#!/usr/bin/env node
// Rebuilds the Claude directory plugin (benskamps/career-compass-plugin) as a skills-only
// bundle from one career-compass-mcp release. Run it from a career-compass-plugin checkout,
// with CC_SOURCE_DIR pointing at this repo at that release's commit:
//
//   cd career-compass-plugin && CC_SOURCE_DIR=../career-compass-mcp \
//     node ../career-compass-mcp/scripts/build-plugin-skills.mjs 2.16.0
//
// Why skills only: since November 2026 the directory accepts MCP servers that run on the
// user's computer only from Verified organizations, so a bundle with server/ and .mcp.json
// is refused. The full plugin, with the local server, stays installable from this repo's
// own marketplace (.claude-plugin/marketplace.json, source ./plugin).
// scripts/build-plugin-bundle.mjs still builds the old bundle with server/ for when that
// changes.
//
// What it does:
//   1. Copies the skills, LICENSE, icon and privacy policy from the source checkout. In the
//      skill files it drops each `allowed-tools` list (the directory accepts entries beyond
//      Read/Grep/Glob/LS only from Verified organizations, and refused 2.16.0 for the MCP
//      tool names) and every <!-- full-only --> ... <!-- /full-only --> span: instructions
//      to read the full version's saved files on the user's computer.
//   2. Writes plugin.json from plugin/.claude-plugin/plugin.json, with the fields in
//      plugin/directory.json (the listing description) laid over it.
//   3. Deletes server/ and .mcp.json, and sets the version in this repo's README.
//   4. Checks the directory's file limits: 512 files, 256 KiB per non-image file.
//   5. Writes BUNDLE.md.

import { cpSync, existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) {
  console.error("Usage: build-plugin-skills.mjs <exact version, e.g. 2.16.0>");
  process.exit(2);
}
const src = process.env.CC_SOURCE_DIR;
if (!src) {
  console.error("Set CC_SOURCE_DIR to a career-compass-mcp checkout at the release's commit.");
  process.exit(2);
}
const ROOT = process.cwd();
const SOURCE_REPO = "https://github.com/benskamps/career-compass-mcp";
const MAX_FILES = 512;
const MAX_BYTES = 256 * 1024;

const at = JSON.parse(readFileSync(join(src, "package.json"), "utf-8")).version;
if (at !== version) throw new Error(`CC_SOURCE_DIR is at ${at}, expected ${version}`);

// 1. Skills and the files that travel with them.
rmSync(join(ROOT, "skills"), { recursive: true, force: true });
cpSync(join(src, "plugin", "skills"), join(ROOT, "skills"), { recursive: true });
const ALLOWED = new Set(["Read", "Grep", "Glob", "LS"]);
const skillFiles = [];
const walkSkills = (d) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) walkSkills(p);
    else if (e.name.endsWith(".md")) skillFiles.push(p);
  }
};
walkSkills(join(ROOT, "skills"));
for (const f of skillFiles) {
  let text = readFileSync(f, "utf-8");
  text = text.replace(/<!-- full-only -->[\s\S]*?<!-- \/full-only -->\n?/g, "");
  if (text.startsWith("---\n")) {
    const end = text.indexOf("\n---\n", 4);
    const lines = text.slice(4, end).split("\n");
    const kept = [];
    for (let i = 0; i < lines.length; i++) {
      if (/^allowed-tools:/.test(lines[i])) {
        // Drop the comment lines that explain the list, then the list itself.
        while (kept.length && kept[kept.length - 1].startsWith("#")) kept.pop();
        while (i + 1 < lines.length && /^\s+- /.test(lines[i + 1])) i++;
        continue;
      }
      kept.push(lines[i]);
    }
    text = "---\n" + kept.join("\n") + text.slice(end);
  }
  if (/<!-- \/?full-only -->/.test(text)) throw new Error(`unbalanced full-only marker in ${relative(ROOT, f)}`);
  // The directory copy names no home-folder path and no command to run: the scan flagged
  // plugin.json for "uses a credential from the user's machine" while these were in it.
  const local = text.match(/~\/\.career-compass|\bnpx\b/);
  if (local) throw new Error(`"${local[0]}" left in the directory copy of ${relative(ROOT, f)}; mark it full-only`);
  const tools = text.match(/^allowed-tools:.*(?:\n\s+- .*)*/m);
  if (tools && tools[0].split(/[\s,:\-\[\]]+/).slice(1).some((t) => t && !ALLOWED.has(t))) {
    throw new Error(`allowed-tools beyond Read/Grep/Glob/LS in ${relative(ROOT, f)}`);
  }
  writeFileSync(f, text);
}
cpSync(join(src, "plugin", "LICENSE"), join(ROOT, "LICENSE"));
cpSync(join(src, "plugin", ".claude-plugin", "icon.png"), join(ROOT, ".claude-plugin", "icon.png"));
cpSync(join(src, "PRIVACY.md"), join(ROOT, "PRIVACY.md"));

// 2. The manifest, with the directory's own listing fields.
const manifest = JSON.parse(readFileSync(join(src, "plugin", ".claude-plugin", "plugin.json"), "utf-8"));
const overridesPath = join(src, "plugin", "directory.json");
const overrides = existsSync(overridesPath) ? JSON.parse(readFileSync(overridesPath, "utf-8")) : {};
Object.assign(manifest, overrides);
manifest.version = version;
manifest.repository = "https://github.com/benskamps/career-compass-plugin";
delete manifest.userConfig;
writeFileSync(join(ROOT, ".claude-plugin", "plugin.json"), JSON.stringify(manifest, null, 2) + "\n");

// 3. No local server in the directory bundle.
rmSync(join(ROOT, "server"), { recursive: true, force: true });
rmSync(join(ROOT, ".mcp.json"), { force: true });
const readme = join(ROOT, "README.md");
if (/~\/\.career-compass/.test(readFileSync(readme, "utf-8"))) {
  throw new Error("README.md names ~/.career-compass; say \"a folder on your computer\" instead");
}
writeFileSync(readme, readFileSync(readme, "utf-8").replace(/career-compass-mcp(@|\]\([^)]*\) v| v)\d+\.\d+\.\d+/g, (m) => m.replace(/\d+\.\d+\.\d+$/, version)));

// 4. The directory's limits.
const files = [];
const walk = (d) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    if (e.name === ".git" || (d === ROOT && e.name === "node_modules")) continue;
    const p = join(d, e.name);
    e.isDirectory() ? walk(p) : files.push(p);
  }
};
walk(ROOT);
const tooBig = files.filter((f) => !/\.(png|jpe?g|gif|webp|woff2?|ttf|otf)$/i.test(f) && statSync(f).size > MAX_BYTES);
if (files.length > MAX_FILES || tooBig.length) {
  console.error(`Over the directory limits: ${files.length} files (max ${MAX_FILES}).`);
  tooBig.forEach((f) => console.error(`  over 256 KiB: ${relative(ROOT, f)}`));
  process.exit(1);
}
const total = files.length + (files.includes(join(ROOT, "BUNDLE.md")) ? 0 : 1);

// 5. Provenance.
writeFileSync(
  join(ROOT, "BUNDLE.md"),
  `# Where this plugin comes from

Built from [v${version} in career-compass-mcp](${SOURCE_REPO}/tree/v${version}).

- The plugin is skills only: \`skills/\`, the icon, the manifest, LICENSE and the privacy
  policy. There is no MCP server, no \`.mcp.json\`, and no program that runs on your
  computer.
- Each skill file is \`plugin/skills/\` at that commit with two things removed: the
  \`allowed-tools\` lists (they name the full version's MCP tools), and the passages marked
  full-only, which tell Claude to read the full version's saved files on your computer.
- \`plugin.json\` is \`plugin/.claude-plugin/plugin.json\` at that commit, with the listing
  fields in \`plugin/directory.json\` laid over it and the repository set to this one.
- ${total} files in the plugin in total.

The full plugin, which adds a local server that remembers your career history and tracks
your applications, installs in Claude Code from career-compass-mcp's own marketplace:

\`\`\`
/plugin marketplace add benskamps/career-compass-mcp
/plugin install career-compass@career-compass
\`\`\`

The build script is
[scripts/build-plugin-skills.mjs](${SOURCE_REPO}/blob/main/scripts/build-plugin-skills.mjs)
in career-compass-mcp, so each release can be regenerated and compared.
`,
);
console.log(`Bundled career-compass ${version} (skills only): ${total} files.`);
