import { createHmac, timingSafeEqual } from "node:crypto";
import { after, NextResponse } from "next/server";
import { processWhatsAppMessage } from "@/lib/nadege/process-message";

export const runtime = "nodejs";
export const maxDuration = 60;

type WebhookPayload = { entry?: Array<{ changes?: Array<{ value?: { contacts?: Array<{ profile?: { name?: string } }>; messages?: Array<Parameters<typeof processWhatsAppMessage>[0]> } }> }> };

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token && token === process.env.WHATSAPP_VERIFY_TOKEN && challenge) return new Response(challenge, { status: 200, headers: { "content-type": "text/plain" } });
  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  const appSecret = process.env.META_APP_SECRET;
  if (!signature || !appSecret) return NextResponse.json({ error: "Webhook signature unavailable" }, { status: 401 });
  const expected = `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
  const valid = signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  if (!valid) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  let payload: WebhookPayload;
  try { payload = JSON.parse(rawBody) as WebhookPayload; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const jobs: Array<Promise<void>> = [];
  for (const entry of payload.entry ?? []) for (const change of entry.changes ?? []) {
    const profileName = change.value?.contacts?.[0]?.profile?.name;
    for (const message of change.value?.messages ?? []) jobs.push(processWhatsAppMessage(message, profileName));
  }
  if (jobs.length) after(async () => { const settled = await Promise.allSettled(jobs); for (const result of settled) if (result.status === "rejected") console.error("Nadège webhook error", result.reason); });
  return NextResponse.json({ received: true });
}
