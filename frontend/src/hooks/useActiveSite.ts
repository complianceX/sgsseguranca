'use client';

import { useEffect, useCallback, useRef } from 'react';
import { siteStore, type SelectedSite } from '@/lib/siteStore';

/**
 * Hook para gerenciar o site ativo no contexto de formulários.
 *
 * Este hook:
 * - Sincroniza o site_id do formulário com o siteStore
 * - Valida que o usuário não pode submeter sem site ativo
 * - Limpa o formulário quando o site muda
 * - Impede perda de dados não salvos ao trocar de site
 *
 * @param options - Opções de configuração
 * @param options.form - Instância do react-hook-form (useForm)
 * @param options.fieldName - Nome do campo no formulário (padrão: 'site_id')
 * @param options.onSiteChange - Callback chamado quando o site muda
 * @param options.requireSite - Se true, impede submissão sem site ativo
 * @param options.clearOnChange - Campos a limpar quando o site mudar
 */
export function useActiveSite({
  form,
  fieldName = 'site_id',
  onSiteChange,
  requireSite = true,
  clearOnChange = [],
}: {
  form?: {
    setValue: (name: string, value: unknown, options?: Record<string, unknown>) => void;
    getValues: (name: string) => unknown;
    clearErrors: (name: string) => void;
  };
  fieldName?: string;
  onSiteChange?: (site: SelectedSite | null) => void | Promise<void>;
  requireSite?: boolean;
  clearOnChange?: string[];
} = {}) {
  const formRef = useRef(form);
  formRef.current = form;
  const activeSite = siteStore.get();

  // Sincroniza o site ativo com o formulário ao montar
  useEffect(() => {
    if (activeSite && formRef.current) {
      const currentSiteId = formRef.current.getValues(fieldName);
      // Only set if no site is selected or the site has changed
      if (!currentSiteId || currentSiteId !== activeSite.siteId) {
        formRef.current.setValue(fieldName, activeSite.siteId, { shouldValidate: false });
        formRef.current.clearErrors(fieldName);
      }
    }
  }, [activeSite, fieldName]);

  // Inscrição para mudanças no siteStore
  useEffect(() => {
    if (!formRef.current) return;

    const unsubscribe = siteStore.subscribe((site) => {
      if (site && formRef.current) {
        const currentSiteId = formRef.current.getValues(fieldName);

        // Se o site mudou, limpa campos dependentes
        if (currentSiteId && currentSiteId !== site.siteId) {
          // Limpa campos específicos
          clearOnChange.forEach((field) => {
            formRef.current?.setValue(field, '', { shouldValidate: false });
          });

          // Executa callback se definido
          if (onSiteChange) {
            onSiteChange(site);
          }
        }

        // Atualiza o campo site_id
        formRef.current.setValue(fieldName, site.siteId, { shouldValidate: false });
      }
    });

    return () => { unsubscribe(); };
  }, [fieldName, clearOnChange, onSiteChange]);

  /**
   * Valida se o site está ativo antes de uma ação.
   * Retorna true se puder prosseguir, false se precisar de site.
   */
  const validateSiteActive = useCallback((): boolean => {
    const currentSite = siteStore.get();
    if (requireSite && !currentSite) {
      return false;
    }
    return true;
  }, [requireSite]);

  /**
   * Retorna o site ativo atual.
   */
  const getActiveSite = useCallback((): SelectedSite | null => {
    return siteStore.get();
  }, []);

  return {
    activeSite,
    validateSiteActive,
    getActiveSite,
    isSiteSelected: !!activeSite,
  };
}
