import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

type Row = Record<string, unknown>;
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET,POST,OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });
const clean = (value: unknown, max = 250) => typeof value === "string" ? value.trim().slice(0, max) : "";
const stringList = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];

async function integrationSecrets() {
  const { data, error } = await db.rpc("runtime_get_integration_secrets");
  if (error) throw error;
  return (data ?? {}) as Record<string, Record<string, string>>;
}

async function postal(code: string) {
  const response = await fetch(`https://geocodes.envia.com/zipcode/MX/${encodeURIComponent(code)}`);
  const payload = await response.json().catch(() => null) as unknown;
  if (!response.ok || !payload) return null;
  const root = payload as Row, nested = root.data;
  const data = (Array.isArray(payload) ? payload[0] : Array.isArray(nested) ? nested[0] : nested ?? payload) as Row | undefined;
  if (!data) return null;
  const stateData = data.state;
  const state = typeof stateData === "string" ? stateData : stateData && typeof stateData === "object" ? String(((stateData as Row).code as Row | undefined)?.["2digit"] ?? (stateData as Row).iso_code ?? (stateData as Row).name ?? "").replace(/^MX-/, "") : "";
  const regions = data.regions as Row | undefined;
  const result = { postalCode: String(data.postalCode ?? data.zip_code ?? ""), city: String(data.city ?? data.locality ?? regions?.region_2 ?? ""), state };
  return result.postalCode && result.city && result.state ? result : null;
}

function quoteRows(payload: unknown, carrier: string) {
  const root = payload as Row;
  const list = [root.data, root.rates, root.data && (root.data as Row).rates].find(Array.isArray) as Row[] | undefined;
  return (list ?? []).map((row) => ({ carrier: String(row.carrier ?? row.carrierDescription ?? carrier), service: String(row.service ?? "standard"), description: String(row.serviceDescription ?? row.service ?? "Sèvis estanda"), estimate: String(row.deliveryEstimate ?? row.deliveryDate ?? row.estimatedDelivery ?? row.deliveryTime ?? row.transitDays ?? row.deliveryDays ?? row.days ?? ""), price: Number(row.totalPrice ?? row.total ?? row.price ?? row.cost), currency: String(row.currency ?? "MXN") })).filter((row) => Number.isFinite(row.price) && row.price >= 0);
}

async function getRates(settings: Row, customer: Row, quantity: number) {
  const shipping = (await integrationSecrets()).shipping ?? {};
  if (!shipping.api_key) throw new Error("Livraison Envia non configurée");
  const [origin, destination] = await Promise.all([postal(String(settings.origin_postal_code ?? "")), postal(String(customer.postalCode ?? ""))]);
  if (!origin) throw new Error("Adresse d’expédition non configurée");
  if (!destination) throw new Error("Code postal mexicain invalide");
  const common = {
    origin: { name: "Pale Panyol Fasil", company: "Pale Panyol Fasil", email: settings.after_sales_email || "contact@juncreatif.store", phone: settings.origin_phone, street: settings.origin_street, number: settings.origin_number || "S/N", district: settings.origin_district || "Centro", city: origin.city, state: origin.state, country: "MX", postalCode: origin.postalCode },
    destination: { name: customer.fullName, company: customer.fullName, email: customer.email, phone: customer.phone, street: customer.street, number: customer.number || "S/N", district: customer.colony, city: destination.city, state: destination.state, country: "MX", postalCode: destination.postalCode },
    packages: [{ type: "box", content: "Libro Pale Panyol Fasil", amount: quantity, declaredValue: Number(settings.book_price_mxn) * quantity, weight: Number(settings.package_weight_kg) * quantity, insurance: 0, weightUnit: "KG", lengthUnit: "CM", dimensions: { length: Number(settings.package_length_cm), width: Number(settings.package_width_cm), height: Number(settings.package_height_cm) } }],
  };
  const base = (shipping.api_url || "https://api.envia.com").replace(/\/$/, "");
  const carriers = stringList(settings.envia_carriers).length ? stringList(settings.envia_carriers) : ["dhl", "fedex", "estafeta"];
  const attempts = await Promise.all(carriers.map(async (carrier) => {
    const response = await fetch(`${base}/ship/rate/`, { method: "POST", headers: { authorization: `Bearer ${shipping.api_key}`, "content-type": "application/json" }, body: JSON.stringify({ ...common, shipment: { carrier, type: 1 } }) });
    return response.ok ? quoteRows(await response.json().catch(() => ({})), carrier) : [];
  }));
  return attempts.flat().sort((a, b) => a.price - b.price).slice(0, 3);
}

Deno.serve(async (request) => {
  try {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method === "GET") {
      const { data, error } = await db.from("sales_settings").select("book_price_mxn,book_pages,book_chapters,summary_pdf_url,photo_urls,book_benefits,tapachula_delivery,cdmx_delivery,other_zones_delivery,homepage_video_url").eq("id", true).single();
      return error ? json({ error: "Configuration indisponible" }, 503) : json(data);
    }
    if (request.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);
    const body = await request.json().catch(() => ({})) as Row;
    if (clean(body.website, 10)) return json({ success: true });
    const action = clean(body.action, 20), quantity = Math.min(20, Math.max(1, Math.trunc(Number(body.quantity) || 1))), delivery = clean(body.delivery, 30);
    const customer: Row = { fullName: clean(body.fullName, 120), email: clean(body.email, 160), phone: clean(body.phone, 40), postalCode: clean(body.postalCode, 5), street: clean(body.street, 200), number: clean(body.number, 30), colony: clean(body.colony, 120) };
    if (!customer.fullName || !customer.email || !customer.phone) return json({ error: "Nom, e-mail et téléphone sont obligatoires" }, 400);
    const { data: settings, error: settingsError } = await db.from("sales_settings").select("*").eq("id", true).single();
    if (settingsError || !settings) return json({ error: "Configuration indisponible" }, 503);
    if (delivery === "shipping") {
      if (!/^\d{5}$/.test(String(customer.postalCode)) || !customer.street || !customer.colony) return json({ error: "Adresse de livraison incomplète" }, 400);
      const found = await getRates(settings, customer, quantity);
      if (!found.length) return json({ error: "Aucun tarif de livraison disponible" }, 422);
      if (action === "quote") return json({ rates: found });
      const selected = found.find((rate) => rate.carrier === clean(body.carrier, 80) && rate.service === clean(body.service, 120));
      if (!selected) return json({ error: "Veuillez recalculer et sélectionner une livraison" }, 409);
      body.shippingPrice = selected.price; body.shippingLabel = `${selected.carrier} ${selected.description}`;
    } else if (!["pickup_cdmx", "pickup_tapachula"].includes(delivery)) return json({ error: "Mode de réception invalide" }, 400);
    if (action !== "checkout") return json({ error: "Action invalide" }, 400);
    const { data: customerRow, error: customerError } = await db.from("customers").insert({ full_name: customer.fullName, email: customer.email, phone: customer.phone, whatsapp_phone: customer.phone, street_address: [customer.street, customer.number, customer.colony].filter(Boolean).join(", ") || null, postal_code: customer.postalCode || null, country: "MX" }).select("id").single();
    if (customerError) return json({ error: "Impossible d’enregistrer le client" }, 500);
    const token = crypto.randomUUID(), orderNumber = `PPF-${new Date().toISOString().slice(2, 10).replaceAll("-", "")}-${crypto.randomUUID().slice(0, 5).toUpperCase()}`;
    const { data: order, error } = await db.from("orders").insert({ order_number: orderNumber, customer_id: customerRow.id, status: "payment_pending", fulfillment_type: delivery, quantity, unit_price_mxn: Number(settings.book_price_mxn), shipping_price_mxn: Number(body.shippingPrice || 0), payment_provider: "mercado_pago", public_checkout_token: token, notes: clean(body.shippingLabel, 250) || null }).select("id,order_number,total_mxn").single();
    if (error) { await db.from("customers").delete().eq("id", customerRow.id); return json({ error: "Impossible de créer la commande" }, 500); }
    const waPhone = String(customer.phone).replace(/[^\d]/g, "");
    if (waPhone.length >= 10) {
      const { data: existing } = await db.from("whatsapp_conversations").select("id,customer_data").eq("wa_phone", waPhone).maybeSingle();
      const payment = { checkout_token: token, checkout_url: `https://pale-panyol-fasil.vercel.app/pagar?order=${order.id}&token=${token}`, order_number: order.order_number, total_mxn: order.total_mxn };
      if (existing) await db.from("whatsapp_conversations").update({ order_id: order.id, customer_first_name: String(customer.fullName).split(/\s+/)[0], customer_data: { ...((existing.customer_data as Row | null) ?? {}), mercado_pago: payment }, current_step: "payment", updated_at: new Date().toISOString() }).eq("id", existing.id);
      else await db.from("whatsapp_conversations").insert({ wa_phone: waPhone, customer_first_name: String(customer.fullName).split(/\s+/)[0], order_id: order.id, current_step: "payment", customer_data: { mercado_pago: payment } });
    }
    return json({ checkout_url: `/pagar?order=${encodeURIComponent(order.id)}&token=${encodeURIComponent(token)}`, order_number: order.order_number, total: order.total_mxn }, 201);
  } catch (error) { console.error("Storefront error", error); return json({ error: error instanceof Error ? error.message : "Erreur interne" }, 500); }
});
