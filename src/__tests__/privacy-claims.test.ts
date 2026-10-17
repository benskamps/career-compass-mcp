import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { readdirSync } from "fs";
import { BACKUP_RETENTION } from "../storage/file-store.js";

/**
 * Privacy-claim truth: the shipped copy has to match what the code does.
 *
 * From 2.4 to 2.13.1, `check_setup` could GET the public npm registry, and this
 * suite made every surface disclose that call. The call is gone, so every
 * surface now says the server makes no network requests, and this suite holds
 * the code to that: the server source may reach loopback (the dashboard probe)
 * and nothing else. A stale privacy claim is the one kind of documentation
 * drift that cannot be shrugged off as out-of-date copy: it is the claim the
 * user is deciding on.
 */

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");

function read(file: string): string {
  return readFileSync(path.join(repoRoot, file), "utf-8");
}

const manifest = JSON.parse(read("manifest.json")) as {
  description: string;
  long_description: string;
};

/** Every surface a user reads before deciding to trust the package. */
const SURFACES: { name: string; text: string }[] = [
  { name: "README.md (whole file)", text: read("README.md") },
  { name: "PRIVACY.md (whole file)", text: read("PRIVACY.md") },
  { name: "manifest.json long_description", text: manifest.long_description },
  { name: "manifest.json description", text: manifest.description },
  // The published policy page is the URL the Claude directory listing links to,
  // and it said "no outbound network requests" for two months after PRIVACY.md
  // stopped saying it, because nothing here read it.
  { name: "docs/privacy.md", text: read("docs/privacy.md") },
  { name: "docs/privacy/index.html", text: read("docs/privacy/index.html") },
  { name: "docs/privacy.html", text: read("docs/privacy.html") },
  { name: "plugin/README.md", text: read("plugin/README.md") },
];

/** The full policy, in every form it is published. */
const FULL_POLICIES = SURFACES.filter((s) => /PRIVACY\.md|docs\/privacy/.test(s.name));

/** HTML copies carry `<code>` tags and entities; compare on plain text. */
function plain(text: string): string {
  return text.replace(/<[^>]+>/g, "").replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
}

/** Does this surface say what `--ask-claude` starts, who receives it, and who pays? */
export function describesAskClaude(text: string): boolean {
  const t = plain(text);
  return /--ask-claude\b/.test(t) && /Anthropic/.test(t) && /billing|billed/i.test(t) && /--ask-claude-writes/.test(t);
}

/** Does this surface say that only the newest N backups are kept? */
export function statesBackupRetention(text: string, n: number): boolean {
  const t = plain(text);
  return new RegExp(`newest ${n} \`?\\.bak\`? files per data file`, "i").test(t) && /deleted automatically/i.test(t);
}

/** The old absolute: one request for the whole package, which the printed npx command contradicts. */
export function claimsSingleRequestForPackage(text: string): boolean {
  return /exactly one outbound network request/i.test(plain(text));
}

/** Every .ts file under src/, tests excluded. */
function serverSources(dir = path.join(repoRoot, "src")): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "__tests__" ? [] : serverSources(p);
    return e.name.endsWith(".ts") ? [p] : [];
  });
}

/**
 * Network calls in a source file that don't target loopback. A relative URL
 * (the lite dashboard's page calling its own `/ask`) is same-origin, which is
 * the local dashboard, so it counts as loopback.
 */
export function outboundCalls(source: string): string[] {
  const calls = source.match(/\bfetch\(\s*[^,)]+|https?\.request\(|net\.connect\(/g) ?? [];
  return calls.filter((c) => !/127\.0\.0\.1|localhost|fetch\(\s*["'`]\//.test(c));
}

/** Does this surface say the server makes no network requests? */
export function statesNoRequests(text: string): boolean {
  return /makes no (?:network )?requests|no network requests/i.test(plain(text));
}

describe("privacy claims match the code", () => {
  it("the server source makes no request beyond loopback", () => {
    const found = serverSources().flatMap((f) =>
      outboundCalls(readFileSync(f, "utf-8")).map((c) => `${path.relative(repoRoot, f)}: ${c}`),
    );
    expect(found, "every surface says the server makes no network requests").toEqual([]);
  });

  it.each(FULL_POLICIES)("$name says the server makes no network requests", ({ text }) => {
    expect(statesNoRequests(text)).toBe(true);
  });

  // ── What the policy itself has to say ──────────────────────────────────────
  // The full policy (PRIVACY.md and its published copies) is what the directory
  // listing links to, so it has to cover the things the package starts or deletes
  // on its own, not only the one request the server makes.

  it.each(FULL_POLICIES)("$name says --ask-claude sends KB content to Anthropic and bills the user", ({ text }) => {
    expect(
      describesAskClaude(text),
      "the dashboard's --ask-claude runs Claude Code, which sends what it reads to Anthropic " +
        "under the user's account and billing. The policy has to say so, and that writes need " +
        "--ask-claude-writes.",
    ).toBe(true);
  });

  it.each(FULL_POLICIES)("$name states the backup retention count the code uses", ({ text }) => {
    expect(
      statesBackupRetention(text, BACKUP_RETENTION),
      `file-store keeps only the newest ${BACKUP_RETENTION} .bak files per data file and deletes ` +
        `the rest. "Files stay until you delete them" is not the whole truth without that.`,
    ).toBe(true);
  });

  it.each(FULL_POLICIES)("$name does not count the whole package as one request", ({ text }) => {
    // The npx command check_setup prints for the dashboard is a second request,
    // run by the user. "Exactly one ... in the whole package" denied it.
    expect(claimsSingleRequestForPackage(text)).toBe(false);
  });

  it.each(FULL_POLICIES)("$name says any schedule is the user's own, local and read-only", ({ text }) => {
    expect(/schedule[\s\S]{0,120}you create[\s\S]{0,120}locally[\s\S]{0,60}only\s+reads/i.test(text)).toBe(true);
  });

  it("docs/privacy.md is PRIVACY.md plus front matter", () => {
    const published = read("docs/privacy.md").replace(/^---\n[\s\S]*?\n---\n\n/, "");
    expect(published).toBe(read("PRIVACY.md"));
  });

  it("the published HTML pages are rendered from docs/privacy.md", () => {
    // Both HTML copies used to be hand-edited and fell a section behind the
    // markdown on the very URL the directory listing links to.
    const run = spawnSync(process.execPath, [path.join(repoRoot, "docs/privacy/build.mjs"), "--check"], {
      encoding: "utf-8",
    });
    expect(run.status, `${run.stderr}\nRun: node docs/privacy/build.mjs`).toBe(0);
  });

  // ── Negative controls ──────────────────────────────────────────────────────
  // Both detectors above pass on the current tree. These prove they can fail:
  // without them, a typo in either regex would make the suite green forever.

  it("negative control: the 2.9.7 'exactly one outbound network request' sentence is caught", () => {
    expect(
      claimsSingleRequestForPackage(
        "There is exactly one outbound network request in the whole package, and only when you ask for it",
      ),
    ).toBe(true);
  });

  it("negative control: a policy silent on backups and --ask-claude fails both checks", () => {
    const silent = "Your files stay on your disk until you delete them. The dashboard makes no network calls.";
    expect(statesBackupRetention(silent, BACKUP_RETENTION)).toBe(false);
    expect(describesAskClaude(silent)).toBe(false);
  });

  it("negative control: the 2.13.1 registry call is caught", () => {
    expect(outboundCalls("const response = await fetch(REGISTRY_URL, {")).toHaveLength(1);
    expect(outboundCalls("await fetch(`http://127.0.0.1:${port}/`, {")).toEqual([]);
    expect(outboundCalls('await fetch("/ask",{method:"POST"})')).toEqual([]);
  });

  it("negative control: a policy that never says it makes no requests fails", () => {
    expect(statesNoRequests("Your data is plain YAML in a directory you choose.")).toBe(false);
  });
});
