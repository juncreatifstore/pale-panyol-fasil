"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { trackJourney } from "@/lib/journey";

declare global { interface Window { MercadoPago: new (key: string, options?: Record<string, unknown>) => { bricks: () => { create: (name: string, container: string, settings: Record<string, unknown>) => Promise<{ unmount: () => void }> } } } }
const endpoint = "https://xvmvppfziiymqjvhciax.supabase.co/functions/v1/mercado-pago-checkout";

export default function PaymentClient() {
  const params = useSearchParams(), order = params.get("order") || "", token = params.get("token") || "";
  const mounted = useRef(false);
  const [state, setState] = useState<"loading"|"ready"|"approved"|"pending"|"error">("loading");
  const [message, setMessage] = useState("N ap prepare peman sekirize a…");
  const [summary, setSummary] = useState<{order_number:string;amount:number}|null>(null);

  useEffect(() => {
    if (mounted.current) return; mounted.current = true;
    trackJourney("payment_page_view", { source: "payment", orderId: order });
    let controller: { unmount: () => void } | undefined;
    (async () => {
      const response = await fetch(`${endpoint}?order=${encodeURIComponent(order)}&token=${encodeURIComponent(token)}`);
      const config = await response.json();
      if (!response.ok) throw new Error(config.error || "Lyen peman an pa valab");
      setSummary(config);
      if (config.paid) { setState("approved"); setMessage("Peman sa a deja konfime ✅"); return; }
      if (!config.public_key) throw new Error("Public Key Mercado Pago a pa configuré");
      await new Promise<void>((resolve, reject) => {
        if (window.MercadoPago) return resolve();
        const script = document.createElement("script"); script.src = "https://sdk.mercadopago.com/js/v2";
        script.onload = () => resolve(); script.onerror = () => reject(new Error("Mercado Pago pa chaje")); document.head.appendChild(script);
      });
      const mp = new window.MercadoPago(config.public_key, { locale: "es-MX" });
      controller = await mp.bricks().create("payment", "paymentBrick_container", {
        initialization: { amount: config.amount, preferenceId: config.preference_id },
        customization: {
          paymentMethods: {
            creditCard: "all",
            debitCard: "all",
            prepaidCard: "all",
            ticket: "all",
            bankTransfer: "all",
            atm: "all",
            mercadoPago: "all",
          },
        },
        callbacks: {
          onReady: () => { setState("ready"); setMessage(""); },
          onError: (error: unknown) => { console.error(error); trackJourney("payment_failed", { source: "payment", orderId: order, metadata: { stage: "brick" } }); setState("error"); setMessage("Fòm Mercado Pago a pa chaje. Tanpri rafrechi paj la."); },
          onSubmit: async ({ selectedPaymentMethod, formData }: { selectedPaymentMethod: string; formData: Record<string, unknown> }) => {
            trackJourney("payment_method_selected", { source: "payment", orderId: order, metadata: { method: selectedPaymentMethod } });
            trackJourney("payment_submitted", { source: "payment", orderId: order, metadata: { method: selectedPaymentMethod } });
            setState("loading"); setMessage("N ap verifye peman an…");
            const pay = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ order, checkout_token: token, selected_payment_method: selectedPaymentMethod, payment_data: formData }) });
            const result = await pay.json();
            if (!pay.ok) { trackJourney("payment_failed", { source: "payment", orderId: order, metadata: { method: selectedPaymentMethod } }); setState("error"); setMessage(result.error || "Peman an pa pase. Verifye enfòmasyon yo."); throw new Error(result.error); }
            if (result.status === "approved") { trackJourney("payment_approved", { source: "payment", orderId: order, metadata: { method: selectedPaymentMethod } }); setState("approved"); setMessage("Peman konfime ✅ N ap voye konfimasyon an sou WhatsApp."); }
            else if (result.status === "pending") {
              setState("pending");
              setMessage("Peman an an atant. Swiv enstriksyon Mercado Pago yo; n ap avèti w sou WhatsApp lè li konfime.");
              if (result.payment_url) window.location.assign(result.payment_url);
            } else { setState("error"); setMessage("Peman an pa apwouve. Eseye yon lòt metòd oswa kontakte nou."); }
          },
        },
      });
    })().catch((error) => { setState("error"); setMessage(error instanceof Error ? error.message : "Nou pa ka louvri peman an."); });
    return () => controller?.unmount();
  }, [order, token]);

  return <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-950"><div className="mx-auto max-w-xl rounded-3xl bg-white p-6 shadow-xl">
    <h1 className="text-2xl font-black">Peman sekirize</h1>
    {summary && <div className="my-5 rounded-2xl bg-blue-50 p-4"><p>Kòmand: <b>{summary.order_number}</b></p><p className="text-xl">Total: <b>${summary.amount.toFixed(2)} MXN</b></p></div>}
    {message && <p className={`my-4 rounded-xl p-3 ${state === "error" ? "bg-red-50 text-red-800" : state === "approved" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50"}`}>{message}</p>}
    <div id="paymentBrick_container" className={state === "approved" ? "hidden" : ""} />
    <p className="mt-5 text-sm text-slate-500">🔒 Mercado Pago pwoteje peman ou. Ou ka chwazi kat, SPEI, OXXO/lajan kach oswa kont Mercado Pago selon opsyon ki disponib.</p>
  </div></main>;
}
