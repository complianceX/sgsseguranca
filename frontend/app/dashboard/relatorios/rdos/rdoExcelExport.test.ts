import { downloadExcelBlob, fetchExcelBlob } from "@/lib/download-excel";
import { exportCurrentRdoExcel } from "./rdoExcelExport";

jest.mock("@/lib/download-excel", () => ({
  fetchExcelBlob: jest.fn(),
  downloadExcelBlob: jest.fn(),
}));

const mockedFetchExcelBlob = jest.mocked(fetchExcelBlob);
const mockedDownloadExcelBlob = jest.mocked(downloadExcelBlob);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("exportCurrentRdoExcel", () => {
  beforeEach(() => jest.clearAllMocks());

  it("não dispara download quando o export fica stale durante a requisição", async () => {
    const pending = deferred<Blob>();
    mockedFetchExcelBlob.mockReturnValueOnce(pending.promise);
    let current = true;

    const exportPromise = exportCurrentRdoExcel({
      url: "/rdos/export/excel",
      filename: "rdos.xlsx",
      isCurrent: () => current,
    });
    current = false;
    pending.resolve(new Blob(["tenant-a"]));

    await expect(exportPromise).resolves.toBe(false);
    expect(mockedDownloadExcelBlob).not.toHaveBeenCalled();
  });

  it("dispara download quando a operação continua atual", async () => {
    const blob = new Blob(["tenant-a"]);
    mockedFetchExcelBlob.mockResolvedValueOnce(blob);

    await expect(
      exportCurrentRdoExcel({
        url: "/rdos/export/excel",
        filename: "rdos.xlsx",
        isCurrent: () => true,
      }),
    ).resolves.toBe(true);
    expect(mockedDownloadExcelBlob).toHaveBeenCalledWith(blob, "rdos.xlsx");
  });
});
