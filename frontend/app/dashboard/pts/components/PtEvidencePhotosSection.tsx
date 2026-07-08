import React, { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  PT_EVIDENCE_FASE_LABELS,
  ptsService,
  type Pt,
  type PtEvidencePhoto,
  type PtEvidencePhotoFase,
} from '@/services/ptsService';

type PtEvidencePhotosSectionProps = {
  ptId?: string;
  ptStatus?: Pt['status'];
  photos: PtEvidencePhoto[];
  /** true enquanto uploads/remoções são permitidos (Pendente/Aprovada/Expirada, sem PDF final). */
  canUploadPhotos: boolean;
  onPhotosChanged: () => void;
};

const MAX_PHOTO_SIZE_MB = 10;

const defaultFaseForStatus = (
  status?: Pt['status'],
): PtEvidencePhotoFase => {
  if (status === 'Aprovada') return 'durante';
  if (status === 'Expirada' || status === 'Encerrada') return 'depois';
  return 'antes';
};

export const PtEvidencePhotosSection = ({
  ptId,
  ptStatus,
  photos,
  canUploadPhotos,
  onPhotosChanged,
}: PtEvidencePhotosSectionProps) => {
  const [fase, setFase] = useState<PtEvidencePhotoFase>(() =>
    defaultFaseForStatus(ptStatus),
  );
  const [legenda, setLegenda] = useState('');
  const [uploading, setUploading] = useState(false);
  const [removingIndex, setRemovingIndex] = useState<number | null>(null);
  const [thumbnails, setThumbnails] = useState<Record<number, string | null>>(
    {},
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setFase(defaultFaseForStatus(ptStatus));
  }, [ptStatus]);

  const loadThumbnails = useCallback(async () => {
    if (!ptId || photos.length === 0) {
      setThumbnails({});
      return;
    }
    const entries = await Promise.all(
      photos.map(async (_, index) => {
        try {
          const access = await ptsService.getEvidencePhotoAccess(ptId, index);
          return [index, access.url] as const;
        } catch {
          return [index, null] as const;
        }
      }),
    );
    setThumbnails(Object.fromEntries(entries));
  }, [ptId, photos]);

  useEffect(() => {
    void loadThumbnails();
  }, [loadThumbnails]);

  const handleUpload = async (file: File) => {
    if (!ptId) return;
    if (file.size > MAX_PHOTO_SIZE_MB * 1024 * 1024) {
      toast.error(`A foto deve ter no máximo ${MAX_PHOTO_SIZE_MB}MB.`);
      return;
    }
    setUploading(true);
    try {
      await ptsService.attachEvidencePhoto(ptId, file, {
        fase,
        legenda: legenda.trim() || undefined,
      });
      toast.success('Foto de evidência anexada.');
      setLegenda('');
      onPhotosChanged();
    } catch (error) {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message || 'Erro ao enviar a foto.';
      toast.error(message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemove = async (index: number) => {
    if (!ptId) return;
    setRemovingIndex(index);
    try {
      await ptsService.removeEvidencePhoto(ptId, index);
      toast.success('Foto removida.');
      onPhotosChanged();
    } catch (error) {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message || 'Erro ao remover a foto.';
      toast.error(message);
    } finally {
      setRemovingIndex(null);
    }
  };

  return (
    <div className="ds-form-section">
      <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold text-[var(--ds-color-text-primary)]">
        Evidências Fotográficas da Área
        <span className="h-2 w-2 rounded-full bg-[var(--ds-color-info)]"></span>
      </h2>
      <p className="mb-6 text-sm text-[var(--ds-color-text-primary)]">
        Registre fotos da área de trabalho antes, durante e depois da
        atividade. As imagens são armazenadas de forma governada e incluídas no
        PDF final da PT.
      </p>

      {!ptId ? (
        <div className="rounded-lg border border-dashed border-[var(--ds-color-border-default)] bg-[color:var(--ds-color-surface-muted)]/14 p-6 text-center text-sm text-[var(--ds-color-text-muted)]">
          Salve a PT para anexar fotos de evidência.
        </div>
      ) : (
        <>
          {canUploadPhotos && (
            <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-secondary)]">
                  Fase
                </label>
                <select
                  value={fase}
                  onChange={(event) =>
                    setFase(event.target.value as PtEvidencePhotoFase)
                  }
                  className="block w-full rounded-lg border border-[var(--ds-color-border-default)] px-3 py-2 text-sm focus:border-[var(--ds-color-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-color-focus-ring)]"
                >
                  {(
                    Object.entries(PT_EVIDENCE_FASE_LABELS) as Array<
                      [PtEvidencePhotoFase, string]
                    >
                  ).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-secondary)]">
                  Legenda (opcional)
                </label>
                <input
                  value={legenda}
                  onChange={(event) => setLegenda(event.target.value)}
                  maxLength={300}
                  placeholder="Ex: Área isolada antes do início"
                  className="block w-full rounded-lg border border-[var(--ds-color-border-default)] px-3 py-2 text-sm focus:border-[var(--ds-color-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-color-focus-ring)]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-secondary)]">
                  Foto (JPG, PNG ou WebP até {MAX_PHOTO_SIZE_MB}MB)
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={uploading}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void handleUpload(file);
                  }}
                  className="block w-full rounded-lg border border-[var(--ds-color-border-default)] px-3 py-1.5 text-sm"
                />
                {uploading && (
                  <p className="mt-1 text-xs text-[var(--ds-color-text-muted)]">
                    Enviando foto...
                  </p>
                )}
              </div>
            </div>
          )}

          {photos.length === 0 ? (
            <p className="text-sm text-[var(--ds-color-text-muted)]">
              Nenhuma foto de evidência anexada.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {photos.map((photo, index) => (
                <figure
                  key={`${photo.ref.slice(-24)}-${index}`}
                  className="overflow-hidden rounded-lg border border-[var(--ds-color-border-default)] bg-[color:var(--ds-color-surface-muted)]/14"
                >
                  <div className="flex h-32 items-center justify-center overflow-hidden bg-[color:var(--ds-color-surface-muted)]/40">
                    {thumbnails[index] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumbnails[index] as string}
                        alt={photo.legenda || PT_EVIDENCE_FASE_LABELS[photo.fase]}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-xs text-[var(--ds-color-text-muted)]">
                        Pré-visualização indisponível
                      </span>
                    )}
                  </div>
                  <figcaption className="space-y-1 p-2">
                    <span
                      className={cn(
                        'inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                        photo.fase === 'antes' &&
                          'bg-[color:var(--ds-color-info-subtle)] text-[var(--ds-color-info)]',
                        photo.fase === 'durante' &&
                          'bg-[color:var(--ds-color-warning-subtle)] text-[var(--ds-color-warning)]',
                        photo.fase === 'depois' &&
                          'bg-[color:var(--ds-color-success-subtle)] text-[var(--ds-color-success)]',
                      )}
                    >
                      {PT_EVIDENCE_FASE_LABELS[photo.fase]}
                    </span>
                    {photo.legenda && (
                      <p className="line-clamp-2 text-xs text-[var(--ds-color-text-primary)]">
                        {photo.legenda}
                      </p>
                    )}
                    {canUploadPhotos && (
                      <button
                        type="button"
                        onClick={() => void handleRemove(index)}
                        disabled={removingIndex === index}
                        className="text-xs font-semibold text-[var(--ds-color-danger)] hover:underline disabled:opacity-50"
                      >
                        {removingIndex === index ? 'Removendo...' : 'Remover'}
                      </button>
                    )}
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default PtEvidencePhotosSection;
