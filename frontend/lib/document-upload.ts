export async function attachPdfIfProvided(
  entityId: string | undefined,
  file: File | null | undefined,
  attachFn: (id: string, file: File) => Promise<unknown>,
): Promise<void> {
  if (!entityId || !file) {
    return;
  }

  await attachFn(entityId, file);
}

