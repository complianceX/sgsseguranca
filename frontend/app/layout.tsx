import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { Toaster } from 'sonner';
import { AppErrorBoundary } from '@/components/AppErrorBoundary';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "COMPLIANCE X | Sistema de Gestão SST",
  description: "Sistema inteligente de gestão de Segurança e Saúde no Trabalho",
  applicationName: "COMPLIANCE X",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "COMPLIANCE X",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#2563eb",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AppErrorBoundary>
          <AuthProvider>
            {children}
            <Toaster position="top-right" richColors />
          </AuthProvider>
        </AppErrorBoundary>
      </body>
    </html>
  );
}
