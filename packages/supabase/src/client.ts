import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

export type Client = SupabaseClient<Database>;

// A Storage-like adapter for where Supabase persists the auth session. Callers
// (the admin app) can pass a custom one to switch between persistent (localStorage)
// and browser-close-only (sessionStorage) storage — the "Remember me" behaviour.
export interface AuthStorage {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

// Browser client factory. Both apps pass their own VITE_SUPABASE_* env values.
// The anon key is safe to ship; the service-role key must NEVER reach a client.
export function createSupabaseClient(
  url: string,
  anonKey: string,
  options?: { storage?: AuthStorage },
): Client {
  return createClient<Database>(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      ...(options?.storage ? { storage: options.storage } : {}),
    },
  });
}
