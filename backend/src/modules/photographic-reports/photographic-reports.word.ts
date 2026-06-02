import JSZip from 'jszip';
import type {
  PhotographicReportDayResponse,
  PhotographicReportImageResponse,
  PhotographicReportResponse,
} from './photographic-reports.types';
import {
  PhotographicReportAreaStatus,
  PhotographicReportShift,
} from './entities/photographic-report.entity';

export type PhotographicReportWordImage = PhotographicReportImageResponse & {
  data_url: string | null;
  activity_date_label: string;
};

type BuildPhotographicReportWordBufferOptions = {
  companyName: string;
  generatedAt?: string;
  renderableImages: PhotographicReportWordImage[];
};

type ImageBinary = {
  buffer: Buffer;
  contentType: string;
  extension: string;
  width: number;
  height: number;
};

const EMU_PER_PIXEL = 9525;
const MAX_IMAGE_WIDTH = 580;
const MAX_IMAGE_HEIGHT = 410;

function escapeXml(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toText(value: string | number | null | undefined): string {
  const normalized = String(value ?? '').trim();
  return normalized.length > 0 ? normalized : '-';
}

function formatDate(value?: string | null): string {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleDateString('pt-BR');
}

function formatDateTime(value?: string | null): string {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString('pt-BR');
}

function formatTime(value?: string | null): string {
  if (!value) return '-';
  const trimmed = value.trim();
  return trimmed.length >= 5 ? trimmed.slice(0, 5) : trimmed;
}

function buildPeriodLabel(report: PhotographicReportResponse): string {
  const start = formatDate(report.start_date);
  const end = report.end_date ? formatDate(report.end_date) : start;
  return start === end ? start : `${start} a ${end}`;
}

function buildCoverHighlight(report: PhotographicReportResponse): string {
  if (
    report.area_status === PhotographicReportAreaStatus.LOJA_FECHADA ||
    report.area_status === PhotographicReportAreaStatus.AREA_CONTROLADA ||
    report.shift === PhotographicReportShift.NOTURNO
  ) {
    return 'ATIVIDADE REGISTRADA COM CONTROLE OPERACIONAL, MENOR INTERFERÊNCIA EXTERNA E CONDIÇÕES FAVORÁVEIS PARA EXECUÇÃO SEGURA.';
  }

  return 'ATIVIDADE REGISTRADA COM ORGANIZAÇÃO OPERACIONAL, CONTROLE DA FRENTE DE SERVIÇO E BOAS CONDIÇÕES DE EXECUÇÃO.';
}

function groupImagesByDay(
  days: PhotographicReportDayResponse[],
  images: PhotographicReportWordImage[],
): Array<{
  day: PhotographicReportDayResponse | null;
  items: PhotographicReportWordImage[];
}> {
  const buckets = new Map<string, PhotographicReportWordImage[]>();
  const dayMap = new Map<string, PhotographicReportDayResponse>();

  days.forEach((day) => dayMap.set(day.id, day));

  for (const image of images) {
    const key = image.report_day_id || 'unassigned';
    const existing = buckets.get(key) || [];
    existing.push(image);
    buckets.set(key, existing);
  }

  const orderedDayIds = [
    ...days
      .slice()
      .sort((left, right) =>
        left.activity_date.localeCompare(right.activity_date),
      )
      .map((day) => day.id),
    ...(buckets.has('unassigned') ? ['unassigned'] : []),
  ];

  return orderedDayIds.map((dayId) => ({
    day: dayId === 'unassigned' ? null : dayMap.get(dayId) || null,
    items: (buckets.get(dayId) || []).sort(
      (left, right) => left.image_order - right.image_order,
    ),
  }));
}

function parseImageBinary(dataUrl: string): ImageBinary {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) {
    throw new Error('Imagem em formato inválido para exportação Word.');
  }

  const contentType = match[1].toLowerCase();
  const buffer = Buffer.from(match[2], 'base64');
  const extension =
    contentType === 'image/png'
      ? 'png'
      : contentType === 'image/gif'
        ? 'gif'
        : contentType === 'image/webp'
          ? 'webp'
          : 'jpg';

  const dimensions = getImageDimensions(buffer, contentType);
  return { buffer, contentType, extension, ...dimensions };
}

function getImageDimensions(
  buffer: Buffer,
  contentType: string,
): { width: number; height: number } {
  try {
    if (contentType === 'image/png' && buffer.length >= 24) {
      return {
        width: buffer.readUInt32BE(16),
        height: buffer.readUInt32BE(20),
      };
    }

    if (contentType === 'image/gif' && buffer.length >= 10) {
      return {
        width: buffer.readUInt16LE(6),
        height: buffer.readUInt16LE(8),
      };
    }

    if (contentType === 'image/webp' && buffer.length >= 30) {
      const chunkType = buffer.toString('ascii', 12, 16);
      if (chunkType === 'VP8X' && buffer.length >= 30) {
        const width = 1 + buffer.readUIntLE(24, 3);
        const height = 1 + buffer.readUIntLE(27, 3);
        return { width, height };
      }
      if (chunkType === 'VP8L' && buffer.length >= 25) {
        const b0 = buffer[21];
        const b1 = buffer[22];
        const b2 = buffer[23];
        const b3 = buffer[24];
        const width = 1 + (((b1 & 0x3f) << 8) | b0);
        const height =
          1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
        return { width, height };
      }
      if (chunkType === 'VP8 ' && buffer.length >= 30) {
        const width = buffer.readUInt16LE(26) & 0x3fff;
        const height = buffer.readUInt16LE(28) & 0x3fff;
        return { width, height };
      }
    }

    if (contentType === 'image/jpeg') {
      let offset = 2;
      while (offset < buffer.length) {
        if (buffer[offset] !== 0xff) {
          offset += 1;
          continue;
        }

        const marker = buffer[offset + 1];
        if (marker === 0xc0 || marker === 0xc2 || marker === 0xc1) {
          const height = buffer.readUInt16BE(offset + 5);
          const width = buffer.readUInt16BE(offset + 7);
          return { width, height };
        }

        const size = buffer.readUInt16BE(offset + 2);
        offset += 2 + size;
      }
    }
  } catch {
    // Fallback to dimensions below.
  }

  return { width: 1600, height: 900 };
}

function scaleImage(dimensions: { width: number; height: number }) {
  const widthRatio = MAX_IMAGE_WIDTH / dimensions.width;
  const heightRatio = MAX_IMAGE_HEIGHT / dimensions.height;
  const ratio = Math.min(widthRatio, heightRatio, 1);

  return {
    width: Math.max(1, Math.round(dimensions.width * ratio)),
    height: Math.max(1, Math.round(dimensions.height * ratio)),
  };
}

function makeTextRun(
  text: string,
  options?: { bold?: boolean; size?: number; color?: string; center?: boolean },
): string {
  const rPr: string[] = [];
  if (options?.bold) {
    rPr.push('<w:b/>');
  }
  if (options?.size) {
    rPr.push(`<w:sz w:val="${Math.round(options.size * 2)}"/>`);
  }
  if (options?.color) {
    rPr.push(`<w:color w:val="${options.color}"/>`);
  }

  return `
    <w:r>
      ${rPr.length ? `<w:rPr>${rPr.join('')}</w:rPr>` : ''}
      <w:t xml:space="preserve">${escapeXml(text)}</w:t>
    </w:r>
  `;
}

function makeParagraph(
  text: string,
  options?: {
    bold?: boolean;
    size?: number;
    color?: string;
    center?: boolean;
    pageBreakBefore?: boolean;
    spacingAfter?: number;
  },
): string {
  const pPr: string[] = [];
  if (options?.center) {
    pPr.push('<w:jc w:val="center"/>');
  }
  if (options?.pageBreakBefore) {
    pPr.push('<w:pageBreakBefore/>');
  }
  if (options?.spacingAfter !== undefined) {
    pPr.push(`<w:spacing w:after="${options.spacingAfter}"/>`);
  }

  return `
    <w:p>
      ${pPr.length ? `<w:pPr>${pPr.join('')}</w:pPr>` : ''}
      ${makeTextRun(text, options)}
    </w:p>
  `;
}

function makePageBreak(): string {
  return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
}

function makeTable(
  rows: Array<Array<string>>,
  options?: { header?: boolean; widths?: number[] },
): string {
  const widths = options?.widths || [];
  const rowXml = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((cell, cellIndex) => {
          const width = widths[cellIndex] || 4000;
          const isHeader = options?.header && rowIndex === 0;
          return `
            <w:tc>
              <w:tcPr>
                <w:tcW w:w="${width}" w:type="dxa"/>
              </w:tcPr>
              ${makeParagraph(cell, {
                bold: isHeader,
                size: 9,
                color: isHeader ? '17324c' : '31465a',
              })}
            </w:tc>
          `;
        })
        .join('');

      return `<w:tr>${cells}</w:tr>`;
    })
    .join('');

  return `
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="0" w:type="auto"/>
        <w:tblLook w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/>
        <w:tblBorders>
          <w:top w:val="single" w:sz="8" w:space="0" w:color="D9E2EC"/>
          <w:left w:val="single" w:sz="8" w:space="0" w:color="D9E2EC"/>
          <w:bottom w:val="single" w:sz="8" w:space="0" w:color="D9E2EC"/>
          <w:right w:val="single" w:sz="8" w:space="0" w:color="D9E2EC"/>
          <w:insideH w:val="single" w:sz="8" w:space="0" w:color="D9E2EC"/>
          <w:insideV w:val="single" w:sz="8" w:space="0" w:color="D9E2EC"/>
        </w:tblBorders>
      </w:tblPr>
      <w:tblGrid>
        ${
          rowXml
            ? (options?.widths || [4000, 9000])
                .map((width) => `<w:gridCol w:w="${width}"/>`)
                .join('')
            : ''
        }
      </w:tblGrid>
      ${rowXml}
    </w:tbl>
  `;
}

function buildDocumentBody(
  report: PhotographicReportResponse,
  options: BuildPhotographicReportWordBufferOptions,
  mediaEntries: Array<{ relId: string; width: number; height: number }>,
): string {
  const groupedImages = groupImagesByDay(
    report.days || [],
    options.renderableImages,
  );
  const exportsList = (report.exports || [])
    .slice()
    .sort((left, right) => left.generated_at.localeCompare(right.generated_at))
    .map((entry) => [
      entry.export_type.toUpperCase(),
      formatDateTime(entry.generated_at),
      entry.download_url || entry.file_url,
    ]);

  const flattenedImages = options.renderableImages.map((image) => ({
    ...image,
    positivePoints: (image.ai_positive_points || []).slice(0, 5),
    recommendations: (image.ai_recommendations || []).slice(0, 5),
  }));

  let mediaIndex = 0;
  const body: string[] = [];

  body.push(
    makeParagraph('RELATÓRIO FOTOGRÁFICO', {
      bold: true,
      size: 22,
      center: true,
      spacingAfter: 180,
    }),
  );
  body.push(
    makeParagraph(
      `${options.companyName} · documento profissional de registro visual, análise técnica e histórico operacional.`,
      { center: true, size: 11, spacingAfter: 150 },
    ),
  );
  body.push(
    makeParagraph(buildCoverHighlight(report), {
      bold: true,
      size: 11,
      color: 'FFFFFF',
      center: true,
      spacingAfter: 120,
    }),
  );
  body.push(
    makeTable(
      [
        ['Cliente', report.client_name],
        ['Obra', report.project_name],
        ['Unidade', report.unit_name || '-'],
        ['Local', report.location || '-'],
        ['Data', buildPeriodLabel(report)],
        [
          'Período',
          `${formatTime(report.start_time)} às ${formatTime(report.end_time)}`,
        ],
        ['Tipo de atividade', report.activity_type],
        ['Responsável', report.responsible_name],
        ['Empresa executora', report.contractor_company],
        ['Turno', report.shift],
        ['Condição da área', report.area_status],
        ['Tom do relatório', report.report_tone],
      ],
      { widths: [3500, 9500] },
    ),
  );

  body.push(
    makeParagraph(
      `Resumo: ${report.ai_summary || 'Consolidação técnica em andamento'}`,
      {
        size: 10.5,
        spacingAfter: 60,
      },
    ),
  );
  body.push(
    makeParagraph(`Conclusão: ${report.final_conclusion || 'Em edição'}`, {
      size: 10.5,
      spacingAfter: 120,
    }),
  );
  body.push(makePageBreak());

  body.push(
    makeParagraph('2. Dados da obra', {
      bold: true,
      size: 16,
      spacingAfter: 80,
    }),
  );
  body.push(
    makeTable(
      [
        ['Cliente', report.client_name],
        ['Obra', report.project_name],
        ['Unidade', report.unit_name || '-'],
        ['Local específico', report.location || '-'],
        ['Responsável', report.responsible_name],
        ['Empresa executora', report.contractor_company],
      ],
      { widths: [4200, 8800] },
    ),
  );

  body.push(
    makeParagraph('3. Objetivo do relatório', {
      bold: true,
      size: 16,
      spacingAfter: 80,
    }),
  );
  body.push(
    makeParagraph(
      'O presente relatório fotográfico tem por objetivo documentar visualmente a atividade executada, organizar as evidências por data e apresentar leitura técnica objetiva, com linguagem profissional e compatível com o contexto operacional registrado.',
      { size: 10.5, spacingAfter: 120 },
    ),
  );

  body.push(
    makeParagraph('4. Descrição geral da atividade', {
      bold: true,
      size: 16,
      spacingAfter: 80,
    }),
  );
  body.push(
    makeParagraph(
      report.general_observations ||
        `Atividade de ${report.activity_type.toLowerCase()} executada com registro fotográfico da frente de serviço, evidenciando organização operacional, rastreabilidade e acompanhamento do cenário de campo.`,
      { size: 10.5, spacingAfter: 120 },
    ),
  );

  body.push(
    makeParagraph('5. Condições gerais observadas', {
      bold: true,
      size: 16,
      spacingAfter: 80,
    }),
  );
  body.push(
    makeParagraph(report.ai_summary || buildCoverHighlight(report), {
      size: 10.5,
      spacingAfter: 120,
    }),
  );

  body.push(
    makeParagraph('6. Registro fotográfico separado por data', {
      bold: true,
      size: 16,
      spacingAfter: 80,
    }),
  );
  body.push(
    makeParagraph(
      'As imagens estão agrupadas por data de atividade para facilitar a leitura operacional e a rastreabilidade do documento.',
      { size: 10.5, spacingAfter: 120 },
    ),
  );

  groupedImages.forEach((group) => {
    body.push(
      makeParagraph(
        group.day
          ? `Registro da data ${formatDate(group.day.activity_date)}`
          : 'Registros sem data vinculada',
        { bold: true, size: 13, spacingAfter: 40 },
      ),
    );
    body.push(
      makeParagraph(
        group.day?.day_summary ||
          'Fotos ainda não vinculadas a uma data específica.',
        { size: 10, spacingAfter: 80 },
      ),
    );

    group.items.forEach((image) => {
      const media = image.data_url ? mediaEntries[mediaIndex] : undefined;
      const hasImage = Boolean(image.data_url && media);
      body.push(
        makeParagraph(
          `${String(image.image_order).padStart(2, '0')} · ${image.ai_title || image.manual_caption || 'Registro fotográfico'}`,
          { bold: true, size: 11, spacingAfter: 40 },
        ),
      );
      if (hasImage && image.data_url && media) {
        const width = media.width * EMU_PER_PIXEL;
        const height = media.height * EMU_PER_PIXEL;
        body.push(
          `
            <w:p>
              <w:r>
                <w:drawing>
                  <wp:inline distT="0" distB="0" distL="0" distR="0">
                    <wp:extent cx="${width}" cy="${height}"/>
                    <wp:docPr id="${mediaIndex + 1}" name="Imagem ${mediaIndex + 1}"/>
                    <wp:cNvGraphicFramePr>
                      <a:graphicFrameLocks noChangeAspect="1"/>
                    </wp:cNvGraphicFramePr>
                    <a:graphic>
                      <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
                        <pic:pic>
                          <pic:nvPicPr>
                            <pic:cNvPr id="${mediaIndex + 1}" name="Imagem ${mediaIndex + 1}"/>
                            <pic:cNvPicPr/>
                          </pic:nvPicPr>
                          <pic:blipFill>
                            <a:blip r:embed="${media.relId}"/>
                            <a:stretch><a:fillRect/></a:stretch>
                          </pic:blipFill>
                          <pic:spPr>
                            <a:xfrm>
                              <a:off x="0" y="0"/>
                              <a:ext cx="${width}" cy="${height}"/>
                            </a:xfrm>
                            <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
                          </pic:spPr>
                        </pic:pic>
                      </a:graphicData>
                    </a:graphic>
                  </wp:inline>
                </w:drawing>
              </w:r>
            </w:p>
          `,
        );
      } else {
        body.push(
          makeParagraph('Imagem indisponível para esta exportação.', {
            size: 10,
            spacingAfter: 40,
          }),
        );
      }

      body.push(
        makeParagraph(`Legenda manual: ${toText(image.manual_caption)}`, {
          size: 10,
          spacingAfter: 20,
        }),
      );
      body.push(
        makeParagraph(`Descrição: ${toText(image.ai_description)}`, {
          size: 10,
          spacingAfter: 20,
        }),
      );
      body.push(
        makeParagraph(
          `Pontos positivos: ${toText((image.ai_positive_points || []).join(' · '))}`,
          {
            size: 10,
            spacingAfter: 20,
          },
        ),
      );
      body.push(
        makeParagraph(
          `Avaliação técnica: ${toText(image.ai_technical_assessment)}`,
          {
            size: 10,
            spacingAfter: 20,
          },
        ),
      );
      body.push(
        makeParagraph(
          `Classificação: ${toText(image.ai_condition_classification)}`,
          {
            size: 10,
            spacingAfter: 20,
          },
        ),
      );
      body.push(
        makeParagraph(
          `Recomendação preventiva: ${toText((image.ai_recommendations || []).join(' · '))}`,
          { size: 10, spacingAfter: 100 },
        ),
      );
      if (hasImage) {
        mediaIndex += 1;
      }
    });
  });

  body.push(
    makeParagraph('7. Detalhamento de cada foto', {
      bold: true,
      size: 16,
      spacingAfter: 80,
    }),
  );
  body.push(
    makeParagraph(
      'O detalhamento abaixo registra os elementos de cada foto sem repetir as imagens, mantendo a leitura técnica em formato de síntese por registro.',
      { size: 10.5, spacingAfter: 100 },
    ),
  );

  flattenedImages.forEach((image) => {
    body.push(
      makeParagraph(
        `Registro Fotográfico ${String(image.image_order).padStart(2, '0')}`,
        {
          bold: true,
          size: 12,
          spacingAfter: 30,
        },
      ),
    );
    body.push(
      makeTable(
        [
          ['Data', image.activity_date_label],
          ['Título', image.ai_title || image.manual_caption || 'Sem título'],
          [
            'Descrição',
            image.ai_description ||
              image.manual_caption ||
              'Sem descrição informada.',
          ],
          [
            'Pontos positivos',
            image.positivePoints.join(' · ') || 'Sem itens registrados.',
          ],
          [
            'Avaliação técnica',
            image.ai_technical_assessment || 'Avaliação técnica não informada.',
          ],
          [
            'Classificação',
            image.ai_condition_classification || 'Satisfatória',
          ],
          [
            'Recomendação preventiva',
            image.recommendations.join(' · ') || 'Sem recomendação preventiva.',
          ],
        ],
        { widths: [3800, 8200] },
      ),
    );
  });

  body.push(
    makeParagraph('8. Avaliação consolidada', {
      bold: true,
      size: 16,
      spacingAfter: 80,
    }),
  );
  body.push(
    makeParagraph(
      report.ai_summary ||
        'Avaliação consolidada pendente de geração automática ou edição manual.',
      {
        size: 10.5,
        spacingAfter: 120,
      },
    ),
  );

  body.push(
    makeParagraph('9. Parecer técnico', {
      bold: true,
      size: 16,
      spacingAfter: 80,
    }),
  );
  body.push(
    makeParagraph(
      report.final_conclusion ||
        'Parecer técnico em edição. Utilize a tela de edição para concluir a redação final.',
      { size: 10.5, spacingAfter: 120 },
    ),
  );

  body.push(
    makeParagraph('10. Conclusão final', {
      bold: true,
      size: 16,
      spacingAfter: 80,
    }),
  );
  body.push(
    makeParagraph(
      report.final_conclusion ||
        'Conclusão final em aberto. Registre ou regenere a síntese antes da finalização.',
      { size: 10.5, spacingAfter: 120 },
    ),
  );

  body.push(
    makeParagraph('Histórico de exportações', {
      bold: true,
      size: 16,
      spacingAfter: 80,
      pageBreakBefore: true,
    }),
  );
  body.push(
    makeTable(
      [
        ['Tipo', 'Gerado em', 'Arquivo / URL'],
        ...exportsList.map((entry) => [entry[0], entry[1], entry[2]]),
      ],
      { header: true, widths: [2400, 4200, 6400] },
    ),
  );

  return body.join('');
}

function buildRelationshipsXml(
  mediaEntries: Array<{ relId: string; fileName: string; contentType: string }>,
): string {
  const relationships = mediaEntries
    .map(
      (entry) => `
        <Relationship Id="${entry.relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${entry.fileName}"/>
      `,
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      ${relationships}
    </Relationships>`;
}

function buildRootRelsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
    </Relationships>`;
}

function buildContentTypesXml(
  mediaEntries: Array<{ fileName: string; contentType: string }>,
): string {
  const defaults = new Map<string, string>([
    ['rels', 'application/vnd.openxmlformats-package.relationships+xml'],
    ['xml', 'application/xml'],
  ]);

  mediaEntries.forEach((entry) => {
    const ext = entry.fileName.split('.').pop()?.toLowerCase() || 'jpg';
    if (!defaults.has(ext)) {
      defaults.set(ext, entry.contentType);
    }
  });

  const defaultXml = [...defaults.entries()]
    .map(
      ([ext, contentType]) =>
        `<Default Extension="${ext}" ContentType="${contentType}"/>`,
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      ${defaultXml}
      <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
    </Types>`;
}

export async function buildPhotographicReportWordBuffer(
  report: PhotographicReportResponse,
  options: BuildPhotographicReportWordBufferOptions,
): Promise<Buffer> {
  const zip = new JSZip();
  const mediaEntries: Array<{
    relId: string;
    fileName: string;
    contentType: string;
    data: Buffer;
    width: number;
    height: number;
  }> = [];

  let relCounter = 1;
  options.renderableImages.forEach((image, index) => {
    if (!image.data_url) {
      return;
    }

    try {
      const binary = parseImageBinary(image.data_url);
      const scaled = scaleImage(binary);
      const relId = `rId${relCounter}`;
      const fileName = `image${index + 1}.${binary.extension}`;
      mediaEntries.push({
        relId,
        fileName,
        contentType: binary.contentType,
        data: binary.buffer,
        width: scaled.width,
        height: scaled.height,
      });
      relCounter += 1;
    } catch {
      // Keep the document valid even if one image cannot be embedded.
    }
  });

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document
      xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
      xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
      xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
      xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
      xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
      <w:body>
        ${buildDocumentBody(report, options, mediaEntries)}
        <w:sectPr>
          <w:pgSz w:w="11906" w:h="16838"/>
          <w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="708" w:footer="708" w:gutter="0"/>
        </w:sectPr>
      </w:body>
    </w:document>`;

  zip.file('[Content_Types].xml', buildContentTypesXml(mediaEntries));
  zip.folder('_rels')?.file('.rels', buildRootRelsXml());
  zip.folder('word')?.file('document.xml', documentXml);
  zip
    .folder('word')
    ?.folder('_rels')
    ?.file('document.xml.rels', buildRelationshipsXml(mediaEntries));

  for (const entry of mediaEntries) {
    zip.folder('word')?.folder('media')?.file(entry.fileName, entry.data);
  }

  return zip.generateAsync({ type: 'nodebuffer' });
}
