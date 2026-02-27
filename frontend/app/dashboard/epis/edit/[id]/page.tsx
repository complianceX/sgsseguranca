'use client';

import { EpiForm } from '@/components/EpiForm';
import { useParams } from 'next/navigation';

export default function EditEpiPage() {
  const params = useParams();
  const id = params.id as string;

  return <EpiForm id={id} />;
}
