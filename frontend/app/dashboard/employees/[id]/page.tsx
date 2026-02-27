'use client';

import { UserForm } from '../../users/components/UserForm';
import { useParams } from 'next/navigation';

export default function EditEmployeePage() {
  const params = useParams();
  const id = params.id as string;

  return <UserForm id={id} />;
}
