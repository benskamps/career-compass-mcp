import { openCard, sealCard } from "./crypto";

export const MAX_CARD_BYTES = 16 * 1024;
export const MAX_SAVES_PER_DAY = 50;
export const IDLE_DELETE_DAYS = 365;

export interface CardRecord {
  card: string;
  updatedAt: number;
  hasPrevious: boolean;
}

export type SaveResult =
  | { ok: true; bytes: number; replaced: boolean }
  | { ok: false; reason: "too_large"; bytes: number }
  | { ok: false; reason: "rate_limited" }
  | { ok: false; reason: "empty" };

/** Raw row as stored. card/previous are ciphertext. */
export interface Row {
  user_id: string;
  card: string | null;
  previous: string | null;
  updated_at: number | null;
  last_seen_at: number;
  saves_day: string | null;
  saves_count: number;
}

/** The storage seam: D1 in production, a Map in tests. */
export interface RowStore {
  get(userId: string): Promise<Row | null>;
  put(row: Row): Promise<void>;
  touch(userId: string, now: number): Promise<void>;
  delete(userId: string): Promise<boolean>;
  deleteIdleBefore(cutoff: number): Promise<number>;
}

export class D1RowStore implements RowStore {
  constructor(private db: D1Database) {}
  async get(userId: string) {
    return (await this.db.prepare("SELECT * FROM cards WHERE user_id = ?").bind(userId).first<Row>()) ?? null;
  }
  async put(r: Row) {
    await this.db
      .prepare(
        `INSERT INTO cards (user_id, card, previous, updated_at, last_seen_at, saves_day, saves_count)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET card = excluded.card, previous = excluded.previous,
           updated_at = excluded.updated_at, last_seen_at = excluded.last_seen_at,
           saves_day = excluded.saves_day, saves_count = excluded.saves_count`,
      )
      .bind(r.user_id, r.card, r.previous, r.updated_at, r.last_seen_at, r.saves_day, r.saves_count)
      .run();
  }
  async touch(userId: string, now: number) {
    await this.db.prepare("UPDATE cards SET last_seen_at = ? WHERE user_id = ?").bind(now, userId).run();
  }
  async delete(userId: string) {
    const res = await this.db.prepare("DELETE FROM cards WHERE user_id = ?").bind(userId).run();
    return (res.meta.changes ?? 0) > 0;
  }
  async deleteIdleBefore(cutoff: number) {
    const res = await this.db.prepare("DELETE FROM cards WHERE last_seen_at < ?").bind(cutoff).run();
    return res.meta.changes ?? 0;
  }
}

export class MemoryRowStore implements RowStore {
  rows = new Map<string, Row>();
  async get(id: string) {
    const r = this.rows.get(id);
    return r ? { ...r } : null;
  }
  async put(r: Row) {
    this.rows.set(r.user_id, { ...r });
  }
  async touch(id: string, now: number) {
    const r = this.rows.get(id);
    if (r) r.last_seen_at = now;
  }
  async delete(id: string) {
    return this.rows.delete(id);
  }
  async deleteIdleBefore(cutoff: number) {
    let n = 0;
    for (const [id, r] of this.rows) if (r.last_seen_at < cutoff) (this.rows.delete(id), n++);
    return n;
  }
}

const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** The card operations the tools use. Encrypts on the way in, decrypts on the way out. */
export class CardStore {
  constructor(
    private rows: RowStore,
    private secret: string,
    private now: () => number = Date.now,
  ) {}

  async read(userId: string): Promise<CardRecord | null> {
    const row = await this.rows.get(userId);
    if (!row) return null;
    await this.rows.touch(userId, this.now());
    if (!row.card) return null;
    return {
      card: await openCard(this.secret, userId, row.card),
      updatedAt: row.updated_at ?? 0,
      hasPrevious: !!row.previous,
    };
  }

  async save(userId: string, text: string): Promise<SaveResult> {
    const card = text.trim();
    if (!card) return { ok: false, reason: "empty" };
    const bytes = new TextEncoder().encode(card).byteLength;
    if (bytes > MAX_CARD_BYTES) return { ok: false, reason: "too_large", bytes };
    const now = this.now();
    const today = utcDay(now);
    const row = await this.rows.get(userId);
    const count = row?.saves_day === today ? row.saves_count : 0;
    if (count >= MAX_SAVES_PER_DAY) return { ok: false, reason: "rate_limited" };
    await this.rows.put({
      user_id: userId,
      card: await sealCard(this.secret, userId, card),
      previous: row?.card ?? null,
      updated_at: now,
      last_seen_at: now,
      saves_day: today,
      saves_count: count + 1,
    });
    return { ok: true, bytes, replaced: !!row?.card };
  }

  /** Swap the card with the one saved before it. */
  async undo(userId: string): Promise<boolean> {
    const row = await this.rows.get(userId);
    if (!row?.previous) return false;
    const now = this.now();
    await this.rows.put({ ...row, card: row.previous, previous: row.card, updated_at: now, last_seen_at: now });
    return true;
  }

  delete(userId: string) {
    return this.rows.delete(userId);
  }

  deleteIdle() {
    return this.rows.deleteIdleBefore(this.now() - IDLE_DELETE_DAYS * 86_400_000);
  }
}
