'use client';

import { useParams } from 'next/navigation';
import { DidForm } from '@/components/DidForm';

export default function EditDidPage() {
  const params = useParams();
  const id = params.id as string;

  return (
    <div className="py-6">
      <DidForm id={id} />
    </div>
  );
}
