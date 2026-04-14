import { Toaster } from 'sonner';
import LoginPageClient from './LoginPageClient';
import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { AuthProvider } from '@/context/AuthContext';
import { headers } from 'next/headers';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const turnstileSiteKey =
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || '';
  const nonce = (await headers()).get('x-nonce') || undefined;

  return (
    <AppErrorBoundary>
      <AuthProvider>
        <LoginPageClient turnstileSiteKey={turnstileSiteKey} nonce={nonce} />
        <Toaster position="top-right" richColors />
      </AuthProvider>
    </AppErrorBoundary>
  );
}
