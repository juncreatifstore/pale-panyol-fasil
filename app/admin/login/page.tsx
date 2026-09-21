"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Eye, EyeOff, Loader2, LockKeyhole, ShieldCheck } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import Link from "next/link";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [setupMode, setSetupMode] = useState(false);
  const [message, setMessage] = useState("");

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const supabase = createSupabaseBrowserClient();
    if (setupMode) {
      const { error: signUpError } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/admin/login` } });
      if (signUpError) setError(signUpError.message);
      else setMessage("Compte créé. Vérifiez votre e-mail, puis revenez vous connecter.");
      setLoading(false);
      return;
    }
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setError("Adresse e-mail ou mot de passe incorrect.");
      setLoading(false);
      return;
    }
    router.replace("/admin");
    router.refresh();
  }

  return (
    <main className="grid min-h-screen bg-[#f4f6f9] lg:grid-cols-[.9fr_1.1fr]">
      <section className="hidden flex-col justify-between bg-[#102c64] p-12 text-white lg:flex">
        <div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-[#123f91]"><BookOpen /></span><div><p className="font-serif text-2xl font-black">Pale Panyol Fasil</p><p className="text-sm text-blue-100">Administration sécurisée</p></div></div>
        <div className="max-w-lg"><p className="text-sm font-bold uppercase tracking-[.2em] text-[#ff8b70]">Centre de contrôle</p><h1 className="mt-4 font-serif text-5xl font-black leading-tight">Gérez toute la boutique depuis un seul endroit.</h1><p className="mt-5 text-lg leading-8 text-blue-100">Commandes, paiements, stocks, livraisons, clients et marketing sont protégés par Supabase Auth et les règles RLS.</p></div>
        <p className="flex items-center gap-2 text-sm text-blue-100"><ShieldCheck size={18} />Accès réservé aux administrateurs autorisés</p>
      </section>
      <section className="flex items-center justify-center p-5 sm:p-10">
        <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-xl sm:p-9">
          <div className="mb-8 lg:hidden"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#123f91] text-white"><BookOpen /></span></div>
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-[#123f91]"><LockKeyhole size={21} /></span>
          <h2 className="mt-5 text-3xl font-black text-slate-950">{setupMode ? "Créer le compte admin" : "Connexion admin"}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">{setupMode ? "Créez le premier compte, puis il sera autorisé comme super administrateur." : "Utilisez votre compte administrateur Pale Panyol Fasil."}</p>
          <form onSubmit={signIn} className="mt-7 space-y-5">
            <label className="block text-sm font-bold text-slate-700">Adresse e-mail<input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-[#123f91] focus:ring-2 focus:ring-blue-100" placeholder="admin@exemple.com" /></label>
            <label className="block text-sm font-bold text-slate-700">Mot de passe<div className="relative mt-2"><input required type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-3 pr-12 font-normal outline-none focus:border-[#123f91] focus:ring-2 focus:ring-blue-100" /><button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-500" aria-label="Afficher le mot de passe">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
            {error && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p>}
            {message && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{message}</p>}
            <button disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#123f91] px-4 py-3.5 font-bold text-white hover:bg-[#0d347c] disabled:opacity-60">{loading && <Loader2 size={18} className="animate-spin" />}{setupMode ? "Créer mon compte" : "Se connecter"}</button>
          </form>
          <button onClick={() => { setSetupMode(!setupMode); setError(""); setMessage(""); }} className="mt-5 w-full text-center text-sm font-bold text-[#123f91]">{setupMode ? "J’ai déjà un compte" : "Créer le premier compte administrateur"}</button>
          <Link href="/" className="mt-4 block text-center text-sm font-bold text-slate-500">Retour à la boutique</Link>
        </div>
      </section>
    </main>
  );
}
