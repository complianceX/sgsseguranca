import LoginPageClient from './LoginPageClient';
import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { AuthProvider } from '@/context/AuthContext';
import { headers } from 'next/headers';

export const dynamic = 'force-dynamic';

function getLoginSupportHref(): string {
  const supportEmail =
    process.env.NEXT_PUBLIC_LEGAL_SUPPORT_EMAIL?.trim() ||
    process.env.NEXT_PUBLIC_LEGAL_CONTACT_EMAIL?.trim() ||
    process.env.NEXT_PUBLIC_LEGAL_PRIVACY_EMAIL?.trim();

  return supportEmail ? `mailto:${supportEmail}` : '/termos';
}

export default async function LoginPage() {
  const turnstileSiteKey =
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || '';
  const nonce = (await headers()).get('x-nonce') || undefined;

  return (
    <AppErrorBoundary>
      <AuthProvider>
        <LoginPageClient
          turnstileSiteKey={turnstileSiteKey}
          nonce={nonce}
          supportHref={getLoginSupportHref()}
        />
      </AuthProvider>
    </AppErrorBoundary>
  );
}
