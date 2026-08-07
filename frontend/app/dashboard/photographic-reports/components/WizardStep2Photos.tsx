'use client';

import { useRef } from 'react';
import { format } from 'date-fns';
import {
  BrainCircuit,
  Image as ImageIcon,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type {
  PhotographicReport,
  PhotographicReportDay,
  PhotographicReportImage,
} from '@/services/photographicReportsService';
import type { PendingPhoto } from '../types';
import { PhotoCard, type PhotoCardSavePayload } from './PhotoCard';

type GroupedImages = {
  day: PhotographicReportDay | null;
  items: PhotographicReportImage[];
};

interface WizardStep2Props {
  report: PhotographicReport;
  sortedDays: PhotographicReportDay[];
  groupedImages: GroupedImages[];
  canManage: boolean;
  canUseAi: boolean;
  savingImageId: string | null;
  uploading: boolean;
  analyzing: boolean;
  pendingPhotos: PendingPhoto[];
  processingProgress: { completed: number; total: number };
  selectedFiles: File[];
  uploadDayId: string;
  uploadActivityDate: string;
  uploadManualCaption: string;
  processingControllerRef: React.RefObject<AbortController | null>;
  onFilesSelected: (files: File[]) => void;
  onRemovePending: (id: string) => void;
  onRetryPending: (id: string) => void;
  onCancelProcessing: () => void;
  onUploadDayIdChange: (id: string) => void;
  onUploadActivityDateChange: (date: string) => void;
  onUploadManualCaptionChange: (caption: string) => void;
  onUpload: () => void;
  onSaveImage: (imageId: string, payload: PhotoCardSavePayload) => void;
  onAnalyzeImage: (imageId: string) => void;
  onAnalyzeAll: () => void;
  onDeleteImage: (imageId: string) => void;
  onNext: () => void;
  onBack: () => void;
  saving: boolean;
}

export function WizardStep2Photos({
  report,
  sortedDays,
  groupedImages,
  canManage,
  canUseAi,
  savingImageId,
  uploading,
  analyzing,
  pendingPhotos,
  processingProgress,
  selectedFiles,
  uploadDayId,
  uploadActivityDate,
  uploadManualCaption,
  processingControllerRef,
  onFilesSelected,
  onRemovePending,
  onRetryPending,
  onCancelProcessing,
  onUploadDayIdChange,
  onUploadActivityDateChange,
  onUploadManualCaptionChange,
  onUpload,
  onSaveImage,
  onAnalyzeImage,
  onAnalyzeAll,
  onDeleteImage,
  onNext,
  onBack,
  saving,
}: WizardStep2Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const totalImages = report.images?.length ?? 0;
  const isProcessing = pendingPhotos.some((p) => p.status === 'processing');
  const readyCount = pendingPhotos.filter((p) => p.status === 'ready').length;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Fotos da inspeção</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Adicione as fotos e marque as condições observadas em cada uma.
        </p>
      </div>

      {/* Upload zone */}
      <div className="space-y-4">
        <div
          className="rounded-xl border-2 border-dashed border-border bg-muted/30 p-8 text-center transition-colors hover:border-primary/40 hover:bg-muted/50"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const files = Array.from(e.dataTransfer.files || []).filter((f) =>
              f.type.startsWith('image/'),
            );
            if (files.length > 0) onFilesSelected(files);
          }}
        >
          <Upload className="mx-auto mb-3 h-8 w-8 text-primary" />
          <p className="text-sm font-semibold text-foreground">
            Arraste as fotos aqui
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            ou use o botão para selecionar arquivos (JPEG, PNG, WebP)
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-4"
            onClick={() => fileInputRef.current?.click()}
            leftIcon={<ImageIcon className="h-4 w-4" />}
          >
            Selecionar fotos
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              if (files.length) onFilesSelected(files);
              e.target.value = '';
            }}
          />
        </div>

        {/* Day/date selector for upload */}
        <div className="grid gap-3 sm:grid-cols-2">
          {sortedDays.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Vincular a uma data
              </label>
              <select
                value={uploadDayId}
                onChange={(e) => onUploadDayIdChange(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Nova data</option>
                {sortedDays.map((day) => (
                  <option key={day.id} value={day.id}>
                    {format(new Date(day.activity_date), 'dd/MM/yyyy')}
                  </option>
                ))}
              </select>
            </div>
          )}
          {!uploadDayId && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Data das fotos
              </label>
              <input
                type="date"
                value={uploadActivityDate}
                onChange={(e) => onUploadActivityDateChange(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          )}
          <div className={sortedDays.length > 0 || !uploadDayId ? '' : 'sm:col-span-2'}>
            <label className="block text-sm font-medium text-foreground mb-1">
              Legenda padrão (opcional)
            </label>
            <input
              type="text"
              value={uploadManualCaption}
              onChange={(e) => onUploadManualCaptionChange(e.target.value)}
              placeholder="Aplicada a todas as fotos deste envio"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        {/* Pending photos preview */}
        {pendingPhotos.length > 0 && (
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-foreground">
                {readyCount} de {pendingPhotos.length} pronta(s)
              </p>
              {isProcessing && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onCancelProcessing}
                  leftIcon={<X className="h-3.5 w-3.5" />}
                >
                  Cancelar
                </Button>
              )}
            </div>
            {processingProgress.total > 0 && (
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={processingProgress.total}
                aria-valuenow={processingProgress.completed}
                className="h-1.5 overflow-hidden rounded-full bg-muted"
              >
                <div
                  className="h-full bg-primary transition-all"
                  style={{
                    width: `${Math.round((processingProgress.completed / processingProgress.total) * 100)}%`,
                  }}
                />
              </div>
            )}
            <ul className="grid gap-2 sm:grid-cols-2">
              {pendingPhotos.map((photo) => (
                <li
                  key={photo.id}
                  className="flex gap-3 rounded-lg border border-border bg-background p-2"
                >
                  {photo.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photo.previewUrl}
                      alt={`Prévia de ${photo.original.name}`}
                      className="h-14 w-14 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded bg-muted">
                      <ImageIcon className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {photo.original.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {photo.status === 'processing'
                        ? 'Otimizando…'
                        : photo.status === 'ready'
                          ? `${Math.round((photo.processed?.outputBytes ?? 0) / 1024)} KB · pronta`
                          : (photo.error ?? 'Erro')}
                    </p>
                    {(photo.status === 'error' || photo.status === 'cancelled') && (
                      <button
                        type="button"
                        className="mt-0.5 text-xs font-semibold text-primary"
                        onClick={() => onRetryPending(photo.id)}
                      >
                        Tentar novamente
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    aria-label={`Remover ${photo.original.name}`}
                    onClick={() => onRemovePending(photo.id)}
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
            <Button
              type="button"
              onClick={onUpload}
              loading={uploading}
              disabled={!canManage || readyCount === 0 || isProcessing}
              leftIcon={<Upload className="h-4 w-4" />}
            >
              Enviar {readyCount > 0 ? `${readyCount} foto(s)` : 'fotos'}
            </Button>
          </div>
        )}

        {/* Send button when pending but not showing the block */}
        {pendingPhotos.length === 0 && selectedFiles.length > 0 && (
          <Button
            type="button"
            onClick={onUpload}
            loading={uploading}
            disabled={!canManage}
            leftIcon={<Upload className="h-4 w-4" />}
          >
            Enviar fotos
          </Button>
        )}
      </div>

      {/* Uploaded images */}
      {totalImages > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-foreground">
                Fotos enviadas
              </h3>
              <p className="text-sm text-muted-foreground">
                {totalImages} foto(s) no relatório
              </p>
            </div>
            {canUseAi && (
              <Button
                type="button"
                variant="outline"
                onClick={onAnalyzeAll}
                loading={analyzing}
                leftIcon={<BrainCircuit className="h-4 w-4" />}
              >
                Analisar todas com IA
              </Button>
            )}
          </div>

          {groupedImages.map((group) => (
            <div key={group.day?.id ?? 'unassigned'} className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-foreground">
                  {group.day
                    ? format(new Date(group.day.activity_date), "dd/MM/yyyy")
                    : 'Sem data vinculada'}
                </p>
                <Badge variant="neutral">{group.items.length} foto(s)</Badge>
              </div>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {group.items.map((image) => (
                  <PhotoCard
                    key={`${image.id}-${image.updated_at}`}
                    image={image}
                    sortedDays={sortedDays}
                    canManage={canManage}
                    canUseAi={canUseAi}
                    savingImageId={savingImageId}
                    onSave={onSaveImage}
                    onAnalyze={onAnalyzeImage}
                    onDelete={onDeleteImage}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {totalImages === 0 && pendingPhotos.length === 0 && (
        <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center">
          <ImageIcon className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">Nenhuma foto enviada ainda</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Use a área acima para adicionar as fotos da inspeção.
          </p>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between gap-3 pt-2 border-t border-border">
        <Button type="button" variant="outline" onClick={onBack} disabled={saving}>
          ← Voltar aos dados
        </Button>
        <Button
          type="button"
          onClick={onNext}
          loading={saving}
          disabled={!canManage || totalImages === 0}
        >
          Próximo → Revisar
        </Button>
      </div>
    </div>
  );
}
