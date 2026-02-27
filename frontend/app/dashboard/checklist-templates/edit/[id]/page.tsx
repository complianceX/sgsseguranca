'use client';

import { ChecklistForm } from '../../../checklists/components/ChecklistForm';
import { use } from 'react';

export default function EditChecklistTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  
  return (
    <div className="py-6">
      <ChecklistForm id={id} mode="template" />
    </div>
  );
}
