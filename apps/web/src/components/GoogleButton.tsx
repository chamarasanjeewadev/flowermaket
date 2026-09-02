import * as React from "react";
import { toast } from "sonner";
import { Button } from "@flowers/ui/components/button";
import { getGoogleAuthUrl } from "../server/auth";

/** Simple monochrome "G" mark so we don't ship brand image assets. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path
        fill="currentColor"
        d="M21.35 11.1H12v2.9h5.35c-.5 2.5-2.6 4.1-5.35 4.1a6.1 6.1 0 1 1 0-12.2c1.55 0 2.95.55 4.05 1.5l2.15-2.15A9.04 9.04 0 0 0 12 3a9 9 0 1 0 0 18c5.2 0 8.65-3.65 8.65-8.8 0-.4-.1-.75-.3-1.1Z"
      />
    </svg>
  );
}

/**
 * "Continue with Google": asks the server for the OAuth URL (which also
 * plants the PKCE verifier cookie), then hard-navigates to Google.
 */
export function GoogleButton({
  redirect,
  disabled,
}: {
  redirect?: string;
  disabled?: boolean;
}) {
  const [loading, setLoading] = React.useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const result = await getGoogleAuthUrl({ data: { redirect } });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      window.location.assign(result.data.url);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      disabled={disabled || loading}
      onClick={() => void handleClick()}
    >
      <GoogleMark />
      {loading ? "Redirecting…" : "Continue with Google"}
    </Button>
  );
}
