import {
  ADAPTIVE_THEME_PRESETS,
  type SystemThemeTokens,
} from '@/services/systemThemeService';

/** Mapeia os campos da API para CSS variables do design system */
const TOKEN_MAP: Record<keyof Omit<SystemThemeTokens, 'id' | 'updatedAt'>, string[]> = {
  backgroundColor: [
    '--brand-background',
  ],
  sidebarColor: [
    '--brand-sidebar',
  ],
  cardColor: [
    '--brand-card',
  ],
  primaryColor: [
    '--brand-primary',
  ],
  secondaryColor: [
    '--brand-secondary',
  ],
  textPrimary: [
    '--brand-text-primary',
  ],
  textSecondary: [
    '--brand-text-secondary',
  ],
  successColor: [
    '--brand-success',
  ],
  warningColor: [
    '--brand-warning',
  ],
  dangerColor: [
    '--brand-danger',
  ],
  infoColor: [
    '--brand-info',
  ],
};

export type RuntimeThemeTokens = Omit<SystemThemeTokens, 'id' | 'updatedAt'>;

const THEME_STORAGE_KEY = 'gst.system-theme.v1';
const THEME_EVENT_NAME = 'gst:system-theme-updated';
const THEME_CHANNEL_NAME = 'gst-system-theme';
const SYSTEM_COLOR_SCHEME_QUERY = '(prefers-color-scheme: dark)';

let broadcastChannel: BroadcastChannel | null = null;

function getBroadcastChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') {
    return null;
  }

  if (!broadcastChannel) {
    broadcastChannel = new BroadcastChannel(THEME_CHANNEL_NAME);
  }

  return broadcastChannel;
}

function updateBrowserThemeColor(theme: Partial<RuntimeThemeTokens>): void {
  if (typeof document === 'undefined') return;
  const themeColor = theme.backgroundColor || theme.primaryColor;
  if (!themeColor) return;

  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }

  meta.content = themeColor;
}

/** Aplica os tokens do tema como CSS variables no :root */
export function applyTheme(theme: Partial<RuntimeThemeTokens>): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  for (const [field, vars] of Object.entries(TOKEN_MAP)) {
    const value = theme[field as keyof typeof theme];
    if (!value) continue;
    for (const cssVar of vars) {
      root.style.setProperty(cssVar, value);
    }
  }

  updateBrowserThemeColor(theme);
}

/** Remove os overrides e volta para os valores padrão do globals.css */
export function clearThemeOverrides(): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const allVars = Object.values(TOKEN_MAP).flat();
  for (const cssVar of allVars) {
    root.style.removeProperty(cssVar);
  }
}

export function readStoredTheme(): RuntimeThemeTokens | null {
  if (typeof window === 'undefined') return null;

  const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as RuntimeThemeTokens;
  } catch {
    window.localStorage.removeItem(THEME_STORAGE_KEY);
    return null;
  }
}

export function storeTheme(theme: RuntimeThemeTokens): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(theme));
}

export function applyStoredTheme(): RuntimeThemeTokens | null {
  const theme = readStoredTheme();
  if (theme) {
    applyTheme(theme);
  }
  return theme;
}

export function getAdaptiveFallbackTheme(): RuntimeThemeTokens {
  if (typeof window === 'undefined') {
    return ADAPTIVE_THEME_PRESETS.light;
  }

  return window.matchMedia(SYSTEM_COLOR_SCHEME_QUERY).matches
    ? ADAPTIVE_THEME_PRESETS.dark
    : ADAPTIVE_THEME_PRESETS.light;
}

export function applyAdaptiveFallbackTheme(): RuntimeThemeTokens {
  const theme = getAdaptiveFallbackTheme();
  applyTheme(theme);
  return theme;
}

export function syncThemeRuntime(theme: RuntimeThemeTokens): void {
  applyTheme(theme);
  storeTheme(theme);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent<RuntimeThemeTokens>(THEME_EVENT_NAME, { detail: theme }),
    );
  }

  getBroadcastChannel()?.postMessage(theme);
}

export function subscribeToThemeRuntime(
  onTheme: (theme: RuntimeThemeTokens) => void,
): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const handleWindowTheme = (event: Event) => {
    const customEvent = event as CustomEvent<RuntimeThemeTokens>;
    if (customEvent.detail) {
      onTheme(customEvent.detail);
    }
  };

  const handleStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY || !event.newValue) return;

    try {
      onTheme(JSON.parse(event.newValue) as RuntimeThemeTokens);
    } catch {
      // ignore malformed external writes
    }
  };

  const channel = getBroadcastChannel();
  const handleChannelMessage = (event: MessageEvent<RuntimeThemeTokens>) => {
    if (event.data) {
      onTheme(event.data);
    }
  };

  window.addEventListener(THEME_EVENT_NAME, handleWindowTheme as EventListener);
  window.addEventListener('storage', handleStorage);
  channel?.addEventListener('message', handleChannelMessage);

  return () => {
    window.removeEventListener(THEME_EVENT_NAME, handleWindowTheme as EventListener);
    window.removeEventListener('storage', handleStorage);
    channel?.removeEventListener('message', handleChannelMessage);
  };
}

export function subscribeToAdaptiveThemePreference(
  onTheme: (theme: RuntimeThemeTokens) => void,
): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const mediaQuery = window.matchMedia(SYSTEM_COLOR_SCHEME_QUERY);
  const handleChange = () => {
    onTheme(getAdaptiveFallbackTheme());
  };

  mediaQuery.addEventListener('change', handleChange);

  return () => {
    mediaQuery.removeEventListener('change', handleChange);
  };
}
