import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { askNadege } from "./openai";
import { buildNadegePrompt, catalogData, whySpanish } from "./prompt";
import { sendDocument, sendImage, sendNadegeResponse } from "@/lib/whatsapp/client";

type IncomingMessage = { id: string; from: string; timestamp?: string; type?: string; text?: { body?: string }; button?: { text?: string; payload?: string }; interactive?: { button_reply?: { id?: string; title?: string }; list_reply?: { id?: string; title?: string } }; image?: { caption?: string } };

function messageText(message: IncomingMessage) {
  if (message.type === "text") return message.text?.body?.trim() || "";
  if (message.type === "button") return message.button?.text || message.button?.payload || "";
  if (message.type === "interactive") return message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || "";
  if (message.type === "audio") return "[Message vocal non transcrit]";
  if (message.type === "image") return message.image?.caption ? `[Photo reçue] ${message.image.caption}` : "[Photo reçue]";
  return `[Message ${message.type || "inconnu"} non lisible]`;
}

function detectLanguage(input: string, previous: string) {
  const lower = input.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const scores = {
    ht: (lower.match(/\b(bonjou|bonswa|mwen|ou|nou|yo|liv|pri|achte|vle|konnen|konbyen|kijan|poukisa|livrezon|voye|mesi|tanpri|eske|kreyol|panyol|peye|komande|adres)\b/g) ?? []).length,
    es: (lower.match(/\b(hola|precio|libro|envio|quiero|gracias|cuanto|donde|comprar|pagar|pedido|direccion|espanol)\b/g) ?? []).length,
    fr: (lower.match(/\b(bonjour|bonsoir|prix|livre|merci|livraison|acheter|payer|commande|adresse|francais)\b/g) ?? []).length,
    en: (lower.match(/\b(hello|hi|price|book|shipping|thanks|buy|pay|order|address|english)\b/g) ?? []).length,
  };
  const winner = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  if (winner[1] > 0) return winner[0];
  return previous || "ht";
}

const stepByAction: Record<string, string> = { show_catalog: "choose_book", send_photos: "book_details", send_sample: "sample", show_price: "price", ask_zone: "delivery_zone", ask_field: "address", request_shipping_quote: "shipping_quote", show_summary: "summary", create_payment_link: "payment", send_tracking: "tracking" };

export async function processWhatsAppMessage(message: IncomingMessage, profileName?: string) {
  const supabase = createSupabaseAdminClient();
  const content = messageText(message);
  if (!content || !message.id || !message.from) return;

  const { data: existing } = await supabase.from("whatsapp_messages").select("id").eq("whatsapp_message_id", message.id).maybeSingle();
  if (existing) return;

  const conversationResult = await supabase.from("whatsapp_conversations").select("*").eq("wa_phone", message.from).maybeSingle();
  let conversation = conversationResult.data;
  const conversationError = conversationResult.error;
  if (conversationError) throw conversationError;
  if (!conversation) {
    const firstName = profileName?.trim().split(/\s+/)[0] || null;
    const created = await supabase.from("whatsapp_conversations").insert({ wa_phone: message.from, customer_first_name: firstName, language: detectLanguage(content, "ht") }).select().single();
    if (created.error) throw created.error;
    conversation = created.data;
  }

  const inbound = await supabase.from("whatsapp_messages").insert({ conversation_id: conversation.id, whatsapp_message_id: message.id, direction: "inbound", message_type: message.type || "unknown", content, payload: message }).select("id").single();
  if (inbound.error?.code === "23505") return;
  if (inbound.error) throw inbound.error;

  const language = detectLanguage(content, conversation.language);
  const [{ data: history }, { data: stockRows }] = await Promise.all([
    supabase.from("whatsapp_messages").select("direction,content").eq("conversation_id", conversation.id).order("created_at", { ascending: false }).limit(12),
    supabase.from("inventory_locations").select("quantity_on_hand"),
  ]);
  let orderData: unknown = null, paymentStatus = "none", trackingData: unknown = null;
  if (conversation.order_id) {
    const [{ data: order }, { data: payment }, { data: shipment }] = await Promise.all([
      supabase.from("orders").select("order_number,status,quantity,unit_price_mxn,shipping_price_mxn,total_mxn,fulfillment_type").eq("id", conversation.order_id).maybeSingle(),
      supabase.from("payments").select("status,provider,amount_mxn").eq("order_id", conversation.order_id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("shipments").select("provider,tracking_number,status,estimated_delivery,last_event").eq("order_id", conversation.order_id).maybeSingle(),
    ]);
    orderData = order; paymentStatus = payment?.status || "none"; trackingData = shipment;
  }
  const liveCatalog = structuredClone(catalogData);
  liveCatalog.books[0].stock = String((stockRows ?? []).reduce((sum, row) => sum + Number(row.quantity_on_hand), 0));
  const systemPrompt = buildNadegePrompt({ customerFirstName: conversation.customer_first_name || "", language, currentStep: conversation.current_step, catalogData: liveCatalog, whySpanish, orderData, shippingQuote: null, paymentStatus, trackingData, supportEmail: process.env.SUPPORT_EMAIL || "contact@juncreatif.store", conversationHistory: (history ?? []).reverse() });
  const answer = await askNadege(systemPrompt, content);
  await sendNadegeResponse(message.from, answer);

  const extracted = Object.fromEntries(Object.entries(answer.extracted).filter(([, value]) => value !== null && value !== ""));
  const customerData = { ...(conversation.customer_data ?? {}), ...extracted };
  await supabase.from("whatsapp_conversations").update({ language, current_step: stepByAction[answer.next_action] || conversation.current_step, customer_first_name: answer.extracted.full_name?.split(/\s+/)[0] || conversation.customer_first_name, customer_data: customerData, last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", conversation.id);
  await supabase.from("whatsapp_messages").insert(answer.messages.map((text) => ({ conversation_id: conversation.id, direction: "outbound", message_type: answer.buttons.length ? "interactive" : "text", content: text, ai_intent: answer.intent, ai_next_action: answer.next_action, payload: { buttons: answer.buttons } })));

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if ((answer.next_action === "show_catalog" || answer.next_action === "send_photos") && siteUrl) await sendImage(message.from, `${siteUrl}/pale-panyol-fasil-cover.jpg`, "Pale Panyol Fasil");
  if (answer.next_action === "send_sample" && process.env.BOOK_SAMPLE_URL) await sendDocument(message.from, process.env.BOOK_SAMPLE_URL, "Apercu-Pale-Panyol-Fasil.pdf");
}
