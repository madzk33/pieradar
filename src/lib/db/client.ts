import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";
import { env } from "../env";

export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;

const g = globalThis as unknown as { __pieradarDb?: Promise<DB> };

const MIGRATIONS = path.join(process.cwd(), "drizzle");

async function connect(): Promise<DB> {
  if (env.DATABASE_URL) {
    const { default: postgres } = await import("postgres");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    // Serverless-friendly: small pool, no prepared statements (works behind PgBouncer / Neon pooler).
    const sql = postgres(env.DATABASE_URL, { max: 5, prepare: false, idle_timeout: 20 });
    return drizzle(sql, { schema }) as unknown as DB;
  }

  // Local: embedded Postgres (PGlite) persisted to ./.data — zero setup, auto-migrated.
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const fs = await import("node:fs");
  // PGlite is single-process: tests/scripts can point at their own directory.
  const dir = path.resolve(process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite"));
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  acquireLock(fs, dir);

  const open = async () => {
    const client = new PGlite(dir);
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: MIGRATIONS });
    return db as unknown as DB;
  };

  try {
    return await open();
  } catch (err) {
    // We hold the lock, so nobody else is using it: the directory itself is
    // unreadable (e.g. it was opened by two processes at once in the past).
    // Local data is a rebuildable cache, so set it aside and start fresh.
    if (!fs.existsSync(dir)) throw err;
    const aside = `${dir}-corrupt-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    fs.renameSync(dir, aside);
    console.warn(`[db] Local database at ${dir} could not be opened; moved it to ${aside} and created a fresh one. The pipeline will rebuild the index.`);
    return open();
  }
}

/**
 * One process per PGlite directory. Two processes writing the same directory
 * corrupt it, so refuse with a clear message instead.
 */
function acquireLock(fs: typeof import("node:fs"), dir: string) {
  const lockFile = `${dir}.lock`;
  try {
    const pid = Number(fs.readFileSync(lockFile, "utf8"));
    if (pid && pid !== process.pid && isAlive(pid)) {
      throw new Error(
        `Local database ${dir} is in use by another process (pid ${pid}). Stop it (e.g. the running \`next dev\`), or set PGLITE_DIR to use a separate database.`,
      );
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  fs.writeFileSync(lockFile, String(process.pid));
  process.once("exit", () => {
    try {
      if (Number(fs.readFileSync(lockFile, "utf8")) === process.pid) fs.unlinkSync(lockFile);
    } catch {
      /* already gone */
    }
  });
}

function isAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Process-wide singleton (survives Next dev HMR). */
export function getDb(): Promise<DB> {
  if (!g.__pieradarDb) {
    g.__pieradarDb = connect().catch((err) => {
      g.__pieradarDb = undefined;
      throw err;
    });
  }
  return g.__pieradarDb;
}

export { schema };
