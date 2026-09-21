import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pale Panyol Fasil : Español Fácil para Haitianos",
  description: "Commandez le livre de Dieudonné Almonord pour apprendre l’espagnol facilement à partir du créole haïtien.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className="antialiased">{children}</body>
    </html>
  );
}
