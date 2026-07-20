// Customer step for ORDER and INVOICE creation (DB-backed). Either pick an
// existing customer or fill an inline draft. The draft is NOT persisted here — it
// is handed to the parent and created transactionally with the order/invoice
// (no orphan-on-cancel).
import { useMemo, useState } from "react";
import { ArrowLeft, Check, ChevronsUpDown, Pencil, Plus, Search, UserPlus, Users } from "lucide-react";
import { useCustomers } from "../../data/crm";
import type { NewCustomerDraft } from "../../data/orders";
import { Button } from "@360/ui/button";
import { Input } from "@360/ui/input";
import { Label } from "@360/ui/label";
import { PhoneInput } from "./PhoneInput";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@360/ui/select";

export type CustomerSelection =
  | { kind: "existing"; id: string; type: NewCustomerDraft["type"]; label: string; sub: string }
  | { kind: "new"; draft: NewCustomerDraft };

export type CustomerType = NewCustomerDraft["type"];

// The selected customer's pricing tier (drives the per-line default).
export function selType(sel: CustomerSelection | null): CustomerType | null {
  if (!sel) return null;
  return sel.kind === "existing" ? sel.type : sel.draft.type;
}

// Default line price for a tier: trade/workshop → reseller (fallback retail); retail → retail.
export function tierPrice(retail: number | null, reseller: number | null, type: CustomerType | null): number {
  if (type === "trade" || type === "workshop") return reseller ?? retail ?? 0;
  return retail ?? 0;
}

const TYPES: { value: NewCustomerDraft["type"]; label: string }[] = [
  { value: "retail", label: "Retail" },
  { value: "workshop", label: "Workshop" },
];
const TYPE_LABEL: Record<string, string> = { retail: "Retail", trade: "Trade", workshop: "Workshop" };

type Mode = "choose" | "existing" | "new";

const blankDraft: NewCustomerDraft = { name: "", type: "retail", email: "", phone: "", city: "" };

export function CustomerStep({
  value,
  onChange,
}: {
  value: CustomerSelection | null;
  onChange: (sel: CustomerSelection | null) => void;
}) {
  const customersQ = useCustomers();
  const customers = useMemo(() => customersQ.data ?? [], [customersQ.data]);
  const [mode, setMode] = useState<Mode>("choose");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<NewCustomerDraft>(blankDraft);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = q
      ? customers.filter((c) =>
          [c.name, c.phone, c.email, c.city].some((f) => (f ?? "").toLowerCase().includes(q)),
        )
      : customers;
    return all.slice(0, 50);
  }, [customers, query]);

  function reset() {
    setMode("choose");
    setQuery("");
    setDraft(blankDraft);
  }

  function pickExisting(c: (typeof customers)[number]) {
    onChange({ kind: "existing", id: c.id, type: c.type, label: c.name, sub: c.phone || c.email || c.city || TYPE_LABEL[c.type] });
    reset();
  }

  function useNew() {
    if (!draft.name.trim()) return;
    onChange({ kind: "new", draft: { ...draft, name: draft.name.trim() } });
    reset();
  }

  // ---- Already-selected summary ----
  if (value && mode === "choose") {
    const label = value.kind === "existing" ? value.label : value.draft.name;
    const sub = value.kind === "existing" ? value.sub : "New customer, created when the order is saved";
    return (
      <div className="rounded-md border border-border bg-secondary/40 p-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid size-9 place-items-center rounded-full bg-black text-white">
            <Users className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground [font-family:var(--font-heading)]">Customer</p>
            <p className="truncate font-medium">{label}</p>
            <p className="truncate text-xs text-muted-foreground">{sub}</p>
          </div>
          <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={() => { onChange(null); setMode("choose"); }}>
            <Pencil className="size-3.5" /> Change
          </Button>
        </div>
      </div>
    );
  }

  // ---- Two-tile chooser ----
  if (mode === "choose") {
    return (
      <div className="space-y-3">
        <Label>Customer</Label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setMode("existing")}
            className="group flex items-start gap-3 rounded-md border border-border bg-card p-4 text-left transition-colors hover:border-[#cc0000] focus:border-[#cc0000] focus:outline-none focus:ring-2 focus:ring-[#cc0000]/30"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary text-foreground transition-colors group-hover:bg-[#cc0000] group-hover:text-white">
              <Users className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block [font-family:var(--font-heading)] uppercase tracking-wide">Existing customer</span>
              <span className="block text-xs text-muted-foreground">Search by name, phone, or address ({customers.length} on file)</span>
            </span>
            <ChevronsUpDown className="ml-auto mt-1 size-4 shrink-0 text-muted-foreground" />
          </button>
          <button
            type="button"
            onClick={() => setMode("new")}
            className="group flex items-start gap-3 rounded-md border border-border bg-card p-4 text-left transition-colors hover:border-[#cc0000] focus:border-[#cc0000] focus:outline-none focus:ring-2 focus:ring-[#cc0000]/30"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary text-foreground transition-colors group-hover:bg-[#cc0000] group-hover:text-white">
              <UserPlus className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block [font-family:var(--font-heading)] uppercase tracking-wide">New customer</span>
              <span className="block text-xs text-muted-foreground">Created with the order, not before</span>
            </span>
            <Plus className="ml-auto mt-1 size-4 shrink-0 text-muted-foreground" />
          </button>
        </div>
      </div>
    );
  }

  // ---- Existing customer search ----
  if (mode === "existing") {
    return (
      <div className="space-y-2 rounded-md border border-border bg-card p-3">
        <button type="button" onClick={reset} className="inline-flex items-center gap-1.5 rounded-md bg-[#cc0000]/10 px-2.5 py-1 text-sm font-medium text-[#cc0000] transition-colors hover:bg-[#cc0000]/20">
          <ArrowLeft className="size-4" /> Back
        </button>
        <Label className="block text-xs uppercase tracking-wide text-muted-foreground">Pick a customer</Label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input autoFocus placeholder="Search name, phone, email, address…" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
        </div>
        <div className="max-h-60 overflow-y-auto rounded-sm border border-border">
          {matches.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">
              No matches.{" "}
              <button type="button" className="text-[#cc0000] hover:underline" onClick={() => { setDraft((d) => ({ ...d, name: query })); setMode("new"); }}>
                Add &quot;{query}&quot; as new
              </button>
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {matches.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => pickExisting(c)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-secondary">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{c.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{c.phone || c.email} · {c.city || TYPE_LABEL[c.type]}</p>
                    </div>
                    <span className="shrink-0 text-xs uppercase tracking-wide text-muted-foreground">{TYPE_LABEL[c.type]}</span>
                    {value?.kind === "existing" && value.id === c.id && <Check className="size-4 text-[#cc0000]" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  // ---- Inline new-customer draft (deferred) ----
  return (
    <div className="space-y-3 rounded-md border border-border bg-card p-4">
      <button type="button" onClick={reset} className="inline-flex items-center gap-1.5 rounded-md bg-[#cc0000]/10 px-2.5 py-1 text-sm font-medium text-[#cc0000] transition-colors hover:bg-[#cc0000]/20">
        <ArrowLeft className="size-4" /> Back
      </button>
      <Label className="block text-xs uppercase tracking-wide text-muted-foreground">New customer</Label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Name</Label>
          <Input autoFocus value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Full name or business" />
        </div>
        <div className="space-y-1.5">
          <Label>Phone</Label>
          <PhoneInput value={draft.phone} onChange={(v) => setDraft({ ...draft, phone: v })} />
        </div>
        <div className="space-y-1.5">
          <Label>Email <span className="text-muted-foreground">(optional)</span></Label>
          <Input type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
        </div>
        {/* Labelled "Address" per the client; still stored in customers.city — the create_order /
            create_invoice RPCs only accept that field on an inline new customer. */}
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Address</Label>
          <Input value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })} placeholder="Delivery address" />
        </div>
        <div className="space-y-1.5">
          <Label>Type</Label>
          <Select value={draft.type} onValueChange={(v) => setDraft({ ...draft, type: v as NewCustomerDraft["type"] })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" onClick={reset}>Cancel</Button>
        <Button type="button" size="sm" className="bg-[#cc0000] text-white hover:bg-[#a30000]" onClick={useNew} disabled={!draft.name.trim()}>
          <Plus className="size-3.5" /> Add customer
        </Button>
      </div>
    </div>
  );
}
