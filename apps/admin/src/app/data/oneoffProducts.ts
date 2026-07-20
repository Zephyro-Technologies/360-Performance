// One-off products data layer — a reusable list of non-catalogue items (name, OEM #, vendor,
// landed cost, sale price). Shown in Catalogue → "One-off products" and addable to orders.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "./supabase";
import { friendlyError } from "./errors";

export interface OneoffProduct {
  id: string;
  name: string;
  oem_part_no: string | null;
  supplier_id: string | null;
  landed_cost_pkr: number;
  sale_price_pkr: number;
  active: boolean;
}

export function useOneoffProducts() {
  return useQuery({
    queryKey: ["oneoff-products"],
    queryFn: async (): Promise<OneoffProduct[]> => {
      const { data, error } = await supabase
        .from("oneoff_products")
        .select("id, name, oem_part_no, supplier_id, landed_cost_pkr, sale_price_pkr, active")
        .order("name");
      if (error) throw new Error(friendlyError(error));
      return (data ?? []).map((r) => ({
        id: r.id, name: r.name, oem_part_no: r.oem_part_no, supplier_id: r.supplier_id,
        landed_cost_pkr: Number(r.landed_cost_pkr), sale_price_pkr: Number(r.sale_price_pkr), active: r.active,
      }));
    },
  });
}

export const oneoffProductSchema = z.object({
  name: z.string().trim().min(1, "Name the product"),
  oem_part_no: z.string().trim().nullable(),
  supplier_id: z.string().uuid().nullable(),
  landed_cost_pkr: z.number().finite().nonnegative(),
  sale_price_pkr: z.number().finite().nonnegative(),
});
export type OneoffProductInput = z.infer<typeof oneoffProductSchema>;

export function useSaveOneoffProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: OneoffProductInput }): Promise<string> => {
      const p = oneoffProductSchema.parse(input);
      const { data, error } = id
        ? await supabase.from("oneoff_products").update(p).eq("id", id).select("id").single()
        : await supabase.from("oneoff_products").insert(p).select("id").single();
      if (error) throw new Error(friendlyError(error));
      return (data as { id: string }).id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["oneoff-products"] }),
  });
}

export function useDeleteOneoffProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("oneoff_products").delete().eq("id", id);
      if (error) throw new Error(friendlyError(error));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["oneoff-products"] }),
  });
}
