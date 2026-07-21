// Query sheets data layer — rough working spreadsheets on Sales Documents (admin-only; the RLS
// policies in migration 090110 are the real gate, `can("manage")` in the UI is only UX).
// Scratch work: nothing here touches stock, orders, invoices or the P&L.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { friendlyError } from "./errors";
import type { Json } from "@360/supabase";
import { toCustomColumns, type CustomColumnDef, type SheetCells } from "../components/invoicing/querySheetColumns";

// A named interface has no implicit index signature, so it isn't assignable to the generated `Json`
// type. Rebuilding each entry as a fresh object literal keeps the write type-checked field by field
// (rather than casting the whole array through `unknown` and losing the check).
const customColumnsToJson = (cols: CustomColumnDef[]): Json =>
  cols.map((c) => ({ key: c.key, label: c.label, kind: c.kind }));

export interface QuerySheetRow {
  id: string;
  position: number;
  product_id: string | null;
  cells: SheetCells;
}

export interface QuerySheet {
  id: string;
  title: string;
  notes: string | null;
  columns: string[]; // ordered column keys — this IS the layout; empty ⇒ fall back to the full set
  custom_columns: CustomColumnDef[]; // operator-defined columns for this sheet
  created_at: string;
  updated_at: string;
}

// The stored value is jsonb, so a hand-edited row could be anything — coerce defensively.
const toKeys = (v: unknown): string[] => (Array.isArray(v) ? v.filter((k): k is string => typeof k === "string") : []);

export interface QuerySheetDetail extends QuerySheet {
  rows: QuerySheetRow[];
}

export function useQuerySheets() {
  return useQuery({
    queryKey: ["query-sheets"],
    queryFn: async (): Promise<(QuerySheet & { row_count: number })[]> => {
      const { data, error } = await supabase
        .from("query_sheets")
        .select("id, title, notes, columns, custom_columns, created_at, updated_at, query_sheet_rows(count)")
        .order("updated_at", { ascending: false });
      if (error) throw new Error(friendlyError(error));
      return (data ?? []).map((s) => {
        const counts = s.query_sheet_rows as unknown as { count: number }[] | null;
        return {
          id: s.id,
          title: s.title,
          notes: s.notes,
          columns: toKeys(s.columns),
          custom_columns: toCustomColumns(s.custom_columns),
          created_at: s.created_at,
          updated_at: s.updated_at,
          row_count: counts?.[0]?.count ?? 0,
        };
      });
    },
  });
}

export function useQuerySheet(id: string | null) {
  return useQuery({
    queryKey: ["query-sheet", id],
    enabled: !!id,
    queryFn: async (): Promise<QuerySheetDetail | null> => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("query_sheets")
        .select("id, title, notes, columns, custom_columns, created_at, updated_at, query_sheet_rows(id, position, product_id, cells)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error(friendlyError(error));
      if (!data) return null;
      const rows = (data.query_sheet_rows ?? []) as unknown as { id: string; position: number; product_id: string | null; cells: SheetCells | null }[];
      return {
        id: data.id,
        title: data.title,
        notes: data.notes,
        columns: toKeys(data.columns),
        custom_columns: toCustomColumns(data.custom_columns),
        created_at: data.created_at,
        updated_at: data.updated_at,
        rows: rows
          .map((r) => ({ id: r.id, position: r.position, product_id: r.product_id, cells: r.cells ?? {} }))
          .sort((a, b) => a.position - b.position),
      };
    },
  });
}

export function useCreateQuerySheet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ title, columns, custom_columns = [] }: { title: string; columns: string[]; custom_columns?: CustomColumnDef[] }): Promise<string> => {
      const { data, error } = await supabase
        .from("query_sheets")
        .insert({ title: title.trim() || "Untitled query", columns, custom_columns: customColumnsToJson(custom_columns) })
        .select("id")
        .single();
      if (error) throw new Error(friendlyError(error));
      return data.id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["query-sheets"] }),
  });
}

export function useUpdateQuerySheet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, custom_columns, ...patch }: { id: string; title?: string; notes?: string | null; columns?: string[]; custom_columns?: CustomColumnDef[] }) => {
      const { error } = await supabase
        .from("query_sheets")
        .update(custom_columns ? { ...patch, custom_columns: customColumnsToJson(custom_columns) } : patch)
        .eq("id", id);
      if (error) throw new Error(friendlyError(error));
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["query-sheets"] });
      qc.invalidateQueries({ queryKey: ["query-sheet", v.id] });
    },
  });
}

export function useDeleteQuerySheet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("query_sheets").delete().eq("id", id);
      if (error) throw new Error(friendlyError(error));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["query-sheets"] }),
  });
}

// ---- rows -------------------------------------------------------------------------------------

export function useAddQuerySheetRows(sheetId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: { position: number; product_id?: string | null; cells: SheetCells }[]) => {
      const { error } = await supabase
        .from("query_sheet_rows")
        .insert(rows.map((r) => ({ sheet_id: sheetId, position: r.position, product_id: r.product_id ?? null, cells: r.cells })));
      if (error) throw new Error(friendlyError(error));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["query-sheet", sheetId] }),
  });
}

// One UPDATE per edited row (the grid writes a whole row's blob, not a single key), so two cells
// edited in different rows can't clobber each other.
export function useUpdateQuerySheetRow(sheetId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, cells }: { id: string; cells: SheetCells }) => {
      const { error } = await supabase.from("query_sheet_rows").update({ cells }).eq("id", id);
      if (error) throw new Error(friendlyError(error));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["query-sheet", sheetId] }),
  });
}

export function useDeleteQuerySheetRow(sheetId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("query_sheet_rows").delete().eq("id", id);
      if (error) throw new Error(friendlyError(error));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["query-sheet", sheetId] }),
  });
}
