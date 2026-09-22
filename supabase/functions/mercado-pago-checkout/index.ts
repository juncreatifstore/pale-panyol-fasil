import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

type Secrets = Record<string, Record<string, string>>;
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const cors = { "access-control-allow-origin": "https://pale-panyol-fasil.vercel.app", "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET,POST,OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

async function getSecrets(): Promise<Secrets> {
  const { data, error } = await supabase.rpc("runtime_get_integration_secrets");
  if (error) throw error;
  return (data ?? {}) as Secrets;
}

async function checkout(orderId: string, token: string) {
  const { data: conversation } = await supabase.from("whatsapp_conversations").select("wa_phone,customer_data").eq("order_id", orderId).maybeSingle();
  const saved = (conversation?.customer_data as Record<string, any> | null)?.mercado_pago;
  if (!conversation || !token || saved?.checkout_token !== token) return null;
  const { data: order } = await supabase.from("orders").select("id,order_number,total_mxn,status").eq("id", orderId).maybeSingle();
  return order ? { order, conversation } : null;
}

async function sendWhatsApp(wa: Record<string, string>, to: string, body: string) {
  const response = await fetch(`https://graph.facebook.com/${wa.api_version || "v23.0"}/${wa.phone_number_id}/messages`, {
    method: "POST", headers: { authorization: `Bearer ${wa.access_token}`, "content-type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { preview_url: false, body } }),
  });
  if (!response.ok) console.error("WhatsApp confirmation failed", response.status, await response.text());
}

Deno.serve(async (request) => {
  try {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const integration = await getSecrets();
    const mp = integration.mercado_pago;
    if (!mp?.access_token) return json({ error: "Paiement non configuré" }, 503);
    const url = new URL(request.url);
    const body = request.method === "POST" ? await request.json().catch(() => ({})) as Record<string, any> : {};
    const orderId = String(url.searchParams.get("order") || body.order || "");
    const token = String(url.searchParams.get("token") || body.checkout_token || "");
    const found = await checkout(orderId, token);
    if (!found) return json({ error: "Lien de paiement invalide" }, 404);
    if (request.method === "GET") {
      if (found.order.status === "paid") return json({ paid: true, order_number: found.order.order_number, amount: Number(found.order.total_mxn) });
      const { data: setting } = await supabase.from("integration_settings").select("public_identifier").eq("provider", "mercado_pago").single();
      return json({ paid: false, public_key: setting?.public_identifier || null, order_number: found.order.order_number, amount: Number(found.order.total_mxn) });
    }
    if (request.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);
    if (found.order.status === "paid") return json({ status: "approved", order_number: found.order.order_number });
    const paymentData = body.payment_data || {};
    const required = [paymentData.token, paymentData.payment_method_id, paymentData.installments, paymentData.payer?.email];
    if (required.some((value) => value == null || value === "")) return json({ error: "Informations de paiement incomplètes" }, 400);
    const paymentResponse = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: { authorization: `Bearer ${mp.access_token}`, "content-type": "application/json", "x-idempotency-key": `ppf-${found.order.id}-${String(paymentData.token).slice(-16)}` },
      body: JSON.stringify({
        token: paymentData.token, transaction_amount: Number(found.order.total_mxn), installments: Number(paymentData.installments),
        payment_method_id: paymentData.payment_method_id, issuer_id: paymentData.issuer_id || undefined, payer: paymentData.payer,
        description: `Pale Panyol Fasil - ${found.order.order_number}`, external_reference: found.order.id,
        notification_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/mercado-pago-webhook`, three_d_secure_mode: "optional",
      }),
    });
    const payment = await paymentResponse.json().catch(() => null) as Record<string, any> | null;
    if (!paymentResponse.ok || !payment) return json({ error: String(payment?.message || "Mercado Pago a refusé le paiement"), details: payment?.cause || [] }, paymentResponse.status || 502);
    const normalized = payment.status === "approved" ? "approved" : payment.status === "rejected" ? "rejected" : "pending";
    await supabase.from("payments").insert({ order_id: found.order.id, provider: "mercado_pago", provider_payment_id: String(payment.id), status: normalized, amount_mxn: Number(found.order.total_mxn), fee_mxn: Number(payment.fee_details?.reduce((sum: number, fee: Record<string, unknown>) => sum + Number(fee.amount || 0), 0) || 0), paid_at: normalized === "approved" ? payment.date_approved || new Date().toISOString() : null });
    await supabase.from("orders").update({ status: normalized === "approved" ? "paid" : "payment_pending", payment_reference: String(payment.id), paid_at: normalized === "approved" ? payment.date_approved || new Date().toISOString() : null }).eq("id", found.order.id);
    if (normalized === "approved" && integration.whatsapp?.access_token) await sendWhatsApp(integration.whatsapp, found.conversation.wa_phone, `✅ Mercado Pago konfime peman ou an.\nKòmand: *${found.order.order_number}*\nMontan: *$${Number(found.order.total_mxn).toFixed(2)} MXN*\n\nN ap prepare kòmand ou epi n ap voye nimewo swivi a ba ou.`);
    return json({ status: normalized, status_detail: payment.status_detail, order_number: found.order.order_number });
  } catch (error) {
    console.error("Guest checkout error", error);
    return json({ error: "Erreur interne" }, 500);
  }
});
