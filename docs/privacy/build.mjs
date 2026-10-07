#!/usr/bin/env node
// Renders docs/privacy.md into the two published HTML copies of the privacy policy:
//
//   docs/privacy/index.html  https://benskamps.github.io/career-compass-mcp/privacy (the URL
//                            plugin.json's privacyPolicyUrl and the directory listing link to)
//   docs/privacy.html        the older link, kept so nothing that points at it breaks
//
//   node docs/privacy/build.mjs           write both files
//   node docs/privacy/build.mjs --check   exit 1 if either is out of date (run by the tests)
//
// The two HTML files used to be edited by hand and fell behind the markdown: a whole
// section and two policy changes were missing from the page the listing links to. The
// converter below handles only what the policy uses (headings, paragraphs, flat lists,
// code fences, inline code, bold, italics, links, the --- rule), so it needs no
// dependency. PRIVACY.md at the repo root is the same text without the front matter.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const docs = join(dirname(fileURLToPath(import.meta.url)), "..");

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9 -]/g, "").trim().replace(/ /g, "-");
}

function inline(text) {
  const codes = [];
  let s = text.replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(esc(c)) - 1}\u0000`);
  s = esc(s).replace(/'/g, "&#39;");
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, href) => `<a href="${href}">${t}</a>`);
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+[^\s<).,;:])/g, (_, pre, url) => `${pre}<a href="${url}">${url}</a>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*\w])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[Number(i)]}</code>`);
}

/** Markdown body (no front matter, no H1) to HTML blocks. */
export function toHtml(md) {
  const out = [];
  const lines = md.split("\n");
  for (let i = 0; i < lines.length; ) {
    const line = lines[i];
    if (line.trim() === "" || line.trim() === "---") { i++; continue; }
    if (line.startsWith("```")) {
      const body = [];
      for (i++; i < lines.length && !lines[i].startsWith("```"); i++) body.push(lines[i]);
      i++;
      out.push(`<pre><code>${esc(body.join("\n"))}\n</code></pre>`);
      continue;
    }
    const h = line.match(/^(#{2,3}) (.+)$/);
    if (h) {
      const tag = h[1].length === 2 ? "h2" : "h3";
      out.push(`<${tag} id="${slug(h[2])}">${inline(h[2])}</${tag}>`);
      i++;
      continue;
    }
    if (line.startsWith("- ")) {
      const items = [];
      while (i < lines.length && (lines[i].startsWith("- ") || lines[i].startsWith("  "))) {
        if (lines[i].startsWith("- ")) items.push(lines[i].slice(2));
        else items[items.length - 1] += "\n" + lines[i].trim();
        i++;
      }
      out.push(`<ul>\n${items.map((t) => `<li>${inline(t)}</li>`).join("\n")}\n</ul>`);
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() !== "" && !/^(#|- |```|---$)/.test(lines[i])) para.push(lines[i++]);
    out.push(`<p>${inline(para.join("\n"))}</p>`);
  }
  return out.join("\n");
}

export function render(markdown, iconHref) {
  const md = markdown.replace(/^---\n[\s\S]*?\n---\n/, "");
  const updated = md.match(/\*\*Last updated:\*\* (\S+)/)?.[1] ?? "";
  const applies = md.match(/\*\*Applies to:\*\* ([\s\S]+?)\n\n/)?.[1].replace(/\s+/g, " ") ?? "";
  const short = md.match(/## The short version\n([\s\S]*?)\n---\n/)?.[1] ?? "";
  const rest = md.slice(md.indexOf("## What data the software handles"));
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Privacy Policy — Career Compass MCP</title>
<meta name="description" content="Career Compass runs entirely on your own computer. No account, no cloud sync, no telemetry.">
<link rel="icon" href="${iconHref}">
<style>
  :root{
    --bark:#1c1917; --bark-2:#26221f; --bone:#ede8e1; --bone-dim:#b9b0a6;
    --ember:#d67a3c; --rule:#3a3430;
  }
  @media (prefers-color-scheme: light){
    :root{ --bark:#faf8f5; --bark-2:#f2ede6; --bone:#26221f; --bone-dim:#5f574f;
           --ember:#b25c22; --rule:#ded6cc; }
  }
  :root[data-theme="dark"]{ --bark:#1c1917; --bark-2:#26221f; --bone:#ede8e1;
    --bone-dim:#b9b0a6; --ember:#d67a3c; --rule:#3a3430; }
  :root[data-theme="light"]{ --bark:#faf8f5; --bark-2:#f2ede6; --bone:#26221f;
    --bone-dim:#5f574f; --ember:#b25c22; --rule:#ded6cc; }

  *{box-sizing:border-box}
  body{
    margin:0; background:var(--bark); color:var(--bone);
    font:16px/1.7 ui-serif, Georgia, "Iowan Old Style", serif;
    -webkit-font-smoothing:antialiased;
  }
  .wrap{max-width:44rem; margin:0 auto; padding:4rem 1.5rem 6rem}
  header{border-bottom:1px solid var(--rule); padding-bottom:1.75rem; margin-bottom:2.5rem}
  .eyebrow{
    font:600 .72rem/1 ui-monospace, SFMono-Regular, Menlo, monospace;
    letter-spacing:.14em; text-transform:uppercase; color:var(--ember); margin:0 0 .9rem;
  }
  h1{font-size:clamp(1.9rem,5vw,2.6rem); line-height:1.15; margin:0 0 .6rem; font-weight:600}
  .meta{font:.8rem/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; color:var(--bone-dim); margin:0}
  h2{font-size:1.22rem; margin:2.75rem 0 .75rem; font-weight:600}
  p{margin:0 0 1.1rem}
  ul{margin:0 0 1.1rem; padding-left:1.2rem}
  li{margin:.45rem 0}
  a{color:var(--ember)}
  code{
    font:.88em ui-monospace, SFMono-Regular, Menlo, monospace;
    background:var(--bark-2); padding:.12em .38em; border-radius:3px;
  }
  pre{background:var(--bark-2); padding:.9rem 1rem; border-radius:4px; overflow-x:auto; margin:0 0 1.1rem}
  pre code{background:none; padding:0}
  .lede{
    background:var(--bark-2); border-left:3px solid var(--ember);
    padding:1.25rem 1.4rem; margin:0 0 2rem; border-radius:0 4px 4px 0;
  }
  .lede p:last-child{margin-bottom:0}
  footer{
    margin-top:4rem; padding-top:1.5rem; border-top:1px solid var(--rule);
    font:.82rem/1.6 ui-monospace, SFMono-Regular, Menlo, monospace; color:var(--bone-dim);
  }
</style>
</head>
<body>
<div class="wrap">
<header>
  <p class="eyebrow">Career Compass MCP</p>
  <h1>Privacy Policy</h1>
  <p class="meta">Last updated ${esc(updated)} · applies to ${inline(applies)}</p>
</header>

<div class="lede">
${toHtml(short)}
</div>

${toHtml(rest)}

<footer>
  career-compass-mcp · MIT ·
  <a href="https://github.com/benskamps/career-compass-mcp">source</a> ·
  <a href="https://www.npmjs.com/package/career-compass-mcp">npm</a>
</footer>
</div>
</body>
</html>
`;
}

const TARGETS = [
  { file: join(docs, "privacy", "index.html"), icon: "../icon-32.png" },
  { file: join(docs, "privacy.html"), icon: "icon-32.png" },
];

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const md = readFileSync(join(docs, "privacy.md"), "utf-8");
  const check = process.argv.includes("--check");
  let stale = 0;
  for (const { file, icon } of TARGETS) {
    const html = render(md, icon);
    if (check) {
      let current = "";
      try { current = readFileSync(file, "utf-8"); } catch { /* missing counts as stale */ }
      if (current !== html) { console.error(`out of date: ${file}`); stale++; }
    } else {
      writeFileSync(file, html);
    }
  }
  if (stale) {
    console.error("Run: node docs/privacy/build.mjs");
    process.exit(1);
  }
}
