import LoginPageClient from './LoginPageClient';
import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { AuthProvider } from '@/context/AuthContext';
import { headers } from 'next/headers';
import { getPublicLegalConfig } from '@/lib/legal';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const turnstileSiteKey =
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || '';
  const nonce = (await headers()).get('x-nonce') || undefined;
  const { supportEmail } = getPublicLegalConfig();
  const supportHref = supportEmail ? `mailto:${supportEmail}` : '/termos';

  return (
    <AppErrorBoundary>
      <AuthProvider>
        <LoginPageClient
          turnstileSiteKey={turnstileSiteKey}
          nonce={nonce}
          supportHref={supportHref}
        />
      </AuthProvider>
    </AppErrorBoundary>
  );
}
