This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## ElevenLabs Convai

To enable the voice assistant widget in the dashboard, define:

```bash
NEXT_PUBLIC_ELEVENLABS_AGENT_ID=agent_4701kkd45sy6eb7r4rg7rz7bxypk
```

The agent must be public in ElevenLabs, with auth disabled and the frontend domain added to the widget allowlist.

## Legal pages

To publish the legal pages with official channels, define:

```bash
NEXT_PUBLIC_LEGAL_COMPANY_NAME=Sua Empresa Ltda
NEXT_PUBLIC_LEGAL_COMPANY_DOCUMENT=00.000.000/0001-00
NEXT_PUBLIC_LEGAL_COMPANY_ADDRESS=Rua Exemplo, 123, Centro, Cidade/UF, CEP 00000-000
NEXT_PUBLIC_LEGAL_PRIVACY_EMAIL=privacidade@seudominio.com
NEXT_PUBLIC_LEGAL_SUPPORT_EMAIL=suporte@seudominio.com
NEXT_PUBLIC_LEGAL_DPO_NAME=Nome do DPO
NEXT_PUBLIC_LEGAL_FORUM_CITY_STATE=Fortaleza/CE
```

Legacy compatibility: `NEXT_PUBLIC_LEGAL_CONTACT_EMAIL` is still accepted as a fallback for support.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
