import { Toaster } from 'sonner';
import LoginPageClient from './LoginPageClient';
import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { AuthProvider } from '@/context/AuthContext';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  const turnstileSiteKey =
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || '';

  return (
    <AppErrorBoundary>
      <AuthProvider>
        <LoginPageClient turnstileSiteKey={turnstileSiteKey} />
        <Toaster position="top-right" richColors />
      </AuthProvider>
    </AppErrorBoundary>
  );
}
