import { createSupabaseClient } from "@360/supabase";

// Anon, READ-ONLY client for the public website (no auth, no writes — the storefront
// is WhatsApp-only). Dev/tests fall back to the local stack; a PRODUCTION build must
// supply both env vars — no hardcoded localhost is ever shipped to the cloud.
const envUrl = import.meta.env.VITE_SUPABASE_URL;
const envAnon = import.meta.env.VITE_SUPABASE_ANON_KEY;

function resolveConfig(): { url: string; anon: string } {
  if (envUrl && envAnon) return { url: envUrl, anon: envAnon };
  if (import.meta.env.PROD) {
    throw new Error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — set them for this build.");
  }
  console.warn("[supabase] env not set — using local stack defaults (dev only)");
  return { url: envUrl || "http://127.0.0.1:54421", anon: envAnon || "local-anon-key" };
}

const cfg = resolveConfig();
export const supabase = createSupabaseClient(cfg.url, cfg.anon);
