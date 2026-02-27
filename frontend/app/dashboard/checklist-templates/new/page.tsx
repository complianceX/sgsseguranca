'use client';

import { ChecklistForm } from '../../checklists/components/ChecklistForm';

export default function NewChecklistTemplatePage() {
  return (
    <div className="py-6">
      <ChecklistForm mode="template" />
    </div>
  );
}
