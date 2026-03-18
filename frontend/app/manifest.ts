import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '<GST> GESTÃO DE SEGURANÇA DO TRABALHO',
    short_name: 'GST',
    description: 'Sistema inteligente de gestão de Segurança e Saúde no Trabalho',
    start_url: '/login',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#2458dd',
    orientation: 'portrait',
    icons: [
      {
        src: '/logo-gst.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
  };
}
