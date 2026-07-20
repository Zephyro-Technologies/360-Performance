// The prefilled WhatsApp order message is the ONLY conversion artifact on this site — every sale is
// closed by hand in that chat. It previously quoted `pricePKR` while the page displayed (and struck
// through) it in favour of `salePricePKR`, so a discounted part opened WhatsApp at the HIGHER,
// crossed-out price. These tests lock that shut.
import { describe, expect, it } from "vitest";
import { whatsappOrderUrl } from "@360/lib/whatsapp";

/** wa.me puts the message in ?text=, url-encoded. */
function messageOf(url: string): string {
  return decodeURIComponent(new URL(url).searchParams.get("text") ?? "");
}

const base = {
  name: "Milltek Cat-Back Exhaust",
  sku: "MLK-CB-001",
  pricePKR: 60000,
  url: "https://360performance.pk/product/milltek-cat-back",
};

describe("whatsappOrderUrl", () => {
  it("quotes the SALE price — never the struck-through list price", () => {
    const msg = messageOf(whatsappOrderUrl({ ...base, salePricePKR: 45000 }));
    expect(msg).toContain("45,000");
    // the list price may only appear as the "was" reference, never as the price being ordered
    expect(msg).toMatch(/45,000.*was.*60,000/s);
    expect(msg).not.toMatch(/•\s*Rs\s*60,000\s*$/m);
  });

  it("quotes the list price when the product is not on sale", () => {
    const msg = messageOf(whatsappOrderUrl({ ...base, salePricePKR: null }));
    expect(msg).toContain("60,000");
    expect(msg).not.toContain("was");
  });

  it("ignores a 'sale' price that is not actually a discount", () => {
    const msg = messageOf(whatsappOrderUrl({ ...base, salePricePKR: 70000 }));
    expect(msg).toContain("60,000");
    expect(msg).not.toContain("70,000");
  });

  it("identifies the part by SKU and link, not an opaque UUID", () => {
    const msg = messageOf(whatsappOrderUrl({ ...base, salePricePKR: null }));
    expect(msg).toContain("MLK-CB-001");
    expect(msg).toContain("https://360performance.pk/product/milltek-cat-back");
    expect(msg).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i); // no UUID
  });
});
