type TokenListener = (token: string | null) => void;

let accessToken: string | null = null;
const listeners = new Set<TokenListener>();

export const tokenStore = {
  get(): string | null {
    return accessToken;
  },

  set(token: string) {
    accessToken = token;
    for (const listener of listeners) listener(accessToken);
  },

  clear() {
    accessToken = null;
    for (const listener of listeners) listener(accessToken);
  },

  subscribe(listener: TokenListener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

