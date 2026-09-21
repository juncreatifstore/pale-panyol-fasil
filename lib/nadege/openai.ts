import "server-only";
import { z } from "zod";
import { nadegeResponseSchema, type NadegeResponse } from "./schema";

const responseValidator = z.object({
  messages: z.array(z.string().min(1).max(700)).min(1).max(3),
  buttons: z.array(z.object({ id: z.string().min(1).max(64), title: z.string().min(1).max(20) })).max(3),
  intent: z.enum(["choose_book", "ask_price", "ask_sample", "ask_why_spanish", "give_address", "confirm", "object_price", "smalltalk", "complaint", "other"]),
  extracted: z.object({ full_name: z.string().nullable(), phone: z.string().nullable(), postal_code: z.string().nullable(), street: z.string().nullable(), colony: z.string().nullable(), references: z.string().nullable() }),
  next_action: z.enum(["none", "show_catalog", "send_photos", "send_sample", "show_price", "ask_zone", "ask_field", "request_shipping_quote", "show_summary", "create_payment_link", "send_tracking"]),
});

type OpenAIOutput = { output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }> };

export async function askNadege(systemPrompt: string, customerMessage: string): Promise<NadegeResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is missing");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      input: [{ role: "system", content: systemPrompt }, { role: "user", content: customerMessage }],
      text: { format: { type: "json_schema", name: "nadege_whatsapp_response", strict: true, schema: nadegeResponseSchema } },
      max_output_tokens: 1200,
    }),
  });
  const payload = await response.json() as OpenAIOutput & { error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message || `OpenAI error ${response.status}`);
  const outputText = payload.output?.flatMap((item) => item.content ?? []).find((item) => item.type === "output_text")?.text;
  if (!outputText) throw new Error("OpenAI returned no structured output");
  return responseValidator.parse(JSON.parse(outputText));
}
