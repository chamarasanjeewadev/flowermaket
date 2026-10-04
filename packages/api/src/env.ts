/**
 * Typed, lazy environment access.
 *
 * IMPORTANT: on Cloudflare Workers env vars must never be read at module top
 * level — module scope is evaluated once per isolate, before per-request env
 * is bound. Always call `getEnv()` inside a request handler / server function.
 */
export interface AppEnv {
  DATABASE_URL: string | undefined;
  SUPABASE_URL: string | undefined;
  SUPABASE_ANON_KEY: string | undefined;
  SUPABASE_SERVICE_ROLE_KEY: string | undefined;
  ANTHROPIC_API_KEY: string | undefined;
  /** Google Generative Language API key for Imagen bouquet rendering. Absent → designer generation disabled (fails soft). */
  GEMINI_API_KEY: string | undefined;
  SITE_URL: string | undefined;
  ADMIN_URL: string | undefined;
  PAYHERE_MERCHANT_ID: string | undefined;
  PAYHERE_MERCHANT_SECRET: string | undefined;
  /** Defaults to "sandbox" unless PAYHERE_MODE is exactly "live". */
  PAYHERE_MODE: "sandbox" | "live";
  /**
   * Set to "1" to enable auth-disabled dev mode (missing Supabase env is
   * treated as intentional, not a misconfiguration). Must be an explicit
   * opt-in — absent or any other value means auth is REQUIRED.
   */
  AUTH_DISABLED: boolean;
  // ---------------------------------------------------------------------------
  // Evolution API — WhatsApp dispatch for RFQ nudges (Task 12)
  // ---------------------------------------------------------------------------
  /** Base URL of the Evolution API instance (e.g. https://evolution.example.com). */
  EVOLUTION_API_URL: string | undefined;
  /** API key for the Evolution API instance. */
  EVOLUTION_API_KEY: string | undefined;
  /** Evolution instance name used in the sendText endpoint path. */
  EVOLUTION_INSTANCE: string | undefined;
  // ---------------------------------------------------------------------------
  // Supplier portal — base URL for RFQ deep-links sent via WhatsApp (Task 12)
  // ---------------------------------------------------------------------------
  /** Origin of the supplier portal (e.g. https://supplier.flowermarket.lk). */
  SUPPLIER_PORTAL_URL: string | undefined;
  // ---------------------------------------------------------------------------
  // WhatsApp webhook — inbound message authentication (Task 5)
  // ---------------------------------------------------------------------------
  /** Shared secret in the WhatsApp webhook URL path; guards the admin receive endpoint. */
  WHATSAPP_WEBHOOK_SECRET: string | undefined;
  // ---------------------------------------------------------------------------
  // Document access — OTP + signed cookie (Task 18)
  // ---------------------------------------------------------------------------
  /**
   * HMAC secret used to hash OTP codes at rest and sign document-access cookies.
   * Must be a strong random string (≥ 32 chars). If absent, requestOtp and
   * verifyOtp fail closed (generic error). Never log or expose this value.
   */
  DOC_ACCESS_SECRET: string | undefined;
  // ---------------------------------------------------------------------------
  // Web public URL — used to build customer-facing document links (Task 20)
  // ---------------------------------------------------------------------------
  /** Canonical public origin of the web app (e.g. https://flowermarket.lk). */
  WEB_PUBLIC_URL: string | undefined;
}

function read(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

export function getEnv(): AppEnv {
  return {
    DATABASE_URL: read("DATABASE_URL"),
    SUPABASE_URL: read("SUPABASE_URL"),
    SUPABASE_ANON_KEY: read("SUPABASE_ANON_KEY"),
    SUPABASE_SERVICE_ROLE_KEY: read("SUPABASE_SERVICE_ROLE_KEY"),
    ANTHROPIC_API_KEY: read("ANTHROPIC_API_KEY"),
    GEMINI_API_KEY: read("GEMINI_API_KEY"),
    SITE_URL: read("SITE_URL"),
    ADMIN_URL: read("ADMIN_URL"),
    PAYHERE_MERCHANT_ID: read("PAYHERE_MERCHANT_ID"),
    PAYHERE_MERCHANT_SECRET: read("PAYHERE_MERCHANT_SECRET"),
    PAYHERE_MODE: read("PAYHERE_MODE") === "live" ? "live" : "sandbox",
    AUTH_DISABLED: read("AUTH_DISABLED") === "1",
    EVOLUTION_API_URL: read("EVOLUTION_API_URL"),
    EVOLUTION_API_KEY: read("EVOLUTION_API_KEY"),
    EVOLUTION_INSTANCE: read("EVOLUTION_INSTANCE"),
    SUPPLIER_PORTAL_URL: read("SUPPLIER_PORTAL_URL"),
    WHATSAPP_WEBHOOK_SECRET: read("WHATSAPP_WEBHOOK_SECRET"),
    DOC_ACCESS_SECRET: read("DOC_ACCESS_SECRET"),
    WEB_PUBLIC_URL: read("WEB_PUBLIC_URL"),
  };
}
