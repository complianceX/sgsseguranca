import { act, renderHook, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import type {
  GovernedDocumentVideoAccessResponse,
  GovernedDocumentVideoAttachment,
  GovernedDocumentVideoMutationResponse,
} from "@/lib/videos/documentVideos";
import { useDocumentVideos } from "./useDocumentVideos";

jest.mock("sonner", () => ({
  toast: { error: jest.fn(), info: jest.fn(), success: jest.fn(), warning: jest.fn() },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const videoA = { id: "a", company_id: "A" } as GovernedDocumentVideoAttachment;
const videoB = { id: "b", company_id: "B" } as GovernedDocumentVideoAttachment;
const mutation = (attachments: GovernedDocumentVideoAttachment[]) => ({
  attachments,
  attachment: attachments[0] || videoA,
  message: "ok",
} as GovernedDocumentVideoMutationResponse);
const access = {
  url: null,
  message: "indisponível",
  video: videoA,
} as GovernedDocumentVideoAccessResponse;

function services() {
  return {
    loadVideos: jest
      .fn<Promise<GovernedDocumentVideoAttachment[]>, [string]>()
      .mockResolvedValueOnce([videoA])
      .mockResolvedValue([videoB]),
    uploadVideo: jest.fn(async () => mutation([videoA])),
    removeVideo: jest.fn(async () => mutation([])),
    getVideoAccess: jest.fn(async () => access),
  };
}

function setup(api: ReturnType<typeof services>) {
  return renderHook(
    ({ operationKey }) => useDocumentVideos({
      documentId: "doc", operationKey, ...api,
    }),
    { initialProps: { operationKey: "A:doc" } },
  );
}

describe("useDocumentVideos tenant-safe mutations", () => {
  it("descarta loadVideos tardio do tenant anterior", async () => {
    const pendingA = deferred<GovernedDocumentVideoAttachment[]>();
    const api = services();
    api.loadVideos
      .mockReset()
      .mockReturnValueOnce(pendingA.promise)
      .mockResolvedValueOnce([videoB]);
    const { result, rerender } = setup(api);

    rerender({ operationKey: "B:doc" });
    await waitFor(() => expect(result.current.attachments).toEqual([videoB]));
    await act(async () => pendingA.resolve([videoA]));

    expect(result.current.attachments).toEqual([videoB]);
    expect(result.current.loading).toBe(false);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("descarta estado, toast e retorno de upload stale", async () => {
    const pending = deferred<GovernedDocumentVideoMutationResponse>();
    const api = services();
    api.uploadVideo.mockImplementationOnce(() => pending.promise);
    const { result, rerender } = setup(api);
    await waitFor(() => expect(result.current.attachments).toEqual([videoA]));
    let promise!: ReturnType<typeof result.current.handleUpload>;
    act(() => { promise = result.current.handleUpload(new File(["x"], "x.mp4")); });
    rerender({ operationKey: "B:doc" });
    await waitFor(() => expect(result.current.attachments).toEqual([videoB]));
    await act(async () => pending.resolve(mutation([videoA])));
    await expect(promise).resolves.toBeNull();
    expect(result.current.attachments).toEqual([videoB]);
    expect(result.current.uploading).toBe(false);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("descarta estado, toast e retorno de remoção stale", async () => {
    const pending = deferred<GovernedDocumentVideoMutationResponse>();
    const api = services();
    api.removeVideo.mockImplementationOnce(() => pending.promise);
    const { result, rerender } = setup(api);
    await waitFor(() => expect(result.current.attachments).toEqual([videoA]));
    let promise!: ReturnType<typeof result.current.handleRemove>;
    act(() => { promise = result.current.handleRemove(videoA); });
    rerender({ operationKey: "B:doc" });
    await waitFor(() => expect(result.current.attachments).toEqual([videoB]));
    await act(async () => pending.resolve(mutation([])));
    await expect(promise).resolves.toBeNull();
    expect(result.current.attachments).toEqual([videoB]);
    expect(result.current.removingId).toBeNull();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("descarta feedback e retorno de acesso stale", async () => {
    const pending = deferred<GovernedDocumentVideoAccessResponse>();
    const api = services();
    api.getVideoAccess.mockImplementationOnce(() => pending.promise);
    const { result, rerender } = setup(api);
    await waitFor(() => expect(result.current.attachments).toEqual([videoA]));
    const promise = result.current.resolveAccess(videoA);
    rerender({ operationKey: "B:doc" });
    await act(async () => pending.resolve(access));
    await expect(promise).resolves.toBeNull();
    expect(toast.warning).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("não produz feedback nem rejeição depois de unmount", async () => {
    const pending = deferred<GovernedDocumentVideoMutationResponse>();
    const api = services();
    api.uploadVideo.mockImplementationOnce(() => pending.promise);
    const { result, unmount } = setup(api);
    await waitFor(() => expect(result.current.attachments).toEqual([videoA]));
    let promise!: ReturnType<typeof result.current.handleUpload>;
    act(() => { promise = result.current.handleUpload(new File(["x"], "x.mp4")); });
    unmount();
    await act(async () => pending.reject(new Error("stale")));
    await expect(promise).resolves.toBeNull();
    expect(toast.error).not.toHaveBeenCalled();
  });
});
