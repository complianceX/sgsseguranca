export function pdfDocToBase64(doc: { output: (type: 'datauri' | 'dataurl') => string }): string {
  const dataUri = doc.output('datauri');
  const marker = 'base64,';
  const idx = dataUri.indexOf(marker);
  return idx >= 0 ? dataUri.slice(idx + marker.length) : dataUri;
}

