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
    shopName: "Shop",
    verificationStatus: "Verification status",
    pendingNotice: "Your shop is awaiting verification.",
    pendingNoticeBody:
      "Our team will review your shop details and notify you once verified. This usually takes 1–3 business days.",
  },
  onboarding: {
    title: "Set up your shop",
    subtitle: "Create your shop profile to start selling on Flowers.lk.",
    nameEn: "Shop name (English)",
    nameEnPlaceholder: "e.g. Rose Garden Florist",
    nameSi: "Shop name (Sinhala)",
    nameSiPlaceholder: "e.g. රෝස උද්‍යාන මල් සාප්පුව",
    descriptionEn: "Description (English)",
    descriptionEnPlaceholder: "Tell buyers about your shop…",
    descriptionSi: "Description (Sinhala)",
    descriptionSiPlaceholder: "ඔබේ සාප්පුව ගැන ගැනුම්කරුවන්ට කියන්න…",
    district: "District",
    districtPlaceholder: "Select district",
    city: "City / Town",
    cityPlaceholder: "e.g. Colombo 03",
    submit: "Create shop",
    submitting: "Creating shop…",
    nameEnRequired: "Shop name (English) is required.",
    nameEnTooShort: "Shop name must be at least 2 characters.",
    nameEnTooLong: "Shop name must be at most 100 characters.",
    districtRequired: "Please select a district.",
    success: "Your shop has been created and is awaiting verification.",
  },
  shop: {
    title: "Shop settings",
    nameEn: "Shop name (English)",
    nameSi: "Shop name (Sinhala)",
    descriptionEn: "Description (English)",
    descriptionSi: "Description (Sinhala)",
    city: "City / Town",
    slug: "Shop URL slug",
    slugNote: "The slug cannot be changed after creation.",
    verificationStatus: "Verification status",
    statusUnverified: "Unverified",
    statusPending: "Pending review",
    statusVerified: "Verified",
    statusRejected: "Rejected",
    save: "Save changes",
    saving: "Saving…",
    saved: "Changes saved.",
    nameEnRequired: "Shop name (English) is required.",
    nameEnTooShort: "Shop name must be at least 2 characters.",
    nameEnTooLong: "Shop name must be at most 100 characters.",
  },
  nav: {
    dashboard: "Dashboard",
    shopSettings: "Shop settings",
    changeLanguage: "Change language",
  },
  common: {
    loading: "Loading…",
    error: "Something went wrong.",
  },
};

export type Dict = typeof en;
