'use client';

import { ChecklistForm } from '../../../checklists/components/ChecklistForm';
import { useParams } from 'next/navigation';

export default function EditChecklistModelPage() {
  const params = useParams();
  const id = params.id as string;

  return (
    <div className="py-6">
      <ChecklistForm id={id} mode="template" />
    </div>
  );
}
