import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { SellerType } from "@flowers/api/constants";
import {
  INVITE_LINK_PLACEHOLDER,
  buildInviteMessage,
  formatLkPhone,
  normalizeLkPhone,
  type InviteLanguage,
} from "@flowers/api/invite-message";
import { buildWhatsappLink, type WhatsappStatus } from "@flowers/integrations";
import { Button } from "@flowers/ui/components/button";
import { Input } from "@flowers/ui/components/input";
import { Label } from "@flowers/ui/components/label";
import { cn } from "@flowers/ui/lib/utils";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CircleAlert,
  Copy,
  ExternalLink,
  Link2,
  Loader2,
  RefreshCw,
  RotateCcw,
  Send,
} from "lucide-react";
import { SellerTypeCheckboxes } from "../components/seller-types";
import {
  getPendingInviteFn,
  getWhatsappStatusFn,
  inviteSupplierFn,
  resendInviteFn,
  type InviteResult,
} from "../server/suppliers";

export const Route = createFileRoute("/suppliers/invite")({
  component: InviteSupplierPage,
});

interface FormState {
  phone: string;
  nameEn: string;
  sellerTypes: SellerType[];
  language: InviteLanguage;
}

const EMPTY_FORM: FormState = {
  phone: "",
  nameEn: "",
  sellerTypes: ["farmer"],
  language: "en",
};

function templateFor(form: FormState): string {
  return buildInviteMessage({
    nameEn: form.nameEn,
    sellerTypes: form.sellerTypes.length ? form.sellerTypes : null,
    language: form.language,
    joinUrl: INVITE_LINK_PLACEHOLDER,
  });
}

type Pending = "whatsapp" | "link" | "resend" | null;

function InviteSupplierPage() {
  const [form, setForm] = React.useState<FormState>(EMPTY_FORM);
  // null = follow the template; a string = the admin's own edit.
  const [editedMessage, setEditedMessage] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState<Pending>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [conflict, setConflict] = React.useState(false);
  const [result, setResult] = React.useState<InviteResult | null>(null);

  const status = useQuery({
    queryKey: ["whatsapp-status"],
    queryFn: () => getWhatsappStatusFn(),
    staleTime: 60_000,
  });

  const template = templateFor(form);
  const message = editedMessage ?? template;
  const normalizedPhone = normalizeLkPhone(form.phone);
  const phoneError =
    form.phone.trim() && !normalizedPhone ? "Enter a Sri Lankan mobile, e.g. 0771234567" : null;
  const canSendWhatsapp = status.data?.state === "open";
  const busy = pending !== null;

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setConflict(false);
  }

  function reset() {
    setForm(EMPTY_FORM);
    setEditedMessage(null);
    setResult(null);
    setError(null);
    setConflict(false);
  }

  async function create(delivery: "whatsapp" | "link") {
    setError(null);
    setConflict(false);
    if (!normalizedPhone) {
      setError("Enter the supplier's WhatsApp number first.");
      return;
    }
    if (!message.trim()) {
      setError("The message can't be empty.");
      return;
    }
    setPending(delivery);
    try {
      const res = await inviteSupplierFn({
        data: {
          phone: form.phone,
          nameEn: form.nameEn.trim() || null,
          sellerTypes: form.sellerTypes.length ? form.sellerTypes : null,
          language: form.language,
          message,
          delivery,
        },
      });
      if (!res.ok) {
        setConflict(res.code === "conflict");
        setError(res.message);
        return;
      }
      setResult(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setPending(null);
    }
  }

  async function resend(token: string | null, text: string) {
    setError(null);
    setPending("resend");
    try {
      let inviteToken = token;
      if (!inviteToken) {
        const existing = await getPendingInviteFn({ data: { phone: form.phone } });
        if (!existing) {
          setError("Couldn't find the pending invite for this number.");
          return;
        }
        inviteToken = existing.token;
      }
      const res = await resendInviteFn({ data: { token: inviteToken, message: text } });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setConflict(false);
      setResult(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="space-y-2">
        <Link
          to="/suppliers"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" /> Back to suppliers
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl">Invite a supplier</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Review the WhatsApp message, edit it if needed, then send. Each invite carries a
              personal join link valid for 30 days.
            </p>
          </div>
          <StatusPill
            status={status.data}
            loading={status.isFetching}
            onRefresh={() => void status.refetch()}
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-start">
        {/* ───────────── Recipient ───────────── */}
        <section
          aria-labelledby="recipient-heading"
          className="space-y-5 rounded-xl border bg-card p-5 sm:p-6"
        >
          <h2 id="recipient-heading" className="font-display text-xl">
            Recipient
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="phone">WhatsApp number</Label>
              <Input
                id="phone"
                inputMode="tel"
                autoComplete="tel"
                value={form.phone}
                disabled={!!result}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="077 123 4567"
                aria-invalid={!!phoneError}
                aria-describedby="phone-hint"
              />
              <p
                id="phone-hint"
                className={cn(
                  "text-xs",
                  phoneError ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {phoneError ??
                  (normalizedPhone ? (
                    <span className="inline-flex items-center gap-1">
                      <Check className="size-3 text-sage-deep" aria-hidden="true" />
                      {formatLkPhone(normalizedPhone)}
                    </span>
                  ) : (
                    "Local (07…) or international (94…) format"
                  ))}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nameEn">
                Name <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="nameEn"
                value={form.nameEn}
                disabled={!!result}
                onChange={(e) => set("nameEn", e.target.value)}
                placeholder="Used in the greeting"
              />
            </div>
          </div>

          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">
              Seller type{" "}
              <span className="font-normal text-muted-foreground">
                (pre-selected for them; leave empty to let them choose)
              </span>
            </legend>
            <SellerTypeCheckboxes
              value={form.sellerTypes}
              disabled={!!result}
              onChange={(next) => set("sellerTypes", next)}
            />
          </fieldset>

          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">Message language</legend>
            <div className="inline-flex rounded-lg border bg-muted/50 p-1" role="radiogroup">
              {(
                [
                  ["en", "English"],
                  ["si", "සිංහල"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={form.language === value}
                  disabled={!!result}
                  onClick={() => set("language", value)}
                  className={cn(
                    "min-h-9 rounded-md px-4 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
                    form.language === value
                      ? "bg-background font-medium text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>

          {editedMessage !== null && editedMessage !== template && !result && (
            <p className="flex items-start gap-2 rounded-lg bg-butter/50 px-3 py-2 text-xs">
              <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              You've edited the message, so changes here won't update it. Use “Reset to template”
              to regenerate it.
            </p>
          )}
        </section>

        {/* ───────────── Message preview + actions ───────────── */}
        <section
          aria-labelledby="preview-heading"
          className="overflow-hidden rounded-xl border bg-card lg:sticky lg:top-6"
        >
          <div className="flex items-center justify-between gap-2 border-b px-5 py-3">
            <h2 id="preview-heading" className="font-display text-xl">
              Message
            </h2>
            {editedMessage !== null && !result && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setEditedMessage(null)}
              >
                <RotateCcw className="mr-1.5 size-3.5" aria-hidden="true" />
                Reset to template
              </Button>
            )}
          </div>

          <div className="bg-[#efeae2] px-4 py-5 dark:bg-muted">
            <p className="mb-2 text-center text-[11px] font-medium uppercase tracking-wide text-black/45 dark:text-muted-foreground">
              To {normalizedPhone ? formatLkPhone(normalizedPhone) : "…"}
            </p>
            <div className="ml-auto max-w-[92%] rounded-lg rounded-tr-none bg-[#d9fdd3] p-1 shadow-sm dark:bg-emerald-950">
              {result ? (
                <p className="whitespace-pre-wrap break-words px-2 py-1.5 text-sm leading-relaxed text-[#111b21] dark:text-emerald-50">
                  {result.message}
                </p>
              ) : (
                <textarea
                  aria-label="WhatsApp message"
                  value={message}
                  onChange={(e) => setEditedMessage(e.target.value)}
                  rows={Math.min(14, Math.max(6, message.split("\n").length + 3))}
                  className="block w-full resize-y rounded-md bg-transparent px-2 py-1.5 text-sm leading-relaxed text-[#111b21] focus-visible:bg-white/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25d366]/60 dark:text-emerald-50 dark:focus-visible:bg-black/20"
                />
              )}
            </div>
            {!result && (
              <p className="mt-2 text-right text-[11px] text-black/50 dark:text-muted-foreground">
                <code className="rounded bg-black/5 px-1">{INVITE_LINK_PLACEHOLDER}</code> becomes
                their personal join link · {message.length} chars
              </p>
            )}
          </div>

          <div className="space-y-3 p-5">
            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              >
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <div className="space-y-2">
                  <p>{error}</p>
                  {conflict && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy || !canSendWhatsapp}
                        onClick={() => void resend(null, message)}
                      >
                        {pending === "resend" && (
                          <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" />
                        )}
                        Resend existing invite with this message
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {result ? (
              <ResultPanel
                result={result}
                canSendWhatsapp={canSendWhatsapp}
                retrying={pending === "resend"}
                onRetry={() => void resend(result.token, result.message)}
                onReset={reset}
              />
            ) : (
              <>
                <Button
                  type="button"
                  className="w-full"
                  size="lg"
                  disabled={busy || !canSendWhatsapp || !normalizedPhone}
                  onClick={() => void create("whatsapp")}
                >
                  {pending === "whatsapp" ? (
                    <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Send className="mr-2 size-4" aria-hidden="true" />
                  )}
                  {pending === "whatsapp" ? "Sending…" : "Send on WhatsApp"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={busy || !normalizedPhone}
                  onClick={() => void create("link")}
                >
                  {pending === "link" ? (
                    <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Link2 className="mr-2 size-4" aria-hidden="true" />
                  )}
                  Create link only — send from my phone
                </Button>
                {!canSendWhatsapp && !status.isLoading && (
                  <p className="text-xs text-muted-foreground">
                    Automatic sending is unavailable until WhatsApp is connected. You can still
                    create the link and send it yourself.
                  </p>
                )}
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function StatusPill({
  status,
  loading,
  onRefresh,
}: {
  status: WhatsappStatus | undefined;
  loading: boolean;
  onRefresh: () => void;
}) {
  let tone = "bg-muted text-muted-foreground";
  let dot = "bg-muted-foreground/50";
  let label = "Checking WhatsApp…";
  let title: string | undefined;

  if (status) {
    switch (status.state) {
      case "open":
        tone = "bg-sage text-sage-deep";
        dot = "bg-emerald-500";
        label = "WhatsApp connected";
        title = `Instance: ${status.instance}`;
        break;
      case "disconnected":
        tone = "bg-butter text-foreground";
        dot = "bg-amber-500";
        label = "WhatsApp disconnected";
        title = `Instance ${status.instance} is “${status.detail}”. Re-scan the QR code in Evolution.`;
        break;
      case "unreachable":
        tone = "bg-destructive/10 text-destructive";
        dot = "bg-destructive";
        label = "WhatsApp API unreachable";
        title = status.detail;
        break;
      case "not_configured":
        tone = "bg-destructive/10 text-destructive";
        dot = "bg-destructive";
        label = "WhatsApp not configured";
        title = `Missing: ${status.missing.join(", ")}`;
        break;
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className={cn("inline-flex items-center gap-2 rounded-full py-1 pl-3 pr-1 text-xs font-medium", tone)}>
        <span className={cn("size-2 rounded-full", dot)} aria-hidden="true" />
        <span role="status">{label}</span>
        <button
          type="button"
          onClick={onRefresh}
          className="grid size-7 place-items-center rounded-full hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Re-check WhatsApp connection"
        >
          <RefreshCw className={cn("size-3.5", loading && "animate-spin")} aria-hidden="true" />
        </button>
      </div>
      {title && status?.state !== "open" && (
        <p className="max-w-xs text-right text-xs text-muted-foreground">{title}</p>
      )}
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? (
        <Check className="mr-1.5 size-3.5" aria-hidden="true" />
      ) : (
        <Copy className="mr-1.5 size-3.5" aria-hidden="true" />
      )}
      {copied ? "Copied" : label}
    </Button>
  );
}

function ResultPanel({
  result,
  canSendWhatsapp,
  retrying,
  onRetry,
  onReset,
}: {
  result: InviteResult;
  canSendWhatsapp: boolean;
  retrying: boolean;
  onRetry: () => void;
  onReset: () => void;
}) {
  const waLink = buildWhatsappLink(result.phone, result.message);
  const { delivery } = result;

  return (
    <div className="space-y-4">
      <div
        role="status"
        className={cn(
          "flex items-start gap-2 rounded-lg px-3 py-2 text-sm",
          delivery.status === "sent" && "bg-sage text-sage-deep",
          delivery.status === "skipped" && "bg-muted",
          delivery.status === "failed" && "bg-destructive/10 text-destructive",
        )}
      >
        {delivery.status === "failed" ? (
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        ) : (
          <Check className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        )}
        <div>
          {delivery.status === "sent" && <p className="font-medium">Sent on WhatsApp</p>}
          {delivery.status === "skipped" && (
            <p className="font-medium">Invite created. Send it from your phone.</p>
          )}
          {delivery.status === "failed" && (
            <>
              <p className="font-medium">Invite created, but WhatsApp didn't send it</p>
              <p className="mt-0.5 break-words text-xs opacity-90">{delivery.detail}</p>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
        <code className="min-w-0 flex-1 truncate text-xs">{result.joinUrl}</code>
        <CopyButton text={result.joinUrl} label="Link" />
      </div>

      <div className="flex flex-wrap gap-2">
        {delivery.status === "failed" && canSendWhatsapp && (
          <Button type="button" size="sm" disabled={retrying} onClick={onRetry}>
            {retrying ? (
              <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="mr-1.5 size-3.5" aria-hidden="true" />
            )}
            Retry send
          </Button>
        )}
        {delivery.status !== "sent" && waLink && (
          <Button asChild size="sm" variant={delivery.status === "skipped" ? "default" : "outline"}>
            <a href={waLink} target="_blank" rel="noreferrer">
              <ExternalLink className="mr-1.5 size-3.5" aria-hidden="true" />
              Open in WhatsApp
            </a>
          </Button>
        )}
        <CopyButton text={result.message} label="Message" />
      </div>

      <Button type="button" variant="ghost" className="w-full" onClick={onReset}>
        Invite another supplier
      </Button>
    </div>
  );
}
