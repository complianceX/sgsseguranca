import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SGS | Sistema de Gestão de Segurança",
  description: "Sistema inteligente de gestão de Segurança e Saúde no Trabalho",
  applicationName: "SGS – Sistema de Gestão de Segurança",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "SGS",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#11598C",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      data-theme="light"
      className="theme-light"
      suppressHydrationWarning
    >
      <body className="antialiased">{children}</body>
    </html>
  );
}
