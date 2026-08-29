import { watch, existsSync, type FSWatcher } from "fs";
import { join, basename } from "path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  SubscribeRequestSchema,
  UnsubscribeRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { getDataDir } from "../storage/file-store.js";

/**
 * Live resources — the conversation notices when the files change underneath it.
 *
 * The product's whole premise is that your career data is plain YAML you can
 * open in an editor, and that a local dashboard can move a card in it. Until
 * now both of those were invisible to the conversation: the model read a
 * resource once, and anything you did outside the chat was gone until you said
 * so out loud. You would edit `applications.yaml` in vim, come back, and be
 * talking to a model holding a stale copy of your own job search.
 *
 * This is the piece of MCP that has no equivalent anywhere else in the stack.
 * A web app owns its state and pushes to a browser. A CLI reads and exits. Here
 * three peers — an editor, a GUI, and a conversation — share one directory of
 * plain files, and none of them owns it. Resource subscriptions are what let
 * the conversation be a real peer in that arrangement instead of a snapshot.
 *
 * ── Honest failure posture ──────────────────────────────────────────────────
 *
 * The notification is advisory. A host that never sends `resources/subscribe`
 * gets a server that behaves exactly as before: the watcher is started lazily
 * by the first subscribe and there is no cost, no thread, and no behaviour
 * change if that never arrives. Whether a given host *acts* on
 * `notifications/resources/updated` by refreshing context is the host's call and
 * not something this server can claim on its behalf — so nothing in the
 * user-facing copy promises it. What is promised here is narrow and true: if you
 * subscribe, you are told.
 */

/** Files we own, mapped to the resource URI whose content they back. */
const FILE_TO_URI: Record<string, string> = {
  "profile.yaml": "career://profile",
  "experience.yaml": "career://experience",
  "skills.yaml": "career://skills",
  "projects.yaml": "career://projects",
  "education.yaml": "career://education",
  "testimonials.yaml": "career://testimonials",
  "applications.yaml": "career://pipeline",
  // The journal is a section of the merged KB (file-store.ts merges it into
  // `career://full`), so a `capture_insight` append must dirty both its own
  // resource and the aggregate. Without this entry the append fired silently:
  // `career://full` never learned that part of its own document had changed.
  "journal.yaml": "career://journal",
};

/**
 * Resources whose content is derived from several files, so any of them dirties it.
 *
 * `career://full` is the merged Career KB. A subscriber to it wants to hear
 * about a change to any section, not to guess which file backs it.
 */
const AGGREGATE_URIS = ["career://full"];

/**
 * How long to wait after a change before notifying.
 *
 * Every write in this codebase is a backup-copy plus a temp-file-plus-rename, so
 * one logical save produces a burst of filesystem events — and an editor doing
 * atomic-save produces its own. Without coalescing, moving one kanban card would
 * emit several notifications and, on a host that refreshes context per
 * notification, spend tokens re-reading the same file three times.
 *
 * 250ms is comfortably longer than a write burst and comfortably shorter than a
 * person's attention: by the time you have switched windows back to the chat,
 * the notification has already gone.
 */
const DEBOUNCE_MS = 250;

/**
 * Filenames that must never notify.
 *
 * `atomicWriteYaml` writes `.<name>.<uuid>.tmp` then renames, and copies a
 * timestamped `.bak` first; `write-claim.ts` creates and deletes `.write-claim`
 * on every single mutation. Announcing those would turn one save into a stream
 * of updates about the machinery of saving, and the claim file in particular
 * would fire on *every* write including ones that changed nothing.
 */
function isInternal(name: string): boolean {
  return name.startsWith(".") || name.endsWith(".tmp") || name.endsWith(".bak");
}

export interface LiveResources {
  /** Currently subscribed URIs. Exposed for tests and diagnostics. */
  subscriptions(): string[];
  /** Stop watching and drop all subscriptions. Idempotent. */
  close(): void;
  /** Force a check now, bypassing the debounce. For tests. */
  __flush(): void;
  /** Names of the data subdirs currently armed. For tests and diagnostics. */
  __watched(): string[];
  /** Is the directory-death recovery poll currently running? For tests. */
  __rearming(): boolean;
  /** Run one recovery attempt now, bypassing the poll cadence. For tests. */
  __rearmTick(): void;
}

/**
 * Wire subscribe/unsubscribe onto a server and watch the data dir.
 *
 * Returns a handle so the caller — and the tests — can inspect and tear down.
 */
export function registerLiveResources(server: McpServer): LiveResources {
  const subscribed = new Set<string>();
  // One watcher per data subdirectory, tracked by name so a single dead handle
  // can be re-armed without disturbing its sibling. The bug this shape fixes:
  // the old flat array early-returned from startWatching whenever *anything*
  // was still watched, so once one subdir's watcher died the other stayed alive
  // and no subscribe could ever re-arm the dead one.
  const watchers: Array<{ sub: string; path: string; watcher: FSWatcher }> = [];
  const pending = new Set<string>();
  let timer: NodeJS.Timeout | null = null;
  let closed = false;
  // Recovery poll for a directory that was deleted while subscribed. A dead
  // watcher emits no events, so the "heal on the next event" path in onChange
  // can never fire for the very dir that died — nothing would ever re-arm it
  // until unrelated sibling activity or a fresh subscribe. This is NOT the
  // 157k/s storm: it is one cheap existsSync every REARM_POLL_MS, only while a
  // subdir is disarmed and something is still subscribed, and it stops the
  // instant every subdir is armed again.
  const REARM_POLL_MS = 2_000;
  let rearmTimer: NodeJS.Timeout | null = null;

  // Declaring the capability is what tells a host it may subscribe at all.
  // Without it a spec-compliant client will never send the request, and the
  // handlers below would be unreachable code that looked like a feature.
  server.server.registerCapabilities({ resources: { subscribe: true } });

  const notify = (uri: string) => {
    if (!subscribed.has(uri)) return;
    // Fire-and-forget: a transport that has gone away must not turn a file
    // change into an unhandled rejection.
    server.server.sendResourceUpdated({ uri }).catch(() => {});
  };

  const flush = () => {
    timer = null;
    const uris = [...pending];
    pending.clear();
    for (const uri of uris) notify(uri);
  };

  const mark = (uri: string) => {
    pending.add(uri);
    if (timer) return;
    timer = setTimeout(flush, DEBOUNCE_MS);
    // Never hold the process open for a debounce timer.
    timer.unref?.();
  };

  // The data subdirectories we watch. Not recursive: `recursive: true` is
  // unsupported on Linux in older Node and silently watches nothing there. Two
  // shallow watchers cover the whole layout and behave the same everywhere.
  const SUBDIRS = ["career", "pipeline"];

  const isArmed = (sub: string) => watchers.some((w) => w.sub === sub);

  /** Close and forget the watcher for one subdir, if present. */
  const disarm = (sub: string) => {
    const idx = watchers.findIndex((w) => w.sub === sub);
    if (idx === -1) return;
    const [w] = watchers.splice(idx, 1);
    try {
      w.watcher.close();
    } catch {
      /* already gone */
    }
  };

  const onChange = (sub: string, watchedPath: string, filename: string | null) => {
    if (closed) return;

    // ── Directory death (measured on Windows) ────────────────────────────────
    // Deleting the watched directory does not throw and does not merely stop
    // events: `fs.watch` emits an unbounded rename storm (~157k/s) whose
    // filename resolves to the watched directory itself (its own basename, not
    // a file inside it), and the handle then stays bound to the dead inode
    // forever — zero events even after the directory is recreated. Detect the
    // self-referential event, tear the dead watcher down (which STOPS the
    // storm), and leave the subdir disarmed so the next event on a sibling
    // watcher or the next subscribe re-arms it lazily against the live dir.
    if (filename !== null && basename(filename) === basename(watchedPath)) {
      disarm(sub);
      // The dead dir will emit nothing more; poll it back to life while subscribed.
      ensureRearmPoll();
      return;
    }
    if (filename === null) return;

    // A real event proves the store is alive again — heal any sibling whose
    // directory died and came back, without polling.
    if (watchers.length < SUBDIRS.length) startWatching();

    const name = basename(filename);
    if (isInternal(name)) return;
    const uri = FILE_TO_URI[name];
    if (!uri) return;
    mark(uri);
    for (const agg of AGGREGATE_URIS) mark(agg);
  };

  /** Arm one subdir's watcher if it isn't already, tolerating a missing dir. */
  const armWatcher = (sub: string) => {
    if (closed || isArmed(sub)) return;
    const path = join(getDataDir(), sub);
    try {
      const w = watch(path, { persistent: false }, (_event, filename) =>
        onChange(sub, path, filename ? String(filename) : null),
      );
      // A directory that vanishes surfaces as an error event (ENOENT) on some
      // platforms rather than a throw. Drop the dead handle so a later
      // subscribe or sibling event can re-arm it; never crash the server.
      w.on("error", () => {
        disarm(sub);
        ensureRearmPoll();
      });
      watchers.push({ sub, path, watcher: w });
    } catch {
      // The directory may not exist yet — a first-run install has nothing to
      // watch, and subscribing before there is data is not an error. It arms
      // on a later subscribe, once the dir exists.
    }
  };

  const clearRearm = () => {
    if (rearmTimer) {
      clearInterval(rearmTimer);
      rearmTimer = null;
    }
  };

  // One recovery attempt: re-arm any missing subdir whose directory is back, and
  // stop polling once all are armed or nothing is subscribed.
  const rearmTick = () => {
    if (closed || subscribed.size === 0) {
      clearRearm();
      return;
    }
    startWatching();
    if (watchers.length >= SUBDIRS.length) clearRearm();
  };

  // Start the recovery poll if a subdir is disarmed and something is subscribed.
  // Idempotent; self-clears once every subdir is armed again or nothing is left
  // subscribed. Called from the two directory-death paths (disarm on a
  // self-referential storm event, and disarm on a watcher error).
  const ensureRearmPoll = () => {
    if (rearmTimer || closed || subscribed.size === 0) return;
    rearmTimer = setInterval(rearmTick, REARM_POLL_MS);
    rearmTimer.unref?.();
  };

  const startWatching = () => {
    if (closed) return;
    // Prune any watcher whose directory has vanished: its handle is dead and
    // holding the slot would block a re-arm. This covers the deletion case that
    // is NOT signalled by a self-referential event on every platform (the
    // Windows storm is; a bare "gone" is not).
    for (const w of [...watchers]) {
      if (!existsSync(w.path)) disarm(w.sub);
    }
    // Idempotent per-subdir: arms only what is missing. This is what lets a
    // fresh subscribe re-arm a watcher that died when its directory was deleted.
    for (const sub of SUBDIRS) armWatcher(sub);
  };

  server.server.setRequestHandler(SubscribeRequestSchema, async (request) => {
    subscribed.add(request.params.uri);
    startWatching();
    return {};
  });

  server.server.setRequestHandler(UnsubscribeRequestSchema, async (request) => {
    subscribed.delete(request.params.uri);
    // Keep the watchers up while anything is still subscribed; tear down when
    // the last subscriber leaves so an idle server holds no handles.
    if (subscribed.size === 0) stopWatching();
    return {};
  });

  function stopWatching() {
    clearRearm();
    for (const w of watchers) {
      try {
        w.watcher.close();
      } catch {
        /* already gone */
      }
    }
    watchers.length = 0;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    pending.clear();
  }

  return {
    subscriptions: () => [...subscribed],
    close() {
      closed = true;
      subscribed.clear();
      stopWatching();
    },
    __flush() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      flush();
    },
    __watched: () => watchers.map((w) => w.sub),
    __rearming: () => rearmTimer !== null,
    __rearmTick: rearmTick,
  };
}

/** Exported for tests: the file→URI map and the internal-file rule. */
export const __internals = { FILE_TO_URI, AGGREGATE_URIS, isInternal, DEBOUNCE_MS };
