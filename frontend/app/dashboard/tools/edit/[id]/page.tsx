import { ToolForm } from '@/components/ToolForm';
import { use } from 'react';

interface EditToolPageProps {
  params: Promise<{ id: string }>;
}

export default function EditToolPage({ params }: EditToolPageProps) {
  const { id } = use(params);
  return <ToolForm id={id} />;
}
