type SiteMembership = {
  id?: string | null;
};

type VisibleUser = {
  company_id?: string | null;
  site_id?: string | null;
  site_ids?: string[] | null;
  site?: SiteMembership | null;
  sites?: SiteMembership[] | null;
  profile?: {
    nome?: string | null;
  } | null;
};

function normalizeRoleName(value?: string | null): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function isCompanyWideProfile(value?: string | null): boolean {
  const normalized = normalizeRoleName(value);
  return (
    normalized === "administrador geral" ||
    normalized === "admin geral" ||
    normalized === "administrador da empresa" ||
    normalized === "admin empresa"
  );
}

export function isUserVisibleForSite(
  user: VisibleUser,
  selectedCompanyId: string,
  selectedSiteId: string,
) {
  if (!selectedCompanyId || user.company_id !== selectedCompanyId) {
    return false;
  }

  if (!selectedSiteId) {
    return true;
  }

  if (isCompanyWideProfile(user.profile?.nome)) {
    return true;
  }

  const userSiteIds = new Set(
    [
      user.site_id,
      ...(user.site_ids ?? []),
      user.site?.id,
      ...(user.sites?.map((site) => site.id) ?? []),
    ]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value)),
  );

  if (userSiteIds.size === 0) {
    return true;
  }

  return userSiteIds.has(selectedSiteId);
}
