'use client';

import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';

const SiteForm = dynamic(
  () => import('@/components/SiteForm').then((module) => module.SiteForm),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-[var(--ds-radius-xl)] border border-[var(--component-card-border)] bg-[color:var(--component-card-bg)] p-6 text-sm text-[var(--ds-color-text-secondary)] shadow-[var(--component-card-shadow)]">
        Carregando obra...
      </div>
    ),
  },
);

export default function EditSitePage() {
  const params = useParams();
  const id = params.id as string;
  return <SiteForm id={id} />;
}
