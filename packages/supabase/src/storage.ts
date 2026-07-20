import type { Client } from "./client";

// Resolve a stored image value to a renderable public URL. Full http(s) URLs
// (legacy/external) pass through; a bucket-relative PATH is built from the client's
// configured URL (env-agnostic — the same DB row resolves on local and cloud).
// getPublicUrl is a pure string build (no network).
export function imageUrl(client: Client, bucket: string, value: string | null | undefined): string {
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return client.storage.from(bucket).getPublicUrl(value).data.publicUrl;
}
