import { supabase } from "./supabase";
import type { Role } from "./types";

export interface ProfileRow {
  id: string;
  name: string | null;
  email: string | null;
  role: "admin" | "staff" | "viewer";
  active: boolean;
}

const APP_TO_DB: Record<Role, ProfileRow["role"]> = {
  Admin: "admin",
  Staff: "staff",
  Viewer: "viewer",
};

export async function listProfiles(): Promise<ProfileRow[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, email, role, active")
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as ProfileRow[];
}

// Privileged user management — all routed through the admin-users Edge Function
// (service-role, admin-gated). The session token is attached automatically.
async function invokeAdmin(body: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.functions.invoke("admin-users", { body });
  if (!error) return;
  // functions-js throws FunctionsHttpError for ANY non-2xx, and its .message is the useless
  // "Edge Function returned a non-2xx status code". The function's own message ("admin only",
  // "cannot change your own role", …) is in the un-consumed Response on .context.
  const res = (error as { context?: Response }).context;
  if (res && typeof res.json === "function") {
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) throw new Error(body.error);
    } catch (e) {
      if (e instanceof Error && e.message && !/non-2xx/.test(e.message)) throw e;
    }
  }
  throw new Error(error.message);
}

export const inviteUser = (email: string, role: Role) =>
  invokeAdmin({ action: "invite", email, role: APP_TO_DB[role] });
export const setUserRole = (userId: string, role: Role) =>
  invokeAdmin({ action: "setRole", userId, role: APP_TO_DB[role] });
export const setUserActive = (userId: string, active: boolean) =>
  invokeAdmin({ action: "setActive", userId, active });

// Password reset is anon-safe and stays client-side.
export async function sendPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) throw new Error(error.message);
}
