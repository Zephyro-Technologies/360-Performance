/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_WHATSAPP_NUMBER: string;
  readonly VITE_WHATSAPP_DISPLAY: string;
  /** Public origin (e.g. https://360performance.pk) — required for absolute og:/canonical/share URLs. */
  readonly VITE_SITE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
