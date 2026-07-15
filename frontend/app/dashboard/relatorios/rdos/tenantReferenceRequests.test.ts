import {
  createTenantPermissionScope,
  TenantRequestGate,
} from "./tenantReferenceRequests";

describe("tenant-safe RDO reference requests", () => {
  it("keys cached reference data by company and permission", () => {
    expect(createTenantPermissionScope("company-a", true)).toBe(
      "company-a:manage",
    );
    expect(createTenantPermissionScope("company-b", true)).toBe(
      "company-b:manage",
    );
    expect(createTenantPermissionScope("company-a", false)).toBe(
      "company-a:view",
    );
  });

  it("rejects a late response and error after the tenant changes", () => {
    const gate = new TenantRequestGate();
    const companyARequest = gate.start("company-a:manage");

    gate.invalidate();
    const companyBRequest = gate.start("company-b:manage");

    expect(gate.isCurrent(companyARequest, "company-b:manage")).toBe(false);
    expect(gate.isCurrent(companyBRequest, "company-b:manage")).toBe(true);
  });

  it("keeps only the newest request identity within one scope", () => {
    const gate = new TenantRequestGate();
    const olderRequest = gate.start("company-a:manage");
    const newerRequest = gate.start("company-a:manage");

    expect(gate.isCurrent(olderRequest, "company-a:manage")).toBe(false);
    expect(gate.isCurrent(newerRequest, "company-a:manage")).toBe(true);
  });

  it("can reactivate after Strict Mode simulates an effect cleanup", () => {
    const gate = new TenantRequestGate();
    const disposedRequest = gate.start("company-a:manage");
    gate.dispose();

    gate.activate();
    const remountedRequest = gate.start("company-a:manage");

    expect(gate.isCurrent(disposedRequest, "company-a:manage")).toBe(false);
    expect(gate.isCurrent(remountedRequest, "company-a:manage")).toBe(true);
  });

  it("rejects state updates after unmount", () => {
    const gate = new TenantRequestGate();
    const request = gate.start("company-a:manage");

    gate.dispose();

    expect(gate.isCurrent(request, "company-a:manage")).toBe(false);
  });
});
