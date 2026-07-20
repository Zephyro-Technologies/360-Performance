// Module 4 — Data Management. Customers, Suppliers, Order Editing and the Audit Trail.
// (The money ledgers — expenses, marketing, refunds, delivery, vendor advances — live in Finance.)
import { useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import { Pencil, Plus, Trash2, Search } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "../components/common/PageHeader";
import { StatusBadge } from "../components/common/StatusBadge";
import { useTableSort, SortHead } from "../components/common/useTableSort";
import { OrderDetail } from "../components/orders/OrderDetail";
import { CustomerDialog } from "../components/data/CustomerDialog";
import { VendorDialog, type VendorEditTarget } from "../components/data/VendorDialog";
import { CustomerProfile } from "../components/data/CustomerProfile";
import { useAuditLog } from "../data/audit";
import {
  useCustomers,
  useCustomerPaid,
  useDeleteCustomer,
  useSuppliersList,
  useDeleteSupplier,
  type Customer,
  type SupplierRow,
} from "../data/crm";
import {
  useLogisticsVendors,
  useDeleteVendorAccount,
  VENDOR_ROLE_LABEL,
} from "../data/vendorAdvances";
import { displayCurrency } from "../data/types";
import {
  useOrders,
  useSetOrderStage,
  ALL_STAGES,
  STAGE_LABEL,
  type OrderRow,
  type OrderStage,
} from "../data/orders";
import { useAuth } from "../data/auth";
import { formatPKR, formatDate, formatDateTime } from "@360/lib/format";
import { Button } from "@360/ui/button";
import { Input } from "@360/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@360/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@360/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@360/ui/table";

const TYPE_LABEL: Record<string, string> = { retail: "Retail", trade: "Trade", workshop: "Workshop" };

// One list, three vendor kinds: product vendors (suppliers) + air/sea logistics vendors.
// All three now share the same fields (contact/phone/country/currency); `supplier` is kept
// on product rows so the edit dialog can round-trip the full SupplierRow.
type VendorKind = "product" | "air_freight" | "sea_freight";
interface VendorRow {
  kind: VendorKind;
  id: string;
  name: string;
  contact: string | null;
  phone: string | null;
  country: string | null;
  currency: string;
  active: boolean;
  supplier?: SupplierRow;
}
const VENDOR_KIND_LABEL: Record<VendorKind, string> = { product: "Product", ...VENDOR_ROLE_LABEL } as Record<VendorKind, string>;

function SearchBar({ value, onChange, extra }: { value: string; onChange: (v: string) => void; extra?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search…" value={value} onChange={(e) => onChange(e.target.value)} className="pl-9" />
      </div>
      {extra}
    </div>
  );
}

const TABS = ["customers", "suppliers", "orders", "audit"];

export function DataManagement() {
  const auditQ = useAuditLog();
  const ordersQ = useOrders();
  const setStage = useSetOrderStage();
  const customersQ = useCustomers();
  const paidQ = useCustomerPaid();
  const [q, setQ] = useState("");
  const suppliersQ = useSuppliersList();
  const logisticsQ = useLogisticsVendors();
  const delCustomer = useDeleteCustomer();
  const delSupplier = useDeleteSupplier();
  const delVendorAccount = useDeleteVendorAccount();
  const { can } = useAuth();

  // Deep-link support: /data?tab=suppliers lands on that tab. Falls back to Customers.
  // CONTROLLED, not defaultValue — an uncontrolled Tabs reads its value once at mount, so
  // arriving at /data?tab=… while already on /data (same route match, no remount) silently
  // kept the old tab.
  const [searchParams] = useSearchParams();
  const requested = searchParams.get("tab");
  const activeTab = requested && TABS.includes(requested) ? requested : "customers";
  const [tab, setTab] = useState(activeTab);
  useEffect(() => setTab(activeTab), [activeTab]);

  function changeStage(id: string, stage: OrderStage) {
    setStage.mutate({ id, stage }, { onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update stage") });
  }

  const [activeOrder, setActiveOrder] = useState<OrderRow | null>(null);
  const [profile, setProfile] = useState<Customer | null>(null);
  const [custEdit, setCustEdit] = useState<Customer | null>(null);
  const [custDialog, setCustDialog] = useState(false);
  const [vendorEdit, setVendorEdit] = useState<VendorEditTarget | null>(null);
  const [vendorDialog, setVendorDialog] = useState(false);

  function openNewCustomer() { setCustEdit(null); setCustDialog(true); }
  function openEditCustomer(c: Customer) { setCustEdit(c); setCustDialog(true); }
  function openNewVendor() { setVendorEdit(null); setVendorDialog(true); }
  function openEditVendor(v: VendorEditTarget) { setVendorEdit(v); setVendorDialog(true); }

  async function removeCustomer(c: Customer) {
    if (!confirm(`Delete ${c.name}?`)) return;
    try {
      await delCustomer.mutateAsync(c.id);
      toast.success("Customer deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete");
    }
  }
  async function removeVendor(v: VendorRow) {
    if (!confirm(`Delete ${v.name}?`)) return;
    try {
      if (v.kind === "product") await delSupplier.mutateAsync(v.id);
      else await delVendorAccount.mutateAsync(v.id);
      toast.success("Vendor deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete");
    }
  }

  const term = q.trim().toLowerCase();
  const inc = (s: string | null | undefined) => (s ?? "").toLowerCase().includes(term);
  const paid = paidQ.data ?? {};
  const customers = (customersQ.data ?? [])
    .filter((c) => !term || inc(c.name) || inc(c.email) || inc(c.city) || inc(c.phone) || inc(TYPE_LABEL[c.type] ?? c.type));
  const productVendors: VendorRow[] = (suppliersQ.data ?? [])
    .filter((s) => !term || inc(s.name) || inc(s.phone) || inc(s.contact) || inc(s.country))
    .map((s) => ({ kind: "product", id: s.id, name: s.name, contact: s.contact, phone: s.phone, country: s.country, currency: s.currency, active: s.active, supplier: s }));
  const logisticsVendors: VendorRow[] = (logisticsQ.data ?? [])
    .filter((v) => !term || inc(v.name) || inc(v.phone) || inc(v.contact) || inc(v.country) || inc(VENDOR_ROLE_LABEL[v.role]))
    .map((v) => ({ kind: v.role, id: v.id, name: v.name, contact: v.contact, phone: v.phone, country: v.country, currency: v.currency, active: v.active }));
  const vendorRows: VendorRow[] = [...productVendors, ...logisticsVendors];
  const orders = (ordersQ.data ?? []).filter((o) => !term || inc(o.order_no) || inc(o.customers?.name));
  const audit = (auditQ.data ?? []).filter((a) => !term || inc(a.actor_name) || inc(a.action) || inc(a.entity_type) || inc(a.detail));

  const custSort = useTableSort(customers, {
    customer: (c) => c.name,
    type: (c) => TYPE_LABEL[c.type] ?? c.type,
    city: (c) => c.city,
    since: (c) => c.since,
    orders: (c) => c.ordersCount,
    paid: (c) => paid[c.id] ?? 0,
  }, "customer", "asc");
  const vendorSort = useTableSort(vendorRows, {
    vendor: (v) => v.name,
    type: (v) => VENDOR_KIND_LABEL[v.kind],
    phone: (v) => v.phone,
    country: (v) => v.country,
    currency: (v) => v.currency,
    status: (v) => (v.active ? 1 : 0),
  }, "vendor", "asc");
  const orderSort = useTableSort(orders, {
    order: (o) => o.order_no,
    customer: (o) => o.customers?.name ?? null,
    total: (o) => o.total_pkr,
    stage: (o) => o.stage,
  }, "order", "asc");
  const auditSort = useTableSort(audit, {
    when: (a) => a.at,
    user: (a) => a.actor_name,
    action: (a) => a.action,
    entity: (a) => a.entity_type,
    detail: (a) => a.detail,
  }, "when", "desc");

  return (
    <div>
      <PageHeader title="Data Management" subtitle="Central records. Every change is logged" />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4 h-12 w-full">
          <TabsTrigger value="customers" className="text-base font-medium">Customers</TabsTrigger>
          <TabsTrigger value="suppliers" className="text-base font-medium">Vendors</TabsTrigger>
          <TabsTrigger value="orders" className="text-base font-medium">Order Editing</TabsTrigger>
          <TabsTrigger value="audit" className="text-base font-medium">Audit Trail</TabsTrigger>
        </TabsList>

        {/* Customers */}
        <TabsContent value="customers">
          <SearchBar
            value={q}
            onChange={setQ}
            extra={
              can("edit") && (
                <Button className="bg-[#cc0000] text-white hover:bg-[#a30000]" onClick={openNewCustomer}>
                  <Plus className="size-4" /> New Customer
                </Button>
              )
            }
          />
          <div className="overflow-x-auto rounded-md border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-black hover:bg-black">
                  <SortHead label="Customer" sortKey="customer" sort={custSort} className="text-white" />
                  <SortHead label="Type" sortKey="type" sort={custSort} className="text-white" />
                  <SortHead label="City" sortKey="city" sort={custSort} className="text-white" />
                  <SortHead label="Since" sortKey="since" sort={custSort} className="text-white" />
                  <SortHead label="Orders" sortKey="orders" sort={custSort} className="text-white" />
                  <SortHead label="Total paid" sortKey="paid" sort={custSort} className="text-white" />
                  <TableHead className="text-white w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {custSort.sorted.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="cursor-pointer" onClick={() => setProfile(c)}>
                      <p className="font-medium hover:underline">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.email}</p>
                    </TableCell>
                    <TableCell><StatusBadge status={TYPE_LABEL[c.type] ?? c.type} /></TableCell>
                    <TableCell className="text-muted-foreground">{c.city}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(c.since)}</TableCell>
                    <TableCell className="tabular-nums">{c.ordersCount}</TableCell>
                    <TableCell className="tabular-nums font-medium">{formatPKR(paidQ.data?.[c.id] ?? 0)}</TableCell>
                    <TableCell>
                      {can("edit") && (
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="size-8" onClick={() => openEditCustomer(c)}><Pencil className="size-4" /></Button>
                          {can("delete") && <Button variant="ghost" size="icon" className="size-8" onClick={() => removeCustomer(c)}><Trash2 className="size-4 text-[#cc0000]" /></Button>}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {customersQ.isLoading && <p className="p-6 text-center text-muted-foreground">Loading…</p>}
            {customersQ.isError && <p className="p-6 text-center text-[#cc0000]">{(customersQ.error as Error).message}</p>}
            {!customersQ.isLoading && customers.length === 0 && <p className="p-6 text-center text-muted-foreground">No customers match.</p>}
          </div>
        </TabsContent>

        {/* Vendors — product vendors (suppliers) + air/sea logistics vendors, one list */}
        <TabsContent value="suppliers">
          <SearchBar
            value={q}
            onChange={setQ}
            extra={can("edit") && (
              <Button className="bg-[#cc0000] text-white hover:bg-[#a30000]" onClick={openNewVendor}>
                <Plus className="size-4" /> New Vendor
              </Button>
            )}
          />
          <div className="overflow-x-auto rounded-md border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-black hover:bg-black">
                  <SortHead label="Vendor" sortKey="vendor" sort={vendorSort} className="text-white" />
                  <SortHead label="Type" sortKey="type" sort={vendorSort} className="text-white" />
                  <SortHead label="Phone" sortKey="phone" sort={vendorSort} className="text-white" />
                  <SortHead label="Country" sortKey="country" sort={vendorSort} className="text-white" />
                  <SortHead label="Currency" sortKey="currency" sort={vendorSort} className="text-white" />
                  <SortHead label="Status" sortKey="status" sort={vendorSort} className="text-white" />
                  <TableHead className="text-white w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vendorSort.sorted.map((v) => {
                  // Product vendors are editable by staff+admin; logistics vendors are admin-only (RLS).
                  const canEditRow = v.kind === "product" ? can("edit") : can("manage");
                  const canDeleteRow = v.kind === "product" ? can("delete") : can("manage");
                  return (
                    <TableRow key={`${v.kind}-${v.id}`}>
                      <TableCell className="font-medium">{v.name}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs font-medium">{VENDOR_KIND_LABEL[v.kind]}</span>
                      </TableCell>
                      <TableCell>
                        <p>{v.phone || <span className="text-muted-foreground">—</span>}</p>
                        {/* Legacy free-text contact (the vendor dialog now collects the phone only). */}
                        {v.contact && <p className="text-xs text-muted-foreground">{v.contact}</p>}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{v.country || "—"}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs font-medium tabular-nums">{displayCurrency(v.currency)}</span>
                      </TableCell>
                      <TableCell>
                        {v.active
                          ? <span className="inline-flex items-center rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">Active</span>
                          : <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">Inactive</span>}
                      </TableCell>
                      <TableCell>
                        {canEditRow && (
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="size-8" onClick={() => openEditVendor(v.kind === "product" && v.supplier ? { kind: "product", supplier: v.supplier } : { kind: v.kind as "air_freight" | "sea_freight", id: v.id, name: v.name, contact: v.contact, phone: v.phone, country: v.country, currency: v.currency })}><Pencil className="size-4" /></Button>
                            {canDeleteRow && <Button variant="ghost" size="icon" className="size-8" onClick={() => removeVendor(v)}><Trash2 className="size-4 text-[#cc0000]" /></Button>}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {(suppliersQ.isLoading || logisticsQ.isLoading) && <p className="p-6 text-center text-muted-foreground">Loading…</p>}
            {suppliersQ.isError && <p className="p-6 text-center text-[#cc0000]">{(suppliersQ.error as Error).message}</p>}
            {!suppliersQ.isLoading && !logisticsQ.isLoading && vendorRows.length === 0 && <p className="p-6 text-center text-muted-foreground">No vendors yet.</p>}
          </div>
        </TabsContent>

        {/* Order Editing (DB-backed) */}
        <TabsContent value="orders">
          <SearchBar value={q} onChange={setQ} />
          <div className="overflow-x-auto rounded-md border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-black hover:bg-black">
                  <SortHead label="Order" sortKey="order" sort={orderSort} className="text-white" />
                  <SortHead label="Customer" sortKey="customer" sort={orderSort} className="text-white" />
                  <SortHead label="Total" sortKey="total" sort={orderSort} className="text-white" />
                  <SortHead label="Stage" sortKey="stage" sort={orderSort} className="text-white" />
                  <TableHead className="text-white w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orderSort.sorted.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="cursor-pointer font-medium tabular-nums" onClick={() => setActiveOrder(o)}>{o.order_no}</TableCell>
                    <TableCell>{o.customers?.name}</TableCell>
                    <TableCell className="tabular-nums">{formatPKR(o.total_pkr)}</TableCell>
                    <TableCell>
                      {can("edit") ? (
                        <Select value={o.stage} onValueChange={(v) => changeStage(o.id, v as OrderStage)}>
                          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {ALL_STAGES.map((st) => <SelectItem key={st} value={st}>{STAGE_LABEL[st]}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : (
                        <StatusBadge status={STAGE_LABEL[o.stage]} />
                      )}
                    </TableCell>
                    <TableCell>
                      <button className="text-sm text-[#cc0000] hover:underline" onClick={() => setActiveOrder(o)}>View</button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {ordersQ.isLoading && <p className="p-6 text-center text-muted-foreground">Loading…</p>}
            {!ordersQ.isLoading && ordersQ.data?.length === 0 && <p className="p-6 text-center text-muted-foreground">No orders yet.</p>}
          </div>
        </TabsContent>

        {/* Audit Trail (DB-backed: audit_log) */}
        <TabsContent value="audit">
          <SearchBar value={q} onChange={setQ} />
          <div className="overflow-x-auto rounded-md border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-black hover:bg-black">
                  <SortHead label="When" sortKey="when" sort={auditSort} className="text-white" />
                  <SortHead label="User" sortKey="user" sort={auditSort} className="text-white" />
                  <SortHead label="Action" sortKey="action" sort={auditSort} className="text-white" />
                  <SortHead label="Entity" sortKey="entity" sort={auditSort} className="text-white" />
                  <SortHead label="Detail" sortKey="detail" sort={auditSort} className="text-white" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {auditSort.sorted.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(a.at)}</TableCell>
                    <TableCell className="font-medium">{a.actor_name ?? "—"}</TableCell>
                    <TableCell>{a.action}</TableCell>
                    <TableCell className="tabular-nums">{a.entity_type}</TableCell>
                    <TableCell className="text-muted-foreground">{a.detail}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {auditQ.isLoading && <p className="p-6 text-center text-muted-foreground">Loading…</p>}
            {!auditQ.isLoading && auditQ.data?.length === 0 && <p className="p-6 text-center text-muted-foreground">No audited actions yet.</p>}
          </div>
        </TabsContent>
      </Tabs>

      <OrderDetail
        order={activeOrder ? ordersQ.data?.find((o) => o.id === activeOrder.id) ?? null : null}
        open={!!activeOrder}
        onOpenChange={(o) => !o && setActiveOrder(null)}
      />
      <CustomerProfile customer={profile} open={!!profile} onOpenChange={(o) => !o && setProfile(null)} />
      <CustomerDialog customer={custEdit} open={custDialog} onOpenChange={setCustDialog} />
      <VendorDialog editing={vendorEdit} allowLogistics={can("manage")} open={vendorDialog} onOpenChange={setVendorDialog} />
    </div>
  );
}
