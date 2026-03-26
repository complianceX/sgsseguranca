import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SGS - Sistema de Gestão de Segurança',
    short_name: 'SGS',
    description: 'Sistema inteligente de gestão de Segurança e Saúde no Trabalho',
    lang: 'pt-BR',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    background_color: '#F7FAFD',
    theme_color: '#11598C',
    orientation: 'portrait-primary',
    categories: ['business', 'productivity'],
    icons: [
      {
        src: '/icon-192.svg',
        sizes: '192x192',
        type: 'image/svg+xml',
        purpose: 'any',
      },
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
    shortcuts: [
      {
        name: 'Dashboard',
        short_name: 'Dashboard',
        description: 'Ir para o dashboard principal',
        url: '/dashboard',
        icons: [{ src: '/icon-192.svg', sizes: '192x192', type: 'image/svg+xml' }],
      },
      {
        name: 'Calendário SST',
        short_name: 'Calendário',
        description: 'Ver calendário de eventos SST',
        url: '/dashboard/calendar',
        icons: [{ src: '/icon-192.svg', sizes: '192x192', type: 'image/svg+xml' }],
      },
      {
        name: 'Treinamentos',
        short_name: 'Treinamentos',
        description: 'Gerenciar treinamentos',
        url: '/dashboard/trainings',
        icons: [{ src: '/icon-192.svg', sizes: '192x192', type: 'image/svg+xml' }],
      },
    ],
  };
}
