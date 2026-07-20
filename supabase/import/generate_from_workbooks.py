#!/usr/bin/env python3
"""Generate one idempotent SQL transaction that loads the two 360 Performance
workbooks into the Supabase schema. Emits to stdout."""
import json, re, sys, datetime

ROOT = "/Users/m1pro16512/360-Performance"
ADMIN = "df7da8d2-4387-40dd-85a0-027f77976805"
TODAY = "2026-07-14"

def q(s):
    if s is None or s == "":
        return "null"
    return "'" + str(s).replace("'", "''") + "'"

def num(v):
    if v is None or v == "" or str(v).strip() in ("", "—", "-"):
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None

def n(v, default="null"):
    x = num(v)
    return default if x is None else repr(round(x, 2))

def i(v, default="null"):
    x = num(v)
    return default if x is None else str(int(round(x)))

out = []
W = out.append

# ---------------------------------------------------------------- load sheets
inv = json.load(open("/private/tmp/claude-501/-Users-m1pro16512-360-Performance/b1ea5acd-b467-45ca-aa9a-6b3b63f10451/scratchpad/inv.json"))
investor = json.load(open("/private/tmp/claude-501/-Users-m1pro16512-360-Performance/b1ea5acd-b467-45ca-aa9a-6b3b63f10451/scratchpad/investor.json"))

# ---------------------------------------------------------- category mapping
# Every product must land on a LEAF category (DB trigger enforces this).
CAT = {}
def cat_rules(name, group):
    s = name.lower()
    g = (group or "").lower()
    # --- exhaust / induction
    if "downpipe" in s: return "downpipes"
    if "frontpipe" in s: return "exhausts"
    if "intercooler" in s: return "intercooler-heat-exchangers"
    if "turbo manifold" in s or "exhaust manifold" in s: return "exhaust-manifold"
    if "intake manifold" in s: return "intake-manifolds"
    if s.endswith("intake") or " intake" in s: return "intakes"
    # --- fuel & plumbing
    if "afr gauge" in s or "gauge" in s: return "gauges"
    if "hose separator" in s: return "an-fittings"          # a clamp, not pipe
    if "hose (per meter)" in s or re.match(r"an ?\d+ hose", s): return "an-pipe"
    if s.startswith("an") and ("fitting" in s or "adaptor" in s or "orb" in s or "separator" in s or "bulkhead" in s):
        return "an-fittings"
    if "heat insulation sleeve" in s: return "an-fittings"
    if any(k in s for k in ("fuel pump", "fuel filter", "surge tank", "fuel cell", "fpr", "fuel rail",
                            "fuel pump bracket", "fueling")): return "fueling"
    # --- cooling
    if "radiator" in s: return "aluminum-radiators"
    if any(k in s for k in ("cooler", "overflow bottle", "catch can", "brushless fan", "fan ")): return "cooling-products"
    # --- lighting / electronics
    if "headlight" in s or "fog light" in s or "indicator" in s: return "headlights"
    if "taillight" in s: return "taillights"
    # --- braking & suspension
    if "calliper" in s or "caliper" in s: return "brake-pads"
    if any(k in s for k in ("bushing", "control arm", "tension rod", "angle kit", "axle spacer",
                            "z links", "camber bolt", "shock mount", "coilover", "trailing arm",
                            "drift angle")): return "suspension"
    # --- interior
    if "seat mount" in s or "bucket seat" in s or "seat harness" in s: return "seats"
    if "steering wheel" in s: return "carbon-steering-wheels"
    if any(k in s for k in ("boss kit", "quick release", "short shifter")): return "misc-interior"
    # --- exterior
    if "front grill" in s or "center cap" in s: return "misc-exterior"
    # --- fallback
    return "misc-performance"

# ------------------------------------------------------------------- parse A
def clean(v):
    return str(v).strip() if v is not None else ""

house = []   # internal costing rows
group = None
rows = inv["🔒 Internal Costing"]
for r in rows[2:]:
    name = clean(r[0])
    if not name or name.startswith("✎") or name.startswith("TOTALS"):
        continue
    if name.startswith("▸"):
        group = name.lstrip("▸ ").strip()
        continue
    if num(r[1]) is None:
        continue
    house.append(dict(
        name=name, group=group,
        qty=int(num(r[1])),
        unit=num(r[2]) or 0.0,
        ship=num(r[4]) or 0.0,
        pkg=num(r[6]) or 0.0,
        retail=num(r[9]), reseller=num(r[10]),
        sold=int(num(r[11]) or 0), pr=int(num(r[12]) or 0),
        # The "Item Paid?/Ship Paid?" checkboxes are aspirational (nearly all True), but the
        # amount columns are internally consistent: item cost - Item Paid Amt = 687,704, which
        # is exactly the sheet's own "Items NOT Yet Paid For". So trust the amounts, not the ticks.
        item_paid_amt=num(r[18]) or 0.0,
        ship_paid_amt=num(r[19]) or 0.0,
        vendor=clean(r[23]) or None,
        status=clean(r[24]) or None,
        cat=cat_rules(name, group),
    ))

# ------------------------------------------------------------------- parse B
inv_items = []
for r in investor["Inventory"][2:]:
    idx = clean(r[0])
    if not idx or idx == "TOTAL":
        continue
    inv_items.append(dict(
        code=idx, name=clean(r[1]), vendor=clean(r[2]), status=clean(r[3]),
        cost=num(r[4]) or 0.0, sell=num(r[5]), qty=int(num(r[6]) or 0),
        sold=int(num(r[8]) or 0),
        cat=cat_rules(clean(r[1]), "investor"),
    ))

# ------------------------------------------------------------------ suppliers
sup_names = sorted({h["vendor"] for h in house if h["vendor"]} |
                   {v["vendor"] for v in inv_items if v["vendor"]} |
                   {"Chongqing/Mars Liu", "Amanda Mang"})
SUP = {s: f"sup_{k}" for k, s in enumerate(sup_names)}

W("-- ===================================================================")
W("-- 360 Performance — import of the two source workbooks.")
W("--   A) 360_performance_inventory_v1.xlsx        (house inventory)")
W("--   B) 360 Performance - Investor Item Tracking.xlsx (investor deal)")
W("-- Costs are PKR; POs use frozen_rate_rmb_pkr = 1.0 so")
W("--   landed = unit_cost_rmb*rate + shipping + packaging  reproduces the sheet exactly.")
W("-- ===================================================================")
W("begin;")
W(f"set local request.jwt.claims = '{{\"sub\":\"{ADMIN}\",\"role\":\"authenticated\"}}';")
W("")
W("-- ---- 1. clear demo/seed transactional data (categories, users, settings kept)")
for t in ["stock_movements", "batches", "customer_deliveries", "corrections", "refunds",
          "payments", "invoice_items", "invoices", "order_stage_events", "order_items",
          "build_lines", "builds", "orders", "vendor_advance_entries", "investor_payouts",
          "purchase_order_lines", "purchase_orders", "pr_gifts", "planned_purchases",
          "cash_marketing", "expenses", "products", "investor_deals", "investors",
          "customers", "suppliers", "audit_log", "sku_sequences"]:
    W(f"delete from {t};")
W("")

W("-- ---- 2. suppliers (Chinese vendors; a trigger auto-creates each one's vendor_account)")
W("insert into suppliers (name, country, currency, active) values")
W(",\n".join(f"  ({q(s)}, 'China', 'CNY', true)" for s in sup_names) + ";")
W("-- some costing rows name no vendor; park their POs on a placeholder so supplier_id stays NOT NULL")
W("insert into suppliers (name, country, currency, active, notes) values")
W("  ('Unassigned Vendor', null, 'CNY', true, 'Placeholder — the source sheet left the vendor blank on these rows.');")
W("")
# resolve supplier ids by name at use-time via subselect helper
def sup_id(name):
    return f"(select id from suppliers where name = {q(name)} limit 1)"

W("-- ---- 3. investor + deal (Farhan, 50/50 profit split)")
W("insert into investors (name, notes, active) values")
W("  ('Farhan', 'Investor — 50/50 profit split. Source: Investor Item Tracking workbook.', true);")
W("insert into investor_deals (investor_id, split_pct, label, active)")
W("  select id, 0.5000, 'Batch 1 — BMW/JZX parts (50/50)', true from investors where name='Farhan';")
DEAL = "(select d.id from investor_deals d join investors i on i.id=d.investor_id where i.name='Farhan' limit 1)"
W("")

W("-- ---- 4. products")
W("--   house = the internal-costing sheet; investor = the investor workbook.")
def prod_insert(name, cat, retail, reseller, owner):
    # publish guards: a published product needs a price + slug (slug is auto-assigned).
    # Unpriced rows (consumables like the logo-printing fee) stay unpublished.
    published = "true" if retail else "false"
    res = n(reseller) if (retail and reseller and reseller <= retail) else "null"
    deal = DEAL if owner == "investor" else "null"
    return (f"insert into products (name, category_id, price_pkr, reseller_price_pkr, published, "
            f"made_to_order, low_stock_threshold, status, owner_kind, investor_deal_id) values ("
            f"{q(name)}, (select id from categories where slug={q(cat)}), {n(retail)}, {res}, {published}, "
            f"false, 3, 'active', '{owner}', {deal});")

for h in house:
    W(prod_insert(h["name"], h["cat"], h["retail"], h["reseller"], "house"))
for v in inv_items:
    W(prod_insert(v["name"], v["cat"], v["sell"], None, "investor"))
W("")

def prod_id(name):
    return f"(select id from products where name = {q(name)} limit 1)"

# --------------------------------------------------------------- POs (house)
W("-- ---- 5. purchase orders + lines (one PO per vendor per source sheet)")
W("--   unit_cost_rmb carries the sheet's PKR unit cost; frozen rate 1.0 (sheets hold no RMB).")

STATUS_MAP = {"Forwarder→PAK": "in_transit", "In Production": "in_production", "": "ordered", None: "ordered"}

# group house rows by (vendor, status)
from collections import OrderedDict
hgroups = OrderedDict()
for h in house:
    key = (h["vendor"], h["status"])
    hgroups.setdefault(key, []).append(h)

po_seq = 0
po_refs = []   # (po_var, rows, receive?)
for (vendor, status), items in hgroups.items():
    po_seq += 1
    tag = f"HOUSE-{po_seq:02d}"
    vend_sql = sup_id(vendor) if vendor else "null"
    if not vendor:
        # supplier_id is NOT NULL -> park unassigned items on a placeholder vendor
        vend_sql = sup_id("Unassigned Vendor")
    note = f"Imported from inventory workbook · {vendor or 'vendor TBD'} · sheet status: {status or 'n/a'}"
    W(f"insert into purchase_orders (po_no, supplier_id, status, frozen_rate_rmb_pkr, ordered_on, notes) values "
      f"({q(tag)}, {vend_sql}, 'ordered', 1.0, date '{TODAY}', {q(note)});")
    for h in items:
        W(f"insert into purchase_order_lines (purchase_order_id, product_id, qty_ordered, unit_cost_rmb, "
          f"shipping_per_unit_pkr, packaging_per_unit_pkr) values "
          f"((select id from purchase_orders where po_no={q(tag)}), {prod_id(h['name'])}, {h['qty']}, "
          f"{h['unit']}, {h['ship']}, {h['pkg']});")
    po_refs.append((tag, items, True, status))
W("")

# investor POs — honour the sheet's explicit Received / China to Pak
igroups = OrderedDict()
for v in inv_items:
    igroups.setdefault((v["vendor"], v["status"]), []).append(v)

ipo_seq = 0
ipo_refs = []
for (vendor, status), items in igroups.items():
    ipo_seq += 1
    tag = f"INV-{ipo_seq:02d}"
    recv = status == "Received"
    note = f"Investor batch 1 (Farhan) · {vendor} · sheet status: {status}"
    W(f"insert into purchase_orders (po_no, supplier_id, status, frozen_rate_rmb_pkr, ordered_on, notes) values "
      f"({q(tag)}, {sup_id(vendor)}, 'ordered', 1.0, date '{TODAY}', {q(note)});")
    for v in items:
        W(f"insert into purchase_order_lines (purchase_order_id, product_id, qty_ordered, unit_cost_rmb, "
          f"shipping_per_unit_pkr, packaging_per_unit_pkr) values "
          f"((select id from purchase_orders where po_no={q(tag)}), {prod_id(v['name'])}, {v['qty']}, "
          f"{v['cost']}, 0, 0);")
    ipo_refs.append((tag, items, recv, status))
W("")

# ------------------------------------------------------------------ receive
W("-- ---- 6. receive stock (RPC: creates the batch + 'receive' movement at landed cost)")
W("--   house: all lines received (goods owned; see import notes)")
W("--   investor: only rows the sheet marks 'Received'; 'China to Pak' stays in transit")
for tag, items, recv, status in po_refs:
    for h in items:
        W(f"select receive_po_line((select l.id from purchase_order_lines l join purchase_orders p on p.id=l.purchase_order_id "
          f"where p.po_no={q(tag)} and l.product_id={prod_id(h['name'])} limit 1), {h['qty']}, date '{TODAY}');")
for tag, items, recv, status in ipo_refs:
    if not recv:
        continue
    for v in items:
        W(f"select receive_po_line((select l.id from purchase_order_lines l join purchase_orders p on p.id=l.purchase_order_id "
          f"where p.po_no={q(tag)} and l.product_id={prod_id(v['name'])} limit 1), {v['qty']}, date '{TODAY}');")
W("")

# restore the logistics status the sheet reported (receive_po_line flips POs to 'received')
W("-- keep the sheet's logistics status visible on the PO (receiving flips it to 'received')")
for tag, items, recv, status in po_refs:
    st = STATUS_MAP.get(status, "ordered")
    if st != "ordered":
        W(f"update purchase_orders set notes = notes || ' · logistics: {st}' where po_no={q(tag)};")
for tag, items, recv, status in ipo_refs:
    if not recv:
        W(f"update purchase_orders set status='in_transit' where po_no={q(tag)};")
W("")

# ----------------------------------------------------------------- payments
W("-- ---- 7. settle PO lines with the amounts ACTUALLY paid per the sheet's amount columns.")
W("--   This leaves PKR 687,704 of item cost still owed (Haofa 387,384 / Eva Wu 167,030 /")
W("--   Heya Miao 88,000 / unnamed 45,290) — matching the sheet's 'Items NOT Yet Paid For'.")
for tag, items, recv, status in po_refs:
    for h in items:
        line = (f"(select l.id from purchase_order_lines l join purchase_orders p on p.id=l.purchase_order_id "
                f"where p.po_no={q(tag)} and l.product_id={prod_id(h['name'])} limit 1)")
        if h["item_paid_amt"] > 0:
            W(f"select record_po_payment({line}, 'item', {round(h['item_paid_amt'],2)}, false, date '{TODAY}');")
        if h["ship_paid_amt"] > 0 and h["ship"] > 0:
            W(f"select record_po_payment({line}, 'ship', {round(h['ship_paid_amt'],2)}, false, date '{TODAY}');")
# investor items: the workbook shows them as bought & paid
for tag, items, recv, status in ipo_refs:
    for v in items:
        line = (f"(select l.id from purchase_order_lines l join purchase_orders p on p.id=l.purchase_order_id "
                f"where p.po_no={q(tag)} and l.product_id={prod_id(v['name'])} limit 1)")
        if v["cost"] > 0:
            W(f"select record_po_payment({line}, 'item', {round(v['qty']*v['cost'],2)}, false, date '{TODAY}');")
W("")

# -------------------------------------------------------- investor sales
W("-- ---- 8. investor sales already made (11 units, PKR 559,700) -> orders + invoices + stock draw")
W("--   the workbook records no buyer names, so the 11 units are booked to one placeholder customer")
W("insert into customers (name, type) values ('Legacy Sales (pre-dashboard)', 'retail');")
CUST = "(select id from customers where name='Legacy Sales (pre-dashboard)' limit 1)"

sold = [v for v in inv_items if v["sold"] > 0]
for v in sold:
    W(f"-- {v['name']}: {v['sold']} @ {v['sell']:,.0f}")
    W(f"select create_order({CUST}, null, jsonb_build_array(jsonb_build_object("
      f"'product_id', {prod_id(v['name'])}, 'qty', {v['sold']}, 'price_pkr', {v['sell']})), "
      f"{q('Legacy sale imported from the Investor Item Tracking workbook.')});")
W("")
W("-- draw the stock for every order line: creates the 'sale' movements that carry the")
W("-- investor/COGS snapshot, which is what investor accrual and the P&L read.")
W("""do $$
declare r record; begin
  for r in select id, qty from order_items loop
    perform fulfil_order_line(r.id, r.qty);
  end loop;
end $$;""")
W("")
W("-- invoice + settle each order so the revenue lands in the P&L, then mark delivered")
W("""do $$
declare o record; v_inv invoices; v_items jsonb; begin
  for o in select id, customer_id from orders loop
    select jsonb_agg(jsonb_build_object('product_id', product_id, 'qty', qty))
      into v_items from order_items where order_id = o.id;
    v_inv := create_invoice(o.customer_id, null, o.id, v_items, current_date);
    insert into payments (invoice_id, amount_pkr, method, kind, paid_on)
      values (v_inv.id, v_inv.total_pkr, 'cash', 'payment', current_date);
  end loop;
end $$;""")
W("update orders set stage = 'delivered';")
W("")

# ------------------------------------------------------------------- PR log
W("-- ---- 9. PR gift log (draws house stock FIFO at landed cost)")
for r in inv["🎁 PR Log"][3:]:
    nm = clean(r[1])
    if not nm or nm.startswith("TOTAL"):
        continue
    qty = int(num(r[2]) or 0)
    if qty <= 0:
        continue
    W(f"select gift_pr({prod_id(nm)}, {qty}, {q(clean(r[5]))}, {q(clean(r[6]))}, {q(clean(r[7]))}, "
      f"null, 'sent', {q(clean(r[11]) or None)}, date '{TODAY}');")
W("")

# ------------------------------------------------------------- expenses etc.
W("-- ---- 10. operations costs (expenses table is CHECK-restricted to opex categories)")
OPEX = {"Setup": "operations", "Staffing": "salaries", "Equipment": "operations"}
exp_rows = inv["💳 Expenses"]
for r in exp_rows[3:]:
    amt = num(r[5])
    cat = clean(r[6])
    if amt is None or not cat or clean(r[4]).startswith("TOTAL"):
        continue
    W(f"insert into expenses (category, amount_pkr, spent_on, note) values "
      f"('{OPEX.get(cat,'other')}', {amt}, date '{TODAY}', {q(cat + ' — ' + clean(r[7]))});")
W("")

W("-- ---- 11. cash marketing (sponsorships / promos — no inventory involved)")
for r in exp_rows[3:]:
    amt = num(r[14])
    kind = clean(r[15])
    if amt is None or not kind:
        continue
    k = {"Sponsorship": "sponsorship", "Paid Promotion": "paid_promo", "Discount": "discount"}.get(kind, "other")
    W(f"insert into cash_marketing (kind, amount_pkr, recipient, note, spent_on) values "
      f"('{k}', {amt}, {q(clean(r[16]))}, {q(clean(r[17]) or None)}, date '{TODAY}');")
W("")

W("-- ---- 12. vendor advances (money paid ahead of a purchase order)")
W("--   no vendor named in the sheet -> booked against the generic 'Payment Vendor' account")
PV = "(select id from vendor_accounts where role='payment' and supplier_id is null limit 1)"
for r in exp_rows[3:]:
    amt = num(r[10])
    desc = clean(r[11])
    if amt is None or not desc or desc.startswith("TOTAL"):
        continue
    W(f"insert into vendor_advance_entries (vendor_account_id, kind, amount_pkr, occurred_on, note) values "
      f"({PV}, 'topup', {amt}, date '{TODAY}', {q(desc)});")
W("")

# ------------------------------------------------------------ future orders
W("-- ---- 13. future orders -> planned_purchases (procurement pipeline)")
PLAN_STATUS = {"Pending": "researching", "Quoted": "quoted", "Researching": "researching"}
PRIO = {"High": "high", "Medium": "medium", "Low": "low"}
grp = None
for r in inv["🔮 Future Orders"][2:]:
    nm = clean(r[0])
    if not nm:
        continue
    if nm.startswith("▸"):
        grp = nm.lstrip("▸ ").strip()
        continue
    vend = clean(r[6])
    vend_sql = sup_id(vend) if vend and vend != "-" else "null"
    W(f"insert into planned_purchases (item_name, supplier_id, planned_qty, est_unit_cost_pkr, "
      f"target_retail_pkr, priority, status, notes) values ("
      f"{q(nm)}, {vend_sql}, {i(r[1])}, {n(r[2])}, {n(r[4])}, "
      f"'{PRIO.get(clean(r[8]),'medium')}', '{PLAN_STATUS.get(clean(r[7]),'researching')}', "
      f"{q((grp + ' · ' if grp else '') + clean(r[9]))});")
W("")
W("commit;")

print("\n".join(out))
