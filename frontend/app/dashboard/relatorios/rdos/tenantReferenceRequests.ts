export function createTenantPermissionScope(
  companyId: string,
  canManage: boolean,
) {
  return `${companyId}:${canManage ? "manage" : "view"}`;
}

export type TenantRequestToken = Readonly<{
  generation: number;
  scope: string;
}>;

/**
 * Invalidates asynchronous work when its tenant/permission scope changes or
 * when the owning component unmounts.
 */
export class TenantRequestGate {
  private generation = 0;
  private mounted = true;

  start(scope: string): TenantRequestToken {
    this.generation += 1;
    return { generation: this.generation, scope };
  }

  invalidate() {
    this.generation += 1;
  }

  activate() {
    this.mounted = true;
  }

  dispose() {
    this.mounted = false;
    this.invalidate();
  }

  isCurrent(token: TenantRequestToken, scope: string) {
    return (
      this.mounted &&
      token.generation === this.generation &&
      token.scope === scope
    );
  }
}
