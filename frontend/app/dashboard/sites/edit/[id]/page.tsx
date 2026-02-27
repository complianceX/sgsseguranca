import { SiteForm } from '@/components/SiteForm';
import { use } from 'react';

interface EditSitePageProps {
  params: Promise<{ id: string }>;
}

export default function EditSitePage({ params }: EditSitePageProps) {
  const { id } = use(params);
  return <SiteForm id={id} />;
}
