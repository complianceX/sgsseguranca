const KEY = 'auth_refresh_hint';

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export const authRefreshHint = {
  get(): boolean {
    if (!canUseStorage()) return false;
    return window.localStorage.getItem(KEY) === '1';
  },

  set() {
    if (!canUseStorage()) return;
    window.localStorage.setItem(KEY, '1');
  },

  clear() {
    if (!canUseStorage()) return;
    window.localStorage.removeItem(KEY);
  },
};
