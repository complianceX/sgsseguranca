import { AxiosError } from "axios";
import { getRetryAfterMsFromError } from "@/services/notificationsService";

describe("notificationsService", () => {
  it("extrai retry-after de erro 429", () => {
    const error = new AxiosError("rate limited");
    error.response = {
      status: 429,
      statusText: "Too Many Requests",
      headers: {
        "retry-after": "120",
      },
      config: {},
      data: {},
    };

    expect(getRetryAfterMsFromError(error)).toBe(120_000);
  });

  it("usa fallback quando 429 nao informa retry-after", () => {
    const error = new AxiosError("rate limited");
    error.response = {
      status: 429,
      statusText: "Too Many Requests",
      headers: {},
      config: {},
      data: {},
    };

    expect(getRetryAfterMsFromError(error, 90_000)).toBe(90_000);
  });

  it("ignora erros que nao sao 429", () => {
    const error = new AxiosError("server error");
    error.response = {
      status: 500,
      statusText: "Internal Server Error",
      headers: {},
      config: {},
      data: {},
    };

    expect(getRetryAfterMsFromError(error)).toBeNull();
  });
});
