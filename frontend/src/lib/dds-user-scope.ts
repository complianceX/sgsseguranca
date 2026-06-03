import { isUserVisibleForSite } from "@/lib/site-scoped-user-visibility";

export function isDdsUserVisibleForSite(
  user: { company_id: string; site_id?: string | null },
  selectedCompanyId: string,
  selectedSiteId: string,
) {
  return isUserVisibleForSite(user, selectedCompanyId, selectedSiteId);
}

export function dedupeDdsUsersById<T extends { id: string }>(users: T[]) {
  return Array.from(new Map(users.map((user) => [user.id, user])).values());
}
