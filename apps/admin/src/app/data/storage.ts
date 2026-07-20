// Image storage — uploads go through the AUTHENTICATED client to the public
// buckets (Storage RLS gates writes to staff/admin). We store a BUCKET-RELATIVE
// PATH in the DB (never a full localhost/cloud URL) and resolve it to a public URL
// at render via the env-configured client, so the same row resolves on local + cloud.
import { imageUrl as sharedImageUrl } from "@360/supabase";
import { supabase } from "./supabase";
import { friendlyError } from "./errors";

export type ImageBucket = "product-images" | "blog-images";

const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB pre-resize cap
const MAX_DIM = 1600; // longest edge after resize

export function validateImageFile(file: File): string | null {
  if (!ALLOWED.includes(file.type)) return "Use a JPG, PNG, or WebP image.";
  if (file.size > MAX_BYTES) return "Image is too large (max 8 MB).";
  return null;
}

const EXT_FOR: Record<string, string> = { "image/png": "png", "image/webp": "webp", "image/jpeg": "jpg" };

interface Encoded {
  blob: Blob;
  contentType: string;
  ext: string;
}

// Downscale to MAX_DIM on the longest edge and re-encode as WebP so large factory
// photos aren't stored/served raw. On ANY failure, fall back to the original bytes
// carrying their REAL content-type + extension — a public object is never mislabeled
// (e.g. a JPEG stored/served as image/webp).
async function resizeToWebp(file: File): Promise<Encoded> {
  const original: Encoded = { blob: file, contentType: file.type, ext: EXT_FOR[file.type] ?? "jpg" };
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return original;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.85));
    return blob ? { blob, contentType: "image/webp", ext: "webp" } : original;
  } catch {
    return original;
  }
}

const slugSafe = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "img";

// Returns the bucket-relative path of the uploaded object.
export async function uploadImage(bucket: ImageBucket, file: File, prefix = ""): Promise<string> {
  const err = validateImageFile(file);
  if (err) throw new Error(err);
  const { blob, contentType, ext } = await resizeToWebp(file);
  const stamp = `${Date.now().toString(36)}${Math.round(performance.now()).toString(36)}`;
  const base = slugSafe(file.name.replace(/\.[^.]+$/, ""));
  const path = `${prefix ? slugSafe(prefix) + "/" : ""}${stamp}-${base}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, blob, {
    contentType,
    upsert: false,
  });
  if (error) throw new Error(friendlyError(error));
  return path;
}

// Bind the shared resolver to this app's client (env-agnostic path -> public URL).
export const imageUrl = (bucket: ImageBucket, value: string | null | undefined): string =>
  sharedImageUrl(supabase, bucket, value);

// ---------------------------------------------------------------------------
// Expense receipts — a PRIVATE bucket (financial docs). Uploaded raw (kept legible,
// no resize) and served via short-lived SIGNED urls, never a public link.
// ---------------------------------------------------------------------------
export const RECEIPT_BUCKET = "expense-receipts";
const RECEIPT_ALLOWED = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const RECEIPT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const RECEIPT_EXT: Record<string, string> = { "image/png": "png", "image/webp": "webp", "image/jpeg": "jpg", "application/pdf": "pdf" };

export function validateReceiptFile(file: File): string | null {
  if (!RECEIPT_ALLOWED.includes(file.type)) return "Use a JPG, PNG, WebP, or PDF.";
  if (file.size > RECEIPT_MAX_BYTES) return "File is too large (max 10 MB).";
  return null;
}

// Uploads a receipt to the private bucket; returns its bucket-relative path.
export async function uploadReceipt(file: File): Promise<string> {
  const err = validateReceiptFile(file);
  if (err) throw new Error(err);
  const stamp = `${Date.now().toString(36)}${Math.round(performance.now()).toString(36)}`;
  const base = slugSafe(file.name.replace(/\.[^.]+$/, ""));
  const path = `${stamp}-${base}.${RECEIPT_EXT[file.type] ?? "bin"}`;
  const { error } = await supabase.storage.from(RECEIPT_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(friendlyError(error));
  return path;
}

// A short-lived signed url for viewing a private receipt (null if none / on error).
export async function receiptUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(RECEIPT_BUCKET).createSignedUrl(path, 120);
  if (error) return null;
  return data?.signedUrl ?? null;
}

// Best-effort delete of a receipt object (e.g. when replaced/removed).
export async function removeReceipt(path: string | null | undefined): Promise<void> {
  if (!path) return;
  await supabase.storage.from(RECEIPT_BUCKET).remove([path]);
}
