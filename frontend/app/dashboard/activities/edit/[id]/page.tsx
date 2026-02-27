'use client';

import { ActivityForm } from '@/components/ActivityForm';
import { useParams } from 'next/navigation';

export default function EditActivityPage() {
  const params = useParams();
  const id = params.id as string;

  return <ActivityForm id={id} />;
}
