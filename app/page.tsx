"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpen, Check, ChevronLeft, ChevronRight, Download, MapPin, MessageCircle, Minus, PackageCheck, Plus, ShieldCheck, ShoppingBag, Truck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

const PRICE = 625;
const productImages = [
  { src: "/pale-panyol-fasil-cover.jpg?v=2", label: "Couverture" },
  { src: "/pale-panyol-fasil-cover.jpg?v=2", label: "Vue du livre" },
  { src: "/pale-panyol-fasil-cover.jpg?v=2", label: "Présentation" },
];
const deliveryOptions = [
  { id: "pickup-cdmx", title: "Retrait à Ciudad de México", detail: "Point de retrait confirmé après la commande", price: 0, icon: MapPin },
  { id: "pickup-tapachula", title: "Retrait à Tapachula", detail: "Point de retrait confirmé après la commande", price: 0, icon: PackageCheck },
  { id: "shipping", title: "Livraison partout au Mexique", detail: "Tarif calculé selon le code postal", price: null, icon: Truck },
];

export default function Home() {
  const [activeImage, setActiveImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [delivery, setDelivery] = useState("pickup-cdmx");
  const [postalCode, setPostalCode] = useState("");
  const [shippingPrice, setShippingPrice] = useState<number | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatStep, setChatStep] = useState<"welcome" | "delivery" | "payment">("welcome");
  const total = useMemo(() => PRICE * quantity + (shippingPrice ?? 0), [quantity, shippingPrice]);
  const calculateShipping = () => { if (/^\d{5}$/.test(postalCode)) setShippingPrice(149); };

  useEffect(() => {
    const context = (document as unknown as { modelContext?: { registerTool?: (tool: unknown, options?: { signal: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(context.registerTool({
      name: "configure_book_order",
      title: "Préparer une commande",
      description: "Configure la quantité et le mode de réception du livre Pale Panyol Fasil, puis ouvre le récapitulatif avant paiement.",
      inputSchema: {
        type: "object",
        properties: {
          quantity: { type: "integer", minimum: 1, maximum: 20 },
          delivery: { type: "string", enum: ["pickup-cdmx", "pickup-tapachula", "shipping"] },
        },
        required: ["quantity", "delivery"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input: unknown) {
        const order = input as { quantity?: number; delivery?: string };
        if (!Number.isInteger(order.quantity) || !order.quantity || order.quantity < 1 || order.quantity > 20 || !deliveryOptions.some((item) => item.id === order.delivery)) throw new Error("Commande invalide");
        setQuantity(order.quantity);
        setDelivery(order.delivery!);
        setCheckoutOpen(true);
        return { status: "ready_for_review", quantity: order.quantity, delivery: order.delivery, subtotal_mxn: PRICE * order.quantity };
      },
    }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, []);

  return (
    <main className="min-h-screen bg-[#f7f5f0] text-[#12233f]">
      <header className="sticky top-0 z-30 border-b border-[#12233f]/10 bg-[#f7f5f0]/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-8">
          <a href="#inicio" className="flex items-center gap-3" aria-label="Accueil Pale Panyol Fasil">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-[#123f91] text-white"><BookOpen size={20} /></span>
            <span className="font-serif text-xl font-bold tracking-tight">Pale Panyol Fasil</span>
          </a>
          <nav className="hidden items-center gap-7 text-sm font-semibold md:flex"><a href="#livre" className="hover:text-[#df482f]">Le livre</a><a href="#contenu" className="hover:text-[#df482f]">Pourquoi ce livre</a><a href="#livraison" className="hover:text-[#df482f]">Livraison</a></nav>
          <Button onClick={() => setCheckoutOpen(true)} className="rounded-full bg-[#df482f] px-5 text-white hover:bg-[#c83c27]"><ShoppingBag className="mr-2 h-4 w-4" /> Commander</Button>
        </div>
      </header>

      <section id="inicio" className="mx-auto grid max-w-7xl gap-10 px-5 py-10 lg:grid-cols-[1.05fr_.95fr] lg:px-8 lg:py-16">
        <div className="relative aspect-[4/3] self-start overflow-hidden rounded-[2rem] bg-[#123f91] shadow-2xl shadow-blue-950/15">
          <img src={productImages[activeImage].src} alt={`${productImages[activeImage].label} du livre Pale Panyol Fasil`} className="absolute inset-0 h-full w-full object-contain object-center" />
          <button onClick={() => setActiveImage((activeImage + 2) % 3)} aria-label="Photo précédente" className="absolute left-4 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/90 shadow"><ChevronLeft /></button>
          <button onClick={() => setActiveImage((activeImage + 1) % 3)} aria-label="Photo suivante" className="absolute right-4 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/90 shadow"><ChevronRight /></button>
          <div className="absolute bottom-4 left-4 rounded-full bg-white/90 px-4 py-2 text-sm font-bold">{activeImage + 1} / 3 · {productImages[activeImage].label}</div>
        </div>
        <div id="livre" className="flex flex-col justify-center">
          <p className="mb-3 text-sm font-extrabold uppercase tracking-[.18em] text-[#df482f]">Apprendre l’espagnol simplement</p>
          <h1 className="font-serif text-5xl font-black leading-[.96] tracking-tight sm:text-6xl">Pale Panyol<br /><span className="text-[#123f91]">Fasil</span></h1>
          <p className="mt-4 text-sm font-bold text-[#123f91]">Par Dieudonné Almonord · Édition brochée</p>
          <p className="mt-5 max-w-xl text-lg leading-8 text-[#44516a]">Un guide pratique pensé pour les Haïtiens qui vivent au Mexique ou au Chili et qui veulent comprendre, parler et utiliser l’espagnol avec confiance dans la vie quotidienne.</p>
          <div className="mt-6 flex flex-wrap gap-2">{["278 pages", "Espagnol expliqué en créole", "Exercices pratiques", "Couverture souple"].map((item) => <span key={item} className="rounded-full border border-[#123f91]/15 bg-white px-4 py-2 text-sm font-bold">{item}</span>)}</div>
          <div className="mt-8 flex items-end justify-between border-y border-[#12233f]/10 py-6">
            <div><p className="text-sm text-[#667085]">Prix du livre</p><p className="text-4xl font-black">$625 <span className="text-base font-semibold">MXN</span></p></div>
            <div className="flex items-center rounded-full border border-[#12233f]/15 bg-white p-1"><button aria-label="Diminuer la quantité" onClick={() => setQuantity(Math.max(1, quantity - 1))} className="grid h-10 w-10 place-items-center rounded-full hover:bg-[#f1eee7]"><Minus size={17} /></button><span className="w-10 text-center font-bold">{quantity}</span><button aria-label="Augmenter la quantité" onClick={() => setQuantity(quantity + 1)} className="grid h-10 w-10 place-items-center rounded-full hover:bg-[#f1eee7]"><Plus size={17} /></button></div>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2"><Button onClick={() => setCheckoutOpen(true)} className="h-14 rounded-full bg-[#df482f] text-base font-bold text-white hover:bg-[#c83c27]">Commander maintenant</Button><Button variant="outline" className="h-14 rounded-full border-[#123f91]/25 bg-white text-base font-bold text-[#123f91]"><Download className="mr-2 h-5 w-5" /> Télécharger un aperçu</Button></div>
          <p className="mt-4 flex items-center gap-2 text-sm text-[#667085]"><ShieldCheck size={17} className="text-emerald-600" /> Paiement sécurisé avec Mercado Pago</p>
        </div>
      </section>

      <section id="contenu" className="bg-[#102c64] text-white"><div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 lg:grid-cols-2 lg:px-8"><div><p className="text-sm font-bold uppercase tracking-[.18em] text-[#ff8b70]">Poukisa liv sa a?</p><h2 className="mt-3 max-w-xl font-serif text-4xl font-black leading-tight sm:text-5xl">Panyòl la eksplike nan lang ou konprann.</h2><p className="mt-6 max-w-xl text-lg leading-8 text-white/75">Liv la fèt pou ede w kominike chak jou nan travay, lekòl, lopital, mache oswa nan lari. Li sèvi ak yon metòd senp, egzanp ki soti nan lavi reyèl ak egzèsis ou ka pratike.</p></div><div className="grid gap-4 sm:grid-cols-2">{["Vokabilè pratik pou Meksik ak Chili", "Konjigasyon vèb ak fraz senp", "Dyalòg pou sitiyasyon reyèl", "Egzèsis ak repons pou verifye pwogrè w"].map((text, i) => <div key={text} className="rounded-2xl border border-white/15 bg-white/8 p-5"><span className="mb-4 grid h-8 w-8 place-items-center rounded-full bg-[#df482f] text-sm font-black">{i + 1}</span><p className="font-semibold leading-6">{text}</p></div>)}</div></div></section>

      <section className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
        <p className="text-sm font-extrabold uppercase tracking-[.18em] text-[#df482f]">Détails du livre</p>
        <h2 className="mt-2 font-serif text-4xl font-black">Informations de l’édition</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[{label:"Auteur",value:"Dieudonné Almonord"},{label:"Pages",value:"278 pages"},{label:"Publication",value:"18 juin 2025"},{label:"Dimensions",value:"15,24 × 1,6 × 22,86 cm"},{label:"ISBN-13",value:"979-8288509094"}].map((detail) => <div key={detail.label} className="rounded-2xl bg-white p-5 shadow-sm"><p className="text-sm font-semibold text-[#667085]">{detail.label}</p><p className="mt-2 font-black leading-6">{detail.value}</p></div>)}
        </div>
      </section>

      <section id="livraison" className="mx-auto max-w-7xl px-5 pb-16 lg:px-8">
        <div className="mb-8 flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="text-sm font-extrabold uppercase tracking-[.18em] text-[#df482f]">Livraison flexible</p><h2 className="mt-2 font-serif text-4xl font-black">Choisissez comment recevoir votre livre</h2></div><p className="max-w-md text-[#667085]">Retirez-le gratuitement ou faites calculer la livraison nationale selon votre adresse.</p></div>
        <RadioGroup value={delivery} onValueChange={(value) => { setDelivery(value); if (value !== "shipping") setShippingPrice(null); }} className="grid gap-4 lg:grid-cols-3">{deliveryOptions.map(({ id, title, detail, price, icon: Icon }) => <label key={id} htmlFor={id} className={`cursor-pointer rounded-2xl border-2 bg-white p-6 transition ${delivery === id ? "border-[#123f91] shadow-lg" : "border-transparent hover:border-[#123f91]/20"}`}><div className="flex items-start justify-between"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#eaf0fc] text-[#123f91]"><Icon /></span><RadioGroupItem value={id} id={id} /></div><h3 className="mt-5 text-lg font-black">{title}</h3><p className="mt-2 min-h-12 text-sm leading-6 text-[#667085]">{detail}</p><p className="mt-4 font-black text-[#123f91]">{price === 0 ? "Gratuit" : "Calcul automatique"}</p></label>)}</RadioGroup>
        {delivery === "shipping" && <div className="mt-5 flex max-w-lg gap-3 rounded-2xl bg-white p-4 shadow-sm"><input value={postalCode} onChange={(e) => setPostalCode(e.target.value.replace(/\D/g, "").slice(0, 5))} inputMode="numeric" placeholder="Code postal à 5 chiffres" className="min-w-0 flex-1 rounded-xl border border-[#12233f]/15 px-4 outline-none focus:border-[#123f91]" /><Button onClick={calculateShipping} className="rounded-xl bg-[#123f91]">Calculer</Button>{shippingPrice !== null && <span className="self-center whitespace-nowrap font-black">${shippingPrice} MXN</span>}</div>}
      </section>

      <footer className="border-t border-[#12233f]/10 px-5 py-8"><div className="mx-auto flex max-w-7xl flex-col justify-between gap-3 text-sm text-[#667085] sm:flex-row"><p>© 2026 Pale Panyol Fasil</p><p>Livraison au Mexique · Paiement sécurisé</p></div></footer>

      <button onClick={() => setChatOpen(true)} className="fixed bottom-5 right-5 z-40 flex items-center gap-3 rounded-full bg-[#1da851] px-5 py-4 font-bold text-white shadow-xl hover:bg-[#168b42]" aria-label="Ouvrir le conseiller WhatsApp"><MessageCircle /> <span className="hidden sm:inline">Commander sur WhatsApp</span></button>
      {chatOpen && <div className="fixed bottom-5 right-5 z-50 w-[min(390px,calc(100vw-24px))] overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-black/10"><div className="flex items-center justify-between bg-[#075e54] p-4 text-white"><div><p className="font-black">Conseiller Pale Panyol</p><p className="text-xs text-white/75">Réponse automatique · en ligne</p></div><button onClick={() => setChatOpen(false)} aria-label="Fermer"><X /></button></div><div className="min-h-52 space-y-3 bg-[#efe9df] p-4 text-sm"><div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-white p-3 shadow-sm">Bonjou 👋 Je peux vous aider à commander <b>Pale Panyol Fasil</b>. Le livre coûte <b>$625 MXN</b>.</div>{chatStep !== "welcome" && <div className="ml-auto max-w-[80%] rounded-2xl rounded-tr-sm bg-[#d9fdd3] p-3 shadow-sm">Je souhaite commander le livre.</div>}{chatStep === "payment" && <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-white p-3 shadow-sm">Parfait ! Choisissez votre livraison, puis je vous conduirai au paiement sécurisé Mercado Pago.</div>}</div><div className="grid gap-2 p-3">{chatStep === "welcome" && <Button onClick={() => setChatStep("delivery")} className="bg-[#1da851]">Oui, je veux commander</Button>}{chatStep === "delivery" && <><Button onClick={() => setChatStep("payment")} className="bg-[#1da851]">Retrait à Ciudad de México</Button><Button onClick={() => setChatStep("payment")} variant="outline">Retrait à Tapachula</Button><Button onClick={() => setChatStep("payment")} variant="outline">Livraison nationale</Button></>}{chatStep === "payment" && <Button onClick={() => { setChatOpen(false); setCheckoutOpen(true); }} className="bg-[#123f91]">Continuer la commande</Button>}</div></div>}

      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}><DialogContent className="max-w-lg overflow-hidden rounded-3xl p-0"><DialogHeader className="bg-[#102c64] p-6 text-left text-white"><DialogTitle className="font-serif text-3xl">Votre commande</DialogTitle></DialogHeader><div className="space-y-5 p-6"><div className="flex items-center justify-between"><div><p className="font-black">Pale Panyol Fasil</p><p className="text-sm text-[#667085]">{quantity} exemplaire{quantity > 1 ? "s" : ""}</p></div><p className="text-xl font-black">${PRICE * quantity} MXN</p></div><div className="rounded-2xl bg-[#f4f6fa] p-4"><p className="text-sm font-bold">Mode de réception</p><p className="mt-1 text-sm text-[#667085]">{deliveryOptions.find((option) => option.id === delivery)?.title}</p></div><div className="flex items-center justify-between border-t pt-5"><span className="font-bold">Total</span><span className="text-2xl font-black">${total} MXN</span></div><Button className="h-14 w-full rounded-full bg-[#009ee3] text-base font-black text-white hover:bg-[#008ac5]">Payer avec Mercado Pago</Button><div className="grid grid-cols-3 gap-2 text-center text-xs text-[#667085]">{["Paiement confirmé", "Reçu automatique", "Suivi envoyé"].map((text) => <div key={text}><Check className="mx-auto mb-1 h-4 w-4 text-emerald-600" />{text}</div>)}</div></div></DialogContent></Dialog>
    </main>
  );
}
