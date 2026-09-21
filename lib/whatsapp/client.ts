import "server-only";
import type { NadegeResponse } from "@/lib/nadege/schema";

function config() {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const version = process.env.WHATSAPP_API_VERSION;
  if (!token || !phoneNumberId || !version) throw new Error("WhatsApp Cloud API configuration is missing");
  return { token, endpoint: `https://graph.facebook.com/${version}/${phoneNumberId}/messages` };
}

async function send(payload: Record<string, unknown>) {
  const { token, endpoint } = config();
  const response = await fetch(endpoint, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", ...payload }) });
  const result = await response.json();
  if (!response.ok) throw new Error(`WhatsApp error ${response.status}: ${JSON.stringify(result)}`);
  return result;
}

export async function sendText(to: string, body: string) {
  return send({ to, type: "text", text: { preview_url: false, body } });
}

export async function sendImage(to: string, link: string, caption?: string) {
  return send({ to, type: "image", image: { link, ...(caption ? { caption } : {}) } });
}

export async function sendDocument(to: string, link: string, filename: string) {
  return send({ to, type: "document", document: { link, filename } });
}

export async function sendNadegeResponse(to: string, response: NadegeResponse) {
  const messages = response.messages.slice(0, 3);
  const buttons = response.buttons.slice(0, 3);
  const results: unknown[] = [];
  for (let index = 0; index < messages.length; index += 1) {
    const isLast = index === messages.length - 1;
    if (isLast && buttons.length) {
      results.push(await send({ to, type: "interactive", interactive: { type: "button", body: { text: messages[index] }, action: { buttons: buttons.map((button) => ({ type: "reply", reply: { id: button.id, title: button.title.slice(0, 20) } })) } } }));
    } else {
      results.push(await sendText(to, messages[index]));
    }
  }
  return results;
}
