interface ForcePasswordChangeState {
  nome: string | null;
}

let state: ForcePasswordChangeState | null = null;

/**
 * Estado em memória (não persistido) para o fluxo de troca obrigatória de
 * senha no primeiro acesso. O token limitado emitido pelo backend não gera
 * sessão nem refresh token — por design, um refresh de página aqui perde o
 * estado e o usuário precisa reiniciar o login.
 */
export const forcePasswordChangeStore = {
  get(): ForcePasswordChangeState | null {
    return state;
  },
  set(next: ForcePasswordChangeState) {
    state = next;
  },
  clear() {
    state = null;
  },
};
