/**
 * Guided Trading 212 key setup: reads the key and secret from the clipboard
 * (no hand-editing), checks them against the API without creating anything,
 * and writes them to .env.local only when they work.
 *
 *   npm run t212:setup
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import readline from "node:readline/promises";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const clipboard = () => execSync("pbpaste", { encoding: "utf8" }).trim().replace(/^['"]|['"]$/g, "");
const mask = (s: string) => `${s.length} characters, ending …${s.slice(-4)}`;

console.log("\nTrading 212 API key setup\n");
console.log("In Trading 212 → Settings → API, generate a key with: Metadata, Pies – Read, Pies – Write.\n");

await rl.question("1) Click COPY next to the API KEY in Trading 212, then press Enter here… ");
const key = clipboard();
console.log(`   got key: ${mask(key)}`);

await rl.question("2) Now click COPY next to the API SECRET, then press Enter here… ");
const secret = clipboard();
console.log(`   got secret: ${secret.length} characters`);

if (!key || !secret) {
  console.log("\n✗ Clipboard was empty. Run the command again.");
  process.exit(1);
}
if (key === secret) {
  console.log("\n✗ Key and secret are identical: the second copy didn't happen. Run the command again.");
  process.exit(1);
}
if (/\s/.test(key) || /\s/.test(secret)) {
  console.log("\n✗ The copied text contains spaces or line breaks, so it isn't a single key. Use Trading 212's copy buttons.");
  process.exit(1);
}

console.log("\nChecking with Trading 212 (nothing will be created)…");
const auth = "Basic " + Buffer.from(`${key}:${secret}`).toString("base64");
const base = "https://live.trading212.com/api/v0";
const check = async (path: string, init: RequestInit = {}) =>
  (await fetch(base + path, { ...init, headers: { Authorization: auth, "Content-Type": "application/json" } })).status;

const read = await check("/equity/pies");
await new Promise((r) => setTimeout(r, 1500));
const meta = await check("/equity/metadata/instruments");
await new Promise((r) => setTimeout(r, 1500));
// Deliberately invalid body: 400 = allowed to create, 403 = missing "Pies – Write".
const write = await check("/equity/pies", { method: "POST", body: JSON.stringify({ name: "", instrumentShares: {} }) });

const ok = (s: number) => (s === 200 || s === 400 ? "✓" : "✗");
console.log(`   ${ok(read)} key & secret accepted   (${read})`);
console.log(`   ${ok(meta)} Metadata permission     (${meta})`);
console.log(`   ${write === 403 || write === 401 ? "✗" : "✓"} Pies – Write permission (${write})`);

if (read === 401) {
  console.log("\n✗ Trading 212 doesn't recognise this key/secret pair. Generate a fresh key and run this again.");
  process.exit(1);
}
if (meta === 403 || write === 403) {
  console.log("\n✗ The key works but is missing a permission (see ✗ above). Generate a new key with Metadata, Pies – Read and Pies – Write.");
  process.exit(1);
}

const file = ".env.local";
let env = existsSync(file) ? readFileSync(file, "utf8") : "";
const set = (name: string, value: string) => {
  const line = `${name}='${value}'`;
  env = new RegExp(`^${name}=.*$`, "m").test(env) ? env.replace(new RegExp(`^${name}=.*$`, "m"), line) : `${env.trimEnd()}\n${line}\n`;
};
set("T212_API_KEY", key);
set("T212_API_SECRET", secret);
writeFileSync(file, env);
console.log(`\n✓ Saved to ${file}. Restart the dev server (Ctrl+C, npm run dev) and use “Create in Trading 212”.\n`);
rl.close();
process.exit(0);
