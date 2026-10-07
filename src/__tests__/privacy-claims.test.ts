import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { REGISTRY_URL } from "../tools/doctor.js";
import { BACKUP_RETENTION } from "../storage/file-store.js";

/**
 * Privacy-claim truth: the shipped copy must not deny a request the code makes.
 *
 * Every user-facing surface used to end its privacy paragraph with "the server
 * makes no outbound network requests of its own." That was true until
 * `check_setup` landed, which GETs the public npm registry — and defaults to
 * doing so. PRIVACY.md was updated in the same change; manifest.json's
 * `long_description` and the README's Privacy Policy section were not, so the
 * bundle Claude Desktop shows a stranger, and the page GitHub shows them,
 * both asserted the opposite of the policy sitting next to them.
 *
 * A stale privacy claim is the one kind of documentation drift that cannot be
 * shrugged off as out-of-date copy: it is the claim the user is deciding on.
 * So the absolute is asserted absent from every surface, and the disclosure is
 * asserted present on every surface, rather than either being left to whoever
 * remembers.
 */

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");

function read(file: string): string {
  return readFileSync(path.join(repoRoot, file), "utf-8");
}

const manifest = JSON.parse(read("manifest.json")) as {
  description: string;
  long_description: string;
};

/**
 * Claims that the package never reaches the network at all.
 *
 * Deliberately narrow. The lite dashboard's own copy — "the page has no
 * external assets and makes no network calls" — is about the rendered HTML and
 * is still true, so a blanket "no network calls" match would flag an honest
 * sentence. These are the absolutes about the *software*.
 */
const ABSOLUTE_DENIALS: { pattern: RegExp; label: string }[] = [
  { pattern: /no outbound network requests?/i, label: '"no outbound network requests"' },
  { pattern: /nothing phones home/i, label: '"nothing phones home"' },
  { pattern: /never (?:makes|sends) (?:any )?(?:outbound )?(?:network )?requests?/i, label: '"never makes requests"' },
];

/** Does this surface deny all outbound traffic? Returns the claims it makes. */
export function absoluteDenials(text: string): string[] {
  return ABSOLUTE_DENIALS.filter(({ pattern }) => pattern.test(text)).map((c) => c.label);
}

/** Does this surface disclose the one call that exists? */
export function disclosesRegistryCheck(text: string): boolean {
  return /npm registry/i.test(text) && /check_setup/i.test(text);
}

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

/** The surfaces that carry a privacy *paragraph*, as opposed to a one-liner. */
const POLICY_SURFACES = SURFACES.filter((s) => s.name !== "manifest.json description");

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

describe("privacy claims match the code", () => {
  it("the package really does make one outbound request (else this suite is theatre)", () => {
    // If the registry check is ever removed, the absolutes below become true
    // again and this test should be deleted rather than quietly kept passing.
    expect(REGISTRY_URL).toMatch(/^https:\/\/registry\.npmjs\.org\//);
  });

  it.each(SURFACES)("$name does not deny all outbound traffic", ({ text }) => {
    const denials = absoluteDenials(text);
    expect(
      denials,
      `this surface claims ${denials.join(", ")}, but check_setup GETs ${REGISTRY_URL} ` +
        `when asked to. Say what the call is ` +
        `instead of denying it — PRIVACY.md's "Update checks" section is the wording.`,
    ).toEqual([]);
  });

  it.each(POLICY_SURFACES)("$name discloses the registry version check", ({ text }) => {
    expect(
      disclosesRegistryCheck(text),
      `this surface never mentions check_setup's npm registry call. A privacy ` +
        `paragraph that omits the only network request in the package is not honest ` +
        `by being silent.`,
    ).toBe(true);
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

  it("negative control: the sentence that actually shipped in 2.3.0 is caught", () => {
    const shipped =
      "It is local-first by design. There is no account, no cloud sync, and no " +
      "telemetry — the server makes no outbound network requests of its own.";
    expect(absoluteDenials(shipped)).toContain('"no outbound network requests"');
  });

  it("negative control: 'nothing phones home' is caught", () => {
    expect(absoluteDenials("No account, no cloud sync, no telemetry. Nothing phones home.")).toContain(
      '"nothing phones home"',
    );
  });

  it("negative control: a policy that omits the registry call fails the disclosure check", () => {
    const silent =
      "Career Compass runs entirely on your own computer. There is no account and " +
      "no cloud sync. Your data is plain YAML in a directory you choose.";
    expect(disclosesRegistryCheck(silent)).toBe(false);
  });

  it("negative control: the dashboard's honest 'no network calls' sentence is not flagged", () => {
    // The guard must be narrow enough to leave true statements alone, or the
    // next person deletes it instead of the false claim.
    const honest =
      "Data never leaves your machine - the page has no external assets and makes " +
      "no network calls.";
    expect(absoluteDenials(honest)).toEqual([]);
  });
});
