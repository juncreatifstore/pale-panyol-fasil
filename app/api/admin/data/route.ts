import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const displayStatuses: Record<string, string> = { paid: "Payée", preparing: "Préparation", shipped: "Expédiée", delivered: "Livrée" };
const databaseStatuses: Record<string, string> = { "Payée": "paid", "Préparation": "preparing", "Expédiée": "shipped", "Livrée": "delivered" };

async function authorizedClient() {
  const supabase = await createSupabaseServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return null;
  const { data: admin } = await supabase.from("admin_users").select("user_id").eq("user_id", claims.claims.sub).eq("is_active", true).maybeSingle();
  return admin ? supabase : null;
}

export async function GET() {
  const supabase = await authorizedClient();
  if (!supabase) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const [ordersResult, inventoryResult, budgetResult] = await Promise.all([
    supabase.from("orders").select("id,order_number,status,total_mxn,created_at,customers(full_name,city)").order("created_at", { ascending: false }).limit(100),
    supabase.from("inventory_locations").select("quantity_on_hand"),
    supabase.from("marketing_budgets").select("total_budget_mxn").order("month", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (ordersResult.error || inventoryResult.error || budgetResult.error) return NextResponse.json({ error: "Lecture Supabase impossible" }, { status: 500 });

  const orders = (ordersResult.data ?? []).map((order) => {
    const customer = Array.isArray(order.customers) ? order.customers[0] : order.customers;
    return {
      id: order.order_number,
      databaseId: order.id,
      client: customer?.full_name ?? "Client",
      city: customer?.city ?? "—",
      total: Number(order.total_mxn),
      status: displayStatuses[order.status] ?? "Préparation",
      date: new Intl.DateTimeFormat("fr-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date(order.created_at)),
    };
  });
  const stock = (inventoryResult.data ?? []).reduce((sum, item) => sum + item.quantity_on_hand, 0);
  return NextResponse.json({ orders, stock, marketingBudget: Number(budgetResult.data?.total_budget_mxn ?? 0) });
}

export async function PATCH(request: Request) {
  const supabase = await authorizedClient();
  if (!supabase) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const body = await request.json() as { action?: string; id?: string; status?: string; delta?: number; amount?: number };

  if (body.action === "order_status" && body.id && body.status && databaseStatuses[body.status]) {
    const { error } = await supabase.from("orders").update({ status: databaseStatuses[body.status], updated_at: new Date().toISOString() }).eq("order_number", body.id);
    return error ? NextResponse.json({ error: error.message }, { status: 400 }) : NextResponse.json({ success: true });
  }
  if (body.action === "stock" && Number.isInteger(body.delta)) {
    const { data: location, error: readError } = await supabase.from("inventory_locations").select("id,quantity_on_hand").eq("code", "CDMX").single();
    if (readError) return NextResponse.json({ error: readError.message }, { status: 400 });
    const quantity = Math.max(0, location.quantity_on_hand + Number(body.delta));
    const { error } = await supabase.from("inventory_locations").update({ quantity_on_hand: quantity, updated_at: new Date().toISOString() }).eq("id", location.id);
    if (!error) await supabase.from("inventory_movements").insert({ location_id: location.id, movement_type: "adjustment", quantity: Number(body.delta), note: "Ajustement depuis le tableau de bord" });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    const { data: all } = await supabase.from("inventory_locations").select("quantity_on_hand");
    return NextResponse.json({ stock: (all ?? []).reduce((sum, item) => sum + item.quantity_on_hand, 0) });
  }
  if (body.action === "marketing_budget" && typeof body.amount === "number" && body.amount >= 0) {
    const month = new Date().toISOString().slice(0, 7) + "-01";
    const { error } = await supabase.from("marketing_budgets").upsert({ month, total_budget_mxn: body.amount, updated_at: new Date().toISOString() }, { onConflict: "month" });
    return error ? NextResponse.json({ error: error.message }, { status: 400 }) : NextResponse.json({ success: true });
  }
  return NextResponse.json({ error: "Action invalide" }, { status: 400 });
}
