import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';

/**
 * Gerencia o estado de retry-after após um erro 429.
 *
 * Uso típico:
 *   const { blocked, secondsLeft, onError, reset } = useRetryAfter();
 *
 *   <button disabled={blocked || loading} onClick={handleSubmit}>
 *     {blocked ? `Aguarde ${secondsLeft}s` : 'Enviar'}
 *   </button>
 *
 * No catch do submit:
 *   onError(error);
 */
export interface UseRetryAfterReturn {
  /** true enquanto o contador estiver ativo (botão deve ficar desabilitado) */
  blocked: boolean;
  /** Segundos restantes até poder tentar novamente */
  secondsLeft: number;
  /** Chamar no catch de um form submit para capturar Retry-After do 429 */
  onError: (error: unknown) => void;
  /** Resetar manualmente o estado */
  reset: () => void;
}

export function useRetryAfter(): UseRetryAfterReturn {
  const [secondsLeft, setSecondsLeft] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startCountdown = useCallback((seconds: number) => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    setSecondsLeft(seconds);

    intervalRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const onError = useCallback(
    (error: unknown) => {
      if (!axios.isAxiosError(error)) return;
      if (error.response?.status !== 429) return;

      // Tentar extrair Retry-After do header ou do body
      const headerVal = error.response.headers?.['retry-after'];
      const bodyVal = (error.response.data as Record<string, unknown> | undefined)
        ?.retryAfter;

      const raw = headerVal ?? bodyVal;
      const seconds =
        typeof raw === 'number'
          ? raw
          : typeof raw === 'string'
            ? parseInt(raw, 10)
            : NaN;

      if (!Number.isNaN(seconds) && seconds > 0) {
        startCountdown(seconds);
      } else {
        // Fallback: 60s se não houver Retry-After
        startCountdown(60);
      }
    },
    [startCountdown],
  );

  const reset = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setSecondsLeft(0);
  }, []);

  // Limpar interval ao desmontar
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    blocked: secondsLeft > 0,
    secondsLeft,
    onError,
    reset,
  };
}
