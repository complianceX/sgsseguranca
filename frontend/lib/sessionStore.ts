type Session = {
  userId: string;
  companyId?: string | null;
  profileName?: string | null;
  roles?: string[];
};

type SessionListener = (session: Session | null) => void;

let session: Session | null = null;
const listeners = new Set<SessionListener>();

export const sessionStore = {
  get(): Session | null {
    return session;
  },

  set(next: Session) {
    session = next;
    for (const listener of listeners) listener(session);
  },

  clear() {
    session = null;
    for (const listener of listeners) listener(session);
  },

  subscribe(listener: SessionListener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
