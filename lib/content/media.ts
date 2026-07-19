import { type Sql, RUNTIME_DDL } from "@/lib/db";
import type { MediaItem, MediaType } from "@/lib/content/types";

// Media Library — the searchable store of every produced/uploaded asset (images,
// videos, audio, templates, characters, logos, fonts, brand + motion assets).
// Repository pattern: in-memory for tests/dev, Neon for production.

export type MediaInput = Omit<MediaItem, "id" | "createdAt">;

export type MediaQuery = {
  workspaceKey: string;
  mediaType?: MediaType;
  /** Free-text search over title + tags. */
  q?: string;
  tag?: string;
  limit?: number;
};

export interface MediaRepo {
  put(item: MediaInput): Promise<MediaItem>;
  search(query: MediaQuery): Promise<MediaItem[]>;
  get(id: string): Promise<MediaItem | null>;
}

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `media_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function matchesText(item: MediaItem, q: string): boolean {
  const needle = q.toLowerCase();
  return item.title.toLowerCase().includes(needle) || item.tags.some((t) => t.toLowerCase().includes(needle));
}

/** In-memory media library (default for tests/dev). */
export class InMemoryMediaRepo implements MediaRepo {
  private rows: MediaItem[] = [];

  async put(item: MediaInput): Promise<MediaItem> {
    const row: MediaItem = { id: newId(), createdAt: new Date().toISOString(), ...item };
    this.rows.unshift(row);
    return row;
  }
  async search(query: MediaQuery): Promise<MediaItem[]> {
    let out = this.rows.filter((r) => r.workspaceKey === query.workspaceKey);
    if (query.mediaType) out = out.filter((r) => r.mediaType === query.mediaType);
    if (query.tag) out = out.filter((r) => r.tags.includes(query.tag!));
    if (query.q) out = out.filter((r) => matchesText(r, query.q!));
    return out.slice(0, query.limit ?? 100);
  }
  async get(id: string): Promise<MediaItem | null> {
    return this.rows.find((r) => r.id === id) ?? null;
  }
}

let mediaReady = false;
async function ensureMediaTable(sql: Sql) {
  if (mediaReady) return;
  if (!RUNTIME_DDL) { mediaReady = true; return; }
  await sql`CREATE TABLE IF NOT EXISTS media_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    workspace_key TEXT NOT NULL, media_type TEXT NOT NULL,
    uri TEXT NOT NULL, mime TEXT NOT NULL, title TEXT NOT NULL DEFAULT '',
    tags JSONB NOT NULL DEFAULT '[]'::jsonb, kind TEXT, provider_id TEXT, asset_root_id UUID,
    bytes BIGINT, width INTEGER, height INTEGER, duration_ms INTEGER, meta JSONB
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_media_ws ON media_assets (workspace_key, created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_media_type ON media_assets (workspace_key, media_type)`;
  mediaReady = true;
}

type Row = {
  id: string; created_at: string; workspace_key: string; media_type: string; uri: string;
  mime: string; title: string; tags: unknown; kind: string | null; provider_id: string | null;
  asset_root_id: string | null; bytes: number | null; width: number | null; height: number | null;
  duration_ms: number | null; meta: unknown;
};

function toItem(r: Row): MediaItem {
  return {
    id: r.id, createdAt: r.created_at, workspaceKey: r.workspace_key,
    mediaType: r.media_type as MediaType, uri: r.uri, mime: r.mime, title: r.title,
    tags: Array.isArray(r.tags) ? (r.tags as string[]) : [], kind: (r.kind as MediaItem["kind"]) ?? null,
    providerId: r.provider_id, assetRootId: r.asset_root_id, bytes: r.bytes,
    width: r.width, height: r.height, durationMs: r.duration_ms,
    meta: (r.meta as Record<string, unknown>) ?? null,
  };
}

/** Neon-backed media library for production. */
export class NeonMediaRepo implements MediaRepo {
  constructor(private sql: Sql) {}

  async put(m: MediaInput): Promise<MediaItem> {
    await ensureMediaTable(this.sql);
    const rows = (await this.sql`
      INSERT INTO media_assets
        (workspace_key, media_type, uri, mime, title, tags, kind, provider_id, asset_root_id, bytes, width, height, duration_ms, meta)
      VALUES
        (${m.workspaceKey}, ${m.mediaType}, ${m.uri}, ${m.mime}, ${m.title}, ${JSON.stringify(m.tags ?? [])}::jsonb,
         ${m.kind}, ${m.providerId}, ${m.assetRootId}, ${m.bytes}, ${m.width}, ${m.height}, ${m.durationMs},
         ${m.meta ? JSON.stringify(m.meta) : null}::jsonb)
      RETURNING *`) as Row[];
    return toItem(rows[0]);
  }

  async search(q: MediaQuery): Promise<MediaItem[]> {
    await ensureMediaTable(this.sql);
    const like = q.q ? `%${q.q.toLowerCase()}%` : null;
    const rows = (await this.sql`
      SELECT * FROM media_assets
      WHERE workspace_key = ${q.workspaceKey}
        AND (${q.mediaType ?? null}::text IS NULL OR media_type = ${q.mediaType ?? null})
        AND (${q.tag ?? null}::text IS NULL OR tags ? ${q.tag ?? null})
        AND (${like}::text IS NULL OR lower(title) LIKE ${like} OR lower(tags::text) LIKE ${like})
      ORDER BY created_at DESC
      LIMIT ${q.limit ?? 100}`) as Row[];
    return rows.map(toItem);
  }

  async get(id: string): Promise<MediaItem | null> {
    await ensureMediaTable(this.sql);
    const rows = (await this.sql`SELECT * FROM media_assets WHERE id = ${id}`) as Row[];
    return rows[0] ? toItem(rows[0]) : null;
  }
}
