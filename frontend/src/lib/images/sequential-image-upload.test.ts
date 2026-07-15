import { uploadSequentially } from "./sequential-image-upload";

describe("uploadSequentially integration harness", () => {
  it("mantém uma requisição ativa, limita o lote e preserva sucessos parciais em ordem", async () => {
    let active = 0;
    let peak = 0;
    const started: number[] = [];
    const result = await uploadSequentially([0, 1, 2, 3, 4, 5], async (value) => {
      active += 1;
      peak = Math.max(peak, active);
      started.push(value);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
      if (value === 2) throw new Error("429");
      return `ref-${value}`;
    });

    expect(peak).toBe(1);
    expect(started).toEqual([0, 1, 2, 3, 4]);
    expect(result.successes.map(({ value }) => value)).toEqual([
      "ref-0",
      "ref-1",
      "ref-3",
      "ref-4",
    ]);
    expect(result.failures).toEqual([
      expect.objectContaining({ index: 2, error: expect.any(Error) }),
    ]);
  });
});
