'use client';

import { DdsForm } from '@/components/DdsForm';
import { useParams } from 'next/navigation';

export default function EditDdsPage() {
  const params = useParams();
  const id = params.id as string;

  return (
    <div className="py-6">
      <DdsForm id={id} />
    </div>
  );
}
