"use client";

import dynamic from "next/dynamic";
import { useParams } from "next/navigation";

const DdsForm = dynamic(
  () => import("@/components/DdsForm").then((module) => module.DdsForm),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-[var(--ds-radius-xl)] border border-[var(--component-card-border)] bg-[color:var(--component-card-bg)] p-6 text-sm text-[var(--ds-color-text-secondary)] shadow-[var(--component-card-shadow)]">
        Carregando DDS...
      </div>
    ),
  },
);

export default function EditDdsPage() {
  const params = useParams();
  const id = params.id as string;

  return (
    <div className="py-6">
      <DdsForm id={id} />
    </div>
  );
}
