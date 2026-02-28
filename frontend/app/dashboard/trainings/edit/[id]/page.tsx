import { TrainingForm } from '@/components/TrainingForm';

export default async function EditTrainingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TrainingForm id={id} />;
}
