"use client";

import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ExternalLink, Link2, Loader2, PieChart, ShieldCheck, Unlink, X } from "lucide-react";
import type { PieDetail } from "@/lib/types";
import { pct } from "@/lib/format";
import { InstrumentLogo } from "./instrument-logo";

const BROKER_APP_URL = "https://app.trading212.com";

type Connection = { connected: false } | { connected: true; keyHint: string; source: "browser" | "settings" };

/**
 * "Create in Trading 212": creates this pie (holdings + target weights) in the
 * user's own account through the official API. Nothing is invested.
 */
export function CreateInBroker({ pie, grow }: { pie: PieDetail; grow?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={clsx(
          "flex h-10 items-center justify-center gap-2 rounded-full bg-accent px-4 text-[13.5px] font-semibold text-white transition-transform active:scale-[0.97]",
          grow && "w-full",
        )}
      >
        <PieChart size={16} /> Create in Trading 212
      </button>
      <CreateDialog open={open} onClose={() => setOpen(false)} pie={pie} />
    </>
  );
}

type Result = { kind: "idle" } | { kind: "busy" } | { kind: "done"; name: string; instruments: number } | { kind: "error"; message: string };

function CreateDialog({ open, onClose, pie }: { open: boolean; onClose: () => void; pie: PieDetail }) {
  const [tab, setTab] = useState<"connected" | "connect">("connected");
  const [conn, setConn] = useState<Connection | null>(null);
  const [name, setName] = useState(pie.name.slice(0, 50));
  const [key, setKey] = useState("");
  const [secret, setSecret] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [result, setResult] = useState<Result>({ kind: "idle" });

  const loadConnection = useCallback(async () => {
    try {
      const c = (await (await fetch("/api/broker/connect", { cache: "no-store" })).json()) as Connection;
      setConn(c);
      setTab(c.connected ? "connected" : "connect");
    } catch {
      setConn({ connected: false });
      setTab("connect");
    }
  }, []);

  useEffect(() => {
    if (!open) {
      setSecret("");
      return;
    }
    setResult({ kind: "idle" });
    setConnectError(null);
    loadConnection();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, loadConnection]);

  const connect = async () => {
    setConnecting(true);
    setConnectError(null);
    try {
      const res = await fetch("/api/broker/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: key.trim(), apiSecret: secret.trim() }),
      });
      const json = (await res.json()) as Connection & { error?: string };
      if (json.connected) {
        setConn(json);
        setKey("");
        setSecret("");
        setTab("connected");
      } else setConnectError(json.error ?? "Couldn't connect.");
    } catch {
      setConnectError("Network error, please try again.");
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    await fetch("/api/broker/connect", { method: "DELETE" }).catch(() => {});
    await loadConnection();
  };

  const create = async () => {
    setResult({ kind: "busy" });
    try {
      const res = await fetch("/api/broker/create-pie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pieId: pie.id, name }),
      });
      const json = (await res.json()) as { ok?: boolean; name?: string; instruments?: number; error?: string };
      if (json.ok) setResult({ kind: "done", name: json.name ?? name, instruments: json.instruments ?? pie.holdingsCount });
      else if (json.error === "needKey") {
        setTab("connect");
        setResult({ kind: "idle" });
      } else setResult({ kind: "error", message: json.error ?? "Couldn't create the pie." });
    } catch {
      setResult({ kind: "error", message: "Network error, please try again." });
    }
  };

  const busy = result.kind === "busy";

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 z-50 bg-black/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Create pie in Trading 212"
            className="safe-bottom fixed inset-x-0 bottom-0 z-50 max-h-[90dvh] overflow-y-auto rounded-t-[24px] border-t border-line bg-surface md:inset-x-auto md:bottom-auto md:left-1/2 md:top-[8vh] md:w-[480px] md:-translate-x-1/2 md:rounded-[24px] md:border"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 38 }}
          >
            <div className="flex items-center justify-between px-5 pb-1 pt-4">
              <h2 className="text-[18px] font-semibold">Create in Trading 212</h2>
              <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-surface-3">
                <X size={18} />
              </button>
            </div>

            {result.kind === "done" ? (
              <div className="px-5 pb-6 pt-3 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-up-soft text-up">
                  <Check size={24} />
                </div>
                <p className="mt-3 text-[15px] font-semibold">“{result.name}” was created</p>
                <p className="mt-1 text-[13px] text-muted">
                  {result.instruments} holdings with the same target weights, in the Trading 212 account your key belongs to (e.g. your Stocks ISA).
                  Nothing has been invested. Open Trading 212 → Pies to fund it.
                </p>
                <a
                  href={BROKER_APP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-5 flex h-11 items-center justify-center gap-2 rounded-full bg-accent text-[14px] font-semibold text-white"
                >
                  Open Trading 212 <ExternalLink size={15} />
                </a>
              </div>
            ) : (
              <div className="space-y-4 px-5 pb-5 pt-2">
                <p className="text-[13px] text-muted">
                  Creates this pie with the same holdings and target weights in your account. <strong className="text-fg">No money is invested</strong>.
                </p>

                <div className="grid grid-cols-2 gap-1 rounded-full bg-surface-2 p-1 text-[12.5px]">
                  <TabButton active={tab === "connected"} onClick={() => setTab("connected")}>
                    My connected account
                  </TabButton>
                  <TabButton active={tab === "connect"} onClick={() => setTab("connect")}>
                    Connect account
                  </TabButton>
                </div>

                {tab === "connect" ? (
                  <div className="space-y-3">
                    <p className="text-[12.5px] text-muted">
                      Trading 212 → Settings → API: create a key with <span className="text-fg">Metadata</span> and{" "}
                      <span className="text-fg">Pies – Write</span>, then paste it here.
                    </p>
                    <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="API key" autoComplete="off" spellCheck={false} className={inputCls} />
                    <input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="API secret" autoComplete="off" className={inputCls} />
                    {connectError && <p className="rounded-xl border border-down/40 bg-down-soft p-3 text-[13px]">{connectError}</p>}
                    <button
                      type="button"
                      disabled={connecting || key.trim().length < 8 || !secret.trim()}
                      onClick={connect}
                      className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-accent text-[14px] font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
                    >
                      {connecting ? <Loader2 size={16} className="animate-spin" /> : <Link2 size={16} />}
                      {connecting ? "Checking with Trading 212…" : "Connect account"}
                    </button>
                    <p className="flex items-start gap-2 text-[11.5px] text-dim">
                      <ShieldCheck size={14} className="mt-0.5 shrink-0 text-up" />
                      Checked with Trading 212 (nothing is created), then kept encrypted in this browser where page scripts can&apos;t read it.
                      Disconnect anytime.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {conn === null ? (
                      <div className="skeleton h-14 rounded-xl" />
                    ) : conn.connected ? (
                      <div className="flex items-center gap-3 rounded-xl border border-up/30 bg-up-soft/50 p-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-up-soft text-up">
                          <Check size={18} />
                        </span>
                        <div className="min-w-0 flex-1 text-[13px]">
                          <div className="font-semibold">Trading 212 account connected</div>
                          <div className="text-muted">
                            Key ending <span className="font-mono text-fg">…{conn.keyHint}</span>
                            {conn.source === "settings" ? " · from your server settings" : " · saved in this browser"}
                          </div>
                        </div>
                        {conn.source === "browser" && (
                          <button type="button" onClick={disconnect} className="flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[12px] text-muted hover:bg-surface-3 hover:text-fg">
                            <Unlink size={13} /> Disconnect
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="rounded-xl bg-surface-2 p-3 text-[13px] text-muted">
                        No account connected yet.{" "}
                        <button type="button" onClick={() => setTab("connect")} className="font-medium text-accent hover:underline">
                          Connect account →
                        </button>
                      </div>
                    )}

                    <label className="block">
                      <span className="mb-1.5 block text-[12.5px] font-medium text-muted">Pie name</span>
                      <input value={name} maxLength={50} onChange={(e) => setName(e.target.value)} className={inputCls} />
                    </label>

                    <div className="rounded-xl bg-surface-2 p-3">
                      <div className="mb-2 text-[12px] text-dim">{pie.holdingsDetail.length} holdings</div>
                      <ul className="max-h-[150px] space-y-1.5 overflow-y-auto">
                        {pie.holdingsDetail.map((h) => (
                          <li key={h.ticker} className="flex items-center gap-2 text-[13px]">
                            <InstrumentLogo ticker={h.ticker} domain={h.domain} color={h.color} size={20} />
                            <span className="font-medium">{h.ticker}</span>
                            <span className="truncate text-muted">{h.name}</span>
                            <span className="ml-auto tabular">{pct(h.target, { sign: false, digits: 1 })}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {result.kind === "error" && <p className="rounded-xl border border-down/40 bg-down-soft p-3 text-[13px]">{result.message}</p>}

                    <button
                      type="button"
                      disabled={busy || !conn?.connected || !name.trim()}
                      onClick={create}
                      className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-accent text-[14px] font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
                    >
                      {busy ? <Loader2 size={16} className="animate-spin" /> : <PieChart size={16} />}
                      {busy ? "Creating in Trading 212…" : "Create pie"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx("rounded-full px-3 py-1.5 font-medium transition-colors", active ? "bg-fg text-bg" : "text-muted hover:text-fg")}
    >
      {children}
    </button>
  );
}

const inputCls =
  "h-11 w-full rounded-xl border border-line bg-surface px-3 text-[16px] text-fg outline-none placeholder:text-dim focus:border-accent md:text-[14px]";
