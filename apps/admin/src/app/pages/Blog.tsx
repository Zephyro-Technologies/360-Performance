// Module 7 — Blog. List of posts + create/edit (Markdown) + publish + delete.
import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "../components/common/PageHeader";
import { BlogEditor } from "../components/blog/BlogEditor";
import { useBlogPosts, useDeleteBlogPost, type BlogPost } from "../data/blog";
import { useAuth } from "../data/auth";
import { formatDate } from "@360/lib/format";
import { Button } from "@360/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@360/ui/table";
import { useTableSort, SortHead } from "../components/common/useTableSort";

export function Blog() {
  const postsQ = useBlogPosts();
  const del = useDeleteBlogPost();
  const { can } = useAuth();
  const [editing, setEditing] = useState<BlogPost | null>(null);
  const [open, setOpen] = useState(false);
  const posts = postsQ.data ?? [];
  const sort = useTableSort(
    posts,
    {
      title: (p) => p.title,
      status: (p) => (p.published ? 1 : 0),
      author: (p) => p.author,
      date: (p) => p.published_at ?? p.created_at,
    },
    "date",
    "desc",
  );

  function openNew() {
    setEditing(null);
    setOpen(true);
  }
  function openEdit(p: BlogPost) {
    setEditing(p);
    setOpen(true);
  }
  async function remove(p: BlogPost) {
    if (!confirm(`Delete "${p.title}"?`)) return;
    try {
      await del.mutateAsync(p.id);
      toast.success("Post deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete");
    }
  }

  return (
    <div>
      <PageHeader
        title="Blog"
        subtitle="Articles for the public website"
        actions={
          can("edit") && (
            <Button className="bg-[#cc0000] text-white hover:bg-[#a30000]" onClick={openNew}>
              <Plus className="size-4" /> New Post
            </Button>
          )
        }
      />

      <div className="overflow-x-auto rounded-md border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-black hover:bg-black">
              <SortHead label="Title" sortKey="title" sort={sort} className="text-white" />
              <SortHead label="Status" sortKey="status" sort={sort} className="text-white" />
              <SortHead label="Author" sortKey="author" sort={sort} className="text-white" />
              <SortHead label="Date" sortKey="date" sort={sort} className="text-white" />
              {can("edit") && <TableHead className="w-20 text-white" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sort.sorted.map((p) => (
              <TableRow key={p.id} className="cursor-pointer" onClick={() => openEdit(p)}>
                <TableCell>
                  <p className="font-medium">{p.title}</p>
                  {p.read_minutes ? <p className="text-xs text-muted-foreground">{p.read_minutes} min read</p> : null}
                </TableCell>
                <TableCell>
                  {p.published ? (
                    <span className="inline-flex items-center rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">Published</span>
                  ) : (
                    <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">Draft</span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">{p.author ?? "—"}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(p.published_at ?? p.created_at)}</TableCell>
                {can("edit") && (
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(p)}><Pencil className="size-4" /></Button>
                      {can("delete") && <Button variant="ghost" size="icon" className="size-8" onClick={() => remove(p)}><Trash2 className="size-4 text-[#cc0000]" /></Button>}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {postsQ.isLoading && <p className="p-6 text-center text-muted-foreground">Loading…</p>}
        {!postsQ.isLoading && postsQ.data?.length === 0 && <p className="p-6 text-center text-muted-foreground">No posts yet.</p>}
      </div>

      <BlogEditor post={editing} open={open} onOpenChange={setOpen} />
    </div>
  );
}
