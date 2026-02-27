import { MachineForm } from '@/components/MachineForm';
import { use } from 'react';

interface EditMachinePageProps {
  params: Promise<{ id: string }>;
}

export default function EditMachinePage({ params }: EditMachinePageProps) {
  const { id } = use(params);
  return <MachineForm id={id} />;
}
