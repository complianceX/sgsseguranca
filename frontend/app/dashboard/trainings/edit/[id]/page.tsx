import { TrainingForm } from '@/components/TrainingForm';

export default function EditTrainingPage({ params }: { params: { id: string } }) {
  return <TrainingForm id={params.id} />;
}
