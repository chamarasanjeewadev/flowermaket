/**
 * Client-side "flower enquiry" list — the basket a customer fills before
 * sending their requirements over WhatsApp. Persisted to localStorage so it
 * survives navigation and reloads; no account or backend needed.
 *
 * SSR-safe: state starts empty on the server and loads from storage after
 * mount. `hydrated` gates any UI that would otherwise mismatch (count badge,
 * "Added" state).
 */
import * as React from "react";
import type { EnquiryItem } from "@flowers/integrations";

const STORAGE_KEY = "fm_enquiry_v1";

/** Everything needed to add a product; qty defaults to 1. */
export type EnquiryDraft = Omit<EnquiryItem, "qty"> & { qty?: number };

interface EnquiryContextValue {
  items: EnquiryItem[];
  /** Number of distinct products in the list. */
  count: number;
  hydrated: boolean;
  add: (draft: EnquiryDraft) => void;
  remove: (id: string) => void;
  setQty: (id: string, qty: number) => void;
  clear: () => void;
  has: (id: string) => boolean;
}

const EnquiryContext = React.createContext<EnquiryContextValue | null>(null);

function isEnquiryItem(value: unknown): value is EnquiryItem {
  if (typeof value !== "object" || value === null) return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.slug === "string" &&
    typeof o.nameEn === "string" &&
    (o.nameSi === null || typeof o.nameSi === "string") &&
    typeof o.price === "number" &&
    (o.listingType === "retail" || o.listingType === "wholesale") &&
    typeof o.qty === "number"
  );
}

function readStorage(): EnquiryItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isEnquiryItem) : [];
  } catch {
    return [];
  }
}

export function EnquiryProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<EnquiryItem[]>([]);
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    setItems(readStorage());
    setHydrated(true);
  }, []);

  React.useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Storage full / unavailable — the list simply won't persist.
    }
  }, [items, hydrated]);

  const add = React.useCallback((draft: EnquiryDraft) => {
    const addQty = Math.max(1, Math.floor(draft.qty ?? 1));
    setItems((prev) => {
      const existing = prev.find((i) => i.id === draft.id);
      if (existing) {
        return prev.map((i) =>
          i.id === draft.id ? { ...i, qty: i.qty + addQty } : i,
        );
      }
      const { qty: _drop, ...rest } = draft;
      return [...prev, { ...rest, qty: addQty }];
    });
  }, []);

  const remove = React.useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const setQty = React.useCallback((id: string, qty: number) => {
    const next = Math.max(1, Math.floor(qty));
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, qty: next } : i)));
  }, []);

  const clear = React.useCallback(() => setItems([]), []);

  const value = React.useMemo<EnquiryContextValue>(
    () => ({
      items,
      count: items.length,
      hydrated,
      add,
      remove,
      setQty,
      clear,
      has: (id: string) => items.some((i) => i.id === id),
    }),
    [items, hydrated, add, remove, setQty, clear],
  );

  return (
    <EnquiryContext.Provider value={value}>{children}</EnquiryContext.Provider>
  );
}

export function useEnquiry(): EnquiryContextValue {
  const ctx = React.useContext(EnquiryContext);
  if (!ctx) {
    throw new Error("useEnquiry must be used within an EnquiryProvider");
  }
  return ctx;
}
