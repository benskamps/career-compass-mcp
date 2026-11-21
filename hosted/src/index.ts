import {
  OAuthProvider,
  AuthorizationError,
  CimdFetchError,
  authorizationErrorRedirect,
  getOAuthApi,
  type GrantSummary,
  type OAuthProviderOptions,
} from "@cloudflare/workers-oauth-provider";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { userIdFor } from "./crypto";
import { challengeFor, exchangeCode, googleAuthorizeUrl, newVerifier } from "./google";
import { buildServer } from "./mcp";
import { consentPage, errorPage, homePage, privacyPage } from "./pages";
import { CardStore, D1RowStore } from "./store";

export interface Env {
  DB: D1Database;
  OAUTH_KV: KVNamespace;
  PUBLIC_URL: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  CARD_KEY: string;
  CONTACT?: string;
  /** Local testing only: skip Google and use `?code=` as the account id. Ignored unless PUBLIC_URL is localhost. */
  DEV_FAKE_GOOGLE?: string;
}

/** What a grant carries into every MCP request: only the HMAC'd user id. */
interface Props {
  userId: string;
}

const DEFAULT_CONTACT = "https://github.com/benskamps/career-compass-mcp/issues";

const html = (body: string, status = 200, headers = new Headers()) => {
  headers.set("Content-Type", "text/html; charset=utf-8");
  return new Response(body, { status, headers });
};

const cardStore = (env: Env) => new CardStore(new D1RowStore(env.DB), env.CARD_KEY);

// ---------------------------------------------------------------- MCP endpoint

const mcpHandler = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { userId } = (ctx as unknown as { props: Props }).props;
    const server = buildServer({
      store: cardStore(env),
      userId,
      revokeAccess: async () => {
        const oauth = oauthApi(env);
        const grants = await oauth.listUserGrants(userId);
        await Promise.all(grants.items.map((g: GrantSummary) => oauth.revokeGrant(g.id, userId)));
      },
    });
    // Stateless: a fresh server and transport per request, plain JSON replies.
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await server.connect(transport);
    return transport.handleRequest(request);
  },
};

// ------------------------------------------------------- sign-in and pages

const sites = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/authorize" && request.method === "GET") return await showConsent(request, env);
      if (url.pathname === "/authorize" && request.method === "POST") return await submitConsent(request, env);
      if (url.pathname === "/callback") return await googleCallback(request, env);
      if (url.pathname === "/privacy") return html(privacyPage(env.CONTACT ?? DEFAULT_CONTACT));
      if (url.pathname === "/health") return new Response("ok");
      if (url.pathname === "/") return html(homePage());
      return new Response("Not found", { status: 404 });
    } catch (error) {
      if (error instanceof AuthorizationError && error.redirectTo) return Response.redirect(error.redirectTo, 302);
      if (error instanceof AuthorizationError) return html(errorPage(error.description ?? "The sign-in request expired."), 400);
      if (error instanceof CimdFetchError) return html(errorPage("This app could not be verified."), 400);
      throw error;
    }
  },
};

async function showConsent(request: Request, env: Env) {
  const oauth = oauthApi(env);
  const auth = await oauth.parseAuthRequest(request);
  const details = await oauth.describeConsent(auth);
  const consent = await oauth.beginConsent(auth);
  return html(consentPage(details, consent.handle), 200, consent.headers);
}

async function submitConsent(request: Request, env: Env) {
  const oauth = oauthApi(env);
  const form = await request.formData();
  const handle = String(form.get("handle") ?? "");
  if (form.get("decision") !== "approve") {
    const denied = await oauth.denyConsent(request, handle);
    return new Response(null, { status: 302, headers: denied.headers });
  }
  const approved = await oauth.approveConsent(request, handle);
  const verifier = newVerifier();
  const { state, headers } = await oauth.beginUpstream(approved.request, { data: { verifier }, headers: approved.headers });
  headers.set(
    "Location",
    googleAuthorizeUrl({
      clientId: env.GOOGLE_CLIENT_ID,
      redirectUri: `${env.PUBLIC_URL.replace(/\/+$/, "")}/callback`,
      state,
      challenge: await challengeFor(verifier),
    }),
  );
  return new Response(null, { status: 302, headers });
}

async function googleCallback(request: Request, env: Env) {
  const oauth = oauthApi(env);
  const { request: original, data, headers } = await oauth.finishUpstream<{ verifier: string }>(request);
  const params = new URL(request.url).searchParams;
  const code = params.get("code");
  if (params.get("error") || !code) {
    headers.set("Location", authorizationErrorRedirect(original, "access_denied"));
    return new Response(null, { status: 302, headers });
  }
  const fake = env.DEV_FAKE_GOOGLE === "1" && new URL(env.PUBLIC_URL).hostname === "localhost";
  const subject = fake
    ? code
    : (
        await exchangeCode({
          code,
          verifier: data.verifier,
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
          redirectUri: `${env.PUBLIC_URL.replace(/\/+$/, "")}/callback`,
        })
      ).sub;
  const userId = await userIdFor(env.CARD_KEY, "google", subject);
  const { redirectTo } = await oauth.completeAuthorization({
    request: original,
    userId,
    metadata: {},
    scope: original.scope,
    props: { userId } satisfies Props,
  });
  headers.set("Location", redirectTo);
  return new Response(null, { status: 302, headers });
}

// ------------------------------------------------------------- the Worker

// Options depend on PUBLIC_URL (the resource id is this Worker's own /mcp URL),
// so they are built on first use and cached per URL.
const cache = new Map<string, { options: OAuthProviderOptions<Env>; provider: OAuthProvider<Env> }>();

function forEnv(env: Env) {
  const base = env.PUBLIC_URL.replace(/\/+$/, "");
  let hit = cache.get(base);
  if (!hit) {
    const options: OAuthProviderOptions<Env> = {
      apiRoute: "/mcp",
      apiHandler: mcpHandler as never,
      defaultHandler: sites as never,
      authorizeEndpoint: "/authorize",
      tokenEndpoint: "/token",
      clientRegistrationEndpoint: "/register",
      scopesSupported: ["memory"],
      // Claude uses CIMD when offered and falls back to DCR.
      clientIdMetadataDocumentEnabled: true,
      resourceMetadata: { resource: `${base}/mcp`, authorization_servers: [base] },
      // 90-day sliding refresh: an active user stays connected; an idle one signs in again.
      refreshTokenIdleTTL: 90 * 86_400,
    };
    hit = { options, provider: new OAuthProvider<Env>(options) };
    cache.set(base, hit);
  }
  return hit;
}

const oauthApi = (env: Env) => getOAuthApi(forEnv(env).options, env);

export default {
  fetch: (request: Request, env: Env, ctx: ExecutionContext) => forEnv(env).provider.fetch(request, env, ctx),
  async scheduled(_event: ScheduledController, env: Env, _ctx: ExecutionContext) {
    await cardStore(env).deleteIdle();
    await forEnv(env).provider.purgeExpiredData(env);
  },
};
