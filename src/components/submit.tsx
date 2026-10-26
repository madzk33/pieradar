"use client";

import Link from "next/link";
import { useState } from "react";
import clsx from "clsx";
import { BadgeCheck, KeyRound, Link2, Loader2, ShieldCheck, UserPen } from "lucide-react";

type Mode = "import" | "manual";

export function Submit({ importEnabled }: { importEnabled: boolean }) {
  const [mode, setMode] = useState<Mode>(importEnabled ? "import" : "manual");
  return (
    <div className="mx-auto max-w-[640px]">
      <h1 className="text-[26px] font-bold tracking-tight md:text-[32px]">Add a real pie</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-muted">
        Trading 212 doesn&apos;t publish a list of every public pie, and it blocks automated access to share pages. Real pies get into
        PieRadar through the official Trading 212 API or by submitting a share link. Once a pie is in, its returns update live from market
        prices.
      </p>

      <div className="mt-5 grid grid-cols-2 gap-2">
        <ModeButton active={mode === "import"} disabled={!importEnabled} onClick={() => setMode("import")} icon={<BadgeCheck size={18} />} title="Import my pies" sub="Verified · official API" />
        <ModeButton active={mode === "manual"} onClick={() => setMode("manual")} icon={<UserPen size={18} />} title="Submit a share link" sub="Anyone's pie · unverified" />
      </div>

      <div className="mt-4 rounded-[var(--radius-card)] border border-line bg-surface p-4 md:p-5">{mode === "import" ? <ImportForm /> : <ManualForm />}</div>
    </div>
  );
}

function ModeButton({ active, disabled, onClick, icon, title, sub }: { active: boolean; disabled?: boolean; onClick: () => void; icon: React.ReactNode; title: string; sub: string }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        "flex items-start gap-2.5 rounded-2xl border p-3 text-left transition-colors disabled:opacity-40",
        active ? "border-accent bg-accent-soft" : "border-line bg-surface hover:border-line-strong",
      )}
    >
      <span className={active ? "text-accent" : "text-muted"}>{icon}</span>
      <span>
        <span className="block text-[14px] font-semibold">{title}</span>
        <span className="block text-[12px] text-muted">{sub}</span>
      </span>
    </button>
  );
}

function ImportForm() {
  const [key, setKey] = useState("");
  const [secret, setSecret] = useState("");
  const [creator, setCreator] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ error?: string; total?: number; skippedPrivate?: number; imported?: { id: string; name: string }[] } | null>(null);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setResult(null);
        try {
          const res = await fetch("/api/submit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode: "import", apiKey: key.trim(), apiSecret: secret.trim(), creator }),
          });
          setResult(await res.json());
        } catch {
          setResult({ error: "Network error, please try again" });
        } finally {
          setBusy(false);
          setSecret("");
        }
      }}
      className="space-y-4"
    >
      <ol className="list-decimal space-y-1 pl-5 text-[13px] text-muted">
        <li>
          In Trading 212 go to <span className="text-fg">Settings → API (Beta)</span> and generate a key.
        </li>
        <li>
          Give it <span className="text-fg">only the Pies read permission</span>. Nothing else is needed.
        </li>
        <li>Make sure the pies you want listed are shared publicly (they need a share link).</li>
      </ol>
      <Field label="API key">
        <input value={key} onChange={(e) => setKey(e.target.value)} required autoComplete="off" spellCheck={false} className={inputCls} />
      </Field>
      <Field label="API secret">
        <input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} required autoComplete="off" className={inputCls} />
      </Field>
      <Field label="Display name (optional)">
        <input value={creator} onChange={(e) => setCreator(e.target.value)} maxLength={40} placeholder="Shown as the pie's creator" className={inputCls} />
      </Field>
      <p className="flex items-start gap-2 rounded-xl bg-surface-2 p-3 text-[12px] text-muted">
        <ShieldCheck size={16} className="mt-0.5 shrink-0 text-up" />
        Your key is used once to read your pies and is then discarded. It is never stored or logged. Only pies with a public share link are
        imported. Revoke the key in Trading 212 afterwards if you like.
      </p>
      <button type="submit" disabled={busy} className={btnCls}>
        {busy ? (
          <>
            <Loader2 size={16} className="animate-spin" /> Importing… (Trading 212 allows one pie every 5s)
          </>
        ) : (
          <>
            <KeyRound size={16} /> Import my public pies
          </>
        )}
      </button>
      {result && <Result result={result} />}
    </form>
  );
}

function Result({ result }: { result: { error?: string; total?: number; skippedPrivate?: number; imported?: { id: string; name: string }[] } }) {
  if (result.error) return <p className="rounded-xl border border-down/40 bg-down-soft p-3 text-[13px]">{result.error}</p>;
  return (
    <div className="rounded-xl border border-up/30 bg-up-soft p-3 text-[13px]">
      <p>
        Found {result.total} pies: imported <strong>{result.imported?.length ?? 0}</strong>
        {result.skippedPrivate ? `, skipped ${result.skippedPrivate} private` : ""}.
      </p>
      {!!result.imported?.length && (
        <ul className="mt-2 space-y-1">
          {result.imported.map((p) => (
            <li key={p.id}>
              <Link href={`/pie/${p.id}`} className="text-accent hover:underline">
                {p.name} →
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ManualForm() {
  const [shareUrl, setShareUrl] = useState("");
  const [name, setName] = useState("");
  const [creator, setCreator] = useState("");
  const [holdings, setHoldings] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok?: boolean; error?: string; id?: string; updated?: boolean } | null>(null);
  const total = holdings
    .split("\n")
    .map((l) => /([0-9]+(?:[.,][0-9]+)?)\s*%?\s*$/.exec(l.trim())?.[1])
    .reduce((a, v) => a + (v ? Number(v.replace(",", ".")) : 0), 0);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setResult(null);
        try {
          const res = await fetch("/api/submit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode: "manual", shareUrl, name, creator, holdings }),
          });
          setResult(await res.json());
        } catch {
          setResult({ error: "Network error, please try again" });
        } finally {
          setBusy(false);
        }
      }}
      className="space-y-4"
    >
      <Field label="Trading 212 share link">
        <div className="relative">
          <Link2 size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dim" />
          <input value={shareUrl} onChange={(e) => setShareUrl(e.target.value)} required placeholder="https://www.trading212.com/pies/…" className={clsx(inputCls, "pl-9")} />
        </div>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Pie name">
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} className={inputCls} />
        </Field>
        <Field label="Creator (optional)">
          <input value={creator} onChange={(e) => setCreator(e.target.value)} maxLength={40} className={inputCls} />
        </Field>
      </div>
      <Field label={`Holdings, one per line: TICKER PERCENT · total ${total.toFixed(1)}%`}>
        <textarea
          value={holdings}
          onChange={(e) => setHoldings(e.target.value)}
          required
          rows={7}
          placeholder={"NVDA 30\nMSFT 25\nVUSA 25\nASML 20"}
          className={clsx(inputCls, "h-auto py-2.5 font-mono")}
        />
      </Field>
      <button type="submit" disabled={busy} className={btnCls}>
        {busy ? <Loader2 size={16} className="animate-spin" /> : <UserPen size={16} />} Submit pie
      </button>
      {result &&
        (result.ok ? (
          <p className="rounded-xl border border-up/30 bg-up-soft p-3 text-[13px]">
            {result.updated ? "Updated" : "Added"}.{" "}
            <Link href={`/pie/${result.id}`} className="text-accent hover:underline">
              View the pie →
            </Link>
          </p>
        ) : (
          <p className="rounded-xl border border-down/40 bg-down-soft p-3 text-[13px]">{result.error}</p>
        ))}
      <p className="text-[12px] text-dim">Submitted pies are labelled “Submitted” until their owner imports them through the API.</p>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12.5px] font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  "h-11 w-full rounded-xl border border-line bg-surface-2 px-3 text-[16px] text-fg outline-none placeholder:text-dim focus:border-accent md:text-[14px]";
const btnCls =
  "flex h-11 w-full items-center justify-center gap-2 rounded-full bg-accent text-[14px] font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-60";
