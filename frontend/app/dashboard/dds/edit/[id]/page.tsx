import dynamic from 'next/dynamic';

const DdsForm = dynamic(
  () => import('@/components/DdsForm').then((module) => module.DdsForm),
  {
    loading: () => (
      <div className="rounded-[var(--ds-radius-xl)] border border-[var(--component-card-border)] bg-[color:var(--component-card-bg)] p-6 text-sm text-[var(--ds-color-text-secondary)] shadow-[var(--component-card-shadow)]">
        Carregando DDS...
      </div>
    ),
  },
);

export default async function EditDdsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="py-6">
      <DdsForm id={id} />
    </div>
  );
}
