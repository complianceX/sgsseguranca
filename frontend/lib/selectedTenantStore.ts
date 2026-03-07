type SelectedTenant = {
  companyId: string;
  companyName: string;
};

type Listener = (tenant: SelectedTenant | null) => void;

const STORAGE_KEY = 'cx_selected_tenant';

let current: SelectedTenant | null = null;
const listeners = new Set<Listener>();

function loadFromStorage(): SelectedTenant | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SelectedTenant) : null;
  } catch {
    return null;
  }
}

function saveToStorage(tenant: SelectedTenant | null) {
  if (typeof window === 'undefined') return;
  if (tenant) {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(tenant));
  } else {
    sessionStorage.removeItem(STORAGE_KEY);
  }
}

export const selectedTenantStore = {
  get(): SelectedTenant | null {
    if (!current && typeof window !== 'undefined') {
      current = loadFromStorage();
    }
    return current;
  },

  set(tenant: SelectedTenant) {
    current = tenant;
    saveToStorage(tenant);
    for (const l of listeners) l(current);
  },

  clear() {
    current = null;
    saveToStorage(null);
    for (const l of listeners) l(null);
  },

  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
