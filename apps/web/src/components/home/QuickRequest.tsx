import * as React from "react";
import {
  buildQuickRequestText,
  buildWhatsappUrl,
  WHATSAPP_NUMBER,
} from "@flowers/integrations";
import { variantDisplayName, type FlowerVariantRow } from "@flowers/api/flowers";
import { Minus, Plus, Search, Send, X } from "lucide-react";
import { useT } from "../../i18n/react";
import { track } from "../../lib/analytics";

type Unit = "stem" | "bunch" | "arrangement" | "item";
interface Line {
  id: string;
  name: string;
  qty: number;
  unit: Unit;
}

const STORAGE_KEY = "fm_quick_request_v1";

const COPY = {
  en: {
    title: "Request flowers in 30 seconds",
    sub: "Pick or type what you need. We reply on WhatsApp with availability and price.",
    search: "Search flowers — rose, orchid, jasmine…",
    popular: "Popular",
    yourList: "Your list",
    empty: "Nothing added yet — tap a flower above.",
    addCustom: "Add “{q}” as written",
    noMatch: "No match in our list.",
    paste: "Or type / paste your whole list",
    pastePlaceholder: "e.g. 50 red roses, 20 white orchids, 10 jasmine bunches",
    name: "Your name",
    phone: "Phone (optional)",
    date: "Date needed",
    area: "Delivery area",
    send: "Send request on WhatsApp",
    items: "{n} in list",
    remove: "Remove",
    more: "Increase",
    less: "Decrease",
    units: { stem: "stems", bunch: "bunches", arrangement: "arrangements", item: "items" },
    hint: "No payment now. Opens WhatsApp with your list ready.",
  },
  si: {
    title: "තත්පර 30කින් මල් ඉල්ලන්න",
    sub: "අවශ්‍ය මල් තෝරන්න හෝ ටයිප් කරන්න. WhatsApp හරහා මිල සහ ලබාගත හැකි බව දන්වමු.",
    search: "මල් සොයන්න — රෝස, ඕකිඩ්, සමන්පිච්ච…",
    popular: "ජනප්‍රිය",
    yourList: "ඔබේ ලැයිස්තුව",
    empty: "තවම කිසිවක් නැත — ඉහළින් මලක් තට්ටු කරන්න.",
    addCustom: "“{q}” ලෙසම එක් කරන්න",
    noMatch: "ලැයිස්තුවේ නැත.",
    paste: "හෝ සම්පූර්ණ ලැයිස්තුව ටයිප් / පේස්ට් කරන්න",
    pastePlaceholder: "උදා: රතු රෝස 50, සුදු ඕකිඩ් 20, සමන්පිච්ච 10",
    name: "ඔබේ නම",
    phone: "දුරකථනය (අවශ්‍ය නැත)",
    date: "අවශ්‍ය දිනය",
    area: "ලබාදෙන ප්‍රදේශය",
    send: "WhatsApp හරහා ඉල්ලීම යවන්න",
    items: "මල් වර්ග {n}",
    remove: "ඉවත් කරන්න",
    more: "වැඩි කරන්න",
    less: "අඩු කරන්න",
    units: { stem: "කඳ", bunch: "ගොන්න", arrangement: "සැකසුම්", item: "ඒකක" },
    hint: "දැන් ගෙවීමක් නැත. ලැයිස්තුව සමඟ WhatsApp විවෘත වේ.",
  },
} as const;

export function QuickRequest({
  flowers,
  featured,
}: {
  flowers: FlowerVariantRow[];
  featured: FlowerVariantRow[];
}) {
  const { locale } = useT();
  const c = COPY[locale];
  const [lines, setLines] = React.useState<Line[]>([]);
  const [query, setQuery] = React.useState("");
  const [freeText, setFreeText] = React.useState("");
  const [showPaste, setShowPaste] = React.useState(false);
  const [contact, setContact] = React.useState({ name: "", phone: "", date: "", area: "" });
  const [hydrated, setHydrated] = React.useState(false);
  const [focused, setFocused] = React.useState(false);

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const d = JSON.parse(raw) as { lines?: Line[]; freeText?: string; contact?: typeof contact };
        if (Array.isArray(d.lines)) setLines(d.lines);
        if (typeof d.freeText === "string") {
          setFreeText(d.freeText);
          if (d.freeText) setShowPaste(true);
        }
        if (d.contact) setContact((p) => ({ ...p, ...d.contact }));
      }
    } catch {
      /* storage unavailable */
    }
    setHydrated(true);
  }, []);

  React.useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ lines, freeText, contact }));
    } catch {
      /* ignore */
    }
  }, [lines, freeText, contact, hydrated]);

  const matches = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return flowers
      .filter(
        (f) =>
          variantDisplayName(f, "en").toLowerCase().includes(q) ||
          f.nameSi.includes(query.trim()) ||
          (f.localName?.toLowerCase().includes(q) ?? false),
      )
      .slice(0, 6);
  }, [flowers, query]);

  function addLine(id: string, name: string, unit: Unit) {
    setLines((cur) => {
      const hit = cur.find((l) => l.id === id);
      if (hit) return cur.map((l) => (l.id === id ? { ...l, qty: l.qty + 1 } : l));
      return [...cur, { id, name, qty: 1, unit }];
    });
    setQuery("");
  }
  const addFlower = (f: FlowerVariantRow) =>
    addLine(`v-${f.id}`, variantDisplayName(f, locale), f.defaultUnit);
  const addCustom = (text: string) =>
    addLine(`c-${text.toLowerCase()}`, text, "stem");

  function patch(id: string, p: Partial<Line>) {
    setLines((cur) => cur.map((l) => (l.id === id ? { ...l, ...p } : l)));
  }

  function onSearchKey(e: React.KeyboardEvent) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    if (matches[0]) addFlower(matches[0]);
    else addCustom(q);
  }

  const canSend = lines.length > 0 || freeText.trim().length > 0;
  const href = buildWhatsappUrl(
    buildQuickRequestText({
      lines: lines.map((l) => ({ name: l.name, qty: l.qty, unit: l.unit })),
      freeText,
      name: contact.name,
      phone: contact.phone,
      dateNeeded: contact.date,
      area: contact.area,
    }),
    WHATSAPP_NUMBER,
  );

  const field =
    "h-11 w-full rounded-xl border border-border bg-background px-3 text-[15px] outline-none transition focus:border-brand focus:ring-2 focus:ring-ring/30";

  return (
    <section
      id="quick-request"
      aria-labelledby="quick-request-title"
      className="rounded-3xl border border-border bg-background p-4 shadow-float sm:p-6"
    >
      <h2 id="quick-request-title" className="font-display text-2xl leading-tight sm:text-[1.75rem]">
        {c.title}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{c.sub}</p>

      {/* Search */}
      <div className="relative mt-4">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onSearchKey}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder={c.search}
          aria-label={c.search}
          autoComplete="off"
          className={`${field} pl-10`}
        />
        {focused && query.trim() && (
          <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-border bg-background shadow-float">
            {matches.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => addFlower(f)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left text-[15px] hover:bg-accent"
                >
                  {f.imageUrl ? (
                    <img src={f.imageUrl} alt="" className="size-8 rounded-lg object-cover" />
                  ) : (
                    <span className="size-8 rounded-lg bg-muted" />
                  )}
                  <span className="flex-1">{variantDisplayName(f, locale)}</span>
                  <Plus className="size-4 text-brand-ink" aria-hidden="true" />
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => addCustom(query.trim())}
                className="w-full px-3 py-2 text-left text-sm text-muted-foreground hover:bg-accent"
              >
                {matches.length === 0 && <span>{c.noMatch} </span>}
                <span className="font-medium text-foreground">
                  {c.addCustom.replace("{q}", query.trim())}
                </span>
              </button>
            </li>
          </ul>
        )}
      </div>

      {/* Popular chips */}
      {featured.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">{c.popular}</p>
          <ul className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {featured.slice(0, 10).map((f) => (
              <li key={f.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => addFlower(f)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground/[0.06] pl-1 pr-3 text-sm font-medium transition-colors hover:bg-foreground/10 active:scale-95"
                >
                  {f.imageUrl ? (
                    <img src={f.imageUrl} alt="" className="size-7 rounded-full object-cover" />
                  ) : (
                    <span className="size-7" />
                  )}
                  {variantDisplayName(f, locale)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* List */}
      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{c.yourList}</p>
          {lines.length > 0 && (
            <span className="text-xs text-muted-foreground">{c.items.replace("{n}", String(lines.length))}</span>
          )}
        </div>
        {lines.length === 0 ? (
          <p className="rounded-xl bg-muted/60 px-3 py-4 text-center text-sm text-muted-foreground">{c.empty}</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {lines.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-x-2 gap-y-1.5 p-2.5">
                <span className="min-w-0 flex-1 basis-32 truncate text-[15px] font-medium">{l.name}</span>
                <div className="flex items-center">
                  <button type="button" aria-label={c.less} onClick={() => patch(l.id, { qty: Math.max(1, l.qty - (l.qty > 20 ? 10 : 1)) })} className="flex size-8 items-center justify-center rounded-full border border-border hover:bg-accent">
                    <Minus className="size-3.5" aria-hidden="true" />
                  </button>
                  <input
                    inputMode="numeric"
                    aria-label="Quantity"
                    value={l.qty}
                    onChange={(e) => patch(l.id, { qty: Math.max(1, Math.floor(Number(e.target.value.replace(/\D/g, "")) || 1)) })}
                    className="w-12 bg-transparent text-center text-sm tabular-nums outline-none"
                  />
                  <button type="button" aria-label={c.more} onClick={() => patch(l.id, { qty: l.qty + (l.qty >= 20 ? 10 : 1) })} className="flex size-8 items-center justify-center rounded-full border border-border hover:bg-accent">
                    <Plus className="size-3.5" aria-hidden="true" />
                  </button>
                </div>
                <select
                  value={l.unit}
                  onChange={(e) => patch(l.id, { unit: e.target.value as Unit })}
                  aria-label="Unit"
                  className="h-8 rounded-lg border border-border bg-background px-1.5 text-sm"
                >
                  {(Object.keys(c.units) as Unit[]).map((u) => (
                    <option key={u} value={u}>{c.units[u]}</option>
                  ))}
                </select>
                <button type="button" aria-label={c.remove} onClick={() => setLines((cur) => cur.filter((x) => x.id !== l.id))} className="flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                  <X className="size-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <button type="button" onClick={() => setShowPaste((v) => !v)} className="mt-2 text-sm font-medium text-brand-ink underline-offset-4 hover:underline">
          {c.paste}
        </button>
        {showPaste && (
          <textarea
            rows={3}
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            placeholder={c.pastePlaceholder}
            className="mt-2 w-full rounded-xl border border-border bg-background p-3 text-[15px] outline-none focus:border-brand focus:ring-2 focus:ring-ring/30"
          />
        )}
      </div>

      {/* Contact */}
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <input className={field} placeholder={c.name} aria-label={c.name} value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} />
        <input className={field} placeholder={c.phone} aria-label={c.phone} inputMode="tel" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} />
        <input className={field} type="date" aria-label={c.date} title={c.date} value={contact.date} onChange={(e) => setContact({ ...contact, date: e.target.value })} />
        <input className={field} placeholder={c.area} aria-label={c.area} value={contact.area} onChange={(e) => setContact({ ...contact, area: e.target.value })} />
      </div>

      <a
        href={canSend ? href : undefined}
        aria-disabled={!canSend}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => {
          if (!canSend) return e.preventDefault();
          track.whatsappLead("home_quick_request");
        }}
        className={`mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#25D366] text-[15px] font-semibold text-white transition ${canSend ? "hover:bg-[#1fb457] active:scale-[0.99]" : "pointer-events-none opacity-50"}`}
      >
        <Send className="size-4" aria-hidden="true" />
        {c.send}
      </a>
      <p className="mt-2 text-center text-xs text-muted-foreground">{c.hint}</p>
    </section>
  );
}
