// Google as the identity step only. We ask for `openid` and nothing else, keep
// no Google token, and use only the account id (`sub`), which is then HMAC'd
// before it is stored anywhere.

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function newVerifier(): string {
  return b64url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function challengeFor(verifier: string): Promise<string> {
  return b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
}

export function googleAuthorizeUrl(opts: { clientId: string; redirectUri: string; state: string; challenge: string }): string {
  const u = new URL(AUTH_URL);
  u.searchParams.set("client_id", opts.clientId);
  u.searchParams.set("redirect_uri", opts.redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", "openid");
  u.searchParams.set("state", opts.state);
  u.searchParams.set("code_challenge", opts.challenge);
  u.searchParams.set("code_challenge_method", "S256");
  u.searchParams.set("prompt", "select_account");
  return u.toString();
}

export interface IdClaims {
  sub: string;
  aud: string;
  iss: string;
  exp: number;
}

/**
 * Reads the id_token's claims. Signature checking is skipped on purpose: the
 * token comes straight from Google's token endpoint over TLS in exchange for
 * our client secret, which OpenID Connect Core 3.1.3.7 allows. The audience,
 * issuer and expiry are still checked.
 */
export function readIdToken(idToken: string, clientId: string, nowSec: number): IdClaims {
  const part = idToken.split(".")[1];
  if (!part) throw new Error("malformed id_token");
  const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
  const claims = JSON.parse(json) as IdClaims;
  if (!claims.sub) throw new Error("id_token has no sub");
  if (claims.aud !== clientId) throw new Error("id_token audience mismatch");
  if (!ISSUERS.has(claims.iss)) throw new Error("id_token issuer mismatch");
  if (!(claims.exp > nowSec)) throw new Error("id_token expired");
  return claims;
}

export async function exchangeCode(opts: {
  code: string;
  verifier: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  fetchImpl?: typeof fetch;
}): Promise<IdClaims> {
  const res = await (opts.fetchImpl ?? fetch)(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: opts.code,
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      redirect_uri: opts.redirectUri,
      grant_type: "authorization_code",
      code_verifier: opts.verifier,
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed (${res.status})`);
  const body = (await res.json()) as { id_token?: string };
  if (!body.id_token) throw new Error("Google returned no id_token");
  return readIdToken(body.id_token, opts.clientId, Math.floor(Date.now() / 1000));
}
