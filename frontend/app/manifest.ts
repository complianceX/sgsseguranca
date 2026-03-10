import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'COMPLIANCE X | Sistema de Gestão SST',
    short_name: 'COMPLIANCE X',
    description: 'Sistema inteligente de gestão de Segurança e Saúde no Trabalho',
    start_url: '/login',
    scope: '/',
    display: 'standalone',
    background_color: '#f8fafc',
    theme_color: '#1d4ed8',
    orientation: 'portrait',
    icons: [
      {
        src: '/logo-compliance-x.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
  };
}
