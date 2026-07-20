// Blog data layer — React Query over Supabase. body_md is Markdown; it is rendered
// sanitized (see Markdown.tsx — D6). published_at is stamped by a DB trigger.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import type { Database } from "@360/supabase";
import { supabase } from "./supabase";
import { friendlyError } from "./errors";

type BlogRow = Database["public"]["Tables"]["blog_posts"]["Row"];
export type BlogPost = Pick<
  BlogRow,
  "id" | "slug" | "title" | "excerpt" | "body_md" | "author" | "read_minutes" | "hero_image" | "published" | "published_at" | "created_at"
>;

export const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "post";

export function useBlogPosts() {
  return useQuery({
    queryKey: ["blog_posts"],
    queryFn: async (): Promise<BlogPost[]> => {
      const { data, error } = await supabase
        .from("blog_posts")
        .select("id, slug, title, excerpt, body_md, author, read_minutes, hero_image, published, published_at, created_at")
        .order("created_at", { ascending: false });
      if (error) throw new Error(friendlyError(error));
      return (data ?? []) as BlogPost[];
    },
  });
}

const READ_WPM = 200;

export const blogSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required"),
    slug: z.string().trim().min(1, "Slug is required"),
    excerpt: z.string().trim().nullable(),
    body_md: z.string().nullable(),
    author: z.string().trim().nullable(),
    hero_image: z.string().trim().nullable(),
    published: z.boolean(),
  })
  .refine((d) => !d.published || !!d.body_md?.trim(), {
    path: ["body_md"],
    message: "Add body content before publishing.",
  });
export type BlogInput = z.infer<typeof blogSchema>;

export function useSaveBlogPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: BlogInput }) => {
      const parsed = blogSchema.parse(input);
      const words = (parsed.body_md ?? "").trim().split(/\s+/).filter(Boolean).length;
      const read_minutes = words ? Math.max(1, Math.round(words / READ_WPM)) : 0;
      const payload = { ...parsed, read_minutes }; // published_at handled by the trigger
      const res = id
        ? await supabase.from("blog_posts").update(payload).eq("id", id)
        : await supabase.from("blog_posts").insert(payload);
      if (res.error) throw new Error(friendlyError(res.error));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["blog_posts"] }),
  });
}

export function useDeleteBlogPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("blog_posts").delete().eq("id", id);
      if (error) throw new Error(friendlyError(error));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["blog_posts"] }),
  });
}
