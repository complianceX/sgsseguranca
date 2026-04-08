import { notFound } from 'next/navigation';
import { ChecklistsPageView } from '../page';
import { getChecklistRecordsArea } from '@/lib/checklist-modules';

const validSegments = new Set([
  'normativos',
  'operacionais',
  'equipamentos',
  'veiculos',
  'epis',
]);

export default async function ChecklistSegmentPage({
  params,
}: {
  params: Promise<{ segment: string }>;
}) {
  const { segment } = await params;

  if (!validSegments.has(segment)) {
    notFound();
  }

  return (
    <ChecklistsPageView
      area={getChecklistRecordsArea(
        segment as Parameters<typeof getChecklistRecordsArea>[0],
      )}
    />
  );
}
