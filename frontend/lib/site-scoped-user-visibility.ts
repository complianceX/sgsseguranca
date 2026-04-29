export function isUserVisibleForSite(
  user: { company_id?: string | null; site_id?: string | null },
  selectedCompanyId: string,
  selectedSiteId: string,
) {
  if (!selectedCompanyId || user.company_id !== selectedCompanyId) {
    return false;
  }

  if (!selectedSiteId) {
    return true;
  }

  return !user.site_id || user.site_id === selectedSiteId;
}
