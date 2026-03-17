'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function ImportPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const params = searchParams.toString();
    router.replace(
      params
        ? `/dashboard/documentos/importar?${params}`
        : '/dashboard/documentos/importar',
    );
  }, [router, searchParams]);

  return null;
}
