'use client';

import { Toaster } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { useIsMobile } from '@/hooks/useIsMobile';

export function ResponsiveToaster() {
  const isMobile = useIsMobile();
  const { isAdminGeral } = useAuth();

  const topOffset = isMobile ? 16 : isAdminGeral ? 112 : 80;

  return (
    <Toaster
      position={isMobile ? 'bottom-center' : 'top-right'}
      offset={topOffset}
      toastOptions={{ duration: 4000 }}
      richColors
    />
  );
}
