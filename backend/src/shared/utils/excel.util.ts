import * as ExcelJS from 'exceljs';

function toExcelJsBuffer(buffer: Buffer): ExcelJS.Buffer {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ExcelJS.Buffer;
}

/**
 * Utility functions to generate Excel buffers using ExcelJS.
 * Replaces the vulnerable `xlsx` package (Prototype Pollution + ReDoS).
 */

/**
 * Creates an Excel buffer from an array of key-value row objects.
 * Column headers are derived from the keys of the first row.
 */
export async function jsonToExcelBuffer(
  rows: Record<string, unknown>[],
  sheetName: string,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);

  if (rows.length > 0) {
    const keys = Object.keys(rows[0]);
    worksheet.columns = keys.map((key) => ({ header: key, key, width: 20 }));
    for (const row of rows) {
      worksheet.addRow(row);
    }
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Creates an Excel buffer from an array-of-arrays (AOA) structure,
 * supporting multiple sheets, column widths, and cell merges.
 */
export async function aoaToExcelBuffer(
  sheets: Array<{
    name: string;
    rows: unknown[][];
    colWidths?: number[];
    merges?: Array<{
      startRow: number;
      startCol: number;
      endRow: number;
      endCol: number;
    }>;
  }>,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  for (const sheet of sheets) {
    const worksheet = workbook.addWorksheet(sheet.name);

    for (const row of sheet.rows) {
      worksheet.addRow(row);
    }

    if (sheet.colWidths) {
      sheet.colWidths.forEach((width, index) => {
        const col = worksheet.getColumn(index + 1);
        col.width = width;
      });
    }

    if (sheet.merges) {
      for (const merge of sheet.merges) {
        worksheet.mergeCells(
          merge.startRow,
          merge.startCol,
          merge.endRow,
          merge.endCol,
        );
      }
    }
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Reads an Excel buffer and returns all sheets as arrays of arrays.
 */
export async function readExcelBuffer(buffer: Buffer): Promise<
  Array<{
    sheetName: string;
    rows: Array<Array<string | number | Date | null | undefined>>;
  }>
> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(toExcelJsBuffer(buffer));

  const result: Array<{
    sheetName: string;
    rows: Array<Array<string | number | Date | null | undefined>>;
  }> = [];

  workbook.eachSheet((worksheet) => {
    const rows: Array<Array<string | number | Date | null | undefined>> = [];
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      const values = row.values as Array<
        string | number | Date | null | undefined
      >;
      // ExcelJS row.values is 1-indexed; slot 0 is undefined
      rows.push(values.slice(1));
    });
    if (rows.length > 0) {
      result.push({ sheetName: worksheet.name, rows });
    }
  });

  return result;
}

/**
 * Reads an Excel buffer and extracts text from the first sheet (for document import).
 */
export async function excelSheetToText(buffer: Buffer): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(toExcelJsBuffer(buffer));

  const worksheet = workbook.worksheets[0];
  if (!worksheet) return '';

  const lines: string[] = [];
  worksheet.eachRow((row) => {
    const values = (row.values as unknown[]).slice(1).map((value) => {
      if (value == null) return '';
      if (value instanceof Date) return value.toISOString();
      if (typeof value === 'object') return JSON.stringify(value);
      if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean' ||
        typeof value === 'bigint'
      ) {
        return String(value);
      }
      return '';
    });
    lines.push(values.join('\t'));
  });

  return lines.join('\n');
}
