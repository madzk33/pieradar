/** Remove all simulated pies (e.g. before going live with real data only). */
import { eq } from "drizzle-orm";
import { getDb, schema } from "../src/lib/db/client";

const db = await getDb();
const gone = await db.delete(schema.pies).where(eq(schema.pies.origin, "demo")).returning({ id: schema.pies.id });
console.log(`Removed ${gone.length} simulated pies. Set PIE_SOURCES to exclude "demo" so they don't come back.`);
process.exit(0);
