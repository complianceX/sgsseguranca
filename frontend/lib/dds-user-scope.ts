export function isDdsUserVisibleForSite(
  user: { company_id: string; site_id?: string | null },
  selectedCompanyId: string,
  selectedSiteId: string,
) {
  return (
    user.company_id === selectedCompanyId &&
    (!selectedSiteId || !user.site_id || user.site_id === selectedSiteId)
  );
}

export function dedupeDdsUsersById<T extends { id: string }>(users: T[]) {
  return Array.from(new Map(users.map((user) => [user.id, user])).values());
}
