import { z } from "zod";

const schema = z.object({
  /** Postgres connection string (Neon / Supabase / RDS). When absent, an embedded PGlite database in ./.data is used. */
  DATABASE_URL: z.string().optional(),
  /** Upstash Redis for the shared response cache. When absent, an in-process LRU is used. */
  UPSTASH_REDIS_REST_URL: z.string().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  /** Auto-synced pie sources, comma separated: "demo", "t212-api". Imported/submitted pies are always kept. */
  PIE_SOURCES: z.string().default("demo"),
  /** Operator Trading 212 API accounts: "key:secret[:Display name],…" (Pies read permission is enough). */
  T212_API_ACCOUNTS: z.string().optional(),
  /** Simplest setup for one account: secrets may contain any characters, so no delimiter parsing. */
  T212_API_KEY: z.string().optional(),
  T212_API_SECRET: z.string().optional(),
  T212_API_NAME: z.string().optional(),
  T212_API_ENV: z.enum(["live", "demo"]).default("live"),
  /** Override the API host (tests / proxies). */
  T212_API_BASE: z.string().optional(),
  /**
   * "Create in Trading 212" with the operator's own key (T212_API_KEY). Personal/local use only:
   * on a public site every visitor's click would create pies in YOUR account. Visitors can always
   * use their own key instead.
   */
  ALLOW_OWNER_CREATE: z.enum(["on", "off"]).default("off"),
  /** Allow visitors to import their own public pies with a one-time API key. */
  ALLOW_USER_IMPORT: z.enum(["on", "off"]).default("on"),
  /** Which market data provider prices instruments. */
  MARKET_PROVIDER: z.enum(["demo", "yahoo", "polygon"]).default("demo"),
  POLYGON_API_KEY: z.string().optional(),
  /** Shared secret for /api/cron/* (Vercel Cron sends it as a Bearer token). */
  CRON_SECRET: z.string().optional(),
  INNGEST_EVENT_KEY: z.string().optional(),
  INNGEST_SIGNING_KEY: z.string().optional(),
  NEXT_PUBLIC_SITE_URL: z.string().default("http://localhost:3000"),
});

export const env = schema.parse(process.env);
export type Env = typeof env;
