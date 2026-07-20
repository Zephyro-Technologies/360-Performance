// Per-investor statement — one line per investor answering "what does this investor have with
// us?": capital still parked in unsold stock, capital + profit earned from sold units, paid out,
// and owed now. Combines investor_product_pnl (per-product) with investor_owed (settlement).
// Read-only overview; recording payouts happens in the settlement panel below.
import { useMemo } from "react";
import { Users } from "lucide-react";
import { useInvestorOwed, useInvestorProductPnl } from "../../data/investors";
import { formatPKR } from "@360/lib/format";
import { cn } from "@360/ui/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@360/ui/table";

interface Statement {
  id: string;
  name: string;
  invested: number; // capital still in unsold stock
  capital: number; // capital earned back from sold units
  profit: number; // their profit share from sold units
  paid: number;
  owed: number;
}

export function InvestorStatements() {
  const owedQ = useInvestorOwed();
  const pnlQ = useInvestorProductPnl();

  const rows = useMemo(() => {
    const m = new Map<string, Statement>();
    for (const o of owedQ.data ?? []) {
      m.set(o.investor_id, { id: o.investor_id, name: o.name, invested: 0, capital: 0, profit: 0, paid: o.paid_out_pkr, owed: o.owed_pkr });
    }
    for (const p of pnlQ.data ?? []) {
      const r = m.get(p.investor_id) ?? { id: p.investor_id, name: p.investor_name, invested: 0, capital: 0, profit: 0, paid: 0, owed: 0 };
      r.invested += p.on_hand_value_pkr;
      r.capital += p.capital_returned_pkr;
      r.profit += p.investor_share_pkr;
      m.set(p.investor_id, r);
    }
    return [...m.values()]
      .filter((r) => r.invested || r.capital || r.profit || r.paid || r.owed)
      .sort((a, b) => b.owed - a.owed);
  }, [owedQ.data, pnlQ.data]);

  return (
    <section className="mb-8">
      <div className="mb-1 flex items-center gap-2">
        <Users className="size-4 text-muted-foreground" />
        <h2 className="[font-family:var(--font-heading)] uppercase tracking-wide">Where each investor stands</h2>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Each investor&apos;s position: capital still parked in unsold stock, what they&apos;ve earned from sales, what&apos;s been paid, and what&apos;s owed now.
      </p>

      {owedQ.isError ? (
        <p className="rounded-md border border-border bg-card py-6 text-center text-sm text-[#cc0000]">{(owedQ.error as Error).message}</p>
      ) : rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-border bg-muted/30 py-8 text-center text-sm text-muted-foreground">
          No investor positions yet. Assign a product to an investor (in the product editor) and it&apos;ll show here.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-black hover:bg-black">
                {["Investor", "Still invested", "Capital earned", "Profit earned", "Paid out", "Owed now"].map((c, i) => (
                  <TableHead key={c} className={cn("text-white whitespace-nowrap", i > 0 && "text-right")}>{c}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{formatPKR(r.invested)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{formatPKR(r.capital)}</TableCell>
                  <TableCell className="text-right tabular-nums text-violet-700">{formatPKR(r.profit)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{formatPKR(r.paid)}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{formatPKR(r.owed)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
