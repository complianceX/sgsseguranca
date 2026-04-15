import { notFound } from 'next/navigation';
import { DidPreviewHarness } from './DidPreviewHarness';

export default function DidPreviewPage() {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  return <DidPreviewHarness />;
}
