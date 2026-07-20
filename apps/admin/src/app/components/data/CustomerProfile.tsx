// Customer profile drill-down. Contact + profile details from the DB. Order,
// payment and invoice history return here once the Orders/Invoices modules land.
import type { Customer } from "../../data/crm";
import { formatDate } from "@360/lib/format";
import { StatusBadge } from "../common/StatusBadge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@360/ui/sheet";

const TYPE_LABEL: Record<string, string> = { retail: "Retail", trade: "Trade", workshop: "Workshop" };

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value || "—"}</p>
    </div>
  );
}

export function CustomerProfile({
  customer,
  open,
  onOpenChange,
}: {
  customer: Customer | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  if (!customer) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-3">
            {customer.name} <StatusBadge status={TYPE_LABEL[customer.type] ?? customer.type} />
          </SheetTitle>
          <SheetDescription>{customer.email || "No email"}</SheetDescription>
        </SheetHeader>

        <div className="space-y-6 px-4 pb-8">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone" value={customer.phone} />
            <Field label="Customer since" value={formatDate(customer.since)} />
            <Field label="City" value={customer.city} />
            <Field label="Province" value={customer.province} />
            <Field label="Address" value={customer.address} />
            <Field label="Postal code" value={customer.postal_code} />
          </div>

          <section>
            <h4 className="mb-2">Orders &amp; payments</h4>
            <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
              {customer.ordersCount > 0
                ? `${customer.ordersCount} order(s). Full order, payment and invoice history appears here once those modules are wired.`
                : "No orders yet. Order, payment and invoice history will appear here as those modules come online."}
            </p>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
