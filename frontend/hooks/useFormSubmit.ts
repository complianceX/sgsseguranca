import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { handleApiError } from '@/lib/error-handler';

interface UseFormSubmitOptions {
  successMessage?: string;
  redirectTo?: string;
  onSuccess?: () => void;
  context?: string;
}

export function useFormSubmit<T>(
  submitFn: (data: T) => Promise<unknown>,
  options?: UseFormSubmitOptions
) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (data: T) => {
    setLoading(true);
    try {
      const result = await submitFn(data);
      toast.success(options?.successMessage || 'Salvo com sucesso!');
      
      if (options?.onSuccess) {
        options.onSuccess();
      }

      if (options?.redirectTo) {
        router.push(options.redirectTo);
        router.refresh();
      }
      return result;
    } catch (error) {
      handleApiError(error, options?.context || 'Formulário');
    } finally {
      setLoading(false);
    }
  };

  return { handleSubmit, loading };
}
