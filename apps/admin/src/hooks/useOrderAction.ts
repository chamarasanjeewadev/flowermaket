import { useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";

type ActionOutcome = { ok: true } | { ok: false; message: string };

/** Serialize order actions and refresh persisted state, including failed sends. */
export function useOrderAction() {
  const router = useRouter();
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<ActionOutcome>, failureMessage: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      if (!result.ok) setError(result.message);
    } catch {
      setError(failureMessage);
    } finally {
      try {
        await router.invalidate();
      } catch {
        setError((current) => current ?? "Could not refresh the order. Reload to see its latest status.");
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    }
  }

  return { busy, error, run };
}
