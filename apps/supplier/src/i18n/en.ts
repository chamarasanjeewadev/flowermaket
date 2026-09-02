/**
 * English source-of-truth dictionary for the Supplier Portal.
 * `Dict` is derived from this object, so si.ts fails typecheck if any key is
 * missing or extra.
 */
export const en = {
  portal: {
    name: "Supplier Portal",
    brand: "Flowers.lk",
  },
  auth: {
    signIn: "Sign in",
    signInSub: "Sign in to manage your shop and listings.",
    email: "Email",
    emailPlaceholder: "you@example.com",
    password: "Password",
    passwordPlaceholder: "Your password",
    signingIn: "Signing in…",
    devMode:
      "Supabase is not configured — the portal is running in dev mode without authentication.",
    continueToDashboard: "Continue to dashboard",
    signInFailed: "Sign-in failed.",
    enterCredentials: "Enter your email and password.",
    signOut: "Sign out",
  },
  dashboard: {
    title: "Supplier dashboard",
    comingSoon: "Supplier dashboard — coming soon",
    comingSoonBody:
      "Your dashboard for managing flowers, listings, and orders will be available in Phase 1.",
  },
  onboarding: {
    title: "Become a supplier",
    body: "Your account is not yet set up as a supplier. Supplier onboarding will be available in Phase 1.",
    contactSupport: "In the meantime, contact support if you believe this is an error.",
  },
  nav: {
    dashboard: "Dashboard",
    changeLanguage: "Change language",
  },
  common: {
    loading: "Loading…",
    error: "Something went wrong.",
  },
};

export type Dict = typeof en;
