import api from "@/lib/api";
import { aprsService } from "@/services/aprsService";

jest.mock("@/lib/api", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
  },
}));

describe("aprsService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("propaga erro quando o backend falha ao listar evidencias da APR", async () => {
    const routeError = {
      response: { status: 404 },
    };
    (api.get as jest.Mock).mockRejectedValue(routeError);

    await expect(aprsService.listAprEvidences("apr-1")).rejects.toBe(
      routeError,
    );
  });
});
