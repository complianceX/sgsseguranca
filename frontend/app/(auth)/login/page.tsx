import LoginPageClient from './LoginPageClient';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  const turnstileSiteKey =
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || '';

  return <LoginPageClient turnstileSiteKey={turnstileSiteKey} />;
}
