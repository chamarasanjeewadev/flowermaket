/**
 * English source-of-truth dictionary. `Dict` is derived from this object, so
 * si.ts fails typecheck if any key is missing or extra.
 *
 * Strings may contain `{placeholder}` tokens — render with `interpolate()`.
 */
export const en = {
  nav: {
    home: "Home",
    browse: "Browse",
    login: "Sign in",
    signup: "Sign up",
    account: "My account",
    signOut: "Sign out",
    myAccount: "My account",
    signedInAs: "Signed in as {name}",
    signedOutToast: "Signed out. See you soon!",
    changeLanguage: "Change language",
    openMenu: "Open menu",
    accountMenu: "Account menu",
    siteNavigation: "Site navigation",
    homeAria: "Flowers.lk home",
  },
  footer: {
    tagline: "Sri Lanka's flower marketplace.",
    copyright: "© {year} Flowers.lk",
    strip: "English · සිංහල",
  },
  home: {
    heroTitle: "Sri Lanka's freshest flowers,",
    heroAccent: "delivered to you.",
    heroSubtitle:
      "Shop fresh flowers, arrangements and bouquets from local growers and florists across Sri Lanka.",
    browseByCategory: "Browse by category",
    browseByCategorySub: "Explore flowers and arrangements by type.",
    noCategories: "Categories coming soon.",
    noCategoriesBody:
      "We're adding flower categories — check back shortly to explore bouquets, wreaths, and more.",
  },
  auth: {
    soonTitle: "Accounts are coming soon",
    soonBody:
      "Accounts open once Supabase is connected — browsing works fully without an account.",
    welcomeBack: "Welcome back",
    signInSub: "Sign in to manage your orders and account.",
    email: "Email",
    emailPlaceholder: "you@example.com",
    password: "Password",
    passwordPlaceholder: "Your password",
    emailRequired: "Email is required",
    emailInvalid: "Enter a valid email address",
    passwordRequired: "Password is required",
    signingIn: "Signing in…",
    welcomeToast: "Welcome back!",
    continueWithGoogle: "Continue with Google",
    redirecting: "Redirecting…",
    newHere: "New to Flowers.lk?",
    createFreeAccount: "Create a free account",
    createTitle: "Create your free account",
    createSub: "One account — buy, save favourites, and track orders.",
    fullName: "Full name",
    fullNamePlaceholder: "e.g. Nimali Perera",
    nameRequired: "Your name is required",
    passwordMin: "Password must be at least 8 characters",
    passwordMinPlaceholder: "At least 8 characters",
    confirmPassword: "Confirm password",
    confirmPlaceholder: "Repeat your password",
    passwordsMismatch: "Passwords do not match",
    creating: "Creating account…",
    createAccount: "Create account",
    accountCreatedToast: "Account created — welcome!",
    checkInbox: "Check your inbox",
    confirmBody:
      "We sent you a confirmation link. Click it to activate your account, then",
    signInLink: "sign in",
    terms:
      "By creating an account you agree to our terms of service and privacy policy.",
    haveAccount: "Already have an account?",
    completingSignIn: "Completing sign-in…",
    oauthCancelled: "Sign-in was cancelled or the provider is not enabled.",
  },
  common: {
    comingSoon: "Coming soon",
    goHome: "Go home",
    notFoundTitle: "Page not found",
    notFoundBody: "The page you are looking for may have moved or does not exist.",
    cancel: "Cancel",
    done: "Done",
    gotIt: "Got it",
    or: "or",
    dbUnavailableTitle: "Running without a database",
  },
};

export type Dict = typeof en;
