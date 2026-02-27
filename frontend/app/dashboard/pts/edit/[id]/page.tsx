'use client';

import { PtForm } from '../../components/PtForm';
import { useParams } from 'next/navigation';

export default function EditPtPage() {
  const params = useParams();
  const id = params.id as string;

  return (
    <div className="py-6">
      <PtForm id={id} />
    </div>
  );
}
