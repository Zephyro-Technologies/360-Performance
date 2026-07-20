// Full-page order detail (/orders/:id) — the same content as the board drawer, rendered as a page.
import { useParams, Link } from "react-router";
import { ArrowLeft } from "lucide-react";
import { useOrders } from "../data/orders";
import { OrderDetailContent } from "../components/orders/OrderDetail";

export function OrderDetailPage() {
  const { id } = useParams();
  const ordersQ = useOrders();
  const order = ordersQ.data?.find((o) => o.id === id) ?? null;

  const back = (
    <Link to="/orders" className="inline-flex items-center gap-1.5 rounded-md bg-[#cc0000]/10 px-2.5 py-1 text-sm font-medium text-[#cc0000] transition-colors hover:bg-[#cc0000]/20">
      <ArrowLeft className="size-4" /> Order Pipeline
    </Link>
  );

  if (ordersQ.isLoading) return <div className="space-y-4">{back}<p className="p-6 text-center text-muted-foreground">Loading…</p></div>;
  if (!order) return <div className="space-y-4">{back}<p className="p-6 text-center text-[#cc0000]">Order not found.</p></div>;

  return (
    <div className="space-y-4">
      {back}
      <OrderDetailContent order={order} variant="page" />
    </div>
  );
}
