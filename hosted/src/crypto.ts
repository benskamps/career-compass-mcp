// Application-level encryption for stored cards, on top of Cloudflare's own
// encryption at rest. A copy of the database alone reveals neither the cards
// nor the Google account ids: both need CARD_KEY, which lives only in the
// Worker's secrets.

const enc = new TextEncoder();
const dec = new TextDecoder();

export const MIN_SECRET_LENGTH = 32;

async function rootKey(secret: string): Promise<CryptoKey> {
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`CARD_KEY must be at least ${MIN_SECRET_LENGTH} characters`);
  }
  return crypto.subtle.importKey("raw", enc.encode(secret), "HKDF", false, ["deriveKey"]);
}

function hkdf(info: string) {
  return { name: "HKDF", hash: "SHA-256", salt: enc.encode("career-compass-memory/v1"), info: enc.encode(info) };
}

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

/** The stored user id: an HMAC of the provider's account id, never the id itself. */
export async function userIdFor(secret: string, provider: string, subject: string): Promise<string> {
  const key = await crypto.subtle.deriveKey(
    hkdf("user-id"),
    await rootKey(secret),
    { name: "HMAC", hash: "SHA-256", length: 256 },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(`${provider}:${subject}`));
  return `${provider[0]}_${toHex(mac)}`;
}

async function cardKey(secret: string, userId: string): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    hkdf(`card:${userId}`),
    await rootKey(secret),
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** AES-GCM with a fresh 12-byte IV; output is base64(iv || ciphertext). */
export async function sealCard(secret: string, userId: string, text: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: enc.encode(userId) },
    await cardKey(secret, userId),
    enc.encode(text),
  );
  const out = new Uint8Array(12 + ct.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(ct), 12);
  return toB64(out);
}

export async function openCard(secret: string, userId: string, sealed: string): Promise<string> {
  const bytes = fromB64(sealed);
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytes.slice(0, 12), additionalData: enc.encode(userId) },
    await cardKey(secret, userId),
    bytes.slice(12),
  );
  return dec.decode(pt);
}
