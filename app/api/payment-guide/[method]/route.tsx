import { ImageResponse } from "next/og";

const guides = {
  wallet: {
    icon: "🤝",
    title: "Kont Mercado Pago",
    color: "#ffe600",
    steps: ["Chwazi Mercado Pago Wallet.", "Konekte sou kont Mercado Pago ou.", "Chwazi lajan oswa mwayen peman ki deja nan kont lan."],
    note: "Opsyon sa a mande yon kont Mercado Pago.",
  },
  credit: {
    icon: "💳",
    title: "Kat kredi",
    color: "#dbeafe",
    steps: ["Chwazi Tarjeta de crédito.", "Ekri enfòmasyon kat la sou paj sekirize a.", "Chwazi kantite vèsman ki disponib epi konfime."],
    note: "Pa janm voye nimewo kat oswa CVV nan WhatsApp.",
  },
  debit: {
    icon: "💳",
    title: "Kat debi",
    color: "#dcfce7",
    steps: ["Chwazi Tarjeta de débito.", "Ekri enfòmasyon kat la sou paj sekirize a.", "Peze Pagar epi tann konfimasyon an."],
    note: "Ou pa bezwen yon kont Mercado Pago.",
  },
  spei: {
    icon: "🏦",
    title: "Transfè SPEI",
    color: "#e0e7ff",
    steps: ["Chwazi Transferencia SPEI.", "Mercado Pago ap ba ou yon CLABE ak yon referans inik.", "Louvri aplikasyon bank ou epi fè transfè a ak done sa yo.", "Verifye montan ak referans lan anvan ou konfime."],
    note: "Pa transfere sou okenn kont yo voye nan WhatsApp. Itilize sèlman CLABE ki parèt sou paj Mercado Pago a.",
  },
  cash: {
    icon: "💵",
    title: "Peman kach",
    color: "#fef3c7",
    steps: ["Chwazi Efectivo.", "Ranpli non, siyati ak imèl ou.", "Chwazi OXXO, 7-Eleven, Santander oswa yon lòt kote.", "Peze Pagar pou resevwa fich/kòd peman an.", "Ale nan kote ou chwazi a, montre kòd la epi peye kach."],
    note: "Konsève resi a. Kòmand lan konfime apre Mercado Pago valide peman an.",
  },
} as const;

export async function GET(_request: Request, context: { params: Promise<{ method: string }> }) {
  const { method } = await context.params;
  const guide = guides[method as keyof typeof guides];
  if (!guide) return new Response("Not found", { status: 404 });

  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#f8fafc", padding: 54, fontFamily: "Arial, sans-serif", color: "#0f172a" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
        <div style={{ width: 92, height: 92, borderRadius: 46, background: guide.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 52 }}>{guide.icon}</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 24, color: "#2563eb", fontWeight: 700 }}>PALE PANYOL FASIL</div>
          <div style={{ fontSize: 46, fontWeight: 800 }}>{guide.title}</div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: 42, gap: 22 }}>
        {guide.steps.map((step, index) => (
          <div key={step} style={{ display: "flex", alignItems: "flex-start", gap: 18, fontSize: 29, lineHeight: 1.3 }}>
            <div style={{ width: 42, height: 42, flexShrink: 0, borderRadius: 21, background: "#3483fa", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 800 }}>{index + 1}</div>
            <div style={{ display: "flex", paddingTop: 3 }}>{step}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: "auto", borderRadius: 22, background: "white", border: "2px solid #e2e8f0", padding: "22px 26px", display: "flex", fontSize: 24, lineHeight: 1.35 }}>🔒 {guide.note}</div>
    </div>,
    { width: 1080, height: 1080 },
  );
}
