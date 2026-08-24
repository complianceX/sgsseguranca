/**
 * Remove segmentos EXIF (APP1, APP2, APP3-APP15) de buffers JPEG antes de
 * envio a provedores externos de IA. Preserva apenas APP0 (JFIF), dados de
 * quantização (DQT), Huffman (DHT), frames (SOF), e o stream de scan (SOS).
 *
 * Motivation: imagens de obra podem conter GPS, identificação de dispositivo
 * e outros metadados sensíveis que não devem sair do tenant.
 *
 * Não altera o conteúdo visual nem altera a compressão JPEG.
 * Se o buffer não iniciar com SOI (0xFFD8), é retornado intacto.
 */
export function stripJpegExifMetadata(buffer: Buffer): Buffer {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return buffer; // não é JPEG — devolve intacto
  }

  const chunks: Buffer[] = [buffer.subarray(0, 2)]; // SOI
  let pos = 2;

  while (pos + 1 < buffer.length) {
    if (buffer[pos] !== 0xff) break; // marcador inválido

    const marker = buffer[pos + 1];

    if (marker === 0xd9) {
      // EOI — fim do arquivo
      chunks.push(buffer.subarray(pos));
      break;
    }

    if (marker === 0xda) {
      // SOS — stream comprimido; copia o restante e encerra
      chunks.push(buffer.subarray(pos));
      break;
    }

    // Marcadores sem payload (RST0–RST7, etc.)
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      chunks.push(buffer.subarray(pos, pos + 2));
      pos += 2;
      continue;
    }

    if (pos + 3 >= buffer.length) break;
    const segLen = (buffer[pos + 2] << 8) | buffer[pos + 3]; // inclui os 2 bytes do campo
    const segEnd = pos + 2 + segLen;

    if (segEnd > buffer.length) break; // segmento truncado

    // APP1 (EXIF/XMP) e APP2-APP15 são descartados.
    // APP0 (JFIF, 0xE0) é preservado porque indica formato JFIF.
    const isAppn = marker >= 0xe0 && marker <= 0xef;
    const isExifCarrier = isAppn && marker !== 0xe0;

    if (!isExifCarrier) {
      chunks.push(buffer.subarray(pos, segEnd));
    }

    pos = segEnd;
  }

  return Buffer.concat(chunks);
}
