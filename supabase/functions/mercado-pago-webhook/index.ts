import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

type Secrets = Record<string, Record<string, string>>;
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function getSecrets(): Promise<Secrets> {
  const { data, error } = await supabase.rpc("runtime_get_integration_secrets");
  if (error) throw error;
  return (data ?? {}) as Secrets;
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function validMercadoPagoSignature(request: Request, secret: string, dataId: string) {
  const signature = request.headers.get("x-signature") || "";
  const requestId = request.headers.get("x-request-id") || "";
  const parts = Object.fromEntries(signature.split(",").map((part) => part.trim().split("=", 2)));
  if (!secret || !parts.ts || !parts.v1 || !requestId || !dataId) return false;
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${parts.ts};`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(manifest));
  const expected = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return timingSafeEqual(expected, parts.v1);
}

async function sendWhatsApp(wa: Record<string, string>, to: string, body: string) {
  const response = await fetch(`https://graph.facebook.com/${wa.api_version || "v23.0"}/${wa.phone_number_id}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${wa.access_token}`, "content-type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { preview_url: false, body } }),
  });
  if (!response.ok) throw new Error(`WhatsApp ${response.status}: ${await response.text()}`);
}

function supportSuffix(settings: Record<string, any> | null) {
  const email = String(settings?.after_sales_email || "").trim();
  const phone = String(settings?.after_sales_whatsapp || "").replace(/[^\d]/g, "");
  const contacts = [email ? `Imèl: *${email}*` : "", phone ? `WhatsApp SAV: https://wa.me/${phone}` : ""].filter(Boolean);
  const message = String(settings?.after_sales_service || "").trim();
  return contacts.length || message ? `\n\n🛟 *Sèvis apre-vant*\n${[message, ...contacts].filter(Boolean).join("\n")}` : "";
}

Deno.serve(async (request) => {
  try {
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
    const secrets = await getSecrets();
    const mercadoPago = secrets.mercado_pago;
    if (!mercadoPago?.access_token || !mercadoPago?.webhook_secret) return json({ error: "Mercado Pago not configured" }, 503);
    const url = new URL(request.url);
    const body = await request.json().catch(() => ({})) as Record<string, any>;
    const dataId = String(url.searchParams.get("data.id") || body.data?.id || "");
    const type = String(url.searchParams.get("type") || body.type || "");
    if (type !== "payment") return json({ received: true, ignored: type });
    if (!(await validMercadoPagoSignature(request, mercadoPago.webhook_secret, dataId))) return json({ error: "Invalid signature" }, 401);

    const paymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(dataId)}`, { headers: { authorization: `Bearer ${mercadoPago.access_token}` } });
    const payment = await paymentResponse.json().catch(() => null) as Record<string, any> | null;
    if (!paymentResponse.ok || !payment) throw new Error(`Mercado Pago payment lookup ${paymentResponse.status}`);
    const orderId = String(payment.external_reference || "");
    const { data: order } = await supabase.from("orders").select("id,total_mxn,status").eq("id", orderId).maybeSingle();
    if (!order || Math.abs(Number(order.total_mxn) - Number(payment.transaction_amount)) > 0.001) return json({ error: "Payment does not match order" }, 409);

    const normalizedStatus = payment.status === "approved" ? "approved" : payment.status === "refunded" ? "refunded" : payment.status === "rejected" ? "rejected" : "pending";
    const { data: existing } = await supabase.from("payments").select("id").eq("provider", "mercado_pago").eq("provider_payment_id", String(payment.id)).maybeSingle();
    const paymentRow = { order_id: order.id, provider: "mercado_pago", provider_payment_id: String(payment.id), status: normalizedStatus, amount_mxn: Number(payment.transaction_amount), fee_mxn: Number(payment.fee_details?.reduce((sum: number, fee: Record<string, unknown>) => sum + Number(fee.amount || 0), 0) || 0), raw_event_id: String(body.id || `payment-${payment.id}`), paid_at: normalizedStatus === "approved" ? String(payment.date_approved || new Date().toISOString()) : null };
    if (existing) await supabase.from("payments").update(paymentRow).eq("id", existing.id);
    else {
      const inserted = await supabase.from("payments").insert(paymentRow);
      if (inserted.error && inserted.error.code !== "23505") throw inserted.error;
    }
    const orderStatus = normalizedStatus === "approved" ? "paid" : normalizedStatus === "refunded" ? "refunded" : normalizedStatus === "rejected" ? "payment_pending" : "payment_pending";
    await supabase.from("orders").update({ status: orderStatus, paid_at: normalizedStatus === "approved" ? paymentRow.paid_at : null }).eq("id", order.id);
    if (normalizedStatus === "approved" && order.status !== "paid") {
      const { data: conversation } = await supabase.from("whatsapp_conversations").select("wa_phone,customer_data").eq("order_id", order.id).maybeSingle();
      if (conversation && secrets.whatsapp?.access_token) {
        const orderNumber = (conversation.customer_data as Record<string, any>)?.mercado_pago?.order_number || order.id;
        const { data: settings } = await supabase.from("sales_settings").select("after_sales_service,after_sales_whatsapp,after_sales_email").eq("id", true).maybeSingle();
        await sendWhatsApp(secrets.whatsapp, conversation.wa_phone, `✅ Mercado Pago konfime peman ou an.\nKòmand: *${orderNumber}*\nMontan: *$${Number(payment.transaction_amount).toFixed(2)} MXN*\n\nN ap prepare kòmand ou epi n ap voye nimewo swivi a ba ou.${supportSuffix(settings)}`);
      }
    }
    return json({ received: true });
  } catch (error) {
    console.error("Mercado Pago webhook error", error);
    return json({ error: "Internal error" }, 500);
  }
});
