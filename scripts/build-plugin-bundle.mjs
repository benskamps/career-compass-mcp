#!/usr/bin/env node
// Rebuilds the bundled Claude directory plugin (benskamps/career-compass-plugin) from one
// published career-compass-mcp release. Run it from a career-compass-plugin checkout:
//
//   cd career-compass-plugin && node ../career-compass-mcp/scripts/build-plugin-bundle.mjs 2.9.3
//
// .github/workflows/rebuild-plugin-bundle.yml runs this after every npm release and opens a
// pull request on the plugin repo.
//
// What it does, in order:
//   1. Downloads career-compass-mcp@<version> from npm (the exact tarball users of the
//      npx install get) and installs its production dependencies.
//   2. Asks esbuild which files the server actually loads, starting from
//      build/src/index.js. esbuild only traces here; nothing is bundled or minified.
//   3. Copies those files, unmodified, into server/, with each dependency's package.json
//      and LICENSE, plus the sample data the server reads.
//   4. Copies the skill, LICENSE, icon, and manifest from the source repo at tag v<version>,
//      keeps this repo's own README and .mcp.json, and sets every version string.
//   5. Checks the directory's file limits: 512 files, 256 KiB per non-image file.
//
// Needs Node 22+, npm, git, and esbuild resolvable from this script
// (the workflow runs `npm i --no-save esbuild@0.28.2` in this repo).
//
// CC_PACKAGE_TGZ can point at a local `npm pack` tarball (for a dry run before a release
// exists), and CC_SOURCE_DIR at a checkout of this repo at tag v<version>; each skips its
// download.

import { execFileSync } from "node:child_process";
import {
  cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import * as esbuild from "esbuild";

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) {
  console.error("Usage: build-bundle.mjs <exact version, e.g. 2.9.3>");
  process.exit(2);
}

const ROOT = process.cwd();
const PKG = "career-compass-mcp";
const SOURCE_REPO = "https://github.com/benskamps/career-compass-mcp";
const MAX_FILES = 512;
const MAX_BYTES = 256 * 1024;
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: ["ignore", "pipe", "inherit"], encoding: "utf-8" });

const work = mkdtempSync(join(tmpdir(), "cc-bundle-"));

// 1. The published package and its production dependencies.
const tgz = process.env.CC_PACKAGE_TGZ
  ?? join(work, run("npm", ["pack", `${PKG}@${version}`, "--silent"], work).trim().split("\n").pop());
run("tar", ["xzf", tgz], work);
const pkgDir = join(work, "package");
const pkgJson = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf-8"));
if (pkgJson.version !== version) throw new Error(`npm returned ${pkgJson.version}, expected ${version}`);
run("npm", ["install", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund", "--silent"], pkgDir);

// 2. Which files the server loads.
const traced = await esbuild.build({
  entryPoints: ["build/src/index.js"],
  absWorkingDir: pkgDir,
  bundle: true,
  write: false,
  metafile: true,
  platform: "node",
  format: "esm",
  outdir: join(work, "unused"),
  logLevel: "silent",
});
const inputs = Object.keys(traced.metafile.inputs);

// 3. Copy them into server/, unmodified.
const serverDir = join(ROOT, "server");
rmSync(serverDir, { recursive: true, force: true });
const copy = (rel) => {
  const from = join(pkgDir, rel);
  if (!existsSync(from)) return;
  mkdirSync(dirname(join(serverDir, rel)), { recursive: true });
  cpSync(from, join(serverDir, rel), { recursive: true });
};
inputs.forEach(copy);
const depDirs = new Set(
  inputs.filter((f) => f.startsWith("node_modules/"))
    .map((f) => f.match(/^(node_modules\/(?:@[^/]+\/)?[^/]+)/)[1]),
);
for (const d of depDirs) for (const f of ["package.json", "LICENSE", "LICENSE.md"]) copy(join(d, f));
copy("data/example");
const serverPkg = {
  name: pkgJson.name,
  version: pkgJson.version,
  description: pkgJson.description,
  type: pkgJson.type,
  main: pkgJson.main,
  engines: pkgJson.engines,
  license: pkgJson.license,
  repository: pkgJson.repository,
  dependencies: pkgJson.dependencies,
  private: true,
};
writeFileSync(join(serverDir, "package.json"), JSON.stringify(serverPkg, null, 2) + "\n");

// 4. Plugin files from the source repo at the matching tag.
const src = process.env.CC_SOURCE_DIR ?? join(work, "source");
if (!process.env.CC_SOURCE_DIR) {
  run("git", ["clone", "--quiet", "--depth", "1", "--branch", `v${version}`, SOURCE_REPO, src], work);
}
rmSync(join(ROOT, "skills"), { recursive: true, force: true });
cpSync(join(src, "plugin", "skills"), join(ROOT, "skills"), { recursive: true });
cpSync(join(src, "plugin", "LICENSE"), join(ROOT, "LICENSE"));
cpSync(join(src, "plugin", ".claude-plugin", "icon.png"), join(ROOT, ".claude-plugin", "icon.png"));
cpSync(join(src, "PRIVACY.md"), join(ROOT, "PRIVACY.md"));

const manifest = JSON.parse(readFileSync(join(src, "plugin", ".claude-plugin", "plugin.json"), "utf-8"));
manifest.version = version;
manifest.repository = "https://github.com/benskamps/career-compass-plugin";
writeFileSync(join(ROOT, ".claude-plugin", "plugin.json"), JSON.stringify(manifest, null, 2) + "\n");

const readme = join(ROOT, "README.md");
writeFileSync(readme, readFileSync(readme, "utf-8").replace(/career-compass-mcp(@|\]\([^)]*\) v| v)\d+\.\d+\.\d+/g, (m) => m.replace(/\d+\.\d+\.\d+$/, version)));

// 5. The directory's limits, checked here so a bad bundle never reaches the portal.
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

writeFileSync(
  join(ROOT, "BUNDLE.md"),
  `# Where server/ comes from

Built from the npm package
[${PKG}@${version}](https://www.npmjs.com/package/${PKG}/v/${version}), the same tarball
\`npx ${PKG}@${version}\` installs. Its source is
[v${version} in career-compass-mcp](${SOURCE_REPO}/tree/v${version}).

- Nothing is minified, bundled into one file, or edited. Each file under \`server/build\` and
  \`server/node_modules\` is byte-for-byte identical to that release after
  \`npm install --omit=dev\`. \`server/package.json\` is a shortened copy of the package's own.
- Only the files the server loads are included. esbuild traced them from
  \`build/src/index.js\`; it was not used to transform anything.
- Runtime dependencies, as locked by that install:
${[...depDirs].sort().map((d) => {
  const p = JSON.parse(readFileSync(join(pkgDir, d, "package.json"), "utf-8"));
  return `  - \`${p.name}@${p.version}\` (${p.license ?? "see its package.json"})`;
}).join("\n")}
- ${files.length + (files.includes(join(ROOT, "BUNDLE.md")) ? 0 : 1)} files in the plugin in total.

To check it yourself: install \`${PKG}@${version}\` with \`npm install --omit=dev\` and
compare any file under \`server/\` with the same path in that install. The build script that
produces this repository is
[scripts/build-plugin-bundle.mjs](${SOURCE_REPO}/blob/main/scripts/build-plugin-bundle.mjs)
in career-compass-mcp, so each release can be regenerated and compared the same way.
`,
);
console.log(`Bundled ${PKG}@${version}: ${files.length + (files.includes(join(ROOT, "BUNDLE.md")) ? 0 : 1)} files.`);
rmSync(work, { recursive: true, force: true });
