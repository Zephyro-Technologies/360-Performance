// The catalogue's own filtering is scoped to the active tab, which is exactly the gap this closes:
// a search must find a product regardless of which tab owns it.
import { describe, it, expect } from "vitest";
import { searchCatalog, groupHits, type CatalogHit } from "./catalogSearch";
import type { ProductListItem } from "../../data/catalog";
import type { OneoffProduct } from "../../data/oneoffProducts";

const product = (over: Partial<ProductListItem>) =>
  ({
    id: "p", name: "Part", sku: "SKU-1", brand: null, mpn: null, price_pkr: 1000,
    owner_kind: "house", categories: null,
    ...over,
  }) as unknown as ProductListItem;

const oneoff = (over: Partial<OneoffProduct>) =>
  ({ id: "o", name: "One-off", oem_part_no: null, supplier_id: null, landed_cost_pkr: 0, sale_price_pkr: 500, active: true, ...over }) as OneoffProduct;

const products = [
  product({ id: "p1", name: "Garrett GT2860 turbo", sku: "TRB-001", owner_kind: "house", price_pkr: 120000 }),
  product({ id: "p2", name: "Precision 6266 turbo", sku: "TRB-220", owner_kind: "investor", price_pkr: 310000 }),
  product({ id: "p3", name: "Front rotor", sku: "BRK-010", owner_kind: "house", categories: { name: "Brakes", parent_id: null } }),
  product({ id: "p4", name: "Pad set", sku: "BRK-011", owner_kind: "house", brand: "Brembo" }),
];
const oneoffs = [oneoff({ id: "o1", name: "Turbo gasket kit", oem_part_no: "17105-AA" })];

const run = (term: string) =>
  searchCatalog(term, {
    products,
    oneoffs,
    categoryName: (p) => p.categories?.name ?? null,
    vendorForProduct: (p) => (p.id === "p1" ? "FY MOTO" : null),
    vendorForOneoff: () => "Local Parts Co",
  });

describe("catalogue-wide search", () => {
  it("finds matches in EVERY tab, not just the active one", () => {
    const hits = run("turbo");
    expect(hits.map((h) => h.id)).toEqual(["p1", "p2", "o1"]);
    expect([...new Set(hits.map((h) => h.tab))]).toEqual(["house", "investor", "oneoff"]);
  });

  it("matches on category, brand and OEM #, and says which field hit", () => {
    expect(run("brakes").map((h) => [h.id, h.matchedOn])).toEqual([["p3", "category"]]);
    expect(run("brembo").map((h) => [h.id, h.matchedOn])).toEqual([["p4", "brand"]]);
    expect(run("17105").map((h) => [h.id, h.matchedOn])).toEqual([["o1", "OEM #"]]);
  });

  it("still matches name, SKU and vendor", () => {
    expect(run("GT2860").map((h) => h.matchedOn)).toEqual(["name"]);
    expect(run("brk-010").map((h) => h.matchedOn)).toEqual(["SKU"]);
    expect(run("fy moto").map((h) => h.matchedOn)).toEqual(["vendor"]);
  });

  it("is case-insensitive and trims, and an empty term matches nothing", () => {
    expect(run("  TURBO  ").length).toBe(3);
    expect(run("")).toEqual([]);
    expect(run("   ")).toEqual([]);
  });

  it("reports the name as the match when the term hits several fields", () => {
    // "turbo" is in p1's name; the name is checked first so the badge isn't noise.
    expect(run("turbo")[0].matchedOn).toBe("name");
  });

  it("carries the identifying reference per source: SKU for products, OEM # for one-offs", () => {
    const hits = run("turbo");
    expect(hits.find((h) => h.id === "p1")!.ref).toBe("TRB-001");
    expect(hits.find((h) => h.id === "o1")!.ref).toBe("17105-AA");
  });

  it("groups by tab in page order and drops empty groups", () => {
    expect(groupHits(run("turbo")).map((g) => [g.tab, g.hits.length])).toEqual([
      ["house", 1], ["investor", 1], ["oneoff", 1],
    ]);
    expect(groupHits(run("brembo")).map((g) => g.tab)).toEqual(["house"]);
    expect(groupHits([] as CatalogHit[])).toEqual([]);
  });
});
