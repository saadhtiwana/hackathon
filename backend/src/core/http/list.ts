import { asc, desc, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { z } from 'zod';

export const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
  q: z.string().trim().max(100).optional(),
  sort: z.string().optional(),
  dir: z.enum(['asc', 'desc']).default('desc'),
});

export const decodeCursor = (c?: string): number => {
  if (!c) return 0;
  const n = Number.parseInt(Buffer.from(c, 'base64url').toString(), 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};
export const encodeCursor = (offset: number) => Buffer.from(String(offset)).toString('base64url');

export function orderBy(sorts: Record<string, PgColumn>, fallback: string, sort: string | undefined, dir: 'asc' | 'desc', tie: PgColumn): SQL[] {
  const col = sorts[sort ?? ''] ?? sorts[fallback]!;
  return [dir === 'asc' ? asc(col) : desc(col), asc(tie)];
}

export const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

export function page<T>(rows: T[], limit: number, offset: number, total: number) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? encodeCursor(offset + limit) : null, total };
}
