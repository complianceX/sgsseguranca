import type { Metadata, Viewport } from "next";
import { DM_Sans, Syne } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import { DevCacheReset } from "@/components/DevCacheReset";

const dmSans = DM_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-dm-sans",
  weight: ["400", "500", "700"],
});

const syne = Syne({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-syne",
  weight: ["400", "600", "700", "800"],
});

const THEME_INIT_INLINE_SCRIPT = `
(() => {
  try {
    const stored = localStorage.getItem('sgs.theme');
    const preferred = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    const theme = stored === 'light' || stored === 'dark' ? stored : preferred;
    const html = document.documentElement;
    html.setAttribute('data-theme', theme);
    html.classList.remove('theme-light', 'theme-dark');
    html.classList.add('theme-' + theme);
  } catch (_) {}
})();
`;

const DEV_CACHE_RESET_INLINE_SCRIPT = `
(() => {
  try {
    const isLocalHost =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname.endsWith('.local');

    if (${process.env.NODE_ENV === "production"} || !isLocalHost) {
      return;
    }

    const sessionKey = 'sgs.dev-inline-cache-reset.v2';
    if (window.sessionStorage.getItem(sessionKey) === 'done') {
      return;
    }

    const reset = async () => {
      const registrations =
        'serviceWorker' in navigator
          ? await navigator.serviceWorker.getRegistrations().catch(() => [])
          : [];

      await Promise.all(
        registrations.map((registration) =>
          registration.unregister().catch(() => false),
        ),
      );

      if ('caches' in window) {
        const keys = await window.caches.keys().catch(() => []);
        const targets = keys.filter(
          (key) => key.startsWith('sgs-shell') || key.startsWith('gst-shell'),
        );
        await Promise.all(targets.map((key) => window.caches.delete(key)));
      }

      window.sessionStorage.setItem(sessionKey, 'done');

      if (registrations.length > 0) {
        window.location.reload();
      }
    };

    void reset();
  } catch (_) {
    // no-op
  }
})();
`;

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
  themeColor: "#1D5B8D",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headersList = await headers();
  const nonce = headersList.get("x-nonce") ?? "";

  return (
    <html
      lang="pt-BR"
      data-theme="light"
      className={`${dmSans.variable} ${syne.variable} theme-light`}
      suppressHydrationWarning
    >
      <body className="antialiased" suppressHydrationWarning {...(nonce ? { "data-nonce": nonce } : {})}>
        <script
          suppressHydrationWarning
          nonce={nonce || undefined}
          dangerouslySetInnerHTML={{ __html: THEME_INIT_INLINE_SCRIPT }}
        />
        <script
          suppressHydrationWarning
          nonce={nonce || undefined}
          dangerouslySetInnerHTML={{ __html: DEV_CACHE_RESET_INLINE_SCRIPT }}
        />
        {process.env.NODE_ENV !== 'production' && <DevCacheReset />}
        {children}
      </body>
    </html>
  );
}
