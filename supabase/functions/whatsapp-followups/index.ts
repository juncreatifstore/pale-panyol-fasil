import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

type Secrets = Record<string, Record<string, string>>;
type Conversation = {
  id: string;
  wa_phone: string;
  customer_first_name: string | null;
  current_step: string;
  customer_data: Record<string, unknown> | null;
  order_id: string | null;
  last_message_at: string;
  reminder_stage: number;
};

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function getSecrets(): Promise<Secrets> {
  const { data, error } = await supabase.rpc("runtime_get_integration_secrets");
  if (error) throw error;
  return (data ?? {}) as Secrets;
}

async function send(wa: Record<string, string>, payload: Record<string, unknown>) {
  const response = await fetch(`https://graph.facebook.com/${wa.api_version || "v23.0"}/${wa.phone_number_id}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${wa.access_token}`, "content-type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", ...payload }),
  });
  if (!response.ok) throw new Error(`WhatsApp ${response.status}: ${await response.text()}`);
}

const stringArray = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];

async function sendFollowup(wa: Record<string, string>, conversation: Conversation, settings: Record<string, unknown>) {
  const data = conversation.customer_data ?? {};
  const firstName = conversation.customer_first_name ? `, ${conversation.customer_first_name}` : "";
  const payment = data.mercado_pago && typeof data.mercado_pago === "object" ? data.mercado_pago as Record<string, unknown> : {};
  const checkoutUrl = typeof payment.checkout_url === "string" ? payment.checkout_url : "";
  const testimonials = stringArray(settings.testimonials);
  const photos = stringArray(settings.photo_urls);
  const stage = Number(conversation.reminder_stage || 0);

  if (stage === 0) {
    const link = checkoutUrl ? `\n\nMen lyen peman ou ankò:\n${checkoutUrl}` : "";
    await send(wa, { to: conversation.wa_phone, type: "text", text: { preview_url: true, body: `Bonjou${firstName} 😊 Èske ou ta renmen kontinye ak kòmand Pale Panyol Fasil la?\n\nOu ka peye ak kat, SPEI oswa lajan kach nan OXXO, 7-Eleven, Santander ak lòt kote Mercado Pago pwopoze.${link}\n\nSi ou pa vle resevwa lòt rapèl, ekri *STOP*.` } });
    await send(wa, { to: conversation.wa_phone, type: "image", image: { link: "https://pale-panyol-fasil.vercel.app/api/payment-guide/cash", caption: "💵 *Peman kach fasil*\nChwazi Efectivo, chwazi kote a, jwenn kòd la epi ale peye kach. Konsève resi a." } });
  } else if (stage === 1) {
    const testimonial = testimonials.length ? testimonials[(stage - 1) % testimonials.length] : "Liv la fèt pou ede moun ki pale kreyòl konprann epi pratike panyòl pi fasil.";
    await send(wa, { to: conversation.wa_phone, type: "text", text: { preview_url: Boolean(checkoutUrl), body: `⭐ *Sa yon kliyan di sou liv la*\n\n“${testimonial}”\n\nÈske ou vle kontinye ak kòmand ou a?${checkoutUrl ? `\n${checkoutUrl}` : ""}\n\nEkri *STOP* si ou pa vle lòt rapèl.` } });
  } else {
    await send(wa, { to: conversation.wa_phone, type: "text", text: { preview_url: Boolean(checkoutUrl), body: `📘 Pale Panyol Fasil gen ${settings.book_pages || "plizyè"} paj pou ede w aprann ak pratike panyòl etap pa etap.${checkoutUrl ? `\n\nOu ka kontinye kòmand lan la:\n${checkoutUrl}` : ""}\n\nEkri *STOP* si ou pa vle lòt rapèl.` } });
    if (photos[0]) await send(wa, { to: conversation.wa_phone, type: "image", image: { link: photos[0], caption: "Men yon lòt foto liv Pale Panyol Fasil la 📘" } });
    if (typeof settings.summary_pdf_url === "string" && settings.summary_pdf_url) await send(wa, { to: conversation.wa_phone, type: "document", document: { link: settings.summary_pdf_url, filename: "Rezime-Pale-Panyol-Fasil.pdf", caption: "Men rezime liv la pou w ka gade l anvan ou deside." } });
  }
}

Deno.serve(async (request) => {
  try {
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
    const secrets = await getSecrets();
    if (!secrets.whatsapp?.cron_secret || request.headers.get("x-cron-secret") !== secrets.whatsapp.cron_secret) return json({ error: "Unauthorized" }, 401);
    const wa = secrets.whatsapp;
    if (!wa?.access_token || !wa.phone_number_id) return json({ error: "WhatsApp not configured" }, 503);
    const { data: settings, error: settingsError } = await supabase.from("sales_settings").select("*").eq("id", true).single();
    if (settingsError) throw settingsError;
    const { data: conversations, error } = await supabase.from("whatsapp_conversations")
      .select("id,wa_phone,customer_first_name,current_step,customer_data,order_id,last_message_at,reminder_stage")
      .is("reminder_stopped_at", null).not("next_reminder_at", "is", null).lte("next_reminder_at", new Date().toISOString())
      .not("current_step", "in", "(stopped,tracking,completed)").order("next_reminder_at").limit(50);
    if (error) throw error;

    let sent = 0, stopped = 0, failed = 0;
    for (const conversation of (conversations ?? []) as Conversation[]) {
      if (conversation.order_id) {
        const { data: order } = await supabase.from("orders").select("status").eq("id", conversation.order_id).maybeSingle();
        if (order?.status === "paid") {
          await supabase.from("whatsapp_conversations").update({ next_reminder_at: null, reminder_stopped_at: new Date().toISOString() }).eq("id", conversation.id);
          stopped++; continue;
        }
      }
      const ageMs = Date.now() - new Date(conversation.last_message_at).getTime();
      if (ageMs >= 24 * 60 * 60 * 1000 || conversation.reminder_stage >= 3) {
        await supabase.from("whatsapp_conversations").update({ next_reminder_at: null, reminder_stopped_at: new Date().toISOString() }).eq("id", conversation.id);
        stopped++; continue;
      }
      try {
        await sendFollowup(wa, conversation, settings as Record<string, unknown>);
        const nextStage = conversation.reminder_stage + 1;
        const hours = nextStage === 1 ? 6 : 12;
        const nextAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
        await supabase.from("whatsapp_conversations").update({ reminder_stage: nextStage, last_reminder_at: new Date().toISOString(), next_reminder_at: nextAt }).eq("id", conversation.id);
        await supabase.from("whatsapp_messages").insert({ conversation_id: conversation.id, direction: "outbound", message_type: "followup", content: `Automated follow-up stage ${nextStage}`, ai_intent: "followup", ai_next_action: "none", payload: { stage: nextStage } });
        sent++;
      } catch (sendError) {
        console.error("Follow-up send failed", conversation.id, sendError);
        failed++;
      }
    }
    return json({ processed: conversations?.length ?? 0, sent, stopped, failed });
  } catch (error) {
    console.error("WhatsApp follow-up error", error);
    return json({ error: "Internal error" }, 500);
  }
});
