jest.mock("@/lib/api", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));

import api from "@/lib/api";
import { rdosService } from "./rdosService";

describe("rdosService", () => {
  it("baixa o PDF oficial do RDO via rota governada", async () => {
    (api.get as jest.Mock).mockResolvedValueOnce({
      data: new Blob(["pdf"], { type: "application/pdf" }),
    });

    const result = await rdosService.downloadPdf("rdo-1");

    expect(api.get).toHaveBeenCalledWith("/rdos/rdo-1/pdf/download", {
      responseType: "blob",
    });
    expect(result).toBeInstanceOf(Blob);
  });
});
