"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, Boxes, CheckCircle2, CircleDollarSign, CreditCard, LayoutDashboard, LogOut, Megaphone, Menu, Plus, RefreshCw, Search, Settings2, ShoppingBag, Truck, Users, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Section = "dashboard" | "finances" | "stock" | "livraisons" | "commandes" | "marketing" | "integrations";
type Row = Record<string, unknown>;
type Data = { orders: Row[]; customers: Row[]; locations: Row[]; movements: Row[]; batches: Row[]; payments: Row[]; shipments: Row[]; budgets: Row[]; campaigns: Row[]; integrations: Row[]; secretStatuses: Row[] };
const emptyData: Data = { orders: [], customers: [], locations: [], movements: [], batches: [], payments: [], shipments: [], budgets: [], campaigns: [], integrations: [], secretStatuses: [] };

const menu = [
  ["dashboard", "Vue d’ensemble", LayoutDashboard], ["finances", "Finances", CircleDollarSign], ["stock", "Stock & production", Boxes], ["livraisons", "Livraisons", Truck], ["commandes", "Clients & commandes", Users], ["marketing", "Marketing", Megaphone], ["integrations", "API & intégrations", Settings2],
] as const;
const pesos = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
const date = (value: unknown) => value ? new Intl.DateTimeFormat("fr-MX", { dateStyle: "medium" }).format(new Date(String(value))) : "—";
const money = (value: unknown) => pesos.format(Number(value ?? 0));
const str = (value: unknown) => String(value ?? "");
const orderStatus: Record<string, string> = { pending: "En attente", payment_pending: "Paiement en attente", paid: "Payée", preparing: "Préparation", shipped: "Expédiée", delivered: "Livrée", cancelled: "Annulée", refunded: "Remboursée" };
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
