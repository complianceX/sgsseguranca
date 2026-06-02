"use client";

import axios from "axios";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type {
  GovernedDocumentVideoAccessResponse,
  GovernedDocumentVideoAttachment,
  GovernedDocumentVideoMutationResponse,
} from "@/lib/videos/documentVideos";

type UseDocumentVideosOptions = {
  documentId?: string | null;
  enabled?: boolean;
  loadVideos: (documentId: string) => Promise<GovernedDocumentVideoAttachment[]>;
  uploadVideo: (
    documentId: string,
    file: File,
  ) => Promise<GovernedDocumentVideoMutationResponse>;
  removeVideo: (
    documentId: string,
    attachmentId: string,
  ) => Promise<GovernedDocumentVideoMutationResponse>;
  getVideoAccess: (
    documentId: string,
    attachmentId: string,
  ) => Promise<GovernedDocumentVideoAccessResponse>;
  labels?: {
    loadError?: string;
    uploadSuccess?: string;
    uploadError?: string;
    removeSuccess?: string;
    removeError?: string;
    accessError?: string;
  };
};

function extractVideoApiMessage(error: unknown): string | undefined {
  const normalize = (value: unknown): string | undefined => {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        const normalized = normalize(item);
        if (normalized) {
          return normalized;
        }
      }
      return undefined;
    }

    if (value && typeof value === "object") {
      const objectValue = value as Record<string, unknown>;
      return (
        normalize(objectValue.message) ||
        normalize(objectValue.error) ||
        normalize(objectValue.details)
      );
    }

    return undefined;
  };

  if (axios.isAxiosError(error)) {
    return normalize(error.response?.data);
  }

  if (error instanceof Error) {
    return error.message;
  }

  return undefined;
}

export function useDocumentVideos({
  documentId,
  enabled = true,
  loadVideos,
  uploadVideo,
  removeVideo,
  getVideoAccess,
  labels,
}: UseDocumentVideosOptions) {
  const [attachments, setAttachments] = useState<GovernedDocumentVideoAttachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled || !documentId) {
      setAttachments([]);
      return;
    }

    try {
      setLoading(true);
      setAttachments(await loadVideos(documentId));
    } catch (error) {
      console.error("Erro ao carregar vídeos governados:", error);
      toast.error(
        extractVideoApiMessage(error) ||
          labels?.loadError ||
          "Não foi possível carregar os vídeos anexados.",
      );
    } finally {
      setLoading(false);
    }
  }, [documentId, enabled, labels?.loadError, loadVideos]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleUpload = useCallback(
    async (file: File) => {
      if (!documentId) {
        toast.info("Salve o documento antes de anexar vídeos governados.");
        return null;
      }

      try {
        setUploading(true);
        const result = await uploadVideo(documentId, file);
        setAttachments(result.attachments);
        toast.success(labels?.uploadSuccess || result.message || "Vídeo anexado com sucesso.");
        return result;
      } catch (error) {
        console.error("Erro ao enviar vídeo governado:", error);
        toast.error(
          extractVideoApiMessage(error) ||
            labels?.uploadError ||
            "Não foi possível anexar o vídeo.",
        );
        throw error;
      } finally {
        setUploading(false);
      }
    },
    [documentId, labels?.uploadError, labels?.uploadSuccess, uploadVideo],
  );

  const handleRemove = useCallback(
    async (attachment: GovernedDocumentVideoAttachment) => {
      if (!documentId) {
        return null;
      }

      try {
        setRemovingId(attachment.id);
        const result = await removeVideo(documentId, attachment.id);
        setAttachments(result.attachments);
        toast.success(labels?.removeSuccess || result.message || "Vídeo removido.");
        return result;
      } catch (error) {
        console.error("Erro ao remover vídeo governado:", error);
        toast.error(
          extractVideoApiMessage(error) ||
            labels?.removeError ||
            "Não foi possível remover o vídeo.",
        );
        throw error;
      } finally {
        setRemovingId(null);
      }
    },
    [documentId, labels?.removeError, labels?.removeSuccess, removeVideo],
  );

  const resolveAccess = useCallback(
    async (attachment: GovernedDocumentVideoAttachment) => {
      if (!documentId) {
        return null;
      }

      try {
        const result = await getVideoAccess(documentId, attachment.id);
        if (!result.url && result.message) {
          toast.warning(result.message);
        }
        return result;
      } catch (error) {
        console.error("Erro ao resolver acesso ao vídeo governado:", error);
        toast.error(
          extractVideoApiMessage(error) ||
            labels?.accessError ||
            "Não foi possível abrir o vídeo.",
        );
        throw error;
      }
    },
    [documentId, getVideoAccess, labels?.accessError],
  );

  return {
    attachments,
    loading,
    uploading,
    removingId,
    refresh,
    handleUpload,
    handleRemove,
    resolveAccess,
  };
}
