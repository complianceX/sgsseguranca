import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Nonce gerado pelo middleware por requisição — necessário para que o
  // CSP com 'nonce-{valor}' permita os scripts inline do Next.js sem usar
  // 'unsafe-inline'. O header x-nonce é setado pelo middleware.ts.
  const headersList = await headers();
  const nonce = headersList.get("x-nonce") ?? "";

  return (
    <html
      lang="pt-BR"
      data-theme="light"
      className="theme-light"
      suppressHydrationWarning
    >
      <body className="antialiased" {...(nonce ? { "data-nonce": nonce } : {})}>
        {children}
      </body>
    </html>
  );
}
