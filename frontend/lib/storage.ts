/**
 * Wrapper seguro para o localStorage que lida com SSR e erros de quota/privacidade.
 */
export const storage = {
  setItem: (key: string, value: string) => {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(key, value);
      }
    } catch (error) {
      console.error("Erro ao salvar no localStorage (%s):", key, error);
    }
  },

  getItem: (key: string): string | null => {
    try {
      if (typeof window !== 'undefined') {
        return localStorage.getItem(key);
      }
    } catch (error) {
      console.error("Erro ao ler do localStorage (%s):", key, error);
    }
    return null;
  },

  removeItem: (key: string) => {
    try {
      if (typeof window !== 'undefined') {
        localStorage.removeItem(key);
      }
    } catch (error) {
      console.error("Erro ao remover do localStorage (%s):", key, error);
    }
  },

  clear: () => {
    try {
      if (typeof window !== 'undefined') {
        localStorage.clear();
      }
    } catch (error) {
      console.error('Erro ao limpar o localStorage:', error);
    }
  }
};
