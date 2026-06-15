import { useCallback, useRef, useState } from 'react';

export function useFileUpload() {
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const upload = useCallback(
    async (
      url: string,
      file: File,
      uploadFn: (url: string, file: File, options: {
        onProgress: (pct: number) => void;
        signal: AbortSignal;
      }) => Promise<void>,
    ): Promise<void> => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setProgress(0);
      setError(null);
      setUploading(true);

      try {
        await uploadFn(url, file, {
          onProgress: (pct) => setProgress(pct),
          signal: controller.signal,
        });
        setProgress(100);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          setError('Envio cancelado.');
        } else {
          setError(
            err instanceof Error ? err.message : 'Erro ao enviar arquivo.',
          );
        }
        throw err;
      } finally {
        setUploading(false);
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      }
    },
    [],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const reset = useCallback(() => {
    cancel();
    setProgress(0);
    setError(null);
    setUploading(false);
  }, [cancel]);

  return { progress, uploading, error, upload, cancel, reset };
}
