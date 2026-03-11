import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { Toaster } from 'sonner';
import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { PwaBootstrap } from '@/components/PwaBootstrap';
import { ThemeProvider } from '@/components/ThemeProvider';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "<GST> GESTÃO DE SEGURANÇA DO TRABALHO | Sistema Web SST",
  description: "Sistema inteligente de gestão de Segurança e Saúde no Trabalho",
  applicationName: "<GST> GESTÃO DE SEGURANÇA DO TRABALHO",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "GST",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#f8fafc",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" data-theme="light" className="theme-light" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AppErrorBoundary>
          <ThemeProvider>
            <AuthProvider>
              <PwaBootstrap />
              {children}
              <Toaster position="top-right" richColors />
            </AuthProvider>
          </ThemeProvider>
        </AppErrorBoundary>
      </body>
    </html>
  );
}
