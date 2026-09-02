/**
 * Minimal local toast system for the Admin Portal.
 * API: toast.success/error/message
 */
import * as React from "react";
import { CheckCircle2, Info, XCircle, X } from "lucide-react";

type ToastVariant = "default" | "success" | "destructive";

interface ToastItem {
  id: number;
  title: string;
  description?: string;
  variant: ToastVariant;
}

type Listener = (toasts: ToastItem[]) => void;

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener(items);
}

function dismiss(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

function push(title: string, variant: ToastVariant, description?: string) {
  const id = nextId++;
  items = [...items.slice(-4), { id, title, description, variant }];
  emit();
  setTimeout(() => dismiss(id), 6000);
}

export const toast = {
  message: (title: string, description?: string) =>
    push(title, "default", description),
  success: (title: string, description?: string) =>
    push(title, "success", description),
  error: (title: string, description?: string) =>
    push(title, "destructive", description),
};

const VARIANT_STYLES: Record<ToastVariant, string> = {
  default: "border-border bg-popover text-popover-foreground",
  success: "border-success/40 bg-popover text-popover-foreground",
  destructive: "border-destructive/40 bg-popover text-popover-foreground",
};

function ToastIcon({ variant }: { variant: ToastVariant }) {
  if (variant === "success")
    return <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />;
  if (variant === "destructive")
    return <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />;
  return <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />;
}

export function Toaster() {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);

  React.useEffect(() => {
    const listener: Listener = (next) => setToasts(next);
    listeners.add(listener);
    listener(items);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`pointer-events-auto flex items-start gap-2 rounded-lg border p-3 shadow-lg ${VARIANT_STYLES[t.variant]}`}
        >
          <ToastIcon variant={t.variant} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium leading-snug">{t.title}</p>
            {t.description ? (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t.description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            aria-label="Dismiss"
            className="rounded p-0.5 text-muted-foreground hover:text-foreground"
            onClick={() => dismiss(t.id)}
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
