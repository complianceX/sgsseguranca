'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export function PaginationControls(props: {
  page: number;
  lastPage: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  const canPrev = props.page > 1;
  const canNext = props.page < props.lastPage;

  return (
    <Card tone="muted" padding="none" className="border-t border-[var(--ds-color-border-subtle)] shadow-none">
      <CardContent className="mt-0 flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-[var(--ds-color-text-muted)]">
          Página <span className="font-semibold text-[var(--ds-color-text-primary)]">{props.page}</span> de{' '}
          <span className="font-semibold text-[var(--ds-color-text-primary)]">{props.lastPage}</span> •{' '}
          <span className="font-semibold text-[var(--ds-color-text-primary)]">{props.total}</span> item(s)
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            onClick={props.onPrev}
            disabled={!canPrev}
            variant="outline"
            size="sm"
            leftIcon={<ChevronLeft className="h-4 w-4" />}
          >
            Anterior
          </Button>
          <Button
            type="button"
            onClick={props.onNext}
            disabled={!canNext}
            variant="outline"
            size="sm"
            rightIcon={<ChevronRight className="h-4 w-4" />}
          >
            Próxima
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
