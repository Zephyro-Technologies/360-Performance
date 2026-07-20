// Investors — dedicated top-level page. The entity master (investors + deals), the per-product
// breakdown of investor-owned stock (cost / profit / investor vs house split), and the
// settlement panel (P&L carve-out, owed subledger, payouts). Everything investor in one place.
import { PageHeader } from "../components/common/PageHeader";
import { InvestorStatements } from "../components/data/InvestorStatements";
import { InvestorsManager } from "../components/data/InvestorsManager";
import { InvestorProducts } from "../components/data/InvestorProducts";
import { InvestorsPanel } from "../components/data/InvestorsPanel";

export function Investors() {
  return (
    <div>
      <PageHeader title="Investors" subtitle="Funders, deals, per-product profit & settlement. Every change is logged" />
      <InvestorStatements />
      <InvestorsManager />
      <div className="mt-8">
        <InvestorProducts />
      </div>
      <InvestorsPanel />
    </div>
  );
}
