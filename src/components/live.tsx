"use client";

/**
 * Live numbers for whatever is on screen. Cards register their id while
 * mounted; one batched request per tick refreshes all of them, so a grid of
 * thousands of pies costs a single small poll for the ~20 that are visible.
 */
import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { LiveEntry } from "@/lib/types";

const POLL_MS = 15_000;

class LiveStore {
  private entries = new Map<string, LiveEntry>();
  private refCounts = new Map<string, number>();
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  lastTick: string | null = null;
  private version = 0;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getVersion = () => this.version;
  get(id: string) {
    return this.entries.get(id);
  }

  watch(id: string) {
    this.refCounts.set(id, (this.refCounts.get(id) ?? 0) + 1);
    this.schedule(800); // newly visible → fetch soon (debounced while scrolling)
    return () => {
      const n = (this.refCounts.get(id) ?? 1) - 1;
      if (n <= 0) this.refCounts.delete(id);
      else this.refCounts.set(id, n);
    };
  }

  /** Fetch right away (tab regained focus, network came back, page opened). */
  refreshNow() {
    if (this.refCounts.size) this.schedule(0);
  }

  private schedule(ms: number) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.tick(), ms);
  }

  private async tick() {
    const ids = [...this.refCounts.keys()].slice(0, 200);
    try {
      if (ids.length && document.visibilityState === "visible") {
        const res = await fetch(`/api/live?ids=${encodeURIComponent(ids.join(","))}`, { cache: "no-store" });
        if (res.ok) {
          const json = (await res.json()) as { data: Record<string, LiveEntry>; at: string };
          for (const [id, e] of Object.entries(json.data)) this.entries.set(id, e);
          this.lastTick = json.at;
          this.version++;
          this.listeners.forEach((l) => l());
        }
      }
    } catch {
      // network blip — try again next tick
    } finally {
      this.schedule(POLL_MS);
    }
  }
}

const Ctx = createContext<LiveStore | null>(null);

export function LiveProvider({ children }: { children: ReactNode }) {
  const ref = useRef<LiveStore | null>(null);
  if (!ref.current) ref.current = new LiveStore();
  useEffect(() => {
    const store = ref.current!;
    const onVisible = () => document.visibilityState === "visible" && store.refreshNow();
    const onWake = () => store.refreshNow();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onWake);
    window.addEventListener("online", onWake);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onWake);
      window.removeEventListener("online", onWake);
    };
  }, []);
  return <Ctx.Provider value={ref.current}>{children}</Ctx.Provider>;
}

/** Subscribe to live numbers for one pie while the calling component is mounted. */
export function useLive(id: string): LiveEntry | undefined {
  const store = useContext(Ctx)!;
  useEffect(() => store.watch(id), [store, id]);
  useSyncExternalStore(store.subscribe, store.getVersion, () => 0);
  return store.get(id);
}

/** Briefly tints its contents green/red whenever `value` moves (remounts to restart the animation). */
export function FlashValue({ value, className = "", children }: { value: number | null | undefined; className?: string; children: ReactNode }) {
  const prev = useRef(value);
  const [flash, setFlash] = useState({ n: 0, cls: "" });
  useEffect(() => {
    const p = prev.current;
    if (value != null && p != null && Math.abs(value - p) > 1e-9) {
      setFlash((f) => ({ n: f.n + 1, cls: value > p ? "flash-up" : "flash-down" }));
    }
    prev.current = value;
  }, [value]);
  return (
    <span key={flash.n} className={`${className} rounded-md ${flash.n ? flash.cls : ""}`}>
      {children}
    </span>
  );
}
