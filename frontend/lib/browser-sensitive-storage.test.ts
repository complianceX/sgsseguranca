import { clearSensitiveBrowserStorage } from "./browser-sensitive-storage";

describe("clearSensitiveBrowserStorage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("remove caches, fila offline e rascunhos sensiveis do browser", () => {
    window.localStorage.setItem("gst.cache.aprs", '{"cpf":"12345678900"}');
    window.localStorage.setItem("gst.offline.queue", "enc:payload");
    window.localStorage.setItem("gst.apr.wizard.draft.company-1", "{}");
    window.localStorage.setItem("gst.pt.wizard.draft.company-1", "{}");
    window.localStorage.setItem("gst.nc.sophie.preview.nc-1", "{}");
    window.localStorage.setItem("theme", "dark");

    clearSensitiveBrowserStorage();

    expect(window.localStorage.getItem("gst.cache.aprs")).toBeNull();
    expect(window.localStorage.getItem("gst.offline.queue")).toBeNull();
    expect(
      window.localStorage.getItem("gst.apr.wizard.draft.company-1"),
    ).toBeNull();
    expect(
      window.localStorage.getItem("gst.pt.wizard.draft.company-1"),
    ).toBeNull();
    expect(
      window.localStorage.getItem("gst.nc.sophie.preview.nc-1"),
    ).toBeNull();
    expect(window.localStorage.getItem("theme")).toBe("dark");
  });
});
