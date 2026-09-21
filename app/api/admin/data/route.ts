import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const orderLabels: Record<string, string> = { pending: "En attente", payment_pending: "Paiement en attente", paid: "Payée", preparing: "Préparation", shipped: "Expédiée", delivered: "Livrée", cancelled: "Annulée", refunded: "Remboursée" };
const orderStatuses = new Set(Object.keys(orderLabels));
const shipmentStatuses = new Set(["pending", "label_created", "picked_up", "in_transit", "out_for_delivery", "delivered", "exception", "cancelled"]);
const productionStatuses = new Set(["planned", "approved", "printing", "received", "cancelled"]);
const campaignStatuses = new Set(["draft", "active", "paused", "completed"]);
const paymentStatuses = new Set(["pending", "approved", "rejected", "refunded", "partially_refunded"]);
const paymentProviders = new Set(["mercado_pago", "stripe", "cash", "transfer", "other"]);
const integrationProviders = new Set(["mercado_pago", "stripe", "whatsapp", "openai", "claude", "shipping"]);
type Json = Record<string, unknown>;

async function authorizedClient() {
  const supabase = await createSupabaseServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return null;
  const { data: admin } = await supabase.from("admin_users").select("user_id").eq("user_id", userId).eq("is_active", true).maybeSingle();
  return admin ? { supabase, userId } : null;
}

const apiError = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
const clean = (value: unknown, max = 300) => typeof value === "string" ? value.trim().slice(0, max) : "";
const numeric = (value: unknown, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export async function GET() {
  const auth = await authorizedClient();
  if (!auth) return apiError("Non autorisé", 401);
  const { supabase } = auth;
  const results = await Promise.all([
    supabase.from("orders").select("*,customers(*)").order("created_at", { ascending: false }).limit(200),
    supabase.from("customers").select("*").order("created_at", { ascending: false }).limit(200),
    supabase.from("inventory_locations").select("*").order("code"),
    supabase.from("inventory_movements").select("*,inventory_locations(code,name)").order("created_at", { ascending: false }).limit(100),
    supabase.from("production_batches").select("*").order("created_at", { ascending: false }).limit(50),
    supabase.from("payments").select("*,orders(order_number)").order("created_at", { ascending: false }).limit(200),
    supabase.from("shipments").select("*,orders(order_number,customers(full_name,city,state))").order("updated_at", { ascending: false }).limit(200),
    supabase.from("marketing_budgets").select("*").order("month", { ascending: false }).limit(12),
    supabase.from("marketing_campaigns").select("*").order("updated_at", { ascending: false }).limit(100),
    supabase.from("integration_settings").select("*").order("provider"),
    supabase.from("integration_secret_status").select("provider,secret_key,configured_at").order("provider"),
    supabase.from("sales_settings").select("*").eq("id", true).single(),
  ]);
  const failed = results.find((result) => result.error);
  if (failed?.error) return apiError(failed.error.message, 500);
  const [orders, customers, locations, movements, batches, payments, shipments, budgets, campaigns, integrations, secretStatuses, salesSettings] = results;
  return NextResponse.json({
    orders: (orders.data ?? []).map((order) => ({ ...order, status_label: orderLabels[order.status] ?? order.status })),
    customers: customers.data ?? [], locations: locations.data ?? [], movements: movements.data ?? [], batches: batches.data ?? [], payments: payments.data ?? [], shipments: shipments.data ?? [], budgets: budgets.data ?? [], campaigns: campaigns.data ?? [], integrations: integrations.data ?? [], secretStatuses: secretStatuses.data ?? [], salesSettings: salesSettings.data ?? null,
  });
}

export async function POST(request: Request) {
  const auth = await authorizedClient();
  if (!auth) return apiError("Non autorisé", 401);
  const { supabase } = auth;
  const body = await request.json() as Json;
  const action = clean(body.action, 40);

  if (action === "create_order") {
    const fullName = clean(body.fullName, 120);
    const quantity = Math.trunc(numeric(body.quantity, 1));
    const fulfillment = clean(body.fulfillment, 30);
    if (!fullName || quantity < 1 || !["pickup_cdmx", "pickup_tapachula", "shipping"].includes(fulfillment)) return apiError("Informations de commande invalides");
    const { data: customer, error: customerError } = await supabase.from("customers").insert({ full_name: fullName, phone: clean(body.phone, 40) || null, email: clean(body.email, 160) || null, whatsapp_phone: clean(body.whatsapp, 40) || null, street_address: clean(body.address, 250) || null, city: clean(body.city, 100) || null, state: clean(body.state, 100) || null, postal_code: clean(body.postalCode, 20) || null, notes: clean(body.notes, 500) || null }).select("id").single();
    if (customerError) return apiError(customerError.message);
    const orderNumber = `PPF-${new Date().toISOString().slice(2, 10).replaceAll("-", "")}-${crypto.randomUUID().slice(0, 5).toUpperCase()}`;
    const initialStatus = orderStatuses.has(clean(body.status, 30)) ? clean(body.status, 30) : "payment_pending";
    const { data: order, error } = await supabase.from("orders").insert({ order_number: orderNumber, customer_id: customer.id, status: initialStatus, fulfillment_type: fulfillment, quantity, unit_price_mxn: Math.max(0, numeric(body.unitPrice, 625)), shipping_price_mxn: Math.max(0, numeric(body.shippingPrice)), payment_provider: clean(body.paymentProvider, 40) || null, notes: clean(body.notes, 500) || null }).select("id,order_number").single();
    if (error) { await supabase.from("customers").delete().eq("id", customer.id); return apiError(error.message); }
    return NextResponse.json({ success: true, order }, { status: 201 });
  }

  if (action === "payment") {
    const orderId = clean(body.orderId, 50), provider = clean(body.provider, 30), status = clean(body.status, 30);
    if (!orderId || !paymentProviders.has(provider) || !paymentStatuses.has(status)) return apiError("Paiement invalide");
    const reference = clean(body.reference, 150) || null;
    const { data, error } = await supabase.from("payments").insert({ order_id: orderId, provider, provider_payment_id: reference, status, amount_mxn: Math.max(0, numeric(body.amount)), fee_mxn: Math.max(0, numeric(body.fee)), paid_at: status === "approved" ? new Date().toISOString() : null }).select().single();
    if (error) return apiError(error.message);
    if (status === "approved") await supabase.from("orders").update({ status: "paid", payment_provider: provider, payment_reference: reference, paid_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", orderId);
    return NextResponse.json({ success: true, payment: data }, { status: 201 });
  }

  if (action === "shipment") {
    const orderId = clean(body.orderId, 50), status = clean(body.status, 30) || "pending";
    if (!orderId || !shipmentStatuses.has(status)) return apiError("Expédition invalide");
    const now = new Date().toISOString();
    const { data, error } = await supabase.from("shipments").upsert({ order_id: orderId, provider: clean(body.provider, 80) || null, provider_shipment_id: clean(body.providerShipmentId, 150) || null, tracking_number: clean(body.trackingNumber, 150) || null, label_url: clean(body.labelUrl, 500) || null, status, estimated_delivery: clean(body.estimatedDelivery, 20) || null, last_event: clean(body.lastEvent, 250) || null, shipped_at: ["picked_up", "in_transit", "out_for_delivery", "delivered"].includes(status) ? now : null, delivered_at: status === "delivered" ? now : null, updated_at: now }, { onConflict: "order_id" }).select().single();
    if (error) return apiError(error.message);
    if (["picked_up", "in_transit", "out_for_delivery"].includes(status)) await supabase.from("orders").update({ status: "shipped", updated_at: now }).eq("id", orderId);
    if (status === "delivered") await supabase.from("orders").update({ status: "delivered", updated_at: now }).eq("id", orderId);
    return NextResponse.json({ success: true, shipment: data }, { status: 201 });
  }

  if (action === "production") {
    const batchNumber = clean(body.batchNumber, 80), planned = Math.trunc(numeric(body.plannedQuantity));
    if (!batchNumber || planned < 1) return apiError("Lot de production invalide");
    const { data, error } = await supabase.from("production_batches").insert({ batch_number: batchNumber, planned_quantity: planned, completed_quantity: Math.max(0, Math.trunc(numeric(body.completedQuantity))), unit_cost_mxn: Math.max(0, numeric(body.unitCost)) || null, status: productionStatuses.has(clean(body.status, 30)) ? clean(body.status, 30) : "planned", expected_at: clean(body.expectedAt, 20) || null, supplier: clean(body.supplier, 160) || null, notes: clean(body.notes, 500) || null }).select().single();
    return error ? apiError(error.message) : NextResponse.json({ success: true, batch: data }, { status: 201 });
  }

  if (action === "campaign") {
    const name = clean(body.name, 160);
    if (!name) return apiError("Nom de campagne requis");
    const { data, error } = await supabase.from("marketing_campaigns").insert({ name, channel: clean(body.channel, 80) || "Autre", status: campaignStatuses.has(clean(body.status, 30)) ? clean(body.status, 30) : "draft", budget_mxn: Math.max(0, numeric(body.budget)), spent_mxn: Math.max(0, numeric(body.spent)), reach: Math.max(0, Math.trunc(numeric(body.reach))), clicks: Math.max(0, Math.trunc(numeric(body.clicks))), conversions: Math.max(0, Math.trunc(numeric(body.conversions))), starts_at: clean(body.startsAt, 20) || null, ends_at: clean(body.endsAt, 20) || null }).select().single();
    return error ? apiError(error.message) : NextResponse.json({ success: true, campaign: data }, { status: 201 });
  }
  return apiError("Action invalide");
}

export async function PATCH(request: Request) {
  const auth = await authorizedClient();
  if (!auth) return apiError("Non autorisé", 401);
  const { supabase, userId } = auth;
  const body = await request.json() as Json;
  const action = clean(body.action, 40);

  if (action === "order_status") {
    const id = clean(body.id, 50), status = clean(body.status, 30);
    if (!id || !orderStatuses.has(status)) return apiError("Statut invalide");
    const { error } = await supabase.from("orders").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
    return error ? apiError(error.message) : NextResponse.json({ success: true });
  }
  if (action === "stock") {
    const locationId = clean(body.locationId, 50), delta = Math.trunc(numeric(body.delta));
    if (!locationId || !delta) return apiError("Ajustement invalide");
    const { data: location, error: readError } = await supabase.from("inventory_locations").select("id,quantity_on_hand").eq("id", locationId).single();
    if (readError) return apiError(readError.message);
    const quantity = location.quantity_on_hand + delta;
    if (quantity < 0) return apiError("Le stock ne peut pas être négatif");
    const { data: updated, error } = await supabase.from("inventory_locations").update({ quantity_on_hand: quantity, updated_at: new Date().toISOString() }).eq("id", locationId).eq("quantity_on_hand", location.quantity_on_hand).select("id").maybeSingle();
    if (error || !updated) return apiError(error?.message ?? "Le stock a changé, réessayez");
    await supabase.from("inventory_movements").insert({ location_id: locationId, movement_type: "adjustment", quantity: delta, note: clean(body.note, 250) || "Ajustement depuis l’administration", created_by: userId });
    return NextResponse.json({ success: true });
  }
  if (action === "production") {
    const id = clean(body.id, 50), status = clean(body.status, 30);
    if (!id || !productionStatuses.has(status)) return apiError("Production invalide");
    const { error } = await supabase.from("production_batches").update({ status, completed_quantity: Math.max(0, Math.trunc(numeric(body.completedQuantity))), updated_at: new Date().toISOString() }).eq("id", id);
    return error ? apiError(error.message) : NextResponse.json({ success: true });
  }
  if (action === "marketing_budget") {
    const month = clean(body.month, 20) || `${new Date().toISOString().slice(0, 7)}-01`;
    const { error } = await supabase.from("marketing_budgets").upsert({ month, total_budget_mxn: Math.max(0, numeric(body.amount)), spent_mxn: Math.max(0, numeric(body.spent)), notes: clean(body.notes, 500) || null, updated_at: new Date().toISOString() }, { onConflict: "month" });
    return error ? apiError(error.message) : NextResponse.json({ success: true });
  }
  if (action === "campaign") {
    const id = clean(body.id, 50), status = clean(body.status, 30);
    if (!id || !campaignStatuses.has(status)) return apiError("Campagne invalide");
    const { error } = await supabase.from("marketing_campaigns").update({ status, spent_mxn: Math.max(0, numeric(body.spent)), reach: Math.max(0, Math.trunc(numeric(body.reach))), clicks: Math.max(0, Math.trunc(numeric(body.clicks))), conversions: Math.max(0, Math.trunc(numeric(body.conversions))), updated_at: new Date().toISOString() }).eq("id", id);
    return error ? apiError(error.message) : NextResponse.json({ success: true });
  }
  if (action === "integration") {
    const provider = clean(body.provider, 40), environment = clean(body.environment, 20);
    if (!integrationProviders.has(provider) || !["sandbox", "production"].includes(environment)) return apiError("Intégration invalide");
    const { error } = await supabase.from("integration_settings").update({ enabled: Boolean(body.enabled), environment, public_identifier: clean(body.publicIdentifier, 250) || null, webhook_configured: Boolean(body.webhookConfigured), updated_by: userId, updated_at: new Date().toISOString() }).eq("provider", provider);
    return error ? apiError(error.message) : NextResponse.json({ success: true });
  }
  if (action === "sales_settings") {
    const lines = (value: unknown) => clean(value, 10000).split("\n").map((line) => line.trim()).filter(Boolean);
    const price = numeric(body.bookPrice, 625), pages = Math.trunc(numeric(body.bookPages, 278));
    if (price < 0 || pages < 1) return apiError("Paramètres du livre invalides");
    const { error } = await supabase.from("sales_settings").update({
      book_price_mxn: price,
      book_pages: pages,
      book_chapters: clean(body.bookChapters, 3000) || null,
      summary_pdf_url: clean(body.summaryPdfUrl, 1000) || null,
      photo_urls: lines(body.photoUrls),
      book_benefits: lines(body.bookBenefits),
      testimonials: lines(body.testimonials),
      tapachula_delivery: clean(body.tapachulaDelivery, 1000),
      cdmx_delivery: clean(body.cdmxDelivery, 1000),
      other_zones_delivery: clean(body.otherZonesDelivery, 1000),
      after_sales_service: clean(body.afterSalesService, 1500),
      origin_postal_code: clean(body.originPostalCode, 10) || null,
      origin_city: clean(body.originCity, 100) || null,
      origin_state: clean(body.originState, 100) || null,
      origin_street: clean(body.originStreet, 200) || null,
      origin_number: clean(body.originNumber, 30) || null,
      origin_district: clean(body.originDistrict, 120) || null,
      origin_phone: clean(body.originPhone, 30) || null,
      package_weight_kg: numeric(body.packageWeight, 0) || null,
      package_length_cm: numeric(body.packageLength, 22.86),
      package_width_cm: numeric(body.packageWidth, 15.24),
      package_height_cm: numeric(body.packageHeight, 1.6),
      envia_carriers: lines(body.enviaCarriers),
      updated_by: userId,
      updated_at: new Date().toISOString(),
    }).eq("id", true);
    return error ? apiError(error.message) : NextResponse.json({ success: true });
  }
  if (action === "integration_secret") {
    const provider = clean(body.provider, 40), key = clean(body.key, 60), value = typeof body.value === "string" ? body.value.trim() : "";
    if (!integrationProviders.has(provider) || !key || !value) return apiError("Clé d’intégration invalide");
    const { error } = await supabase.rpc("admin_set_integration_secret", { p_provider: provider, p_key: key, p_value: value });
    return error ? apiError(error.message) : NextResponse.json({ success: true });
  }
  if (action === "delete_integration_secret") {
    const provider = clean(body.provider, 40), key = clean(body.key, 60);
    if (!integrationProviders.has(provider) || !key) return apiError("Clé d’intégration invalide");
    const { error } = await supabase.rpc("admin_delete_integration_secret", { p_provider: provider, p_key: key });
    return error ? apiError(error.message) : NextResponse.json({ success: true });
  }
  if (action === "customer") {
    const id = clean(body.id, 50), fullName = clean(body.fullName, 120);
    if (!id || !fullName) return apiError("Client invalide");
    const { error } = await supabase.from("customers").update({ full_name: fullName, phone: clean(body.phone, 40) || null, email: clean(body.email, 160) || null, whatsapp_phone: clean(body.whatsapp, 40) || null, notes: clean(body.notes, 500) || null, updated_at: new Date().toISOString() }).eq("id", id);
    return error ? apiError(error.message) : NextResponse.json({ success: true });
  }
  return apiError("Action invalide");
}
