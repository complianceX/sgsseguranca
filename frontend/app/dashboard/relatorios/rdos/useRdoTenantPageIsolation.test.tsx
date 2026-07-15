import { act, renderHook } from "@testing-library/react";
import { useCallback, useState } from "react";
import { selectedTenantStore } from "@/lib/selectedTenantStore";
import { sessionStore } from "@/lib/sessionStore";
import { useRdoTenantPageIsolation } from "./useRdoTenantPageIsolation";

async function selectTenant(companyId: string) {
  await selectedTenantStore.set({
    companyId,
    companyName: `Empresa ${companyId}`,
  });
}

function useHarness() {
  const [list, setList] = useState<string[]>([]);
  const [overview, setOverview] = useState(0);
  const [viewRdo, setViewRdo] = useState<string | null>(null);
  const [editRdo, setEditRdo] = useState<string | null>(null);
  const [formTenant, setFormTenant] = useState<string | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);

  const clear = useCallback(() => {
    setList([]);
    setOverview(0);
    setViewRdo(null);
    setEditRdo(null);
    setFormTenant(null);
    setPhotos([]);
  }, []);
  const isolation = useRdoTenantPageIsolation(clear);

  return {
    list,
    overview,
    viewRdo,
    editRdo,
    formTenant,
    photos,
    isolation,
    populateA: () => {
      setList(["rdo-A"]);
      setOverview(7);
      setViewRdo("rdo-A");
      setEditRdo("rdo-A");
      setFormTenant("A");
      setPhotos(["foto-A"]);
    },
  };
}

describe("useRdoTenantPageIsolation", () => {
  beforeEach(() => {
    selectedTenantStore.clear();
    sessionStore.clear();
    sessionStorage.clear();
  });

  it("limpa lista, resumo, visualização, edição, formulário e fotos na troca", async () => {
    await selectTenant("A");
    const { result } = renderHook(useHarness);

    act(() => result.current.populateA());
    expect(result.current.list).toEqual(["rdo-A"]);
    expect(result.current.viewRdo).toBe("rdo-A");

    await act(async () => {
      await selectTenant("B");
    });

    expect(result.current.list).toEqual([]);
    expect(result.current.overview).toBe(0);
    expect(result.current.viewRdo).toBeNull();
    expect(result.current.editRdo).toBeNull();
    expect(result.current.formTenant).toBeNull();
    expect(result.current.photos).toEqual([]);
  });

  it("invalida respostas de lista, overview, fotos e abertura de edição de A", async () => {
    await selectTenant("A");
    const { result } = renderHook(useHarness);
    const channels = ["list", "overview", "photos", "openEditor"] as const;
    const tokens = channels.map((channel) =>
      result.current.isolation.start(channel, "A"),
    );

    await act(async () => {
      await selectTenant("B");
    });

    channels.forEach((channel, index) => {
      expect(
        result.current.isolation.isCurrent(channel, tokens[index]!, "A"),
      ).toBe(false);
    });

    expect(result.current.isolation.isActiveCompany("A")).toBe(false);
    expect(result.current.isolation.isActiveCompany("B")).toBe(true);

    const staleHandlerToken = result.current.isolation.start("openEditor", "A");
    expect(
      result.current.isolation.isCurrent(
        "openEditor",
        staleHandlerToken,
        "A",
      ),
    ).toBe(false);
  });

  it.each(["status:rdo-1", "cancel:rdo-1", "save:editor", "upload:rdo-1"])(
    "bloqueia continuação, estado e feedback da operação %s depois da troca de tenant",
    async (channel) => {
      await selectTenant("A");
      const { result } = renderHook(useHarness);
      const operation = result.current.isolation.beginOperation(channel, "A");
      const continuation = jest.fn();

      await act(async () => {
        await selectTenant("B");
      });
      if (result.current.isolation.isOperationCurrent(operation)) {
        continuation();
      }

      expect(continuation).not.toHaveBeenCalled();
      expect(result.current.isolation.isOperationCurrent(operation)).toBe(false);
    },
  );

  it("chaveia fotos por consumidor/documento sem invalidar outro documento", async () => {
    await selectTenant("A");
    const { result } = renderHook(useHarness);
    const editor = result.current.isolation.beginOperation(
      "photos:editor:rdo-1",
      "A",
    );
    const viewer = result.current.isolation.beginOperation(
      "photos:viewer:rdo-2",
      "A",
    );

    expect(result.current.isolation.isOperationCurrent(editor)).toBe(true);
    expect(result.current.isolation.isOperationCurrent(viewer)).toBe(true);
  });
});
