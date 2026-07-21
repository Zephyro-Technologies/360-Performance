// One-off products list (Catalogue tab). Non-catalogue items with cost/sale/profit + edit/remove.
import { useMemo } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useOneoffProducts, useDeleteOneoffProduct, type OneoffProduct } from "../../data/oneoffProducts";
import { useSuppliers } from "../../data/catalog";
import { useAuth } from "../../data/auth";
import { formatPKR } from "@360/lib/format";
import { Button } from "@360/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@360/ui/table";
import { useTableSort, SortHead } from "../common/useTableSort";
import { useConfirm } from "../common/confirm";

export function OneoffProductsTable({ query, onEdit }: { query: string; onEdit: (p: OneoffProduct) => void }) {
  const listQ = useOneoffProducts();
  const suppliersQ = useSuppliers();
  const del = useDeleteOneoffProduct();
  const { can } = useAuth();
  const editable = can("edit");

  const vendorName = useMemo(() => {
    const m = new Map((suppliersQ.data ?? []).map((s) => [s.id, s.name]));
    return (id: string | null) => (id ? m.get(id) ?? "—" : "—");
  }, [suppliersQ.data]);

  const term = query.trim().toLowerCase();
  const rows = (listQ.data ?? []).filter(
    (p) => !term || p.name.toLowerCase().includes(term) || (p.oem_part_no ?? "").toLowerCase().includes(term) || vendorName(p.supplier_id).toLowerCase().includes(term),
  );
  const sort = useTableSort(
    rows,
    {
      name: (p) => p.name, oem: (p) => p.oem_part_no, vendor: (p) => vendorName(p.supplier_id),
      cost: (p) => p.landed_cost_pkr, sale: (p) => p.sale_price_pkr, profit: (p) => p.sale_price_pkr - p.landed_cost_pkr,
    },
    "name",
    "asc",
  );

  const confirm = useConfirm();

  async function remove(p: OneoffProduct) {
    if (!(await confirm({ title: `Delete ${p.name}?`, description: "This won't affect orders already using it.", destructive: true }))) return;
    try { await del.mutateAsync(p.id); toast.success("Deleted"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not delete"); }
  }

  return (
    <div className="overflow-x-auto rounded-md border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="bg-black hover:bg-black">
            <SortHead label="Name" sortKey="name" sort={sort} className="text-white whitespace-nowrap" />
            <SortHead label="OEM #" sortKey="oem" sort={sort} className="text-white whitespace-nowrap" />
            <SortHead label="Vendor" sortKey="vendor" sort={sort} className="text-white whitespace-nowrap" />
            <SortHead label="Cost" sortKey="cost" sort={sort} className="text-white whitespace-nowrap text-right" align="right" />
            <SortHead label="Sale" sortKey="sale" sort={sort} className="text-white whitespace-nowrap text-right" align="right" />
            <SortHead label="Profit" sortKey="profit" sort={sort} className="text-white whitespace-nowrap text-right" align="right" />
            <TableHead className="text-white whitespace-nowrap text-right">{editable ? "Actions" : ""}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sort.sorted.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="font-medium">{p.name}</TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">{p.oem_part_no ?? "—"}</TableCell>
              <TableCell className="text-muted-foreground">{vendorName(p.supplier_id)}</TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">{formatPKR(p.landed_cost_pkr)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatPKR(p.sale_price_pkr)}</TableCell>
              <TableCell className="text-right tabular-nums font-medium">{formatPKR(p.sale_price_pkr - p.landed_cost_pkr)}</TableCell>
              <TableCell className="text-right">
                {editable && (
                  <div className="flex items-center justify-end gap-1">
                    <Button size="icon" variant="ghost" className="size-7" aria-label="Edit" onClick={() => onEdit(p)}><Pencil className="size-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="size-7 text-muted-foreground hover:text-[#cc0000]" aria-label="Delete" disabled={del.isPending} onClick={() => remove(p)}><Trash2 className="size-3.5" /></Button>
                  </div>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {listQ.isLoading && <p className="p-6 text-center text-muted-foreground">Loading…</p>}
      {!listQ.isLoading && sort.sorted.length === 0 && (
        <p className="p-6 text-center text-muted-foreground">{(listQ.data ?? []).length === 0 ? "No one-off products yet. Add items you sell but don't stock." : "No products match your search."}</p>
      )}
    </div>
  );
}
