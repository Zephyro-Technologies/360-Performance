// Investor products — item-by-item breakdown for every investor-owned product: what each
// unit cost, how many sold, profit per unit, the investor's cut vs your (house) cut, and what
// capital is still tied up in unsold stock. Grouped per investor with a subtotal. Read-only.
import { useMemo } from "react";
import { Link } from "react-router";
import { ArrowRight, Boxes, TrendingUp } from "lucide-react";
import { useInvestorProductPnl, usePnlSummary, type InvestorProductPnl } from "../../data/investors";
import { formatPKR } from "@360/lib/format";
import { cn } from "@360/ui/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@360/ui/table";

const money = (v: number | null) => (v == null ? "—" : formatPKR(v));

function SummaryStat({ label, value, help, tone }: { label: string; value: number; help: string; tone?: "investor" | "house" }) {
  return (
    <div className={cn("rounded-md border p-3", tone === "investor" ? "border-violet-200 bg-violet-50/40" : tone === "house" ? "border-emerald-200 bg-emerald-50/40" : "border-border bg-secondary/30")}>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-1 [font-family:var(--font-heading)] text-lg font-bold tabular-nums", tone === "investor" && "text-violet-700", tone === "house" && "text-emerald-700")}>{formatPKR(value)}</p>
      <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{help}</p>
    </div>
  );
}

export function InvestorProducts() {
  const q = useInvestorProductPnl();
  const pnl = usePnlSummary().data;
  const rows = useMemo(() => q.data ?? [], [q.data]);

  const totals = useMemo(
    () => rows.reduce(
      (a, r) => ({
        profit: a.profit + r.profit_pkr,
        investor: a.investor + r.investor_share_pkr,
        house: a.house + r.house_share_pkr,
        stock: a.stock + r.on_hand_value_pkr,
      }),
      { profit: 0, investor: 0, house: 0, stock: 0 },
    ),
    [rows],
  );

  const groups = useMemo(() => {
    const m = new Map<string, { id: string; name: string; rows: InvestorProductPnl[] }>();
    for (const r of rows) {
      const g = m.get(r.investor_id) ?? { id: r.investor_id, name: r.investor_name, rows: [] };
      g.rows.push(r);
      m.set(r.investor_id, g);
    }
    return [...m.values()];
  }, [rows]);

  return (
    <section className="mb-8">
      <div className="mb-1 flex items-center gap-2">
        <TrendingUp className="size-4 text-muted-foreground" />
        <h2 className="[font-family:var(--font-heading)] uppercase tracking-wide">Investor products: item by item</h2>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Every product funded by an investor. On each sale the investor first gets the item&apos;s cost back (their capital),
        then the profit is split. &quot;Still in stock&quot; is their capital not yet returned.
      </p>

      {rows.length > 0 && (
        <div className="mb-5 rounded-md border border-border bg-card p-5">
          <h3 className="mb-3 text-sm [font-family:var(--font-heading)] uppercase tracking-wide">The money, at a glance</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryStat label="Profit generated" value={totals.profit} help="Margin on sold investor products" />
            <SummaryStat label="Investor's cut" value={totals.investor} help="Their share of that profit" tone="investor" />
            <SummaryStat label="House's cut" value={totals.house} help="Your share of that profit (before expenses)" tone="house" />
            <SummaryStat label="Still invested" value={totals.stock} help="Unsold investor stock (their capital)" />
          </div>
          {pnl && (
            <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
              House-wide: operating expenses <span className="font-medium text-foreground tabular-nums">{formatPKR(pnl.operating_expense_pkr)}</span> ·
              house&apos;s final profit kept (after expenses) <span className="font-medium text-emerald-700 tabular-nums">{formatPKR(pnl.kept_pkr)}</span>
              <Link to="/insights/profit" className="ml-1 inline-flex items-center gap-0.5 text-[#cc0000] hover:underline">see how <ArrowRight className="size-3" /></Link>
            </p>
          )}
        </div>
      )}

      {q.isLoading && <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>}
      {q.isError && <p className="py-6 text-center text-sm text-[#cc0000]">{(q.error as Error).message}</p>}
      {!q.isLoading && groups.length === 0 && (
        <p className="rounded-md border border-dashed border-border bg-muted/30 py-8 text-center text-sm text-muted-foreground">
          No investor-owned products yet. Mark a product as investor-owned in the product editor to see it here.
        </p>
      )}

      <div className="space-y-5">
        {groups.map((g) => {
          const t = g.rows.reduce(
            (a, r) => ({
              profit: a.profit + r.profit_pkr,
              investor: a.investor + r.investor_share_pkr,
              house: a.house + r.house_share_pkr,
              capital: a.capital + r.capital_returned_pkr,
              stock: a.stock + r.on_hand_value_pkr,
            }),
            { profit: 0, investor: 0, house: 0, capital: 0, stock: 0 },
          );
          return (
            <div key={g.id} className="overflow-hidden rounded-md border border-border bg-card">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-secondary/40 px-4 py-2.5">
                <h3 className="font-medium">{g.name}</h3>
                <span className="text-xs text-muted-foreground">{g.rows.length} product{g.rows.length === 1 ? "" : "s"}</span>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-black hover:bg-black">
                      {["Product", "Split", "Cost / unit", "Sold", "Profit / unit", "Total profit", "Investor's cut", "Your cut", "Still in stock"].map((c, i) => (
                        <TableHead key={c} className={cn("text-white whitespace-nowrap", i >= 2 && "text-right")}>{c}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {g.rows.map((r) => (
                      <TableRow key={r.product_id}>
                        <TableCell>
                          <p className="font-medium">{r.name}</p>
                          <p className="font-mono text-xs text-muted-foreground">{r.sku}</p>
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700 tabular-nums">
                            {Math.round(r.split_pct * 100)}%
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{money(r.cost_per_unit_pkr)}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.qty_sold}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(r.profit_per_unit_pkr)}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{r.qty_sold > 0 ? formatPKR(r.profit_pkr) : "—"}</TableCell>
                        <TableCell className="text-right tabular-nums text-violet-700">{r.qty_sold > 0 ? formatPKR(r.investor_share_pkr) : "—"}</TableCell>
                        <TableCell className="text-right tabular-nums text-emerald-700">{r.qty_sold > 0 ? formatPKR(r.house_share_pkr) : "—"}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {r.on_hand_qty > 0 ? <><span className="text-foreground">{formatPKR(r.on_hand_value_pkr)}</span> · {r.on_hand_qty}u</> : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                    {/* subtotal */}
                    <TableRow className="border-t-2 border-border bg-secondary/30 font-medium hover:bg-secondary/30">
                      <TableCell colSpan={5} className="text-sm">
                        <span className="text-muted-foreground">Investor got back so far: </span>
                        <span className="tabular-nums">{formatPKR(t.capital)}</span>
                        <span className="text-muted-foreground"> capital + </span>
                        <span className="tabular-nums text-violet-700">{formatPKR(t.investor)}</span>
                        <span className="text-muted-foreground"> profit-share</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatPKR(t.profit)}</TableCell>
                      <TableCell className="text-right tabular-nums text-violet-700">{formatPKR(t.investor)}</TableCell>
                      <TableCell className="text-right tabular-nums text-emerald-700">{formatPKR(t.house)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        <span className="inline-flex items-center gap-1"><Boxes className="size-3.5 text-muted-foreground" />{formatPKR(t.stock)}</span>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
