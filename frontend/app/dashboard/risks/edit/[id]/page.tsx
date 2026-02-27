'use client';

import { RiskForm } from '../../components/RiskForm';
import { useParams } from 'next/navigation';

export default function EditRiskPage() {
  const params = useParams();
  const id = params.id as string;

  return <RiskForm id={id} />;
}
