# Career Compass Memory (hosted connector)

An opt-in remote MCP server that gives claude.ai chat users memory between chats. It stores one
thing per user, their **Career Compass card**, encrypted. It's a Cloudflare Worker with D1 and
Google sign-in. Plan: [hosted server plan](https://claude.ai/artifact/Tj7UKmzFaUpa5KmRxDx2A1).

This folder is a separate package. It is not part of the npm package or the plugin bundle, and
the local server's privacy promise ("runs entirely on your computer") is unchanged.

| Tool | Does | Annotations |
| --- | --- | --- |
| `get_my_card` | Returns the saved card, fenced as untrusted text | read-only |
| `save_my_card` | Replaces the card (16 KB max, 50 saves a day); keeps the previous one | write |
| `restore_previous_card` | Swaps the card with the previous version (undo) | write |
| `delete_my_data` | Deletes the record and revokes the user's OAuth grants | destructive |

What is stored, per user: an HMAC of the Google account id (never the id, name or email), the card
and the previous card (AES-256-GCM, key derived per user from `CARD_KEY`), the last-seen time, and
today's save count. Records idle for 365 days are deleted by a daily cron. The policy is served at
`/privacy`.

## Run it locally

```sh
cd hosted
npm ci
cp .dev.vars.example .dev.vars        # then set CARD_KEY to `openssl rand -base64 32`
npm run db:migrate:local
npm run dev                            # http://localhost:8787
npm test
```

With `DEV_FAKE_GOOGLE=1` (honored only when `PUBLIC_URL` is localhost), the Google step is skipped
and the `code` on `/callback` becomes the account id, so you can run the whole OAuth loop with curl
or MCP Inspector.

## Deploy (needs Ben's accounts)

1. **Cloudflare.** `npx wrangler login`, then:
   ```sh
   npx wrangler d1 create career-compass-memory
   npx wrangler kv namespace create OAUTH_KV
   ```
   Paste the two ids into `wrangler.jsonc`.
2. **Pick the URL.** The default is `https://career-compass-memory.<your-subdomain>.workers.dev`. A
   custom domain such as `memory.brokenbranch.dev` also works: add it under the Worker's Domains &
   Routes. Set `PUBLIC_URL` in `wrangler.jsonc` to the URL, with no trailing slash.
3. **Google sign-in.** In Google Cloud Console:
   - Create a project.
   - Set up the OAuth consent screen: External, app name "Career Compass Memory", your support email,
     privacy policy `PUBLIC_URL/privacy`, and only the `openid` scope.
   - Publish it to "In production". With non-sensitive scopes only, that usually needs no review.
     Stay in Testing until it works; Testing allows only the test users you list.
   - Create Credentials → OAuth client ID → Web application. Set the redirect URI to
     `PUBLIC_URL/callback`.
4. **Secrets.**
   ```sh
   npx wrangler secret put GOOGLE_CLIENT_ID
   npx wrangler secret put GOOGLE_CLIENT_SECRET
   openssl rand -base64 32 | npx wrangler secret put CARD_KEY
   ```
   Keep a copy of `CARD_KEY` in your password manager. If it's lost, every card becomes
   unreadable, and changing it disconnects every user from their card.
5. **Ship.** `npm run db:migrate && npm run deploy`, then open `PUBLIC_URL/health`.
6. **Try it in claude.ai.** Go to Settings → Connectors → Add custom connector and enter
   `PUBLIC_URL/mcp`. Sign in, then in a new chat ask "what's on my Career Compass card?", do a fit
   check, and accept the offer to save. Open another chat and check that it starts from the card.

## Before directory submission

- Make a Google account for the reviewer and save a filled-in sample card to it.
- Submit as a remote MCP connector at claude.ai/directory/manage, separately from the plugin. Don't
  submit it before the 2.16.1 plugin review clears.
- Only after it's listed, reference the URL from the plugin and add the skill steps: read the card
  at the start of a chat, offer to save at the end.
