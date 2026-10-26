/**
 * "Connected account" for one-click pie creation. The Trading 212 key + secret
 * are encrypted (AES-256-GCM) into an HttpOnly cookie: page scripts can't read
 * it, and it's useless without the server's session secret.
 */
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { T212Credentials } from "./sources/t212";

export const SESSION_COOKIE = "pr_broker";
export const SESSION_MAX_AGE = 30 * 24 * 3600; // 30 days

let cachedKey: Buffer | null = null;

/** BROKER_SESSION_SECRET in production; locally a random secret persisted in .data/. */
function sessionKey(): Buffer {
  if (cachedKey) return cachedKey;
  let secret = process.env.BROKER_SESSION_SECRET;
  if (!secret) {
    const file = path.join(process.cwd(), ".data", "broker-session-secret");
    if (existsSync(file)) secret = readFileSync(file, "utf8").trim();
    else {
      secret = randomBytes(32).toString("hex");
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, secret, { mode: 0o600 });
    }
  }
  cachedKey = createHash("sha256").update(secret).digest();
  return cachedKey;
}

export function sealCredentials(creds: { key: string; secret: string }): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", sessionKey(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify({ k: creds.key, s: creds.secret }), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64url");
}

export function openCredentials(sealed: string | undefined): T212Credentials | null {
  if (!sealed) return null;
  try {
    const buf = Buffer.from(sealed, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", sessionKey(), buf.subarray(0, 12));
    decipher.setAuthTag(buf.subarray(12, 28));
    const json = Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
    const { k, s } = JSON.parse(json) as { k: string; s: string };
    return k ? { key: k, secret: s ?? "", live: true } : null;
  } catch {
    return null; // tampered, or the session secret changed
  }
}
