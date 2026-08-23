import { watch, type FSWatcher } from "fs";
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
}

/**
 * Wire subscribe/unsubscribe onto a server and watch the data dir.
 *
 * Returns a handle so the caller — and the tests — can inspect and tear down.
 */
export function registerLiveResources(server: McpServer): LiveResources {
  const subscribed = new Set<string>();
  const watchers: FSWatcher[] = [];
  const pending = new Set<string>();
  let timer: NodeJS.Timeout | null = null;
  let closed = false;

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

  const onChange = (filename: string | null) => {
    if (closed || !filename) return;
    const name = basename(filename);
    if (isInternal(name)) return;
    const uri = FILE_TO_URI[name];
    if (!uri) return;
    mark(uri);
    for (const agg of AGGREGATE_URIS) mark(agg);
  };

  const startWatching = () => {
    if (watchers.length || closed) return;
    const dataDir = getDataDir();
    for (const sub of ["career", "pipeline"]) {
      try {
        // Not recursive: `recursive: true` is unsupported on Linux in older
        // Node and silently watches nothing there. Two shallow watchers cover
        // the whole layout and behave the same on every platform.
        const w = watch(join(dataDir, sub), { persistent: false }, (_event, filename) =>
          onChange(filename ? String(filename) : null),
        );
        // A directory that vanishes (a user deleting their data dir) must not
        // crash the server.
        w.on("error", () => {});
        watchers.push(w);
      } catch {
        // The directory may not exist yet — a first-run install has nothing to
        // watch, and subscribing before there is data is not an error.
      }
    }
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
    for (const w of watchers) {
      try {
        w.close();
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
  };
}

/** Exported for tests: the file→URI map and the internal-file rule. */
export const __internals = { FILE_TO_URI, AGGREGATE_URIS, isInternal, DEBOUNCE_MS };
