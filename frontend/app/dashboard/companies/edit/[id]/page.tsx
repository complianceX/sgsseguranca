import { CompanyForm } from '@/components/CompanyForm';
import { use } from 'react';

interface EditCompanyPageProps {
  params: Promise<{ id: string }>;
}

export default function EditCompanyPage({ params }: EditCompanyPageProps) {
  const { id } = use(params);
  return <CompanyForm id={id} />;
}
