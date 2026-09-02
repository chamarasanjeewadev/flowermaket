/**
 * Safe redirect path validation.
 *
 * Accepts only same-site paths that start with exactly one "/" and contain no
 * "\" or second leading "/" that browsers would normalise into an external URL.
 *
 * Rejected examples:
 *   "/\evil.com"  — browsers normalise \ → /  → //evil.com (open redirect)
 *   "//evil.com"  — protocol-relative external redirect
 *   "http://x"   — absolute URL
 */
export function safeRedirectPath(raw: string | undefined): string {
  // Must start with "/" but NOT with "//" or "/\"
  if (raw && /^\/(?![/\\])/.test(raw)) return raw;
  return "/";
}
