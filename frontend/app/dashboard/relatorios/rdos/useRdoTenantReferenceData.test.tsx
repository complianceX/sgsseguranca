import { act, renderHook, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { selectedTenantStore } from "@/lib/selectedTenantStore";
import { sessionStore } from "@/lib/sessionStore";
import { sitesService, type Site } from "@/services/sitesService";
import { usersService, type User } from "@/services/usersService";
import { useRdoTenantReferenceData } from "./useRdoTenantReferenceData";

jest.mock("@/services/sitesService", () => ({
  sitesService: { findAll: jest.fn() },
}));
jest.mock("@/services/usersService", () => ({
  usersService: { findAll: jest.fn() },
}));

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function site(companyId: string): Site {
  return {
    id: `site-${companyId}`,
    nome: `Obra ${companyId}`,
    company_id: companyId,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

function user(companyId: string): User {
  return {
    id: `user-${companyId}`,
    nome: `Responsável ${companyId}`,
    email: `${companyId}@example.com`,
    cpf: "00000000000",
    role: "user",
    company_id: companyId,
    profile_id: `profile-${companyId}`,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

async function selectTenant(companyId: string) {
  await selectedTenantStore.set({
    companyId,
    companyName: `Empresa ${companyId}`,
  });
}

describe("useRdoTenantReferenceData integrado", () => {
  beforeEach(() => {
    selectedTenantStore.clear();
    sessionStore.clear();
    sessionStorage.clear();
  });

  it("limpa sites e usuários visíveis de A antes de as respostas de B chegarem", async () => {
    const sitesB = deferred<Site[]>();
    const usersB = deferred<User[]>();
    jest.spyOn(sitesService, "findAll").mockImplementation((companyId) =>
      companyId === "A" ? Promise.resolve([site("A")]) : sitesB.promise,
    );
    jest.spyOn(usersService, "findAll").mockImplementation((companyId) =>
      companyId === "A" ? Promise.resolve([user("A")]) : usersB.promise,
    );
    await selectTenant("A");

    const { result } = renderHook(() =>
      useRdoTenantReferenceData({
        canManageRdo: true,
        onReferenceDataError: jest.fn(),
      }),
    );

    await waitFor(() => expect(result.current.sites).toEqual([site("A")]));
    await act(async () => {
      await result.current.ensureUsersLoaded();
    });
    expect(result.current.users).toEqual([user("A")]);

    await act(async () => {
      await selectTenant("B");
    });

    expect(result.current.activeCompanyId).toBe("B");
    expect(result.current.sites).toEqual([]);
    expect(result.current.users).toEqual([]);

    let usersLoad!: Promise<void>;
    act(() => {
      usersLoad = result.current.ensureUsersLoaded();
    });
    expect(result.current.sites).toEqual([]);
    expect(result.current.users).toEqual([]);

    await act(async () => {
      sitesB.resolve([site("B")]);
      usersB.resolve([user("B")]);
      await usersLoad;
    });
  });

  it("ignora respostas tardias de A e mantém somente o estado de B", async () => {
    const sitesA = deferred<Site[]>();
    const sitesB = deferred<Site[]>();
    const usersA = deferred<User[]>();
    const usersB = deferred<User[]>();
    jest.spyOn(sitesService, "findAll").mockImplementation((companyId) =>
      companyId === "A" ? sitesA.promise : sitesB.promise,
    );
    jest.spyOn(usersService, "findAll").mockImplementation((companyId) =>
      companyId === "A" ? usersA.promise : usersB.promise,
    );
    await selectTenant("A");

    const { result } = renderHook(() =>
      useRdoTenantReferenceData({
        canManageRdo: true,
        onReferenceDataError: jest.fn(),
      }),
    );
    let oldUsersLoad!: Promise<void>;
    act(() => {
      oldUsersLoad = result.current.ensureUsersLoaded();
    });

    await act(async () => {
      await selectTenant("B");
    });
    let currentUsersLoad!: Promise<void>;
    act(() => {
      currentUsersLoad = result.current.ensureUsersLoaded();
    });

    await act(async () => {
      sitesB.resolve([site("B")]);
      usersB.resolve([user("B")]);
      await currentUsersLoad;
    });
    expect(result.current.sites).toEqual([site("B")]);
    expect(result.current.users).toEqual([user("B")]);

    await act(async () => {
      sitesA.resolve([site("A")]);
      usersA.resolve([user("A")]);
      await oldUsersLoad;
    });
    expect(result.current.activeCompanyId).toBe("B");
    expect(result.current.sites).toEqual([site("B")]);
    expect(result.current.users).toEqual([user("B")]);
  });

  it("silencia erro tardio de A sem toast, log ou erro de tela", async () => {
    const sitesA = deferred<Site[]>();
    const sitesB = deferred<Site[]>();
    const usersA = deferred<User[]>();
    jest.spyOn(sitesService, "findAll").mockImplementation((companyId) =>
      companyId === "A" ? sitesA.promise : sitesB.promise,
    );
    jest.spyOn(usersService, "findAll").mockImplementation((companyId) =>
      companyId === "A" ? usersA.promise : Promise.resolve([user("B")]),
    );
    const toastError = jest.spyOn(toast, "error").mockImplementation(() => "" as never);
    const loggerError = jest.spyOn(logger, "error").mockImplementation(() => undefined);
    const onReferenceDataError = jest.fn();
    await selectTenant("A");

    const { result } = renderHook(() =>
      useRdoTenantReferenceData({ canManageRdo: true, onReferenceDataError }),
    );
    let oldUsersLoad!: Promise<void>;
    act(() => {
      oldUsersLoad = result.current.ensureUsersLoaded();
    });
    await act(async () => {
      await selectTenant("B");
    });

    await act(async () => {
      sitesA.reject(new Error("site A falhou tarde"));
      usersA.reject(new Error("users A falhou tarde"));
      await oldUsersLoad;
    });

    expect(toastError).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
    expect(onReferenceDataError).not.toHaveBeenCalled();
  });

  it("não reaproveita no tenant B a promise de usuários iniciada em A", async () => {
    const usersA = deferred<User[]>();
    const usersB = deferred<User[]>();
    jest.spyOn(sitesService, "findAll").mockResolvedValue([]);
    const findUsers = jest
      .spyOn(usersService, "findAll")
      .mockImplementation((companyId) =>
        companyId === "A" ? usersA.promise : usersB.promise,
      );
    await selectTenant("A");

    const { result } = renderHook(() =>
      useRdoTenantReferenceData({
        canManageRdo: true,
        onReferenceDataError: jest.fn(),
      }),
    );
    act(() => {
      void result.current.ensureUsersLoaded();
    });
    expect(findUsers).toHaveBeenCalledWith("A");

    await act(async () => {
      await selectTenant("B");
    });
    act(() => {
      void result.current.ensureUsersLoaded();
    });

    expect(findUsers).toHaveBeenCalledTimes(2);
    expect(findUsers).toHaveBeenNthCalledWith(2, "B");

    await act(async () => {
      usersB.resolve([user("B")]);
    });
    expect(result.current.users).toEqual([user("B")]);

    await act(async () => {
      usersA.resolve([user("A")]);
    });
    expect(result.current.users).toEqual([user("B")]);
  });
});
