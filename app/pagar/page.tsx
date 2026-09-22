import { Suspense } from "react";
import PaymentClient from "./PaymentClient";

export default function PaymentPage() {
  return <Suspense fallback={<main className="min-h-screen bg-slate-50 p-10 text-center">N ap prepare peman sekirize a…</main>}><PaymentClient /></Suspense>;
}
