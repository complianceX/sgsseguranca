import api from '@/lib/api';

export type CreatePresignedUploadInput = {
  filename: string;
  contentType?: string;
};

export type CreatePresignedUploadResponse = {
  uploadUrl: string;
  fileKey: string;
  expiresIn: number;
};

export type CompleteUploadInput = {
  fileKey: string;
  originalFilename?: string;
  sha256?: string;
};

export type CompleteUploadResponse = {
  fileKey: string;
  sizeBytes: number;
  sha256Verified: boolean;
};

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function computeSha256(file: File): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error(
      'Web Crypto API indisponível para calcular SHA-256 do upload.',
    );
  }

  const payload =
    typeof file.arrayBuffer === 'function'
      ? await file.arrayBuffer()
      : await new Promise<ArrayBuffer>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () =>
            reject(new Error('Falha ao ler o arquivo para calcular SHA-256.'));
          reader.onload = () => {
            const result = reader.result;
            if (result instanceof ArrayBuffer) {
              resolve(result);
              return;
            }

            reject(
              new Error(
                'Leitura inválida do arquivo para cálculo de integridade.',
              ),
            );
          };
          reader.readAsArrayBuffer(file);
        });
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    payload,
  );
  return toHex(digest);
}

export const storageUploadService = {
  async requestPresignedUpload(
    input: CreatePresignedUploadInput,
  ): Promise<CreatePresignedUploadResponse> {
    const response = await api.post<CreatePresignedUploadResponse>(
      '/storage/presigned-url',
      {
        filename: input.filename,
        contentType: input.contentType || 'application/pdf',
      },
    );
    return response.data;
  },

  async uploadToPresignedUrl(
    uploadUrl: string,
    file: File,
    contentType = file.type || 'application/pdf',
  ): Promise<void> {
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
      },
      body: file,
    });

    if (!response.ok) {
      throw new Error(
        `Falha ao enviar arquivo para a URL presignada (${response.status}).`,
      );
    }
  },

  async completeUpload(
    input: CompleteUploadInput,
  ): Promise<CompleteUploadResponse> {
    const response = await api.post<CompleteUploadResponse>(
      '/storage/complete-upload',
      input,
    );
    return response.data;
  },

  async uploadPdf(file: File): Promise<CompleteUploadResponse> {
    const presigned = await this.requestPresignedUpload({
      filename: file.name,
      contentType: file.type || 'application/pdf',
    });
    const sha256 = await computeSha256(file);

    await this.uploadToPresignedUrl(
      presigned.uploadUrl,
      file,
      file.type || 'application/pdf',
    );

    return this.completeUpload({
      fileKey: presigned.fileKey,
      originalFilename: file.name,
      sha256,
    });
  },
};
