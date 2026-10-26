"use client";

/** Watchlist + compare tray, persisted per browser. */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

const WATCH_KEY = "pieradar:watchlist";
const COMPARE_KEY = "pieradar:compare";
export const COMPARE_MAX = 4;

interface Collections {
  watchlist: string[];
  isWatched: (id: string) => boolean;
  toggleWatch: (id: string) => void;
  compare: string[];
  inCompare: (id: string) => boolean;
  toggleCompare: (id: string) => void;
  clearCompare: () => void;
  ready: boolean;
}

const Ctx = createContext<Collections | null>(null);

function read(key: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function write(key: string, v: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    // storage unavailable (private mode) — keep in memory only
  }
}

export function CollectionsProvider({ children }: { children: ReactNode }) {
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [compare, setCompare] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setWatchlist(read(WATCH_KEY));
    setCompare(read(COMPARE_KEY));
    setReady(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key === WATCH_KEY) setWatchlist(read(WATCH_KEY));
      if (e.key === COMPARE_KEY) setCompare(read(COMPARE_KEY));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const toggleWatch = useCallback((id: string) => {
    setWatchlist((w) => {
      const next = w.includes(id) ? w.filter((x) => x !== id) : [id, ...w];
      write(WATCH_KEY, next);
      return next;
    });
  }, []);

  const toggleCompare = useCallback((id: string) => {
    setCompare((c) => {
      const next = c.includes(id) ? c.filter((x) => x !== id) : [...c, id].slice(-COMPARE_MAX);
      write(COMPARE_KEY, next);
      return next;
    });
  }, []);

  const clearCompare = useCallback(() => {
    setCompare([]);
    write(COMPARE_KEY, []);
  }, []);

  const value = useMemo<Collections>(
    () => ({
      watchlist,
      isWatched: (id) => watchlist.includes(id),
      toggleWatch,
      compare,
      inCompare: (id) => compare.includes(id),
      toggleCompare,
      clearCompare,
      ready,
    }),
    [watchlist, compare, toggleWatch, toggleCompare, clearCompare, ready],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCollections() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCollections outside provider");
  return c;
}
