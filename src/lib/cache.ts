/**
 * Read-through response cache. Upstash Redis when configured (shared across
 * serverless instances), otherwise an in-process LRU. Keys are namespaced by a
 * data version that sync jobs bump after writing, so caches turn over within
 * one request of new data landing — TTLs are only a safety net.
 */
import { Redis } from "@upstash/redis";
import { env } from "./env";

const redis =
  env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN })
    : null;

const g = globalThis as unknown as {
  __prCache?: Map<string, { exp: number; value: unknown }>;
  __prVersion?: number;
  __prInflight?: Map<string, Promise<unknown>>;
};
const mem = (g.__prCache ??= new Map());
const inflight = (g.__prInflight ??= new Map());
const MAX_ENTRIES = 2000;
const VERSION_KEY = "pr:data-version";

let versionCache: { value: number; at: number } | null = null;

async function dataVersion(): Promise<number> {
  if (!redis) return (g.__prVersion ??= 1);
  if (versionCache && Date.now() - versionCache.at < 2000) return versionCache.value;
  const v = Number(await redis.get<number>(VERSION_KEY)) || 1;
  versionCache = { value: v, at: Date.now() };
  return v;
}

export async function bumpDataVersion() {
  if (redis) {
    await redis.incr(VERSION_KEY);
    versionCache = null;
  } else {
    g.__prVersion = (g.__prVersion ?? 1) + 1;
  }
}

export async function cached<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
  const full = `pr:${await dataVersion()}:${key}`;

  const hit = mem.get(full);
  if (hit && hit.exp > Date.now()) return hit.value as T;

  if (redis) {
    try {
      const remote = await redis.get<T>(full);
      if (remote !== null && remote !== undefined) {
        remember(full, remote, Math.min(ttlSeconds, 5));
        return remote;
      }
    } catch {
      // Redis outage must never take the site down.
    }
  }

  // Coalesce concurrent misses for the same key.
  const pending = inflight.get(full);
  if (pending) return pending as Promise<T>;
  const p = fn()
    .then(async (value) => {
      remember(full, value, ttlSeconds);
      if (redis) redis.set(full, value, { ex: ttlSeconds }).catch(() => {});
      return value;
    })
    .finally(() => inflight.delete(full));
  inflight.set(full, p);
  return p;
}

function remember(key: string, value: unknown, ttl: number) {
  if (mem.size >= MAX_ENTRIES) {
    const oldest = mem.keys().next().value;
    if (oldest) mem.delete(oldest);
  }
  mem.set(key, { exp: Date.now() + ttl * 1000, value });
}
