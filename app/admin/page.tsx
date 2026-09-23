"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Activity, BookOpen, Boxes, CheckCircle2, CircleDollarSign, CreditCard, LayoutDashboard, LogOut, Megaphone, Menu, MousePointerClick, Plus, RefreshCw, Search, Settings2, ShoppingBag, Truck, Users, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Section = "dashboard" | "journey" | "sales" | "finances" | "stock" | "livraisons" | "commandes" | "marketing" | "integrations";
type Row = Record<string, unknown>;
type Data = { orders: Row[]; customers: Row[]; locations: Row[]; movements: Row[]; batches: Row[]; payments: Row[]; shipments: Row[]; budgets: Row[]; campaigns: Row[]; integrations: Row[]; secretStatuses: Row[]; salesSettings: Row | null; journeyEvents: Row[]; conversations: Row[]; messages: Row[] };
const emptyData: Data = { orders: [], customers: [], locations: [], movements: [], batches: [], payments: [], shipments: [], budgets: [], campaigns: [], integrations: [], secretStatuses: [], salesSettings: null, journeyEvents: [], conversations: [], messages: [] };

const menu = [
  ["dashboard", "Vue d’ensemble", LayoutDashboard], ["journey", "Parcours clients", Activity], ["sales", "Livre & vente", BookOpen], ["finances", "Finances", CircleDollarSign], ["stock", "Stock & production", Boxes], ["livraisons", "Livraisons", Truck], ["commandes", "Clients & commandes", Users], ["marketing", "Marketing", Megaphone], ["integrations", "API & intégrations", Settings2],
] as const;
const pesos = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
const date = (value: unknown) => value ? new Intl.DateTimeFormat("fr-MX", { dateStyle: "medium" }).format(new Date(String(value))) : "—";
const money = (value: unknown) => pesos.format(Number(value ?? 0));
const str = (value: unknown) => String(value ?? "");
const orderStatus: Record<string, string> = { pending: "En attente", payment_pending: "Paiement en attente", paid: "Payée", preparing: "Préparation", shipped: "Expédiée", delivered: "Livrée", cancelled: "Annulée", refunded: "Remboursée" };
const journeyLabels: Record<string, string> = { page_view: "Visite du site", book_photo_view: "Photo consultée", summary_download: "Résumé téléchargé", whatsapp_opened: "WhatsApp ouvert", order_started: "Commande commencée", delivery_selected: "Livraison choisie", shipping_quote_requested: "Tarif demandé", shipping_quote_received: "Tarif reçu", checkout_created: "Commande créée", payment_page_view: "Page de paiement", payment_method_selected: "Moyen de paiement choisi", payment_submitted: "Paiement envoyé", payment_approved: "Paiement approuvé", payment_failed: "Paiement échoué" };
const conversationSteps: Record<string, string> = { welcome: "Accueil", delivery: "Livraison", address: "Adresse", quote: "Tarifs", payment: "Paiement", tracking: "Suivi", completed: "Terminée", stopped: "Arrêtée" };
const shipmentStatus: Record<string, string> = { pending: "En attente", label_created: "Étiquette créée", picked_up: "Collectée", in_transit: "En transit", out_for_delivery: "En livraison", delivered: "Livrée", exception: "Incident", cancelled: "Annulée" };
const productionStatus: Record<string, string> = { planned: "Planifié", approved: "Approuvé", printing: "Impression", received: "Reçu", cancelled: "Annulé" };
const campaignStatus: Record<string, string> = { draft: "Brouillon", active: "Active", paused: "En pause", completed: "Terminée" };
const providerNames: Record<string, string> = { mercado_pago: "Mercado Pago", stripe: "Stripe", whatsapp: "WhatsApp Business", openai: "OpenAI", claude: "Claude", shipping: "API de livraison", cash: "Espèces", transfer: "Virement", other: "Autre" };
const providerFields: Record<string, Array<{ key: string; label: string; placeholder?: string; secret?: boolean }>> = {
  mercado_pago: [{ key: "access_token", label: "Access Token", secret: true }, { key: "webhook_secret", label: "Signature du webhook", secret: true }],
  stripe: [{ key: "secret_key", label: "Clé secrète", secret: true }, { key: "webhook_secret", label: "Secret du webhook", secret: true }],
  whatsapp: [{ key: "access_token", label: "Token permanent Meta", secret: true }, { key: "phone_number_id", label: "Phone Number ID" }, { key: "api_version", label: "Version API", placeholder: "v23.0" }, { key: "verify_token", label: "Verify Token", secret: true }, { key: "app_secret", label: "Meta App Secret", secret: true }],
  openai: [{ key: "api_key", label: "Clé API OpenAI", secret: true }, { key: "model", label: "Modèle", placeholder: "gpt-4o-mini" }],
  claude: [{ key: "api_key", label: "Clé API Anthropic", secret: true }, { key: "model", label: "Modèle Claude" }],
  shipping: [{ key: "api_url", label: "URL de l’API" }, { key: "api_key", label: "Clé API", secret: true }],
};

function values(form: HTMLFormElement) {
  return Object.fromEntries(new FormData(form).entries());
}

async function api(method: "POST" | "PATCH", payload: Row) {
  const response = await fetch("/api/admin/data", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Opération impossible");
  return result;
}

export default function AdminPage() {
  const router = useRouter();
  const [section, setSection] = useState<Section>("dashboard");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [data, setData] = useState<Data>(emptyData);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/data", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Chargement impossible");
      setData(result);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Chargement impossible"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    let active = true;
    void fetch("/api/admin/data", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Chargement impossible");
        if (active) setData(result);
      })
      .catch((error: unknown) => { if (active) setNotice(error instanceof Error ? error.message : "Chargement impossible"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const run = async (method: "POST" | "PATCH", payload: Row, success: string, form?: HTMLFormElement) => {
    setSaving(true);
    try { await api(method, payload); form?.reset(); await load(); setNotice(success); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Opération impossible"); }
    finally { setSaving(false); window.setTimeout(() => setNotice(""), 3500); }
  };
  const submit = (action: string, method: "POST" | "PATCH", success: string) => (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = event.currentTarget; void run(method, { action, ...values(form) }, success, form);
  };

  const totalStock = data.locations.reduce((sum, item) => sum + Number(item.quantity_on_hand ?? 0), 0);
  const approved = data.payments.filter((item) => item.status === "approved");
  const grossRevenue = approved.reduce((sum, item) => sum + Number(item.amount_mxn ?? 0), 0);
  const fees = approved.reduce((sum, item) => sum + Number(item.fee_mxn ?? 0), 0);
  const currentBudget = data.budgets[0];
  const filteredOrders = useMemo(() => data.orders.filter((item) => `${item.order_number} ${((item.customers as Row | null)?.full_name ?? "")} ${((item.customers as Row | null)?.city ?? "")}`.toLowerCase().includes(search.toLowerCase())), [data.orders, search]);
  const title = menu.find(([id]) => id === section)?.[1] ?? "Administration";
  const eventCount = (type: string) => data.journeyEvents.filter((event) => event.event_type === type).length;
  const uniqueSessions = new Set(data.journeyEvents.map((event) => str(event.session_id))).size;
  const orderStarts = eventCount("order_started"), checkouts = eventCount("checkout_created"), paymentViews = eventCount("payment_page_view");
  const pendingOrders = data.orders.filter((item) => item.status === "payment_pending").length;
  const activeConversations = data.conversations.filter((item) => !["completed", "tracking", "stopped"].includes(str(item.current_step))).length;
  const marketingSuggestions = [
    uniqueSessions >= 5 && orderStarts / uniqueSessions < .08 ? "Peu de visiteurs commencent une commande : placez une offre claire et un bouton Commander plus haut, avec le prix et la livraison visibles." : "Le bouton de commande attire correctement les visiteurs; testez maintenant deux variantes du texte pour améliorer encore le taux de clic.",
    orderStarts > 2 && checkouts / orderStarts < .45 ? "Beaucoup de clients quittent avant la création de la commande : simplifiez le formulaire et rassurez-les sur le paiement en espèces et les délais." : "Le passage du formulaire vers la commande est satisfaisant; concentrez les rappels sur les paiements non terminés.",
    pendingOrders > 0 ? `${pendingOrders} commande(s) attendent un paiement : relancez avec le même lien et expliquez clairement OXXO, 7-Eleven et SPEI.` : "Aucune commande en attente de paiement : privilégiez l’acquisition de nouveaux visiteurs.",
    activeConversations > 0 ? `${activeConversations} conversation(s) restent ouvertes : adaptez les relances au dernier sujet du client plutôt que d’envoyer un message générique.` : "Les conversations actives sont traitées; partagez davantage de témoignages et de pages réelles du livre.",
  ];

  const signOut = async () => { await createSupabaseBrowserClient().auth.signOut(); router.replace("/admin/login"); router.refresh(); };

  return <main className="min-h-screen bg-[#f4f6f9] text-slate-800">
    {notice && <div className="fixed right-4 top-4 z-[90] flex max-w-md items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white shadow-2xl"><CheckCircle2 size={17} className="text-emerald-400" />{notice}</div>}
    <aside className={`fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col bg-[#102c64] text-white transition-transform lg:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>
      <div className="flex h-20 items-center justify-between border-b border-white/10 px-5"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-[#123f91]"><BookOpen size={21} /></span><div><p className="font-serif text-lg font-black">Pale Panyol</p><p className="text-xs text-blue-100">Centre de contrôle</p></div></div><button onClick={() => setMobileOpen(false)} className="p-2 lg:hidden" aria-label="Fermer"><X /></button></div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-4">{menu.map(([id, label, Icon]) => <button key={id} onClick={() => { setSection(id); setMobileOpen(false); }} className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-bold ${section === id ? "bg-white text-[#123f91]" : "text-blue-50 hover:bg-white/10"}`}><Icon size={19} />{label}</button>)}</nav>
      <div className="border-t border-white/10 p-4"><Link href="/" className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold text-blue-50 hover:bg-white/10"><BookOpen size={18} />Boutique</Link><button onClick={() => void signOut()} className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold text-blue-50 hover:bg-white/10"><LogOut size={18} />Se déconnecter</button></div>
    </aside>
    {mobileOpen && <button className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Fermer" />}
    <div className="lg:pl-[280px]">
      <header className="sticky top-0 z-30 flex h-20 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-7"><div className="flex items-center gap-3"><button onClick={() => setMobileOpen(true)} className="rounded-xl border p-2.5 lg:hidden"><Menu size={20} /></button><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#df482f]">Administration</p><h1 className="text-xl font-black text-slate-950 sm:text-2xl">{title}</h1></div></div><button onClick={() => void load()} disabled={loading} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold"><RefreshCw size={16} className={loading ? "animate-spin" : ""} /><span className="hidden sm:inline">Actualiser</span></button></header>
      <div className="mx-auto max-w-[1500px] space-y-6 p-4 sm:p-7">
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"><b>Supabase actif :</b> toutes les opérations ci-dessous sont enregistrées dans la base réelle.</div>

        {section === "dashboard" && <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Revenu confirmé" value={money(grossRevenue)} icon={CircleDollarSign} /><Metric label="Commandes" value={String(data.orders.length)} icon={ShoppingBag} /><Metric label="Livres disponibles" value={String(totalStock)} icon={Boxes} /><Metric label="Clients" value={String(data.customers.length)} icon={Users} /></div>
          <Panel title="Commandes récentes" description="Données réelles Supabase"><Orders rows={data.orders.slice(0, 6)} onChange={(id, status) => void run("PATCH", { action: "order_status", id, status }, "Statut enregistré")} /></Panel>
        </>}

        {section === "journey" && <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <Metric label="Visiteurs suivis" value={String(uniqueSessions)} icon={MousePointerClick} />
            <Metric label="Commandes commencées" value={String(orderStarts)} icon={ShoppingBag} />
            <Metric label="Commandes créées" value={String(checkouts)} icon={CheckCircle2} />
            <Metric label="Pages de paiement" value={String(paymentViews)} icon={CreditCard} />
            <Metric label="Achats confirmés" value={String(Math.max(eventCount("payment_approved"), data.orders.filter((item) => item.status === "paid").length))} icon={CircleDollarSign} />
          </div>

          <Panel title="Entonnoir de conversion" description="Chaque étape montre où les visiteurs continuent ou abandonnent.">
            <div className="grid gap-3 p-5 md:grid-cols-5">{[
              ["Visites", uniqueSessions], ["Commande commencée", orderStarts], ["Commande créée", checkouts], ["Paiement ouvert", paymentViews], ["Achat confirmé", Math.max(eventCount("payment_approved"), data.orders.filter((item) => item.status === "paid").length)],
            ].map(([label, value], index) => <div key={String(label)} className="relative rounded-2xl border bg-slate-50 p-4"><p className="text-xs font-bold uppercase text-slate-500">Étape {index + 1}</p><p className="mt-2 text-2xl font-black text-slate-950">{String(value)}</p><p className="mt-1 text-sm font-bold">{String(label)}</p>{index > 0 && <p className="mt-2 text-xs text-slate-500">{uniqueSessions ? `${Math.round(Number(value) / uniqueSessions * 100)} % des visiteurs` : "Collecte en cours"}</p>}</div>)}</div>
          </Panel>

          <Panel title="Suggestions marketing automatiques" description="Recommandations recalculées selon les statistiques actuelles.">
            <div className="grid gap-3 p-5 md:grid-cols-2">{marketingSuggestions.map((suggestion, index) => <div key={suggestion} className="flex gap-3 rounded-2xl border border-red-100 bg-red-50/60 p-4"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#d20d20] text-sm font-black text-white">{index + 1}</span><p className="text-sm font-semibold leading-6 text-slate-800">{suggestion}</p></div>)}</div>
          </Panel>

          <Panel title="Parcours récents sur le site" description="Les 100 dernières actions, sans enregistrer d’adresse IP.">
            <DataTable headers={["Session", "Action", "Source", "Commande", "Date"]} rows={data.journeyEvents.slice(0, 100).map((item) => [str(item.session_id).slice(0, 8), journeyLabels[str(item.event_type)] ?? str(item.event_type), str(item.source), str(item.order_id), date(item.created_at)])} />
          </Panel>

          <Panel title="Parcours des conversations WhatsApp" description={`${activeConversations} conversation(s) encore active(s)`}>
            <DataTable headers={["Client", "Téléphone", "Étape actuelle", "Messages", "Dernier échange", "Relance", "Commande", "Dernière activité"]} rows={data.conversations.map((item) => { const conversationMessages = data.messages.filter((message) => message.conversation_id === item.id); const order = item.orders as Row | null; return [str(item.customer_first_name) || "Client", str(item.wa_phone), conversationSteps[str(item.current_step)] ?? str(item.current_step), String(conversationMessages.length), str(conversationMessages[0]?.content).slice(0, 80), str(item.reminder_stage), str(order?.order_number), date(item.last_message_at)]; })} />
          </Panel>
        </>}

        {section === "sales" && data.salesSettings && <SalesSettings item={data.salesSettings} saving={saving} onSubmit={submit("sales_settings", "PATCH", "Paramètres de vente enregistrés")} />}

        {section === "commandes" && <>
          <FormPanel title="Créer une commande" description="Le client et la commande seront créés ensemble." onSubmit={submit("create_order", "POST", "Commande créée")} saving={saving}>
            <Input name="fullName" label="Nom complet" required /><Input name="whatsapp" label="WhatsApp" /><Input name="email" label="E-mail" type="email" /><Input name="phone" label="Téléphone" /><Input name="city" label="Ville" /><Input name="state" label="État" /><Input name="postalCode" label="Code postal" /><Input name="address" label="Adresse" wide /><Select name="fulfillment" label="Mode de livraison" options={{ shipping: "Livraison", pickup_cdmx: "Retrait CDMX", pickup_tapachula: "Retrait Tapachula" }} /><Input name="quantity" label="Quantité" type="number" defaultValue="1" required /><Input name="unitPrice" label="Prix unitaire MXN" type="number" defaultValue="625" required /><Input name="shippingPrice" label="Livraison MXN" type="number" defaultValue="0" /><Select name="status" label="Statut initial" options={orderStatus} /><Input name="notes" label="Notes" wide />
          </FormPanel>
          <Panel title="Clients et commandes" description={`${filteredOrders.length} commande(s)`} action={<div className="relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} className="rounded-xl border py-2 pl-9 pr-3 text-sm" placeholder="Rechercher…" /></div>}><Orders rows={filteredOrders} onChange={(id, status) => void run("PATCH", { action: "order_status", id, status }, "Statut enregistré")} /></Panel>
        </>}

        {section === "finances" && <>
          <div className="grid gap-4 sm:grid-cols-3"><Metric label="Revenu approuvé" value={money(grossRevenue)} icon={CircleDollarSign} /><Metric label="Frais de paiement" value={money(fees)} icon={CreditCard} /><Metric label="Net encaissé" value={money(grossRevenue - fees)} icon={CheckCircle2} /></div>
          <FormPanel title="Enregistrer un paiement" description="Un paiement approuvé marque automatiquement la commande comme payée." onSubmit={submit("payment", "POST", "Paiement enregistré")} saving={saving}>
            <OrderSelect orders={data.orders} /><Select name="provider" label="Méthode" options={{ mercado_pago: "Mercado Pago", stripe: "Stripe", cash: "Espèces", transfer: "Virement", other: "Autre" }} /><Select name="status" label="Statut" options={{ approved: "Approuvé", pending: "En attente", rejected: "Refusé", refunded: "Remboursé", partially_refunded: "Remboursement partiel" }} /><Input name="amount" label="Montant MXN" type="number" required /><Input name="fee" label="Frais MXN" type="number" defaultValue="0" /><Input name="reference" label="Référence du paiement" wide />
          </FormPanel>
          <Panel title="Mouvements financiers"><DataTable headers={["Commande", "Méthode", "Statut", "Montant", "Frais", "Date"]} rows={data.payments.map((item) => [str((item.orders as Row | null)?.order_number), providerNames[str(item.provider)] ?? str(item.provider), str(item.status), money(item.amount_mxn), money(item.fee_mxn), date(item.created_at)])} /></Panel>
        </>}

        {section === "stock" && <>
          <div className="grid gap-4 md:grid-cols-2">{data.locations.map((location) => <div key={str(location.id)} className="rounded-2xl border bg-white p-5 shadow-sm"><p className="text-sm font-bold text-slate-500">{str(location.name)}</p><p className="mt-2 text-4xl font-black text-slate-950">{str(location.quantity_on_hand)}</p><p className="text-sm text-slate-500">{str(location.city)} · alerte à {str(location.reorder_level)}</p><div className="mt-4 flex flex-wrap gap-2">{[-1, 10, 25].map((delta) => <button key={delta} onClick={() => void run("PATCH", { action: "stock", locationId: location.id, delta }, "Stock mis à jour")} className={`rounded-xl px-4 py-2 text-sm font-bold ${delta > 0 ? "bg-[#123f91] text-white" : "border"}`}>{delta > 0 ? `+ ${delta}` : "− 1"}</button>)}</div></div>)}</div>
          <FormPanel title="Nouveau lot de production" onSubmit={submit("production", "POST", "Lot de production créé")} saving={saving}><Input name="batchNumber" label="Numéro du lot" required /><Input name="plannedQuantity" label="Quantité prévue" type="number" required /><Input name="unitCost" label="Coût unitaire MXN" type="number" /><Select name="status" label="Statut" options={productionStatus} /><Input name="supplier" label="Imprimeur / fournisseur" /><Input name="expectedAt" label="Réception prévue" type="date" /><Input name="notes" label="Notes" wide /></FormPanel>
          <Panel title="Lots de production"><div className="grid gap-3 p-5">{data.batches.map((batch) => <div key={str(batch.id)} className="grid gap-3 rounded-xl border p-4 md:grid-cols-[1fr_1fr_1fr_1fr]"><div><b>{str(batch.batch_number)}</b><p className="text-xs text-slate-500">Prévu : {str(batch.planned_quantity)}</p></div><InputInline type="number" defaultValue={str(batch.completed_quantity)} onBlur={(value) => void run("PATCH", { action: "production", id: batch.id, status: batch.status, completedQuantity: value }, "Production mise à jour")} /><select value={str(batch.status)} onChange={(e) => void run("PATCH", { action: "production", id: batch.id, status: e.target.value, completedQuantity: batch.completed_quantity }, "Production mise à jour")} className="rounded-xl border px-3 py-2">{Object.entries(productionStatus).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><span className="text-sm text-slate-500">Réception : {date(batch.expected_at)}</span></div>)}</div></Panel>
        </>}

        {section === "livraisons" && <>
          <FormPanel title="Créer ou mettre à jour une expédition" description="Le numéro de suivi et l’état seront liés à la commande." onSubmit={submit("shipment", "POST", "Expédition enregistrée")} saving={saving}><OrderSelect orders={data.orders} /><Input name="provider" label="Transporteur" required /><Input name="trackingNumber" label="Numéro de suivi" /><Select name="status" label="Statut" options={shipmentStatus} /><Input name="estimatedDelivery" label="Livraison estimée" type="date" /><Input name="labelUrl" label="URL de l’étiquette" wide /><Input name="lastEvent" label="Dernier événement" wide /></FormPanel>
          <Panel title="Suivi des expéditions"><DataTable headers={["Commande", "Client", "Transporteur", "Suivi", "Statut", "Livraison estimée"]} rows={data.shipments.map((item) => { const order = item.orders as Row | null; const customer = order?.customers as Row | null; return [str(order?.order_number), str(customer?.full_name), str(item.provider), str(item.tracking_number), shipmentStatus[str(item.status)] ?? str(item.status), date(item.estimated_delivery)]; })} /></Panel>
        </>}

        {section === "marketing" && <>
          <FormPanel title="Budget marketing mensuel" onSubmit={submit("marketing_budget", "PATCH", "Budget enregistré")} saving={saving}><Input name="month" label="Mois" type="date" defaultValue={str(currentBudget?.month ?? `${new Date().toISOString().slice(0, 7)}-01`)} required /><Input name="amount" label="Budget total MXN" type="number" defaultValue={str(currentBudget?.total_budget_mxn ?? 0)} required /><Input name="spent" label="Dépenses MXN" type="number" defaultValue={str(currentBudget?.spent_mxn ?? 0)} /><Input name="notes" label="Notes" wide /></FormPanel>
          <FormPanel title="Créer une campagne" onSubmit={submit("campaign", "POST", "Campagne créée")} saving={saving}><Input name="name" label="Nom de campagne" required /><Input name="channel" label="Canal" placeholder="Meta Ads, TikTok…" required /><Select name="status" label="Statut" options={campaignStatus} /><Input name="budget" label="Budget MXN" type="number" /><Input name="spent" label="Dépensé MXN" type="number" /><Input name="startsAt" label="Début" type="date" /><Input name="endsAt" label="Fin" type="date" /></FormPanel>
          <Panel title="Campagnes"><DataTable headers={["Campagne", "Canal", "Statut", "Budget", "Dépensé", "Conversions"]} rows={data.campaigns.map((item) => [str(item.name), str(item.channel), campaignStatus[str(item.status)] ?? str(item.status), money(item.budget_mxn), money(item.spent_mxn), str(item.conversions)])} /></Panel>
        </>}

        {section === "integrations" && <>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950"><b>Configuration directe :</b> enregistrez vos clés ici. Elles sont chiffrées dans Supabase Vault, ne sont jamais affichées après l’enregistrement et ne passent plus par Vercel.</div>
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950"><b>Webhook WhatsApp :</b> <span className="break-all font-mono">https://xvmvppfziiymqjvhciax.supabase.co/functions/v1/whatsapp-nadege</span></div>
          <div className="grid gap-4 lg:grid-cols-2">{data.integrations.map((integration) => <IntegrationCard key={str(integration.provider)} item={integration} statuses={data.secretStatuses.filter((status) => status.provider === integration.provider)} saving={saving} onSave={(payload) => void run("PATCH", { action: "integration", ...payload }, `${providerNames[str(integration.provider)]} mis à jour`)} onSecret={(payload) => void run("PATCH", { action: "integration_secret", ...payload }, "Clé chiffrée et enregistrée")} onDeleteSecret={(payload) => void run("PATCH", { action: "delete_integration_secret", ...payload }, "Clé supprimée")} />)}</div>
        </>}
      </div>
    </div>
  </main>;
}

function Metric({ label, value, icon: Icon }: { label: string; value: string; icon: typeof CircleDollarSign }) { return <div className="rounded-2xl border bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><p className="text-sm font-semibold text-slate-500">{label}</p><p className="mt-2 text-2xl font-black text-slate-950">{value}</p></div><span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-[#123f91]"><Icon size={19} /></span></div></div>; }
function Panel({ title, description, children, action }: { title: string; description?: string; children: React.ReactNode; action?: React.ReactNode }) { return <section className="overflow-hidden rounded-2xl border bg-white shadow-sm"><div className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-black text-slate-950">{title}</h2>{description && <p className="mt-1 text-sm text-slate-500">{description}</p>}</div>{action}</div>{children}</section>; }
function FormPanel({ title, description, onSubmit, saving, children }: { title: string; description?: string; onSubmit: (event: FormEvent<HTMLFormElement>) => void; saving: boolean; children: React.ReactNode }) { return <Panel title={title} description={description}><form onSubmit={onSubmit} className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4">{children}<button disabled={saving} className="flex items-center justify-center gap-2 rounded-xl bg-[#123f91] px-4 py-3 text-sm font-bold text-white sm:col-span-2 xl:col-span-4"><Plus size={17} />{saving ? "Enregistrement…" : "Enregistrer"}</button></form></Panel>; }
function Input({ name, label, wide, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { name: string; label: string; wide?: boolean }) { return <label className={`text-sm font-bold text-slate-700 ${wide ? "sm:col-span-2" : ""}`}>{label}<input name={name} {...props} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-[#123f91]" /></label>; }
function Select({ name, label, options }: { name: string; label: string; options: Record<string, string> }) { return <label className="text-sm font-bold text-slate-700">{label}<select name={name} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 font-normal">{Object.entries(options).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>; }
function OrderSelect({ orders }: { orders: Row[] }) { return <label className="text-sm font-bold text-slate-700">Commande<select name="orderId" required className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 font-normal"><option value="">Choisir…</option>{orders.map((item) => <option key={str(item.id)} value={str(item.id)}>{str(item.order_number)} · {str((item.customers as Row | null)?.full_name)}</option>)}</select></label>; }
function InputInline({ defaultValue, onBlur, type = "text" }: { defaultValue: string; onBlur: (value: string) => void; type?: string }) { return <input type={type} defaultValue={defaultValue} onBlur={(e) => onBlur(e.target.value)} className="rounded-xl border px-3 py-2" aria-label="Quantité complétée" />; }
function Orders({ rows, onChange }: { rows: Row[]; onChange: (id: string, status: string) => void }) { return <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr>{["Commande", "Client", "Ville", "Quantité", "Total", "Date", "Statut"].map((h) => <th key={h} className="px-5 py-3">{h}</th>)}</tr></thead><tbody>{rows.map((item) => { const customer = item.customers as Row | null; return <tr key={str(item.id)} className="border-t"><td className="px-5 py-4 font-black text-[#123f91]">{str(item.order_number)}</td><td className="px-5 py-4 font-bold">{str(customer?.full_name)}</td><td className="px-5 py-4">{str(customer?.city) || "—"}</td><td className="px-5 py-4">{str(item.quantity)}</td><td className="px-5 py-4 font-black">{money(item.total_mxn)}</td><td className="px-5 py-4">{date(item.created_at)}</td><td className="px-5 py-4"><select value={str(item.status)} onChange={(e) => onChange(str(item.id), e.target.value)} className="rounded-lg border px-2 py-2">{Object.entries(orderStatus).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></td></tr>; })}</tbody></table>{rows.length === 0 && <Empty />}</div>; }
function DataTable({ headers, rows }: { headers: string[]; rows: string[][] }) { return <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr>{headers.map((h) => <th key={h} className="px-5 py-3">{h}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${row[0]}-${index}`} className="border-t">{row.map((cell, i) => <td key={i} className={`px-5 py-4 ${i === 0 ? "font-bold text-slate-950" : ""}`}>{cell || "—"}</td>)}</tr>)}</tbody></table>{rows.length === 0 && <Empty />}</div>; }
function Empty() { return <div className="p-10 text-center text-sm text-slate-500">Aucune donnée enregistrée.</div>; }
function SalesSettings({ item, saving, onSubmit }: { item: Row; saving: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const list = (value: unknown) => Array.isArray(value) ? value.join("\n") : "";
  const [summaryUrl, setSummaryUrl] = useState(str(item.summary_pdf_url));
  const [videoUrl, setVideoUrl] = useState(str(item.homepage_video_url));
  const [photoUrls, setPhotoUrls] = useState<string[]>(Array.isArray(item.photo_urls) ? item.photo_urls.map(str).filter(Boolean) : []);
  const [uploading, setUploading] = useState("");
  const upload = async (file: File, folder: "summary" | "photos" | "video") => {
    setUploading(folder);
    try {
      const safeName = file.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]/g, "-");
      const path = `${folder}/${Date.now()}-${crypto.randomUUID()}-${safeName}`;
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.storage.from("book-media").upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      return supabase.storage.from("book-media").getPublicUrl(path).data.publicUrl;
    } finally { setUploading(""); }
  };
  return <Panel title="Configuration du livre et du parcours de vente" description="Ces données sont utilisées en temps réel par Nadège. N’ajoutez que des témoignages clients réels.">
    <form onSubmit={onSubmit} className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
      <Input name="bookPrice" label="Prix du livre (MXN)" type="number" step="0.01" defaultValue={str(item.book_price_mxn)} required />
      <Input name="bookPages" label="Nombre de pages" type="number" defaultValue={str(item.book_pages)} required />
      <Input name="bookChapters" label="Chapitres / sommaire" defaultValue={str(item.book_chapters)} wide />
      <input type="hidden" name="summaryPdfUrl" value={summaryUrl} />
      <input type="hidden" name="homepageVideoUrl" value={videoUrl} />
      <input type="hidden" name="photoUrls" value={photoUrls.join("\n")} />
      <MediaUpload label="Résumé PDF" accept="application/pdf" busy={uploading === "summary"} current={summaryUrl} onFiles={async (files) => { const url = await upload(files[0], "summary"); setSummaryUrl(url); }} onClear={() => setSummaryUrl("")} />
      <MediaUpload label="Vidéo d’accueil en créole" accept="video/mp4,video/webm,video/quicktime" busy={uploading === "video"} current={videoUrl} onFiles={async (files) => { const url = await upload(files[0], "video"); setVideoUrl(url); }} onClear={() => setVideoUrl("")} />
      <MediaUpload label="Photos réelles du livre" accept="image/jpeg,image/png,image/webp" multiple busy={uploading === "photos"} current={photoUrls.length ? `${photoUrls.length} photo(s) enregistrée(s)` : ""} onFiles={async (files) => { const urls: string[] = []; for (const file of files) urls.push(await upload(file, "photos")); setPhotoUrls((previous) => [...previous, ...urls]); }} onClear={() => setPhotoUrls([])} />
      <TextArea name="bookBenefits" label="Avantages réels — un par ligne" defaultValue={list(item.book_benefits)} />
      <TextArea name="testimonials" label="Expériences clients réelles — une par ligne" defaultValue={list(item.testimonials)} />
      <Input name="afterSalesWhatsapp" label="WhatsApp du service après-vente" type="tel" placeholder="+52 55 1234 5678" defaultValue={str(item.after_sales_whatsapp)} />
      <Input name="afterSalesEmail" label="E-mail du service après-vente" type="email" placeholder="contact@exemple.com" defaultValue={str(item.after_sales_email)} />
      <TextArea name="afterSalesService" label="Message du service après-vente" defaultValue={str(item.after_sales_service)} />
      <TextArea name="tapachulaDelivery" label="Livraison gratuite Tapachula" defaultValue={str(item.tapachula_delivery)} />
      <TextArea name="cdmxDelivery" label="Livraison gratuite CDMX / métro" defaultValue={str(item.cdmx_delivery)} />
      <TextArea name="otherZonesDelivery" label="Autres zones du Mexique" defaultValue={str(item.other_zones_delivery)} />
      <TextArea name="enviaCarriers" label="Transporteurs Envia — un par ligne" defaultValue={list(item.envia_carriers)} />
      <Input name="originPostalCode" label="CP d’expédition" defaultValue={str(item.origin_postal_code)} />
      <Input name="originCity" label="Ville d’expédition" defaultValue={str(item.origin_city)} />
      <Input name="originState" label="État d’expédition" defaultValue={str(item.origin_state)} />
      <Input name="originDistrict" label="Colonia d’expédition" defaultValue={str(item.origin_district)} />
      <Input name="originStreet" label="Rue d’expédition" defaultValue={str(item.origin_street)} />
      <Input name="originNumber" label="Numéro d’expédition" defaultValue={str(item.origin_number)} />
      <Input name="originPhone" label="Téléphone expéditeur" defaultValue={str(item.origin_phone)} />
      <Input name="packageWeight" label="Poids du colis (kg)" type="number" step="0.001" defaultValue={str(item.package_weight_kg)} />
      <Input name="packageLength" label="Longueur (cm)" type="number" step="0.01" defaultValue={str(item.package_length_cm)} />
      <Input name="packageWidth" label="Largeur (cm)" type="number" step="0.01" defaultValue={str(item.package_width_cm)} />
      <Input name="packageHeight" label="Hauteur (cm)" type="number" step="0.01" defaultValue={str(item.package_height_cm)} />
      <button disabled={saving} className="rounded-xl bg-[#123f91] px-4 py-3 font-bold text-white md:col-span-2 xl:col-span-4">{saving ? "Enregistrement…" : "Enregistrer le parcours de vente"}</button>
    </form>
  </Panel>;
}
function MediaUpload({ label, accept, multiple, busy, current, onFiles, onClear }: { label: string; accept: string; multiple?: boolean; busy: boolean; current: string; onFiles: (files: File[]) => Promise<void>; onClear: () => void }) {
  return <label className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm font-bold text-slate-700 md:col-span-2">
    <span>{label}</span>
    <input type="file" accept={accept} multiple={multiple} disabled={busy} onChange={(event) => { const files = Array.from(event.target.files ?? []); if (files.length) void onFiles(files).catch((error) => window.alert(error instanceof Error ? error.message : "Téléversement impossible")); event.currentTarget.value = ""; }} className="mt-3 block w-full text-sm font-normal file:mr-4 file:rounded-lg file:border-0 file:bg-[#123f91] file:px-4 file:py-2 file:font-bold file:text-white" />
    <span className="mt-2 flex items-center justify-between gap-3 text-xs font-normal text-slate-500"><span className="truncate">{busy ? "Téléversement…" : current || "Aucun fichier enregistré"}</span>{current && <button type="button" onClick={onClear} className="font-bold text-red-600">Retirer</button>}</span>
  </label>;
}
function TextArea({ name, label, defaultValue }: { name: string; label: string; defaultValue?: string }) { return <label className="text-sm font-bold text-slate-700 md:col-span-2"><span>{label}</span><textarea name={name} defaultValue={defaultValue} rows={4} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-[#123f91]" /></label>; }
function IntegrationCard({ item, statuses, saving, onSave, onSecret, onDeleteSecret }: { item: Row; statuses: Row[]; saving: boolean; onSave: (payload: Row) => void; onSecret: (payload: Row) => void; onDeleteSecret: (payload: Row) => void }) {
  const [enabled, setEnabled] = useState(Boolean(item.enabled));
  const [environment, setEnvironment] = useState(str(item.environment) || "sandbox");
  const [identifier, setIdentifier] = useState(str(item.public_identifier));
  const [webhook, setWebhook] = useState(Boolean(item.webhook_configured));
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const provider = str(item.provider);
  const configured = new Set(statuses.map((status) => str(status.secret_key)));
  return <div className="rounded-2xl border bg-white p-5 shadow-sm">
    <div className="flex items-start justify-between gap-3"><div><h2 className="font-black text-slate-950">{providerNames[provider] ?? provider}</h2><p className="mt-1 text-sm text-slate-500">{configured.size ? `${configured.size} paramètre(s) sécurisé(s)` : "Aucune clé configurée"}</p></div><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />Actif</label></div>
    <label className="mt-4 block text-sm font-bold">Identifiant public<input value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder={provider === "whatsapp" ? "+52…" : "ID public ou compte"} className="mt-2 w-full rounded-xl border px-4 py-3 font-normal" /></label>
    <div className="mt-4 grid grid-cols-2 gap-3"><select value={environment} onChange={(e) => setEnvironment(e.target.value)} className="rounded-xl border bg-white px-3 py-2"><option value="sandbox">Test / Sandbox</option><option value="production">Production</option></select><label className="flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold"><input type="checkbox" checked={webhook} onChange={(e) => setWebhook(e.target.checked)} />Webhook prêt</label></div>
    <button disabled={saving} onClick={() => onSave({ provider, enabled, environment, publicIdentifier: identifier, webhookConfigured: webhook })} className="mt-4 w-full rounded-xl bg-[#123f91] px-4 py-3 text-sm font-bold text-white">Enregistrer les réglages</button>
    <div className="mt-5 border-t pt-5"><p className="mb-3 text-xs font-black uppercase tracking-wider text-slate-500">Clés sécurisées</p><div className="space-y-3">{(providerFields[provider] ?? []).map((field) => <div key={field.key}><div className="mb-1 flex items-center justify-between"><label className="text-sm font-bold">{field.label}</label><span className={`text-xs font-bold ${configured.has(field.key) ? "text-emerald-700" : "text-slate-400"}`}>{configured.has(field.key) ? "✓ Configuré" : "Non configuré"}</span></div><div className="flex gap-2"><input type={field.secret ? "password" : "text"} autoComplete="off" value={secrets[field.key] ?? ""} onChange={(e) => setSecrets((current) => ({ ...current, [field.key]: e.target.value }))} placeholder={configured.has(field.key) ? "Saisir pour remplacer" : field.placeholder ?? "Saisir la valeur"} className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm" /><button disabled={saving || !(secrets[field.key] ?? "").trim()} onClick={() => { onSecret({ provider, key: field.key, value: secrets[field.key] }); setSecrets((current) => ({ ...current, [field.key]: "" })); }} className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">{configured.has(field.key) ? "Remplacer" : "Ajouter"}</button>{configured.has(field.key) && <button disabled={saving} onClick={() => onDeleteSecret({ provider, key: field.key })} className="rounded-xl border border-red-200 px-3 py-2 text-xs font-bold text-red-700">Supprimer</button>}</div></div>)}</div></div>
  </div>;
}
