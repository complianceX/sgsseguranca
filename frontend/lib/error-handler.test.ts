import { AxiosError } from "axios";
import { extractApiErrorMessage } from "./error-handler";

describe("extractApiErrorMessage", () => {
  it("normalizes validation messages from JSON payloads", async () => {
    const error = new AxiosError("bad request");
    error.response = {
      status: 400,
      statusText: "Bad Request",
      headers: {},
      config: {},
      data: {
        details: [
          {
            field: "company_id",
            errors: ["Selecione uma empresa"],
          },
        ],
      },
    };

    await expect(
      extractApiErrorMessage(error, "Fallback"),
    ).resolves.toBe("company_id: Selecione uma empresa");
  });

  it("extracts backend messages from blob responses", async () => {
    const error = new AxiosError("service unavailable");
    error.response = {
      status: 503,
      statusText: "Service Unavailable",
      headers: {
        "content-type": "application/json",
      },
      config: {},
      data: {
        text: async () =>
          JSON.stringify({
            message:
              "Storage governado indisponível no momento. Tente novamente em breve.",
          }),
      },
    };

    await expect(
      extractApiErrorMessage(error, "Fallback"),
    ).resolves.toBe(
      "Storage governado indisponível no momento. Tente novamente em breve.",
    );
  });

  it("uses the original error message for non-axios failures", async () => {
    await expect(
      extractApiErrorMessage(new Error("Falha local de renderização"), "Fallback"),
    ).resolves.toBe("Falha local de renderização");
  });
});
