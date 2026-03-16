export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      if (!base64) {
        reject(new Error('Falha ao converter PDF para base64.'));
        return;
      }
      resolve(base64);
    };
    reader.onerror = () =>
      reject(new Error('Falha ao ler o PDF armazenado para envio.'));
    reader.readAsDataURL(blob);
  });
}

export function base64ToPdfBlob(base64: string): Blob {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);

  for (let index = 0; index < byteCharacters.length; index += 1) {
    byteNumbers[index] = byteCharacters.charCodeAt(index);
  }

  return new Blob([new Uint8Array(byteNumbers)], {
    type: 'application/pdf',
  });
}

export function base64ToPdfFile(base64: string, filename: string): File {
  return new File([base64ToPdfBlob(base64)], filename, {
    type: 'application/pdf',
  });
}
