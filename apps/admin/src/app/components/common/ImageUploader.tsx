// Reusable image gallery uploader. Holds bucket-relative paths (string[]); renders
// thumbnails via imageUrl(). Used for product images (multiple) and the blog hero
// (max 1). Upload goes through the authenticated client (Storage RLS).
//
// Order = display order; images[0] is the PRIMARY everywhere (storefront card,
// products_public, detail gallery). For multi-image uploaders the client can reorder
// (◀ ▶) and set a primary (★) — keyboard/touch-friendly buttons, no drag-only.
import { useRef, useState, type ChangeEvent } from "react";
import { ChevronLeft, ChevronRight, ImagePlus, Loader2, Star, X } from "lucide-react";
import { toast } from "sonner";
import { uploadImage, imageUrl, type ImageBucket } from "../../data/storage";
import { ImageWithFallback } from "@360/ui/ImageWithFallback";

export function ImageUploader({
  bucket,
  value,
  onChange,
  max = 8,
  prefix,
}: {
  bucket: ImageBucket;
  value: string[];
  onChange: (v: string[]) => void;
  max?: number;
  prefix?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const reorderable = max > 1;

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    setBusy(true);
    try {
      const added: string[] = [];
      for (const f of files) {
        if (value.length + added.length >= max) break;
        added.push(await uploadImage(bucket, f, prefix));
      }
      if (added.length) onChange([...value, ...added]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= value.length) return;
    const next = [...value];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  }
  function setPrimary(idx: number) {
    if (idx === 0) return;
    const next = [...value];
    const [item] = next.splice(idx, 1);
    next.unshift(item);
    onChange(next);
  }

  const ctrl =
    "opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 motion-reduce:transition-none";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {value.map((path, idx) => (
          <div key={path} className="group relative size-20 overflow-hidden rounded-md border border-border">
            <ImageWithFallback src={imageUrl(bucket, path)} alt="" className="size-full object-cover" />
            {reorderable && idx === 0 && (
              <span className="absolute left-0.5 top-0.5 rounded bg-[#cc0000] px-1 text-[9px] font-bold uppercase leading-tight text-white">
                Primary
              </span>
            )}
            <button
              type="button"
              aria-label="Remove image"
              onClick={() => onChange(value.filter((p) => p !== path))}
              className={`absolute right-0.5 top-0.5 grid size-5 place-items-center rounded-full bg-black/70 text-white ${ctrl}`}
            >
              <X className="size-3" />
            </button>
            {reorderable && (
              <div className={`absolute inset-x-0 bottom-0 flex items-center justify-center gap-0.5 bg-black/70 py-0.5 ${ctrl}`}>
                <button type="button" aria-label="Move image earlier" disabled={idx === 0} onClick={() => move(idx, idx - 1)} className="grid size-4 place-items-center text-white disabled:opacity-30">
                  <ChevronLeft className="size-3.5" />
                </button>
                {idx !== 0 && (
                  <button type="button" aria-label="Set as primary image" onClick={() => setPrimary(idx)} className="grid size-4 place-items-center text-white">
                    <Star className="size-3.5" />
                  </button>
                )}
                <button type="button" aria-label="Move image later" disabled={idx === value.length - 1} onClick={() => move(idx, idx + 1)} className="grid size-4 place-items-center text-white disabled:opacity-30">
                  <ChevronRight className="size-3.5" />
                </button>
              </div>
            )}
          </div>
        ))}
        {value.length < max && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="grid size-20 place-items-center rounded-md border border-dashed border-border text-muted-foreground transition-colors hover:border-[#cc0000] hover:text-[#cc0000] disabled:opacity-50 motion-reduce:transition-none"
            aria-label="Upload image"
          >
            {busy ? <Loader2 className="size-5 animate-spin motion-reduce:animate-none" /> : <ImagePlus className="size-5" />}
          </button>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple={max > 1} className="hidden" onChange={onPick} />
      <p className="text-xs text-muted-foreground">
        JPG/PNG/WebP, auto-resized to 1600px. {value.length}/{max}.{reorderable && " The first image is the primary."}
      </p>
    </div>
  );
}
