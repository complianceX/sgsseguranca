'use client';

import { ChecklistForm } from '../../checklists/components/ChecklistForm';

export default function NewChecklistModelPage() {
  return (
    <div className="py-6">
      <ChecklistForm mode="template" />
    </div>
  );
}
