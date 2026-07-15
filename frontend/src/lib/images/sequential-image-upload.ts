export type SequentialUploadResult<T> = {
  successes: Array<{ index: number; value: T }>;
  failures: Array<{ index: number; error: unknown }>;
};

/**
 * Upload harness for rate-limited image endpoints. It never starts a second
 * request before the previous one settles and never discards partial success.
 */
export async function uploadSequentially<TInput, TResult>(
  inputs: readonly TInput[],
  upload: (input: TInput, index: number) => Promise<TResult>,
  maxBatch = 5,
): Promise<SequentialUploadResult<TResult>> {
  const successes: SequentialUploadResult<TResult>["successes"] = [];
  const failures: SequentialUploadResult<TResult>["failures"] = [];
  const batch = inputs.slice(0, Math.max(0, maxBatch));
  for (let index = 0; index < batch.length; index += 1) {
    try {
      successes.push({ index, value: await upload(batch[index]!, index) });
    } catch (error) {
      failures.push({ index, error });
    }
  }
  return { successes, failures };
}
