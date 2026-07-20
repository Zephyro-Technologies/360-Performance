// Catalogue-wide product search. The page's own filtering is scoped to the ACTIVE tab (In House /
// Investor / One-off), so a product you hold through an investor is invisible when you search from
// In House. This matches across all three sources at once and reports which tab each hit lives in.
//
// Pure and data-shape-agnostic on purpose: the page owns the queries, this owns the matching rules,
// and catalogSearch.test.ts locks them.
import type { ProductListItem } from "../../data/catalog";
import type { OneoffProduct } from "../../data/oneoffProducts";

export type CatalogTab = "house" | "investor" | "oneoff";

export const TAB_LABEL: Record<CatalogTab, string> = {
  house: "In House",
  investor: "Investor",
  oneoff: "One-off",
};

export interface CatalogHit {
  id: string;
  tab: CatalogTab;
  name: string;
  /** SKU for a catalogue product, OEM part no. for a one-off — whichever identifies it. */
  ref: string | null;
  category: string | null;
  brand: string | null;
  vendor: string | null;
  price: number | null;
  /** Which field matched, so the row can say why it's in the results. */
  matchedOn: string;
}

// Fields every product is searched on, in the order they're reported. Name/SKU/vendor were the
// original three; category, brand and OEM # were added so a search like "brakes" or an OEM number
// finds the part without knowing its name.
type Field = { label: string; value: string | null | undefined };

function matchField(fields: Field[], term: string): string | null {
  for (const f of fields) {
    if (f.value && f.value.toLowerCase().includes(term)) return f.label;
  }
  return null;
}

export function searchCatalog(
  term: string,
  {
    products,
    oneoffs,
    categoryName,
    vendorForProduct,
    vendorForOneoff,
  }: {
    products: ProductListItem[];
    oneoffs: OneoffProduct[];
    categoryName: (p: ProductListItem) => string | null;
    vendorForProduct: (p: ProductListItem) => string | null;
    vendorForOneoff: (o: OneoffProduct) => string | null;
  },
): CatalogHit[] {
  const t = term.trim().toLowerCase();
  if (!t) return [];

  const hits: CatalogHit[] = [];

  for (const p of products) {
    const category = categoryName(p);
    const vendor = vendorForProduct(p);
    const matchedOn = matchField(
      [
        { label: "name", value: p.name },
        { label: "SKU", value: p.sku },
        { label: "vendor", value: vendor },
        { label: "category", value: category },
        { label: "brand", value: p.brand },
        { label: "MPN", value: p.mpn },
      ],
      t,
    );
    if (!matchedOn) continue;
    hits.push({
      id: p.id,
      tab: p.owner_kind === "investor" ? "investor" : "house",
      name: p.name,
      ref: p.sku,
      category,
      brand: p.brand,
      vendor,
      price: p.price_pkr,
      matchedOn,
    });
  }

  for (const o of oneoffs) {
    const vendor = vendorForOneoff(o);
    const matchedOn = matchField(
      [
        { label: "name", value: o.name },
        { label: "OEM #", value: o.oem_part_no },
        { label: "vendor", value: vendor },
      ],
      t,
    );
    if (!matchedOn) continue;
    hits.push({
      id: o.id,
      tab: "oneoff",
      name: o.name,
      ref: o.oem_part_no,
      category: null, // one-offs sit outside the category tree
      brand: null,
      vendor,
      price: o.sale_price_pkr,
      matchedOn,
    });
  }

  return hits;
}

// Group hits by tab, preserving the tab order the page shows them in and dropping empty groups.
export function groupHits(hits: CatalogHit[]): { tab: CatalogTab; hits: CatalogHit[] }[] {
  const order: CatalogTab[] = ["house", "investor", "oneoff"];
  return order
    .map((tab) => ({ tab, hits: hits.filter((h) => h.tab === tab) }))
    .filter((g) => g.hits.length > 0);
}
