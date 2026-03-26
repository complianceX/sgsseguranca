"use client";

import { useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  ExternalLink,
  Film,
  Loader2,
  Lock,
  Play,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  formatVideoBytes,
  formatVideoDuration,
  GOVERNED_VIDEO_ACCEPT,
  type GovernedDocumentVideoAccessResponse,
  type GovernedDocumentVideoAttachment,
} from "@/lib/videos/documentVideos";

type DocumentVideoPanelProps = {
  title?: string;
  description?: string;
  documentId?: string | null;
  canManage: boolean;
  locked?: boolean;
  lockMessage?: string | null;
  attachments: GovernedDocumentVideoAttachment[];
  loading?: boolean;
  uploading?: boolean;
  removingId?: string | null;
  onUpload: (file: File) => Promise<unknown>;
  onRemove?: (attachment: GovernedDocumentVideoAttachment) => Promise<unknown>;
  resolveAccess: (
    attachment: GovernedDocumentVideoAttachment,
  ) => Promise<GovernedDocumentVideoAccessResponse | null>;
};

export function DocumentVideoPanel({
  title = "Vídeos governados",
  description = "Registre evidências em vídeo no storage oficial do documento.",
  documentId,
  canManage,
  locked = false,
  lockMessage,
  attachments,
  loading = false,
  uploading = false,
  removingId,
  onUpload,
  onRemove,
  resolveAccess,
}: DocumentVideoPanelProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [previewVideo, setPreviewVideo] = useState<GovernedDocumentVideoAttachment | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);

  const canUpload = canManage && !locked && Boolean(documentId);
  const helperText = useMemo(() => {
    if (!documentId) {
      return "Salve o documento antes de anexar vídeos governados.";
    }

    if (locked) {
      return lockMessage || "O documento está bloqueado para novas evidências.";
    }

    if (!canManage) {
      return "Você pode visualizar os vídeos anexados, mas não possui permissão para alterar esta lista.";
    }

    return description;
  }, [canManage, description, documentId, lockMessage, locked]);

  const handleFileSelection = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      await onUpload(file);
    } finally {
      event.target.value = "";
    }
  };

  const openPreview = async (attachment: GovernedDocumentVideoAttachment) => {
    try {
      setPreviewingId(attachment.id);
      const access = await resolveAccess(attachment);
      if (!access?.url) {
        return;
      }
      setPreviewVideo(attachment);
      setPreviewUrl(access.url);
    } finally {
      setPreviewingId(null);
    }
  };

  const openInNewTab = async (attachment: GovernedDocumentVideoAttachment) => {
    const access = await resolveAccess(attachment);
    if (!access?.url || typeof window === "undefined") {
      return;
    }

    const popup = window.open(access.url, "_blank", "noopener,noreferrer");
    if (!popup) {
      window.location.assign(access.url);
    }
  };

  return (
    <section className="rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] shadow-[var(--ds-shadow-sm)]">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--ds-color-border-subtle)] px-5 py-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Film className="h-4 w-4 text-[var(--ds-color-action-primary)]" />
            <h3 className="text-sm font-semibold text-[var(--ds-color-text-primary)]">
              {title}
            </h3>
          </div>
          <p className="max-w-3xl text-xs text-[var(--ds-color-text-secondary)]">
            {helperText}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {locked ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--ds-color-warning-border)] bg-[var(--ds-color-warning-subtle)] px-3 py-1 text-[11px] font-medium text-[var(--ds-color-warning)]">
              <Lock className="h-3.5 w-3.5" />
              Somente leitura
            </span>
          ) : null}
          <input
            ref={inputRef}
            type="file"
            accept={GOVERNED_VIDEO_ACCEPT}
            className="hidden"
            onChange={handleFileSelection}
          />
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={() => inputRef.current?.click()}
            disabled={!canUpload || uploading}
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {uploading ? "Enviando vídeo..." : "Adicionar vídeo"}
          </Button>
        </div>
      </div>

      <div className="grid gap-5 px-5 py-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.9fr)]">
        <div className="space-y-3">
          {loading ? (
            <div className="rounded-[var(--ds-radius-lg)] border border-dashed border-[var(--ds-color-border-subtle)] px-4 py-8 text-center text-sm text-[var(--ds-color-text-secondary)]">
              Carregando vídeos anexados...
            </div>
          ) : attachments.length === 0 ? (
            <div className="rounded-[var(--ds-radius-lg)] border border-dashed border-[var(--ds-color-border-subtle)] px-4 py-8 text-center text-sm text-[var(--ds-color-text-secondary)]">
              Nenhum vídeo governado anexado até o momento.
            </div>
          ) : (
            attachments.map((attachment) => {
              const isBusy =
                previewingId === attachment.id || removingId === attachment.id;

              return (
                <article
                  key={attachment.id}
                  className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/25 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-[var(--ds-color-action-primary)]/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--ds-color-action-primary)]">
                          {attachment.mime_type}
                        </span>
                        <span className="rounded-full bg-[var(--ds-color-success)]/10 px-2.5 py-1 text-[11px] font-medium text-[var(--ds-color-success)]">
                          {attachment.processing_status}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-[var(--ds-color-text-primary)]">
                          {attachment.original_name}
                        </p>
                        <p className="text-xs text-[var(--ds-color-text-secondary)]">
                          {formatVideoBytes(attachment.size_bytes)} • {formatVideoDuration(attachment.duration_seconds)} •{" "}
                          {new Date(attachment.uploaded_at).toLocaleString("pt-BR")}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="gap-2"
                        onClick={() => void openPreview(attachment)}
                        disabled={isBusy}
                      >
                        {previewingId === attachment.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                        Visualizar
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="gap-2"
                        onClick={() => void openInNewTab(attachment)}
                        disabled={isBusy}
                      >
                        <ExternalLink className="h-4 w-4" />
                        Abrir
                      </Button>
                      {canManage && !locked && onRemove ? (
                        <Button
                          type="button"
                          variant="outline"
                          className={cn(
                            "gap-2 border-[var(--ds-color-danger-border)] text-[var(--ds-color-danger)] hover:bg-[var(--ds-color-danger-subtle)] hover:text-[var(--ds-color-danger)]",
                            removingId === attachment.id && "opacity-80",
                          )}
                          onClick={() => void onRemove(attachment)}
                          disabled={isBusy}
                        >
                          {removingId === attachment.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                          Remover
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>

        <div className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/20 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]">
            Preview seguro
          </p>
          {previewUrl && previewVideo ? (
            <div className="space-y-3">
              <div className="overflow-hidden rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-black">
                <video
                  key={previewUrl}
                  src={previewUrl}
                  controls
                  preload="metadata"
                  className="h-full max-h-[340px] w-full bg-black object-contain"
                />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-[var(--ds-color-text-primary)]">
                  {previewVideo.original_name}
                </p>
                <p className="text-xs text-[var(--ds-color-text-secondary)]">
                  {formatVideoBytes(previewVideo.size_bytes)} • {previewVideo.mime_type}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex min-h-[260px] items-center justify-center rounded-[var(--ds-radius-lg)] border border-dashed border-[var(--ds-color-border-subtle)] px-4 text-center text-sm text-[var(--ds-color-text-secondary)]">
              Selecione um vídeo anexado para reproduzir aqui.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
