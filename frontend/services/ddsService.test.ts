import api from "@/lib/api";
import { ddsService } from "@/services/ddsService";

jest.mock("@/lib/api", () => ({
  __esModule: true,
  default: {
    put: jest.fn(),
  },
}));

describe("ddsService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("envia substituicao de assinaturas do DDS para a rota dedicada", async () => {
    (api.put as jest.Mock).mockResolvedValue({
      data: {
        participantSignatures: 2,
        teamPhotos: 1,
        duplicatePhotoWarnings: [],
      },
    });

    await expect(
      ddsService.replaceSignatures("dds-1", {
        participant_signatures: [
          {
            user_id: "user-1",
            signature_data: "sig-1",
            type: "digital",
          },
        ],
        team_photos: [],
      }),
    ).resolves.toEqual({
      participantSignatures: 2,
      teamPhotos: 1,
      duplicatePhotoWarnings: [],
    });

    expect(api.put).toHaveBeenCalledWith("/dds/dds-1/signatures", {
      participant_signatures: [
        {
          user_id: "user-1",
          signature_data: "sig-1",
          type: "digital",
        },
      ],
      team_photos: [],
    });
  });
});
