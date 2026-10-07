import { and, not, or } from '@prisma/orm-postgres/orm-client';

import { contract } from '#src/service/prisma.js';
import { AppError } from '#src/utils/errors.js';

export interface ListQuery {
  sort?: string;
  page?: string;
  filter?: Record<string, unknown>;
}

export interface ApplyOptions {
  /** Model name in the contract, used to coerce filter values (BigInt, Date, Int). */
  model: string;
  filterable: readonly string[];
  sortable: readonly string[];
  /** Default sort in limelite notation (`field` = desc, `-field` = asc). */
  defaultSort?: string;
  maxLimit?: number;
}

type Codec = string | undefined;

const domainModels = (contract as any).domain.namespaces.public.models as Record<string, any>;
const storageTables = (contract as any).storage.namespaces.public.entries.table as Record<
  string,
  any
>;

const codecCache = new Map<string, Codec>();
function columnCodec(model: string, field: string): Codec {
  const key = `${model}.${field}`;
  if (codecCache.has(key)) return codecCache.get(key);
  const m = domainModels[model];
  const table = m?.storage?.table;
  const column = m?.storage?.fields?.[field]?.column ?? field;
  const codec = table ? storageTables[table]?.columns?.[column]?.codecId : undefined;
  codecCache.set(key, codec);
  return codec;
}

function coerce(model: string, field: string, value: unknown): unknown {
  if (value === null || value === undefined) return value;
  const codec = columnCodec(model, field);
  try {
    switch (codec) {
      case 'pg/int8@1':
        return BigInt(value as string);
      case 'pg/int4@1':
      case 'pg/int2@1': {
        const n = Number(value);
        if (!Number.isInteger(n)) throw new Error();
        return n;
      }
      case 'pg/bool@1':
        return value === true || value === 'true';
      case 'pg/timestamptz-date@1': {
        const d = new Date(value as string);
        if (Number.isNaN(d.getTime())) throw new Error();
        return d;
      }
      default:
        return typeof value === 'string' ? value : String(value);
    }
  } catch {
    throw new AppError(`Invalid filter value for ${field}`);
  }
}

const escapeLike = (v: string) => v.replace(/[\\%_]/g, (c) => `\\${c}`);

const OPERATORS = new Set([
  'eq',
  'ne',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'in',
  'notIn',
  'contains',
  'startsWith',
  'endsWith',
  'isNull',
  'not',
  'mode',
]);

function fieldPredicate(m: any, model: string, field: string, raw: unknown): any {
  const f = m[field];
  if (raw === null) return f.isNull();
  if (Array.isArray(raw)) return f.in(raw.map((v) => coerce(model, field, v)));
  if (typeof raw !== 'object') return f.eq(coerce(model, field, raw));

  const parts: any[] = [];
  for (const [op, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!OPERATORS.has(op)) throw new AppError(`Unsupported filter operator "${op}"`);
    switch (op) {
      case 'eq':
        parts.push(value === null ? f.isNull() : f.eq(coerce(model, field, value)));
        break;
      case 'ne':
      case 'neq':
        parts.push(value === null ? f.isNotNull() : f.neq(coerce(model, field, value)));
        break;
      case 'gt':
      case 'gte':
      case 'lt':
      case 'lte':
        parts.push(f[op](coerce(model, field, value)));
        break;
      case 'in':
        parts.push(f.in((value as unknown[]).map((v) => coerce(model, field, v))));
        break;
      case 'notIn':
        parts.push(not(f.in((value as unknown[]).map((v) => coerce(model, field, v)))));
        break;
      case 'contains':
        parts.push(f.ilike(`%${escapeLike(String(value).replace(/^%|%$/g, ''))}%`));
        break;
      case 'startsWith':
        parts.push(f.ilike(`${escapeLike(String(value))}%`));
        break;
      case 'endsWith':
        parts.push(f.ilike(`%${escapeLike(String(value))}`));
        break;
      case 'isNull':
        parts.push(value ? f.isNull() : f.isNotNull());
        break;
      case 'not':
        parts.push(not(fieldPredicate(m, model, field, value)));
        break;
      case 'mode':
        break;
    }
  }
  if (parts.length === 0) return undefined;
  return parts.length === 1 ? parts[0] : and(...parts);
}

function buildPredicate(
  m: any,
  filter: Record<string, unknown>,
  opts: ApplyOptions
): any | undefined {
  const parts: any[] = [];
  for (const [key, value] of Object.entries(filter)) {
    if (value === undefined) continue;
    if (key === 'AND' || key === 'OR') {
      const list = (Array.isArray(value) ? value : [value]) as Record<string, unknown>[];
      const children = list.map((child) => buildPredicate(m, child, opts)).filter(Boolean);
      if (children.length) parts.push(key === 'AND' ? and(...children) : or(...children));
      continue;
    }
    if (key === 'NOT') {
      const child = buildPredicate(m, value as Record<string, unknown>, opts);
      if (child) parts.push(not(child));
      continue;
    }
    // limelite convention: `firstName_lastName` searches both columns
    const fields = key.split('_');
    for (const field of fields) {
      if (!opts.filterable.includes(field)) {
        throw new AppError(`Filtering by "${field}" is not allowed`);
      }
    }
    const preds = fields
      .map((field) => fieldPredicate(m, opts.model, field, value))
      .filter(Boolean);
    if (preds.length) parts.push(preds.length === 1 ? preds[0] : or(...preds));
  }
  if (parts.length === 0) return undefined;
  return parts.length === 1 ? parts[0] : and(...parts);
}

export function parsePage(page?: string, maxLimit = 200): { limit: number; offset: number } {
  const [p = 1, l = 50] = (page || '1,50').split(',').map((v) => parseInt(v, 10));
  const limit = Math.min(Math.max(Number.isFinite(l) ? l : 50, 1), maxLimit);
  const pageNum = Math.max(Number.isFinite(p) ? p : 1, 1);
  return { limit, offset: (pageNum - 1) * limit };
}

/** Applies only the filter (used for `total` counts). */
export function applyFilter<C>(collection: C, query: ListQuery, opts: ApplyOptions): C {
  if (!query.filter || Object.keys(query.filter).length === 0) return collection;
  const filter = query.filter;
  return (collection as any).where(
    (m: any) => buildPredicate(m, filter, opts) ?? m.id.isNotNull()
  ) as C;
}

/** Applies filter, sort (limelite notation) and page/limit. */
export function applyList<C>(collection: C, query: ListQuery, opts: ApplyOptions): C {
  let c: any = applyFilter(collection, query, opts);
  const sort = (query.sort || opts.defaultSort || 'id')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const orders = sort.map((s) => {
    const asc = s.startsWith('-');
    const field = s.replace(/^-/, '');
    if (!opts.sortable.includes(field) && field !== 'id') {
      throw new AppError(`Sorting by "${field}" is not allowed`);
    }
    return (m: any) => (asc ? m[field].asc() : m[field].desc());
  });
  if (!sort.some((s) => s.replace(/^-/, '') === 'id')) {
    orders.push((m: any) => m.id.desc());
  }
  c = c.orderBy(orders);
  const { limit, offset } = parsePage(query.page, opts.maxLimit);
  return c.limit(limit).offset(offset) as C;
}
