import type { User } from "@/services/usersService";

export function isDdsUserVisibleForSite(
  user: Pick<User, "company_id" | "site_id">,
  selectedCompanyId: string,
  selectedSiteId: string,
) {
  return (
    user.company_id === selectedCompanyId &&
    (!selectedSiteId || !user.site_id || user.site_id === selectedSiteId)
  );
}

export function dedupeDdsUsersById<T extends Pick<User, "id">>(users: T[]) {
  return Array.from(new Map(users.map((user) => [user.id, user])).values());
}
