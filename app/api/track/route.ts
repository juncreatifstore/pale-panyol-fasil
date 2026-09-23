import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const allowedEvents = new Set([
  "page_view", "book_photo_view", "summary_download", "whatsapp_opened",
  "order_started", "delivery_selected", "shipping_quote_requested",
  "shipping_quote_received", "checkout_created", "payment_page_view",
  "payment_method_selected", "payment_submitted", "payment_approved", "payment_failed",
]);

const clean = (value: unknown, max = 200) => typeof value === "string" ? value.trim().slice(0, max) : "";

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const eventType = clean(body.eventType, 50);
    const suppliedSession = clean(body.sessionId, 100);
    const sessionId = suppliedSession.length >= 8 ? suppliedSession : crypto.randomUUID();
    if (!allowedEvents.has(eventType)) return NextResponse.json({ error: "Événement invalide" }, { status: 400 });

    const metadata = body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
      ? JSON.parse(JSON.stringify(body.metadata).slice(0, 4000))
      : {};
    const orderId = clean(body.orderId, 50);
    const { error } = await createSupabaseAdminClient().from("customer_journey_events").insert({
      session_id: sessionId,
      event_type: eventType,
      source: ["website", "payment"].includes(clean(body.source, 20)) ? clean(body.source, 20) : "website",
      page_path: clean(body.pagePath, 300) || null,
      order_id: /^[0-9a-f-]{36}$/i.test(orderId) ? orderId : null,
      metadata,
    });
    return error ? NextResponse.json({ error: error.message }, { status: 500 }) : new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: "Événement illisible" }, { status: 400 });
  }
}
