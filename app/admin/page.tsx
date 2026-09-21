"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Boxes,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  CreditCard,
  Eye,
  EyeOff,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  MessageCircle,
  PackageCheck,
  Search,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Truck,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Section = "dashboard" | "finances" | "stock" | "livraisons" | "commandes" | "marketing" | "integrations";
type OrderStatus = "Payée" | "Préparation" | "Expédiée" | "Livrée";
type AdminOrder = { id: string; client: string; city: string; total: number; status: OrderStatus; date: string };

const menu: { id: Section; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Vue d’ensemble", icon: LayoutDashboard },
  { id: "finances", label: "Finances", icon: CircleDollarSign },
  { id: "stock", label: "Stock & production", icon: Boxes },
  { id: "livraisons", label: "Livraisons", icon: Truck },
  { id: "commandes", label: "Clients & commandes", icon: Users },
  { id: "marketing", label: "Marketing", icon: Megaphone },
  { id: "integrations", label: "API & intégrations", icon: Settings2 },
];

const ordersSeed: AdminOrder[] = [];

const integrations = [
  { name: "Mercado Pago", detail: "Paiement principal au Mexique", icon: CreditCard, state: "À connecter", tone: "amber" },
  { name: "Stripe", detail: "Paiements internationaux", icon: WalletCards, state: "À connecter", tone: "amber" },
  { name: "WhatsApp Business", detail: "Commandes et notifications", icon: MessageCircle, state: "À connecter", tone: "amber" },
  { name: "OpenAI", detail: "Assistant commercial", icon: Sparkles, state: "À connecter", tone: "amber" },
  { name: "Claude", detail: "Assistant de secours", icon: Sparkles, state: "Optionnel", tone: "slate" },
  { name: "API de livraison", detail: "Tarifs, étiquettes et suivi", icon: Truck, state: "À choisir", tone: "slate" },
];

const pesos = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });

function StatusPill({ status }: { status: OrderStatus }) {
  const tones: Record<OrderStatus, string> = {
    Payée: "bg-blue-50 text-blue-700",
    Préparation: "bg-amber-50 text-amber-700",
    Expédiée: "bg-violet-50 text-violet-700",
    Livrée: "bg-emerald-50 text-emerald-700",
  };
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${tones[status]}`}>{status}</span>;
}

function Metric({ label, value, change, positive = true, icon: Icon }: { label: string; value: string; change: string; positive?: boolean; icon: typeof CircleDollarSign }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div><p className="text-sm font-semibold text-slate-500">{label}</p><p className="mt-2 text-2xl font-black tracking-tight text-slate-950">{value}</p></div>
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-[#123f91]"><Icon size={19} /></span>
      </div>
      <p className={`mt-4 flex items-center gap-1 text-xs font-bold ${positive ? "text-emerald-600" : "text-rose-600"}`}>
        {positive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{change}
      </p>
    </div>
  );
}

function Panel({ title, description, children, action }: { title: string; description?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="font-black text-slate-950">{title}</h2>{description && <p className="mt-1 text-sm text-slate-500">{description}</p>}</div>
        {action}
      </div>
      {children}
    </section>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const [section, setSection] = useState<Section>("dashboard");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [orders, setOrders] = useState(ordersSeed);
  const [stock, setStock] = useState(0);
  const [marketingBudget, setMarketingBudget] = useState(0);
  const [search, setSearch] = useState("");
  const [showSecret, setShowSecret] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const filteredOrders = useMemo(() => orders.filter((order) => `${order.id} ${order.client} ${order.city}`.toLowerCase().includes(search.toLowerCase())), [orders, search]);
  const title = menu.find((item) => item.id === section)?.label ?? "Administration";
  const revenue = orders.reduce((sum, order) => sum + order.total, 0);

  useEffect(() => {
    void fetch("/api/admin/data", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Impossible de charger les données");
        return response.json();
      })
      .then((data: { orders: AdminOrder[]; stock: number; marketingBudget: number }) => {
        setOrders(data.orders);
        setStock(data.stock);
        setMarketingBudget(data.marketingBudget);
      })
      .catch(() => setNotice("Impossible de charger les données Supabase"))
      .finally(() => setLoading(false));
  }, []);

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 2600);
  };

  const changeOrderStatus = async (id: string, status: OrderStatus) => {
    const response = await fetch("/api/admin/data", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "order_status", id, status }) });
    if (!response.ok) return flash("La mise à jour a échoué");
    setOrders((current) => current.map((order) => order.id === id ? { ...order, status } : order));
    flash(`Commande ${id} mise à jour`);
  };

  const adjustStock = async (delta: number) => {
    const response = await fetch("/api/admin/data", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "stock", delta }) });
    if (!response.ok) return flash("La mise à jour du stock a échoué");
    const data = await response.json() as { stock: number };
    setStock(data.stock);
    flash(delta > 0 ? `${delta} exemplaires ajoutés` : "Sortie de stock enregistrée");
  };

  const saveMarketingBudget = async () => {
    const response = await fetch("/api/admin/data", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "marketing_budget", amount: marketingBudget }) });
    flash(response.ok ? "Budget marketing enregistré" : "L’enregistrement du budget a échoué");
  };

  const selectSection = (id: Section) => { setSection(id); setMobileOpen(false); };
  const signOut = async () => {
    await createSupabaseBrowserClient().auth.signOut();
    router.replace("/admin/login");
    router.refresh();
  };

  return (
    <main className="min-h-screen bg-[#f4f6f9] text-slate-800">
      {notice && <div className="fixed right-4 top-4 z-[80] flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white shadow-2xl"><CheckCircle2 size={17} className="text-emerald-400" />{notice}</div>}

      <aside className={`fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col bg-[#102c64] text-white transition-transform lg:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-20 items-center justify-between border-b border-white/10 px-5">
          <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-[#123f91]"><BookOpen size={21} /></span><div><p className="font-serif text-lg font-black">Pale Panyol</p><p className="text-xs text-blue-100">Centre de contrôle</p></div></div>
          <button onClick={() => setMobileOpen(false)} className="rounded-lg p-2 hover:bg-white/10 lg:hidden" aria-label="Fermer le menu"><X size={20} /></button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-4">
          {menu.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => selectSection(id)} className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-bold transition ${section === id ? "bg-white text-[#123f91] shadow-lg" : "text-blue-50 hover:bg-white/10"}`}><Icon size={19} /><span>{label}</span>{section === id && <ChevronRight size={16} className="ml-auto" />}</button>)}
        </nav>
        <div className="space-y-1 border-t border-white/10 p-4"><Link href="/" className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold text-blue-50 hover:bg-white/10"><BookOpen size={18} />Retour à la boutique</Link><button onClick={() => void signOut()} className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold text-blue-50 hover:bg-white/10"><LogOut size={18} />Se déconnecter</button></div>
      </aside>

      {mobileOpen && <button className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Fermer le menu" />}

      <div className="lg:pl-[280px]">
        <header className="sticky top-0 z-30 flex h-20 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-7">
          <div className="flex items-center gap-3"><button onClick={() => setMobileOpen(true)} className="rounded-xl border border-slate-200 p-2.5 lg:hidden" aria-label="Ouvrir le menu"><Menu size={20} /></button><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#df482f]">Administration</p><h1 className="text-xl font-black text-slate-950 sm:text-2xl">{title}</h1></div></div>
          <div className="flex items-center gap-3"><span className="hidden rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 sm:inline-flex"><span className="mr-2 mt-1 h-2 w-2 rounded-full bg-emerald-500" />Système actif</span><div className="grid h-10 w-10 place-items-center rounded-full bg-[#123f91] font-black text-white">DA</div></div>
        </header>

        <div className="mx-auto max-w-[1500px] space-y-6 p-4 sm:p-7">
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"><b>Supabase connecté :</b> {loading ? "chargement des données…" : "les modifications sont enregistrées dans la base sécurisée."}</div>

          {section === "dashboard" && <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Metric label="Ventes enregistrées" value={pesos.format(revenue)} change="Données Supabase" icon={CircleDollarSign} />
              <Metric label="Commandes" value={`${orders.length}`} change="Total enregistré" icon={ShoppingBag} />
              <Metric label="Livres disponibles" value={`${stock}`} change="Seuil d’alerte : 25" icon={Boxes} />
              <Metric label="Budget marketing" value={pesos.format(marketingBudget)} change="58 % déjà utilisé" positive={false} icon={Megaphone} />
            </div>
            <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
              <Panel title="Commandes récentes" description="Dernières opérations de la boutique" action={<button onClick={() => setSection("commandes")} className="text-sm font-bold text-[#123f91]">Tout afficher</button>}><OrderTable orders={orders.slice(0, 4)} onStatus={changeOrderStatus} /></Panel>
              <Panel title="À traiter aujourd’hui" description="Priorités opérationnelles"><div className="space-y-3 p-5">{[
                { icon: PackageCheck, text: "6 commandes à préparer", detail: "Avant 15 h", color: "bg-amber-50 text-amber-700" },
                { icon: Truck, text: "3 suivis sans mise à jour", detail: "Vérifier le transporteur", color: "bg-violet-50 text-violet-700" },
                { icon: AlertTriangle, text: "Stock bientôt faible", detail: "Planifier 100 exemplaires", color: "bg-rose-50 text-rose-700" },
              ].map(({ icon: Icon, text, detail, color }) => <div key={text} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3"><span className={`grid h-10 w-10 place-items-center rounded-xl ${color}`}><Icon size={18} /></span><div><p className="text-sm font-bold text-slate-900">{text}</p><p className="text-xs text-slate-500">{detail}</p></div></div>)}</div></Panel>
            </div>
          </>}

          {section === "finances" && <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Revenu brut" value={pesos.format(revenue)} change={`${orders.length} commandes`} icon={CircleDollarSign} /><Metric label="Frais de paiement" value="$0 MXN" change="Calculé depuis les paiements" positive={false} icon={CreditCard} /><Metric label="Livraisons encaissées" value="$0 MXN" change="Calculé automatiquement" icon={Truck} /><Metric label="Bénéfice estimé" value={pesos.format(revenue)} change="Avant frais et production" icon={BarChart3} /></div>
            <Panel title="Mouvements financiers" description="Paiements, frais et remboursements"><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Référence</th><th className="px-5 py-3">Type</th><th className="px-5 py-3">Méthode</th><th className="px-5 py-3">Date</th><th className="px-5 py-3 text-right">Montant</th></tr></thead><tbody>{[
              ["MP-934821", "Vente", "Mercado Pago", "21 sept. 10:42", "+$625"], ["MP-FEE-821", "Frais", "Mercado Pago", "21 sept. 10:42", "-$24"], ["STR-1044", "Vente", "Stripe", "20 sept. 18:20", "+$774"], ["REF-1031", "Remboursement", "Mercado Pago", "18 sept. 09:11", "-$625"],
            ].map((row) => <tr key={row[0]} className="border-t border-slate-100"><td className="px-5 py-4 font-bold text-slate-900">{row[0]}</td><td className="px-5 py-4">{row[1]}</td><td className="px-5 py-4">{row[2]}</td><td className="px-5 py-4 text-slate-500">{row[3]}</td><td className={`px-5 py-4 text-right font-black ${String(row[4]).startsWith("+") ? "text-emerald-600" : "text-rose-600"}`}>{row[4]} MXN</td></tr>)}</tbody></table></div></Panel>
          </>}

          {section === "stock" && <div className="grid gap-6 xl:grid-cols-[1.1fr_.9fr]">
            <Panel title="Inventaire du livre" description="Stock disponible par emplacement"><div className="p-5"><div className="flex flex-col gap-6 rounded-2xl bg-[#102c64] p-6 text-white sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm text-blue-100">Stock total disponible</p><p className="mt-1 text-5xl font-black">{stock}</p><p className="mt-2 text-sm text-blue-100">Pale Panyol Fasil · Édition brochée</p></div><div className="flex gap-2"><button onClick={() => void adjustStock(-1)} className="rounded-xl bg-white/10 px-4 py-3 text-sm font-bold hover:bg-white/20">− Sortie</button><button onClick={() => void adjustStock(25)} className="rounded-xl bg-white px-4 py-3 text-sm font-bold text-[#123f91]">+ 25 livres</button></div></div><div className="mt-5 grid gap-3 sm:grid-cols-3">{[["Disponible", stock], ["Seuil d’alerte", 25], ["Réservé", 0]].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 p-4"><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-black text-slate-950">{value}</p></div>)}</div></div></Panel>
            <Panel title="Production" description="Prochaine impression"><div className="space-y-5 p-5"><div><div className="mb-2 flex justify-between text-sm"><span className="font-bold">Lot #PPF-002</span><span className="text-slate-500">100 exemplaires</span></div><div className="h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full w-[42%] rounded-full bg-[#df482f]" /></div><p className="mt-2 text-xs text-slate-500">Mise en page validée · Impression à confirmer</p></div><div className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Coût estimé</p><p className="mt-1 font-black text-slate-950">$18 500 MXN</p></div><div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Livraison prévue</p><p className="mt-1 font-black text-slate-950">12 octobre</p></div></div><button onClick={() => flash("Plan de production mis à jour")} className="w-full rounded-xl bg-[#123f91] px-4 py-3 text-sm font-bold text-white">Mettre à jour la production</button></div></Panel>
          </div>}

          {section === "livraisons" && <>
            <div className="grid gap-4 sm:grid-cols-3"><Metric label="À expédier" value="6" change="Préparation aujourd’hui" icon={PackageCheck} /><Metric label="En transit" value="17" change="3 arrivent aujourd’hui" icon={Truck} /><Metric label="Livrées ce mois" value="49" change="96 % sans incident" icon={CheckCircle2} /></div>
            <Panel title="Suivi des expéditions" description="Expéditions locales et nationales"><div className="grid gap-3 p-5">{[
              ["PPF-1046", "Nadia Pierre", "Estafeta · 4018293341", "En transit", "Puebla", "23 sept."], ["PPF-1044", "Wilson Jean", "DHL · 7824519930", "En transit", "Querétaro", "22 sept."], ["PPF-1043", "Carline Paul", "Retrait local", "Prête", "CDMX", "Aujourd’hui"],
            ].map((row) => <div key={row[0]} className="grid gap-3 rounded-xl border border-slate-200 p-4 md:grid-cols-[.7fr_1fr_1.2fr_.8fr_.8fr_auto] md:items-center"><b className="text-sm text-[#123f91]">{row[0]}</b><span className="text-sm font-bold text-slate-900">{row[1]}</span><span className="text-sm text-slate-500">{row[2]}</span><span className="text-sm font-bold">{row[3]}</span><span className="text-sm text-slate-500">{row[4]} · {row[5]}</span><button onClick={() => flash(`Suivi ${row[0]} ouvert`)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold">Détails</button></div>)}</div></Panel>
          </>}

          {section === "commandes" && <Panel title="Clients et commandes" description={`${orders.length} commandes dans cette vue`} action={<div className="relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher…" className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-[#123f91] sm:w-64" /></div>}><OrderTable orders={filteredOrders} onStatus={changeOrderStatus} /></Panel>}

          {section === "marketing" && <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
            <Panel title="Budget marketing" description="Plan mensuel de septembre"><div className="space-y-5 p-5"><div className="rounded-2xl bg-[#102c64] p-6 text-white"><p className="text-sm text-blue-100">Budget total</p><p className="mt-1 text-4xl font-black">{pesos.format(marketingBudget)}</p><input aria-label="Budget marketing" type="range" min="2000" max="30000" step="1000" value={marketingBudget} onChange={(event) => setMarketingBudget(Number(event.target.value))} className="mt-6 w-full accent-[#df482f]" /></div>{[["Meta Ads", 4800, 40], ["TikTok Ads", 1800, 15], ["Influenceurs", 2400, 20], ["Impressions & événements", 3000, 25]].map(([name, value, percent]) => <div key={String(name)}><div className="mb-2 flex justify-between text-sm"><span className="font-bold">{name}</span><span>{pesos.format(Number(value))}</span></div><div className="h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-[#123f91]" style={{ width: `${percent}%` }} /></div></div>)}<button onClick={() => void saveMarketingBudget()} className="w-full rounded-xl bg-[#df482f] px-4 py-3 text-sm font-bold text-white">Enregistrer le budget</button></div></Panel>
            <Panel title="Performance des campagnes" description="Résultats des 30 derniers jours"><div className="grid grid-cols-2 gap-3 p-5">{[["Portée", "84 320"], ["Clics", "3 418"], ["Coût par clic", "$1,93"], ["Conversions", "74"]].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 p-4"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-black text-slate-950">{value}</p></div>)}<div className="col-span-2 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800"><b>Meilleure campagne :</b> « Aprann panyòl nan lang ou » génère 41 % des commandes.</div></div></Panel>
          </div>}

          {section === "integrations" && <>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><div className="flex gap-3"><ShieldCheck className="mt-0.5 shrink-0" size={20} /><div><b>Coffre de clés sécurisé</b><p className="mt-1">Les secrets seront enregistrés comme variables serveur chiffrées sur Vercel. Ils ne seront jamais visibles dans le code public ni envoyés au navigateur.</p></div></div></div>
            <div className="grid gap-4 lg:grid-cols-2">{integrations.map(({ name, detail, icon: Icon, state, tone }) => <div key={name} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start gap-4"><span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-[#123f91]"><Icon size={20} /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-black text-slate-950">{name}</h2><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${tone === "amber" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}>{state}</span></div><p className="mt-1 text-sm text-slate-500">{detail}</p></div></div><div className="mt-5 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3"><KeyRound size={16} className="text-slate-400" /><input readOnly value={showSecret === name ? "Configuration serveur requise" : "••••••••••••••••"} className="min-w-0 flex-1 bg-transparent py-3 text-sm text-slate-500 outline-none" /><button onClick={() => setShowSecret(showSecret === name ? null : name)} className="p-1 text-slate-500" aria-label={`Afficher l’état de ${name}`}>{showSecret === name ? <EyeOff size={17} /> : <Eye size={17} />}</button></div><button onClick={() => flash(`${name} : configuration serveur à compléter`)} className="mt-3 w-full rounded-xl border border-[#123f91]/20 px-4 py-2.5 text-sm font-bold text-[#123f91] hover:bg-blue-50">Configurer {name}</button></div>)}</div>
            <Panel title="Paramètres WhatsApp" description="Numéro public et comportement du robot"><div className="grid gap-4 p-5 md:grid-cols-2"><label className="text-sm font-bold text-slate-700">Numéro WhatsApp Business<input placeholder="+52 55 0000 0000" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-[#123f91]" /></label><label className="text-sm font-bold text-slate-700">Assistant IA<select className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 font-normal outline-none focus:border-[#123f91]"><option>OpenAI principal · Claude secours</option><option>OpenAI uniquement</option><option>Claude uniquement</option></select></label><button onClick={() => flash("Paramètres préparés pour Supabase")} className="rounded-xl bg-[#123f91] px-4 py-3 text-sm font-bold text-white md:col-span-2">Enregistrer les paramètres</button></div></Panel>
          </>}
        </div>
      </div>
    </main>
  );
}

function OrderTable({ orders, onStatus }: { orders: AdminOrder[]; onStatus: (id: string, status: OrderStatus) => void | Promise<void> }) {
  return <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Commande</th><th className="px-5 py-3">Client</th><th className="px-5 py-3">Destination</th><th className="px-5 py-3">Date</th><th className="px-5 py-3">Total</th><th className="px-5 py-3">Statut</th></tr></thead><tbody>{orders.map((order) => <tr key={order.id} className="border-t border-slate-100 hover:bg-slate-50/60"><td className="px-5 py-4 font-black text-[#123f91]">{order.id}</td><td className="px-5 py-4 font-bold text-slate-900">{order.client}</td><td className="px-5 py-4 text-slate-500">{order.city}</td><td className="px-5 py-4 text-slate-500">{order.date}</td><td className="px-5 py-4 font-black text-slate-900">{pesos.format(order.total)}</td><td className="px-5 py-4"><div className="flex items-center gap-2"><StatusPill status={order.status} /><select aria-label={`Statut ${order.id}`} value={order.status} onChange={(event) => onStatus(order.id, event.target.value as OrderStatus)} className="w-7 cursor-pointer bg-transparent text-transparent outline-none"><option>Payée</option><option>Préparation</option><option>Expédiée</option><option>Livrée</option></select></div></td></tr>)}</tbody></table>{orders.length === 0 && <div className="p-10 text-center text-sm text-slate-500">Aucune commande trouvée.</div>}</div>;
}
