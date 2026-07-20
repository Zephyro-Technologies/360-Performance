// Create / edit a blog post. Markdown body with a live, sanitized preview; hero
// image via the authenticated uploader. Reuses the foundation (zod, errors).
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { useSaveBlogPost, slugify, type BlogPost, type BlogInput } from "../../data/blog";
import { ImageUploader } from "../common/ImageUploader";
import { Markdown } from "@360/ui/Markdown";
import { Button } from "@360/ui/button";
import { Input } from "@360/ui/input";
import { Label } from "@360/ui/label";
import { Textarea } from "@360/ui/textarea";
import { Switch } from "@360/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@360/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@360/ui/tabs";

interface FormState {
  title: string;
  slug: string;
  author: string;
  excerpt: string;
  body_md: string;
  hero_image: string;
  published: boolean;
}

function fromPost(p: BlogPost | null): FormState {
  return {
    title: p?.title ?? "",
    slug: p?.slug ?? "",
    author: p?.author ?? "",
    excerpt: p?.excerpt ?? "",
    body_md: p?.body_md ?? "",
    hero_image: p?.hero_image ?? "",
    published: p?.published ?? false,
  };
}

export function BlogEditor({
  post,
  open,
  onOpenChange,
}: {
  post: BlogPost | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const save = useSaveBlogPost();
  const [form, setForm] = useState<FormState>(fromPost(null));
  const [slugEdited, setSlugEdited] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(fromPost(post));
      setSlugEdited(!!post);
    }
  }, [post, open]);

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }
  function setTitle(title: string) {
    setForm((f) => ({ ...f, title, slug: slugEdited ? f.slug : slugify(title) }));
  }

  const hero = useMemo(() => (form.hero_image ? [form.hero_image] : []), [form.hero_image]);

  async function onSubmit() {
    const input: BlogInput = {
      title: form.title,
      slug: slugify(form.slug), // final normalize (the field edits leniently while typing)
      author: form.author.trim() || null,
      excerpt: form.excerpt.trim() || null,
      body_md: form.body_md.trim() || null,
      hero_image: form.hero_image || null,
      published: form.published,
    };
    try {
      await save.mutateAsync({ id: post?.id, input });
      toast.success(post ? "Post saved" : "Post created");
      onOpenChange(false);
    } catch (e) {
      if (e instanceof z.ZodError) toast.error(e.issues[0]?.message ?? "Please check the form.");
      else toast.error(e instanceof Error ? e.message : "Could not save post.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{post ? "Edit Post" : "New Post"}</DialogTitle>
          <DialogDescription>Markdown is rendered safely. Raw HTML is disabled.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Title</Label>
              <Input value={form.title} onChange={(e) => setTitle(e.target.value)} placeholder="Article title" />
            </div>
            <div className="space-y-2">
              <Label>Slug</Label>
              <Input
                value={form.slug}
                onChange={(e) => {
                  setSlugEdited(true);
                  // lenient while typing (keep a trailing hyphen so multi-word slugs work); slugify() runs on save
                  set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
                }}
                placeholder="auto from title"
              />
            </div>
            <div className="space-y-2">
              <Label>Author</Label>
              <Input value={form.author} onChange={(e) => set("author", e.target.value)} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Excerpt</Label>
              <Textarea value={form.excerpt} onChange={(e) => set("excerpt", e.target.value)} rows={2} placeholder="Short summary for listings" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Hero image</Label>
              <ImageUploader bucket="blog-images" value={hero} onChange={(v) => set("hero_image", v[0] ?? "")} max={1} prefix={form.slug} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Body (Markdown)</Label>
            <Tabs defaultValue="write">
              <TabsList>
                <TabsTrigger value="write">Write</TabsTrigger>
                <TabsTrigger value="preview">Preview</TabsTrigger>
              </TabsList>
              <TabsContent value="write">
                <Textarea value={form.body_md} onChange={(e) => set("body_md", e.target.value)} rows={14} placeholder="Write your article in Markdown…" className="font-mono text-sm" />
              </TabsContent>
              <TabsContent value="preview">
                <div className="min-h-[14rem] rounded-md border border-border p-4">
                  {form.body_md.trim() ? <Markdown>{form.body_md}</Markdown> : <p className="text-sm text-muted-foreground">Nothing to preview.</p>}
                </div>
              </TabsContent>
            </Tabs>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Switch checked={form.published} onCheckedChange={(c) => set("published", c)} /> Published
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="bg-[#cc0000] text-white hover:bg-[#a30000]" onClick={onSubmit} disabled={save.isPending || !form.title.trim()}>
            {save.isPending ? "Saving…" : post ? "Save Changes" : "Create Post"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
