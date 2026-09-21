export const nadegeResponseSchema = {
  type: "object",
  properties: {
    messages: { type: "array", minItems: 1, maxItems: 3, items: { type: "string", minLength: 1, maxLength: 700 } },
    buttons: { type: "array", maxItems: 3, items: { type: "object", properties: { id: { type: "string", minLength: 1, maxLength: 64 }, title: { type: "string", minLength: 1, maxLength: 20 } }, required: ["id", "title"], additionalProperties: false } },
    intent: { type: "string", enum: ["choose_book", "ask_price", "ask_sample", "ask_why_spanish", "give_address", "confirm", "object_price", "smalltalk", "complaint", "other"] },
    extracted: { type: "object", properties: { full_name: { type: ["string", "null"] }, phone: { type: ["string", "null"] }, postal_code: { type: ["string", "null"] }, street: { type: ["string", "null"] }, colony: { type: ["string", "null"] }, city: { type: ["string", "null"] }, state: { type: ["string", "null"] }, delivery_zone: { type: ["string", "null"] }, metro_station: { type: ["string", "null"] }, references: { type: ["string", "null"] } }, required: ["full_name", "phone", "postal_code", "street", "colony", "city", "state", "delivery_zone", "metro_station", "references"], additionalProperties: false },
    next_action: { type: "string", enum: ["none", "show_catalog", "send_photos", "send_sample", "show_price", "ask_zone", "ask_field", "request_shipping_quote", "show_summary", "create_payment_link", "send_tracking"] },
  },
  required: ["messages", "buttons", "intent", "extracted", "next_action"],
  additionalProperties: false,
} as const;

export type NadegeResponse = {
  messages: string[];
  buttons: Array<{ id: string; title: string }>;
  intent: "choose_book" | "ask_price" | "ask_sample" | "ask_why_spanish" | "give_address" | "confirm" | "object_price" | "smalltalk" | "complaint" | "other";
  extracted: { full_name: string | null; phone: string | null; postal_code: string | null; street: string | null; colony: string | null; city: string | null; state: string | null; delivery_zone: string | null; metro_station: string | null; references: string | null };
  next_action: "none" | "show_catalog" | "send_photos" | "send_sample" | "show_price" | "ask_zone" | "ask_field" | "request_shipping_quote" | "show_summary" | "create_payment_link" | "send_tracking";
};
