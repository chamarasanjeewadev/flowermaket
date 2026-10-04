/**
 * Constant-time string compare for webhook secrets. Length mismatch short
 * circuits to false (safe: lengths are not secret). Avoids early-exit timing
 * leaks on the matching-length path.
 */
export function timingSafeEqualStr(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
