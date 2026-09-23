"use client";

const key = "ppf_journey_session";

export function journeySession() {
  let value = window.localStorage.getItem(key);
  if (!value) {
    value = crypto.randomUUID();
    window.localStorage.setItem(key, value);
  }
  return value;
}

export function trackJourney(eventType: string, details: { source?: "website" | "payment"; orderId?: string; metadata?: Record<string, unknown> } = {}) {
  if (typeof window === "undefined") return;
  const body = JSON.stringify({
    eventType,
    sessionId: journeySession(),
    pagePath: window.location.pathname,
    source: details.source ?? "website",
    orderId: details.orderId,
    metadata: details.metadata ?? {},
  });
  if (navigator.sendBeacon) navigator.sendBeacon("/api/track", new Blob([body], { type: "application/json" }));
  else void fetch("/api/track", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true });
}
