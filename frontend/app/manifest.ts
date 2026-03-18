import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '<GST> GESTÃO DE SEGURANÇA DO TRABALHO',
    short_name: 'GST',
    description: 'Sistema inteligente de gestão de Segurança e Saúde no Trabalho',
    start_url: '/login',
    scope: '/',
    display: 'standalone',
    background_color: '#F4F7FB',
    theme_color: '#2563EB',
    orientation: 'portrait',
    icons: [
      {
        src: '/icon-512.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/icon-maskable.svg',
        sizes: '512x512',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  };
}
