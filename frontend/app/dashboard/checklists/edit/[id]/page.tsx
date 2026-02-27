'use client';

import { ChecklistForm } from '../../components/ChecklistForm';
import { useParams } from 'next/navigation';

export default function EditChecklistPage() {
  const params = useParams();
  const id = params.id as string;

  return (
    <div className="py-6">
      <ChecklistForm id={id} />
    </div>
  );
}
