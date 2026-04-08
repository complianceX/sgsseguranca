'use client';

import dynamic from 'next/dynamic';

const MachineForm = dynamic(
  () => import('@/components/MachineForm').then((module) => module.MachineForm),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-[var(--ds-radius-xl)] border border-[var(--component-card-border)] bg-[color:var(--component-card-bg)] p-6 text-sm text-[var(--ds-color-text-secondary)] shadow-[var(--component-card-shadow)]">
        Carregando máquina...
      </div>
    ),
  },
);

export default function NewMachinePage() {
  return <MachineForm />;
}
