'use client';

import { AprForm } from '../../components/AprForm';
import { useParams } from 'next/navigation';

export default function EditAprPage() {
  const params = useParams();
  const id = params.id as string;

  return <AprForm id={id} />;
}
