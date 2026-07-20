// Finance — the money-out ledgers in one place: operating expenses, refunds, customer
// delivery costs, and vendor advances. Split out of Data Management so bookkeeping lives
// together and the dashboard's money-out tiles have a clear home to link into.
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { PageHeader } from "../components/common/PageHeader";
import { ExpensesManager } from "../components/data/ExpensesManager";
import { MarketingManager } from "../components/data/MarketingManager";
import { RefundsManager } from "../components/data/RefundsManager";
import { DeliveriesManager } from "../components/data/DeliveriesManager";
import { VendorAdvances } from "../components/data/VendorAdvances";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@360/ui/tabs";

const TABS = ["expenses", "marketing", "refunds", "delivery", "advances"];

export function Finance() {
  // Deep-link support: /finance?tab=refunds lands on that tab (e.g. from the dashboard).
  // CONTROLLED, not defaultValue — /finance is one route match, so navigating from
  // ?tab=delivery to ?tab=expenses&new=1 (the topbar's "+ New → Record expense") does not
  // remount this page. An uncontrolled Tabs would keep the old tab, leaving ExpensesManager
  // unmounted, so useOpenOnNewParam never ran: the dialog never opened AND the stale new=1
  // stayed in the URL to fire later, when the operator eventually clicked Expenses by hand.
  const [searchParams] = useSearchParams();
  const requested = searchParams.get("tab");
  const activeTab = requested && TABS.includes(requested) ? requested : "expenses";
  const [tab, setTab] = useState(activeTab);
  useEffect(() => setTab(activeTab), [activeTab]);

  return (
    <div>
      <PageHeader title="Finance" subtitle="Money out: expenses, marketing, refunds, delivery & vendor advances. Every change is logged" />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4 h-12 w-full">
          <TabsTrigger value="expenses" className="text-base font-medium">Expenses</TabsTrigger>
          <TabsTrigger value="marketing" className="text-base font-medium">Marketing</TabsTrigger>
          <TabsTrigger value="refunds" className="text-base font-medium">Refunds</TabsTrigger>
          <TabsTrigger value="delivery" className="text-base font-medium">Delivery</TabsTrigger>
          <TabsTrigger value="advances" className="text-base font-medium">Vendor Advances</TabsTrigger>
        </TabsList>

        <TabsContent value="expenses"><ExpensesManager /></TabsContent>
        <TabsContent value="marketing"><MarketingManager /></TabsContent>
        <TabsContent value="refunds"><RefundsManager /></TabsContent>
        <TabsContent value="delivery"><DeliveriesManager /></TabsContent>
        <TabsContent value="advances"><VendorAdvances /></TabsContent>
      </Tabs>
    </div>
  );
}
