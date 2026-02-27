import { UserForm } from '../../components/UserForm';
import { use } from 'react';

interface EditUserPageProps {
  params: Promise<{ id: string }>;
}

export default function EditUserPage({ params }: EditUserPageProps) {
  const { id } = use(params);
  return <UserForm id={id} />;
}
