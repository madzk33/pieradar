/**
 * Connect a Trading 212 account for one-click pie creation.
 *   POST   { apiKey, apiSecret } → verify with Trading 212, store encrypted in an HttpOnly cookie
 *   GET    → { connected, keyHint, source }
 *   DELETE → disconnect
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { env } from "@/lib/env";
import { SESSION_COOKIE, SESSION_MAX_AGE, openCredentials, sealCredentials } from "@/lib/broker-session";
import { operatorAccounts, verifyCreateAccess } from "@/lib/sources/t212";
import { SourceError } from "@/lib/sources";

const Body = z.object({
  apiKey: z.string().trim().min(8).max(200),
  apiSecret: z.string().trim().min(1).max(200),
});

export async function GET() {
  const jar = await cookies();
  const conn = openCredentials(jar.get(SESSION_COOKIE)?.value);
  if (conn) return NextResponse.json({ connected: true, keyHint: conn.key.slice(-4), source: "browser" });
  const owner = env.ALLOW_OWNER_CREATE === "on" ? operatorAccounts()[0] : undefined;
  if (owner) return NextResponse.json({ connected: true, keyHint: owner.key.slice(-4), source: "settings" });
  return NextResponse.json({ connected: false });
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter both the API key and the API secret" }, { status: 400 });
  const { apiKey, apiSecret } = parsed.data;
  try {
    await verifyCreateAccess({ key: apiKey, secret: apiSecret, live: true });
  } catch (err) {
    const status = err instanceof SourceError ? err.opts.status : undefined;
    const message =
      status === 401
        ? "Trading 212 doesn't recognise this key and secret. Copy both again with Trading 212's copy buttons."
        : status === 403
          ? "This key works but isn't allowed to create pies. Create a key with Metadata and Pies – Write ticked."
          : (err as Error).message || "Couldn't reach Trading 212";
    return NextResponse.json({ error: message }, { status: status && status < 500 ? status : 502 });
  }
  const res = NextResponse.json({ connected: true, keyHint: apiKey.slice(-4), source: "browser" });
  res.cookies.set(SESSION_COOKIE, sealCredentials({ key: apiKey, secret: apiSecret }), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/api/broker",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ connected: false });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "strict", path: "/api/broker", maxAge: 0 });
  return res;
}
