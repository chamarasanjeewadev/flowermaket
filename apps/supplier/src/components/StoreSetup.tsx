import { Check } from "lucide-react";
import * as React from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { Button } from "@flowers/ui/components/button";
import { Badge } from "@flowers/ui/components/badge";
import { Input } from "@flowers/ui/components/input";
import { Label } from "@flowers/ui/components/label";
import { getReadinessFn, saveSettingsFn, submitReviewFn } from "../server/portal";
import { useT } from "../i18n/react";
type Readiness = NonNullable<Awaited<ReturnType<typeof getReadinessFn>>>;
export function StoreReadiness({ data }: { data: Readiness | null }) {
  const { locale } = useT(); const si = locale === "si";
  if (!data) return null;
  const steps = [
    { done: true, to: "/shop", text: si ? "නම, වෙළෙන්දා වර්ගය සහ ස්ථානය" : "Shop name, seller type and location" },
    { done: data.consent && data.verified, to: "/shop", text: si ? "WhatsApp දැනුම්දීම් සකසන්න" : "Connect WhatsApp notifications" },
    { done: data.services, to: "/shop", text: si ? "සේවා ප්‍රදේශ සහ සූදානම් කිරීමේ කාලය" : "Set service areas and preparation time" },
    { done: data.description, to: "/shop", text: si ? "සාප්පු විස්තරය (පින්තූර විකල්පයි)" : "Add shop description (branding optional)" },
    { done: data.hasProduct, to: "/products/new", text: si ? "පළමු නිෂ්පාදනය එක් කරන්න" : "Add your first product" },
    { done: ["Submitted", "Approved"].includes(data.status), to: "/shop", text: si ? "සමාලෝචනය සඳහා ඉදිරිපත් කරන්න" : "Submit shop for review" },
  ] as const;
  return <section className="space-y-4 rounded-xl border border-border bg-card p-5">
    <div className="flex flex-wrap justify-between gap-3"><h2 className="text-lg font-semibold">{si ? "ඔබේ සාප්පුව සකසන්න" : "Set up your store"}</h2><Badge>{si ? ({ Draft: "කෙටුම්පත", Submitted: "ඉදිරිපත් කළ", Approved: "අනුමත කළ", "Changes requested": "වෙනස්කම් අවශ්‍යයි", Paused: "තාවකාලිකව නවතා ඇත" } as Record<string, string>)[data.status] : data.status}</Badge></div>
    <p className="text-sm text-muted-foreground">{steps.filter(s => s.done).length}/6 · {data.live ? (si ? "සාප්පුව සජීවීයි" : "Store live") : !data.hasProduct ? (si ? "සාප්පුව දියත් කිරීමට නිෂ්පාදනයක් එක් කරන්න." : "Add a product to launch your store.") : (si ? "අනුමත කළ නිෂ්පාදනයක් සහ ව්‍යාපාර අනුමැතිය අවශ්‍යයි." : "Business approval and an approved published product are required to go live.")}</p>
    {data.reason && <p role="status" className="rounded-lg bg-muted p-3 text-sm">{data.reason}</p>}
    <ol className="grid gap-2 sm:grid-cols-2">{steps.map((step, index) => <li key={step.text}><Link to={step.to} className="flex min-h-11 items-center gap-3 rounded-lg border border-border p-3 text-sm hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"><span aria-label={step.done ? (si ? "සම්පූර්ණයි" : "Complete") : (si ? "අසම්පූර්ණයි" : "Incomplete")} className="font-semibold text-brand">{step.done ? <Check aria-hidden="true" className="size-4" /> : index + 1}</span>{step.text}</Link></li>)}</ol>
  </section>;
}
export function PortalSettings({ data }: { data: Readiness }) {
  const { locale } = useT(); const si = locale === "si"; const router = useRouter();
  const [form, setForm] = React.useState({ phone: data.phone, consent: data.consent, language: data.language, ...data.service });
  const [busy, setBusy] = React.useState(false); const [message, setMessage] = React.useState<string | null>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMessage(null);
    try { const result = await saveSettingsFn({ data: form }); setMessage(result.ok ? (si ? "සැකසුම් සුරකින ලදී." : "Settings saved. Number changes require verification by FlowerMarket.") : result.message); if (result.ok) await router.invalidate(); }
    catch { setMessage(si ? "සුරැකීම අසාර්ථකයි." : "Could not save settings. Please try again."); } finally { setBusy(false); }
  }
  async function review() {
    setBusy(true); setMessage(null);
    try { const result = await submitReviewFn(); setMessage(result.ok ? (si ? "සමාලෝචනය සඳහා ඉදිරිපත් කරන ලදී." : "Shop submitted for review.") : result.message); if (result.ok) await router.invalidate(); }
    catch { setMessage(si ? "ඉදිරිපත් කිරීම අසාර්ථකයි." : "Could not submit. Please try again."); } finally { setBusy(false); }
  }
  return <section className="space-y-5 rounded-xl border border-border bg-card p-5">
    <h2 className="text-lg font-semibold">{si ? "සේවා සහ දැනුම්දීම්" : "Services & notifications"}</h2>
    <form onSubmit={e => void save(e)} className="space-y-4">
      <div className="space-y-2"><Label htmlFor="service-areas">{si ? "සේවා ප්‍රදේශ" : "Service areas"}</Label><Input id="service-areas" value={form.areas} maxLength={1000} onChange={e => setForm({ ...form, areas: e.target.value })} /></div>
      <fieldset className="flex flex-wrap gap-4"><legend className="mb-2 text-sm font-medium">{si ? "ලබා දීමේ විකල්ප" : "Available service options"}</legend>{(["delivery", "collection"] as const).map(key => <label key={key} className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={form[key]} onChange={e => setForm({ ...form, [key]: e.target.checked })} />{key === "delivery" ? (si ? "බෙදාහැරීම" : "Delivery available") : (si ? "ලබා ගැනීම" : "Collection available")}</label>)}</fieldset>
      <div className="space-y-2"><Label htmlFor="preparation-days">{si ? "සූදානම් කිරීමේ දින" : "Preparation time (days)"}</Label><Input id="preparation-days" type="number" min={0} max={365} required value={form.preparationDays} onChange={e => setForm({ ...form, preparationDays: Number(e.target.value) })} /></div>
      <div className="flex flex-wrap items-center gap-3"><h3 className="font-semibold">WhatsApp</h3><Badge>{data.verified && data.consent ? (si ? "තහවුරු කළ" : "Verified") : data.phone ? (si ? "අවධානය අවශ්‍යයි" : "Needs attention") : (si ? "සම්බන්ධ වී නැත" : "Not connected")}</Badge></div>
      <div className="space-y-2"><Label htmlFor="notification-phone">{si ? "දැනුම්දීම් අංකය" : "Notification number"}</Label><Input id="notification-phone" type="tel" autoComplete="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /><p className="text-sm text-muted-foreground">{si ? "දැනුම්දීම් සක්‍රිය කිරීමට FlowerMarket අංකය තහවුරු කළ යුතුයි. සියලු ඉල්ලීම් ද්වාරයේ පවතී." : "FlowerMarket must verify this number before alerts are enabled. Your portal inbox remains the permanent record."}</p></div>
      <label className="flex min-h-11 items-start gap-3 py-2 text-sm"><input type="checkbox" className="mt-1" checked={form.consent} onChange={e => setForm({ ...form, consent: e.target.checked })} />{si ? "ඉල්ලීම් සහ ඇණවුම් පිළිබඳ WhatsApp දැනුම්දීම් ලබා ගැනීමට මම එකඟ වෙමි." : "I agree to receive WhatsApp alerts about assigned enquiries, confirmed orders, changes and cancellations."}</label>
      <div className="space-y-2"><Label htmlFor="notification-language">{si ? "දැනුම්දීම් භාෂාව" : "Notification language"}</Label><select id="notification-language" className="min-h-11 w-full rounded-md border border-input bg-background px-3" value={form.language} onChange={e => setForm({ ...form, language: e.target.value === "si" ? "si" : "en" })}><option value="en">English</option><option value="si">සිංහල</option></select></div>
      <Button variant="brand" type="submit" className="min-h-11" disabled={busy}>{si ? "සැකසුම් සුරකින්න" : "Save settings"}</Button>
    </form>
    {message && <p role="status" className="text-sm">{message}</p>}
    {["Draft", "Changes requested"].includes(data.status) && <Button variant="outline" disabled={busy} onClick={() => void review()}>{si ? "සාප්පුව සමාලෝචනයට ඉදිරිපත් කරන්න" : "Submit shop for review"}</Button>}
  </section>;
}
