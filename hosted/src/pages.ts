import type { ConsentDescription } from "@cloudflare/workers-oauth-provider";

export const escape = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const STYLE = `body{font:16px/1.55 system-ui,sans-serif;max-width:40rem;margin:2rem auto;padding:0 16px;color:#1f1f1f;background:#fff}
h1{font-size:1.5rem}h2{font-size:1.1rem;margin-top:1.8rem}a{color:#1a56c4}
button{font:inherit;padding:.6rem 1.1rem;border-radius:8px;border:1px solid #999;background:#fff;cursor:pointer}
button.primary{background:#1a56c4;border-color:#1a56c4;color:#fff}.note{color:#555;font-size:.92rem}
@media (prefers-color-scheme:dark){body{background:#161616;color:#e8e8e8}a{color:#8fb4ff}.note{color:#aaa}button{background:#222;color:#e8e8e8}}`;

function page(title: string, body: string): string {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title><style>${STYLE}</style><body>${body}</body></html>`;
}

export function homePage(): string {
  return page(
    "Career Compass Memory",
    `<h1>Career Compass Memory</h1>
<p>Lets Career Compass in claude.ai remember your job search between chats. It stores one thing: your Career Compass card.</p>
<p>Add it in Claude as a connector, using this site's <code>/mcp</code> address. <a href="/privacy">Privacy policy</a>.</p>`,
  );
}

export function consentPage(d: ConsentDescription, handle: string): string {
  const origin = d.clientDomain
    ? `Requested by <strong>${escape(d.clientDomain)}</strong>.`
    : "This app registered itself; its name is not verified.";
  const local = d.redirectIsLoopback
    ? `<p><strong>This sends access to an app on your computer.</strong> Continue only if you just started connecting from it.</p>`
    : "";
  return page(
    "Connect Career Compass Memory",
    `<h1>Connect ${escape(d.clientName)} to Career Compass Memory?</h1>
<p>${origin} Access goes to <strong>${escape(d.redirectHost)}</strong>.</p>${local}
<p>If you connect, Career Compass stores <strong>one thing: your Career Compass card</strong>, encrypted, so your next chat can pick up where you left off. You sign in with Google; we keep only a scrambled form of your account id, not your name or email.</p>
<p>You can read or delete it any time by asking Claude. <a href="/privacy" target="_blank">Privacy policy</a>.</p>
<form method="post" action="/authorize">
<input type="hidden" name="handle" value="${escape(handle)}">
<p><button class="primary" name="decision" value="approve">Continue with Google</button> <button name="decision" value="deny">Cancel</button></p>
</form>`,
  );
}

export function errorPage(message: string): string {
  return page("Career Compass Memory", `<h1>That didn't work</h1><p>${escape(message)}</p><p class="note">Go back to Claude and try connecting again.</p>`);
}

export function privacyPage(contact: string): string {
  return page(
    "Career Compass Memory: privacy",
    `<h1>Career Compass Memory: privacy policy</h1>
<p class="note">Last updated 2026-11-10. Applies to the hosted Career Compass Memory connector only. The local Career Compass server and the plugin's skills have their own policy, and still store nothing on our side.</p>

<h2>What we collect</h2>
<p>If you connect Career Compass Memory, we store one thing: <strong>your Career Compass card</strong>, the short job-search summary you approve in Claude, up to 16 KB. We also keep the card saved just before it, so a save can be undone.</p>
<p>To know it's you, you sign in with Google. We ask Google only for your account id. We don't receive your name, email or profile, and we keep no Google token. Before storing the id we turn it into a one-way code (an HMAC) that can't be turned back into the id.</p>
<p>We do not store job postings, résumés, emails or your chats, unless you put them in your card yourself.</p>

<h2>How it is used and stored</h2>
<p>The card is used for one purpose: handing it back to Claude when you ask Career Compass for help, so you don't start from zero. It is encrypted with a key held only by the service (AES-256-GCM), on top of the hosting provider's own encryption, in a Cloudflare D1 database. We also record when you last used the service and how many saves you made today, to enforce limits and delete idle records.</p>
<p>We don't read, analyze, sell, or share card text, and we don't use it to train any model. Server logs record requests, not card content.</p>

<h2>Third parties</h2>
<p>Cloudflare hosts the service and database. Google handles sign-in. Your card reaches Anthropic when Claude reads it in your chat, under Anthropic's terms, like anything else you share in Claude. No one else receives it.</p>

<h2>Retention and deletion</h2>
<p>Ask Claude to "delete my Career Compass data" at any time: it deletes your card, the previous version and your record, and signs the connection out. Asking Claude to read your card shows you everything we hold. Records not used for 12 months are deleted automatically.</p>

<h2>Contact</h2>
<p>Questions or deletion requests: ${escape(contact)}.</p>`,
  );
}
