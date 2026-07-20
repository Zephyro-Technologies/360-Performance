// 360 Performance — domain types shared across all dashboard modules.

export type Role = "Admin" | "Staff" | "Viewer";

export type ProductCategory =
  | "Exhaust"
  | "OEM/OEM+"
  | "Cooling"
  | "Fueling"
  | "Suspension"
  | "Turbo"
  | "Miscellaneous";

export const PRODUCT_CATEGORIES: ProductCategory[] = [
  "Exhaust",
  "OEM/OEM+",
  "Cooling",
  "Fueling",
  "Suspension",
  "Turbo",
  "Miscellaneous",
];

export type Visibility = "Visible" | "Hidden" | "Archived";
export type StockStatus = "Available" | "Limited" | "Out of Stock";

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: ProductCategory;
  price: number; // PKR
  cost: number; // PKR
  image: string;
  specs: string;
  compatibility: string;
  relatedIds: string[];
  visibility: Visibility;
  stock: StockStatus;
  supplierId: string;
}

export type CustomerType = "Retail" | "Trade" | "Workshop";

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  type: CustomerType;
  since: string;
}

export type Currency = "PKR" | "USD" | "CNY" | "EUR" | "AED";

export const CURRENCIES: Currency[] = ["PKR", "USD", "CNY", "EUR", "AED"];

export const CURRENCY_LABEL: Record<Currency, string> = {
  PKR: "Pakistani Rupee",
  USD: "US Dollar",
  CNY: "RMB", // the client uses "RMB"; "CNY" survives only as the currency code
  EUR: "Euro",
  AED: "UAE Dirham",
};

// Human-facing currency token. The client never sees the ISO code "CNY" — it renders as
// "RMB"; "CNY" survives only as the DB/currency code. Accepts any code string (e.g.
// supplier currencies also include JPY/GBP).
export function displayCurrency(code: string): string {
  return code === "CNY" ? "RMB" : code;
}

export interface Supplier {
  id: string;
  name: string;
  contact: string;
  phone: string;
  country: string;
  productIds: string[];
  currency: Currency;
}

export type PipelineStage =
  | "Received"
  | "Processing"
  | "Sourcing"
  | "Ready to Ship"
  | "Shipped"
  | "Delivered"
  | "Cancelled";

export const PIPELINE_STAGES: PipelineStage[] = [
  "Received",
  "Processing",
  "Sourcing",
  "Ready to Ship",
  "Shipped",
  "Delivered",
  "Cancelled",
];

export interface LineItem {
  productId: string;
  name: string;
  qty: number;
  price: number;
}

export interface StageEvent {
  stage: PipelineStage;
  at: string; // ISO timestamp
  by: string;
}

export interface Order {
  id: string;
  orderNo: string;
  customerId: string;
  items: LineItem[];
  stage: PipelineStage;
  total: number;
  createdAt: string;
  notes: string;
  invoiceId?: string;
  history: StageEvent[];
}

export type InvoiceStatus = "Paid" | "Partial" | "Unpaid" | "Overdue";
export type PaymentMethod = "Bank Transfer" | "Cash" | "Card" | "Easypaisa";

export interface Payment {
  id: string;
  amount: number;
  method: PaymentMethod;
  date: string;
}

export interface Invoice {
  id: string;
  invoiceNo: string;
  customerId: string;
  items: LineItem[];
  subtotal: number;
  tax: number;
  total: number;
  date: string;
  dueDate: string;
  payments: Payment[];
  orderId?: string;
}

export type ExpenseCategory =
  | "Inventory"
  | "Shipping"
  | "Marketing"
  | "Operations"
  | "Salaries";

export interface Expense {
  id: string;
  category: ExpenseCategory;
  supplierId?: string;
  orderId?: string;
  amount: number;
  date: string;
  note: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
}

export interface AuditEntry {
  id: string;
  user: string;
  action: string;
  entity: string;
  detail: string;
  at: string;
}
