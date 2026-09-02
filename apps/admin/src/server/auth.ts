/**
 * Auth server functions for the Admin Portal.
 */
import { createServerFn } from "@tanstack/react-start";
import { getSupabase, resolveAdminSession, type AdminSession } from "./session";

export type { AdminSession };

export interface SignInResult {
  ok: boolean;
  message?: string;
}

export const getAdminSession = createServerFn({ method: "GET" }).handler(
  async (): Promise<AdminSession> => resolveAdminSession(),
);

export const signIn = createServerFn({ method: "POST" })
  .validator((input: { email: string; password: string }) => input)
  .handler(async ({ data }): Promise<SignInResult> => {
    const supabase = getSupabase();
    if (!supabase) {
      return {
        ok: false,
        message:
          'Supabase is not configured — the portal is running in dev mode. Use "Continue to dashboard".',
      };
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });
    if (error) return { ok: false, message: error.message };
    return { ok: true };
  });

export const signOut = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ ok: boolean }> => {
    const supabase = getSupabase();
    if (supabase) await supabase.auth.signOut();
    return { ok: true };
  },
);
