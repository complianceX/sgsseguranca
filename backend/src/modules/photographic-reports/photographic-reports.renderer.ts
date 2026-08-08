import {
  PhotographicReportShift,
  PhotographicReportTone,
} from './entities/photographic-report.entity';
import type {
  PhotographicReportDayResponse,
  PhotographicReportImageResponse,
  PhotographicReportListItemResponse,
  PhotographicReportResponse,
} from './photographic-reports.types';

export type PhotographicReportRenderableImage =
  PhotographicReportImageResponse & {
    data_url: string | null;
    activity_date_label: string;
  };

function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(value?: string | null): string {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('pt-BR');
}

function formatDateTime(value?: string | null): string {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('pt-BR');
}

function formatTime(value?: string | null): string {
  if (!value) return '-';
  const trimmed = value.trim();
  return trimmed.length >= 5 ? trimmed.slice(0, 5) : trimmed;
}

function buildPeriodLabel(report: PhotographicReportListItemResponse): string {
  const start = formatDate(report.start_date);
  const end = report.end_date ? formatDate(report.end_date) : start;
  return start === end ? start : `${start} a ${end}`;
}

function toneLabel(tone: PhotographicReportTone): string {
  switch (tone) {
    case PhotographicReportTone.TECNICO:
      return 'Técnico';
    case PhotographicReportTone.PREVENTIVO:
      return 'Preventivo';
    default:
      return 'Positivo';
  }
}

function classificationTagClass(value: string | null | undefined): string {
  switch (value) {
    case 'Muito satisfatória':
      return 'status-tag status-tag--success';
    case 'Satisfatória':
      return 'status-tag status-tag--info';
    case 'Ponto de atenção preventivo':
      return 'status-tag status-tag--warning';
    case 'Atenção necessária':
      return 'status-tag status-tag--critical';
    default:
      return 'status-tag status-tag--neutral';
  }
}

function renderBulletList(items: string[] | null | undefined): string {
  if (!items || items.length === 0) return '<span class="muted">—</span>';
  return `<ul class="bullets">${items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`;
}

function groupImagesByDay(
  days: PhotographicReportDayResponse[],
  images: PhotographicReportRenderableImage[],
): { day: PhotographicReportDayResponse | null; items: PhotographicReportRenderableImage[] }[] {
  const dayMap = new Map(days.map((d) => [d.id, d]));
  const buckets = new Map<string, PhotographicReportRenderableImage[]>();

  for (const image of images) {
    const key = image.report_day_id || 'unassigned';
    const existing = buckets.get(key) || [];
    existing.push(image);
    buckets.set(key, existing);
  }

  const orderedDayIds = [
    ...days
      .slice()
      .sort((a, b) => a.activity_date.localeCompare(b.activity_date))
      .map((d) => d.id),
    ...(buckets.has('unassigned') ? ['unassigned'] : []),
  ];

  return orderedDayIds.map((dayId) => ({
    day: dayId === 'unassigned' ? null : (dayMap.get(dayId) ?? null),
    items: (buckets.get(dayId) || []).sort(
      (a, b) => a.image_order - b.image_order,
    ),
  }));
}

function renderPhotoCard(image: PhotographicReportRenderableImage, seq: number): string {
  const points = (image.ai_positive_points || []).slice(0, 5);
  const recommendations = (image.ai_recommendations || []).slice(0, 5);
  const conditions = image.photo_conditions || [];
  const source = image.data_url;
  const orderLabel = String(seq).padStart(2, '0');
  const classification = image.ai_condition_classification || 'Satisfatória';

  const conditionsHtml =
    conditions.length > 0
      ? conditions
          .map((c) => `<span class="cond-chip">${escapeHtml(c)}</span>`)
          .join('')
      : '<span class="muted">Nenhuma condição marcada.</span>';

  const captionText = image.ai_title || image.manual_caption || '—';
  const descText = image.ai_description || image.manual_caption || '—';

  return `
    <div class="photo-card">
      <div class="photo-card-header">
        <span class="photo-seq">FOTO ${escapeHtml(orderLabel)}</span>
        <span class="photo-date">${escapeHtml(image.activity_date_label || 'Sem data')}</span>
        <span class="${escapeHtml(classificationTagClass(classification))}">${escapeHtml(classification)}</span>
      </div>

      ${source
        ? `<div class="photo-img-wrap"><img src="${escapeHtml(source)}" alt="Foto ${orderLabel}" /></div>`
        : '<div class="photo-no-img">Imagem indisponível</div>'
      }

      <table class="photo-meta-table">
        <tr>
          <td class="label-cell" style="width:16%">Título</td>
          <td colspan="3">${escapeHtml(captionText)}</td>
        </tr>
        ${descText !== captionText ? `<tr>
          <td class="label-cell">Descrição</td>
          <td colspan="3">${escapeHtml(descText)}</td>
        </tr>` : ''}
        ${image.manual_caption && image.manual_caption !== captionText ? `<tr>
          <td class="label-cell">Legenda</td>
          <td colspan="3">${escapeHtml(image.manual_caption)}</td>
        </tr>` : ''}
        <tr>
          <td class="label-cell" style="vertical-align:top">Pontos positivos</td>
          <td style="width:38%;vertical-align:top">${renderBulletList(points)}</td>
          <td class="label-cell" style="width:16%;vertical-align:top">Avaliação técnica</td>
          <td style="vertical-align:top">${escapeHtml(image.ai_technical_assessment || '—')}</td>
        </tr>
        ${recommendations.length > 0 ? `<tr>
          <td class="label-cell" style="vertical-align:top">Recomendação</td>
          <td colspan="3" style="vertical-align:top">${renderBulletList(recommendations)}</td>
        </tr>` : ''}
        <tr>
          <td class="label-cell" style="vertical-align:top">Condições</td>
          <td colspan="3"><div class="cond-row">${conditionsHtml}</div></td>
        </tr>
      </table>
    </div>
  `;
}

export function buildPhotographicReportHtml(
  report: PhotographicReportResponse,
  options: {
    companyName: string;
    generatedAt?: string;
    renderableImages?: PhotographicReportRenderableImage[];
    logoDataUrl?: string | null;
  },
): string {
  const renderableImages = options.renderableImages || [];
  const groupedImages = groupImagesByDay(report.days || [], renderableImages);
  const generatedAtLabel = options.generatedAt
    ? formatDateTime(options.generatedAt)
    : formatDateTime(new Date().toISOString());

  const exportsList = (report.exports || [])
    .slice()
    .sort((a, b) => a.generated_at.localeCompare(b.generated_at))
    .map(
      (entry) => `
        <tr>
          <td>${escapeHtml(entry.export_type.toUpperCase())}</td>
          <td>${escapeHtml(formatDateTime(entry.generated_at))}</td>
        </tr>
      `,
    )
    .join('');

  const daySummaryMap = new Map(
    (report.days || []).map((day) => [day.id, day.day_summary || '']),
  );

  let seqCounter = 0;
  const photoSections = groupedImages
    .map((group) => {
      if (group.items.length === 0) return '';
      const dateLabel = group.day
        ? formatDate(group.day.activity_date)
        : 'Sem data vinculada';
      const daySummary = group.day ? daySummaryMap.get(group.day.id) : '';
      return `
        <div class="day-block">
          <div class="day-header">
            <span>DATA: ${escapeHtml(dateLabel)}</span>
            <span>${group.items.length} foto(s)${daySummary ? ' · ' + escapeHtml(daySummary) : ''}</span>
          </div>
          ${group.items.map((img) => renderPhotoCard(img, ++seqCounter)).join('')}
        </div>
      `;
    })
    .join('');

  const aiSummaryText =
    report.ai_summary && report.ai_summary.trim()
      ? report.ai_summary
      : null;

  const finalConclusionText =
    report.final_conclusion && report.final_conclusion.trim()
      ? report.final_conclusion
      : null;

  const style = `
    <style>
      @page { size: A4 portrait; margin: 0; }
      * { box-sizing: border-box; }

      :root {
        color-scheme: light;
        --paper: #ffffff;
        --ink: #0f172a;
        --muted: #4a6785;
        --muted-light: #7a9ab8;
        --line: #0d3457;
        --soft-line: #9cbdd8;
        --teal: #1d5b8d;
        --teal-dark: #18517C;
        --teal-bright: #1865B0;
        --teal-mid: #1e6ba0;
        --teal-soft: #eaf4fb;
        --header-gray: #d7e6f3;
        --row-soft: #f8fbff;
        --label-bg: #1d5b8d;
      }

      html, body {
        margin: 0;
        padding: 0;
        background: var(--paper);
        color: var(--ink);
        font-family: Arial, Helvetica, sans-serif;
        font-size: 10px;
        line-height: 1.4;
      }
      h1, h2, h3, h4, p { margin: 0; }

      /* ── WRAPPER COM MARGENS ───────────────────────────── */
      .page-wrap {
        padding: 12mm 14mm 14mm 14mm;
      }

      /* ── CABEÇALHO TÉCNICO ─────────────────────────────── */
      .tech-header {
        border-radius: 8px;
        overflow: hidden;
        margin-bottom: 14px;
        border: 1px solid var(--teal-dark);
      }
      .header-stripe {
        height: 6px;
        background: linear-gradient(90deg,
          var(--teal-bright) 0%, var(--teal-bright) 60%,
          var(--teal-dark)   60%, var(--teal-dark)   100%);
      }
      .header-table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
        background: var(--teal);
      }
      .header-table td {
        padding: 8px 12px;
        vertical-align: middle;
        color: #ffffff;
      }
      .header-td-logo {
        width: 12%;
        text-align: center;
        border-right: 1px solid rgba(255,255,255,.2);
      }
      .header-td-logo img {
        max-width: 100%;
        max-height: 32px;
        object-fit: contain;
        filter: brightness(0) invert(1);
      }
      .header-td-logo .logo-fallback {
        font-size: 14px;
        font-weight: 900;
        letter-spacing: .1em;
        color: #ffffff;
      }
      .header-td-title {
        font-size: 13px;
        font-weight: 800;
        letter-spacing: .07em;
        text-transform: uppercase;
        text-align: center;
        color: #ffffff;
      }
      .header-td-title small {
        display: block;
        font-size: 8px;
        font-weight: 400;
        letter-spacing: .03em;
        text-transform: none;
        color: rgba(255,255,255,.75);
        margin-top: 2px;
      }
      .header-td-code {
        width: 20%;
        font-size: 8px;
        text-align: right;
        color: rgba(255,255,255,.85);
        border-left: 1px solid rgba(255,255,255,.2);
      }
      .header-td-code strong {
        display: block;
        font-size: 10px;
        color: #ffffff;
        font-weight: 700;
        margin-bottom: 2px;
      }

      /* ── TABELA DE METADADOS ───────────────────────────── */
      .meta-table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
        font-size: 10px;
        margin-bottom: 12px;
      }
      .meta-table td {
        border: 1px solid var(--soft-line);
        padding: 5px 8px;
        vertical-align: top;
        word-break: break-word;
      }
      .meta-table .label-cell {
        background: var(--teal);
        color: #ffffff;
        font-weight: 700;
        font-size: 9px;
        text-transform: uppercase;
        letter-spacing: .05em;
        width: 18%;
        vertical-align: middle;
        white-space: nowrap;
      }
      .meta-table .value-cell {
        background: #fdfefe;
        width: 32%;
        font-weight: 600;
        color: var(--ink);
      }

      /* ── SEÇÕES ────────────────────────────────────────── */
      .section {
        margin-bottom: 12px;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .section-title {
        background: var(--teal);
        color: #ffffff;
        font-size: 9px;
        font-weight: 800;
        letter-spacing: .07em;
        text-transform: uppercase;
        padding: 5px 10px;
        border-radius: 4px 4px 0 0;
      }
      .section-body {
        border: 1px solid var(--soft-line);
        border-top: 0;
        padding: 10px 12px;
        border-radius: 0 0 4px 4px;
        font-size: 10px;
        line-height: 1.65;
        color: var(--ink);
        background: #fafcff;
      }

      /* ── STATUS TAGS ───────────────────────────────────── */
      .status-tag {
        display: inline-block;
        padding: 2px 8px;
        border: 1px solid;
        border-radius: 999px;
        font-size: 9px;
        font-weight: 700;
        white-space: nowrap;
      }
      .status-tag--success  { background: #e8f5e9; color: #166534; border-color: #86c99b; }
      .status-tag--critical { background: #fef2f2; color: #991b1b; border-color: #fca5a5; }
      .status-tag--warning  { background: #fffbeb; color: #78350f; border-color: #fde68a; }
      .status-tag--info     { background: #eff6ff; color: #1e40af; border-color: #93c5fd; }
      .status-tag--neutral  { background: #f3f4f6; color: #374151; border-color: #d1d5db; }

      /* ── FOTOS ─────────────────────────────────────────── */
      .day-block {
        margin-bottom: 16px;
      }
      .day-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: var(--header-gray);
        border: 1px solid var(--soft-line);
        border-radius: 4px;
        padding: 5px 10px;
        font-size: 9px;
        font-weight: 800;
        color: var(--teal-dark);
        text-transform: uppercase;
        letter-spacing: .06em;
        margin-bottom: 8px;
      }
      .photo-card {
        border: 1px solid var(--soft-line);
        border-radius: 6px;
        overflow: hidden;
        margin-bottom: 12px;
        break-inside: avoid;
        page-break-inside: avoid;
        background: #ffffff;
      }
      .photo-card-header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 10px;
        background: var(--teal);
        color: #ffffff;
      }
      .photo-seq {
        font-size: 9px;
        font-weight: 800;
        letter-spacing: .1em;
      }
      .photo-date {
        font-size: 9px;
        color: rgba(255,255,255,.8);
        flex: 1;
      }
      .photo-img-wrap {
        width: 100%;
        background: #eef4f8;
        border-bottom: 1px solid var(--soft-line);
        text-align: center;
        padding: 6px 0;
      }
      .photo-img-wrap img {
        max-width: 100%;
        max-height: 110mm;
        object-fit: contain;
        display: block;
        margin: 0 auto;
      }
      .photo-no-img {
        padding: 18px;
        color: var(--muted);
        font-size: 10px;
        text-align: center;
      }
      .photo-meta-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 10px;
      }
      .photo-meta-table td {
        border: 1px solid var(--soft-line);
        padding: 5px 8px;
        vertical-align: top;
        word-break: break-word;
      }
      .photo-meta-table .label-cell {
        background: var(--teal);
        color: #ffffff;
        font-weight: 700;
        font-size: 9px;
        text-transform: uppercase;
        letter-spacing: .04em;
        white-space: nowrap;
        vertical-align: middle;
      }

      /* ── CONDIÇÕES ─────────────────────────────────────── */
      .cond-row {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        padding: 2px 0;
      }
      .cond-chip {
        display: inline-flex;
        padding: 2px 8px;
        border-radius: 999px;
        background: var(--teal-soft);
        border: 1px solid var(--soft-line);
        color: var(--teal);
        font-size: 9px;
        font-weight: 600;
      }

      /* ── LISTAS ────────────────────────────────────────── */
      .bullets {
        margin: 0;
        padding-left: 14px;
        color: var(--ink);
      }
      .bullets li {
        margin-bottom: 3px;
        line-height: 1.5;
        font-size: 10px;
      }
      .muted { color: var(--muted-light); font-style: italic; }

      /* ── TABELA DE EXPORTAÇÕES ─────────────────────────── */
      .export-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 10px;
      }
      .export-table th, .export-table td {
        border: 1px solid var(--soft-line);
        padding: 5px 8px;
        text-align: left;
      }
      .export-table th {
        background: var(--teal);
        color: #ffffff;
        font-weight: 700;
        font-size: 9px;
        text-transform: uppercase;
        letter-spacing: .05em;
      }
      .export-table tr:nth-child(even) td {
        background: var(--row-soft);
      }

      /* ── PAGE BREAK ────────────────────────────────────── */
      .break-before {
        break-before: page;
        page-break-before: always;
      }
    </style>
  `;

  const logoHtml = options.logoDataUrl
    ? `<img src="${escapeHtml(options.logoDataUrl)}" alt="Logo" />`
    : `<div class="logo-fallback">SGS</div>`;

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <title>Relatório Fotográfico</title>
    ${style}
  </head>
  <body>
    <div class="page-wrap">

      <!-- CABEÇALHO TÉCNICO -->
      <div class="tech-header">
        <div class="header-stripe"></div>
        <table class="header-table">
          <tr>
            <td class="header-td-logo">${logoHtml}</td>
            <td class="header-td-title">
              RELATÓRIO FOTOGRÁFICO
              <small>Sistema de Gestão de Segurança · SGS</small>
            </td>
            <td class="header-td-code">
              <strong>${escapeHtml(buildPeriodLabel(report))}</strong>
              Emitido em ${escapeHtml(generatedAtLabel)}
            </td>
          </tr>
        </table>
      </div>

      <!-- 1. IDENTIFICAÇÃO -->
      <div class="section">
        <div class="section-title">1. Identificação do relatório</div>
        <div class="section-body" style="padding:0">
          <table class="meta-table" style="margin:0">
            <tr>
              <td class="label-cell">Cliente</td>
              <td class="value-cell">${escapeHtml(report.client_name)}</td>
              <td class="label-cell">Obra / Projeto</td>
              <td class="value-cell">${escapeHtml(report.project_name)}</td>
            </tr>
            <tr>
              <td class="label-cell">Unidade</td>
              <td class="value-cell">${escapeHtml(report.unit_name || '—')}</td>
              <td class="label-cell">Local específico</td>
              <td class="value-cell">${escapeHtml(report.location || '—')}</td>
            </tr>
            <tr>
              <td class="label-cell">Responsável</td>
              <td class="value-cell">${escapeHtml(report.responsible_name)}</td>
              <td class="label-cell">Empresa executora</td>
              <td class="value-cell">${escapeHtml(report.contractor_company)}</td>
            </tr>
            <tr>
              <td class="label-cell">Atividade</td>
              <td class="value-cell">${escapeHtml(report.activity_type)}</td>
              <td class="label-cell">Período</td>
              <td class="value-cell">${escapeHtml(buildPeriodLabel(report))} · ${escapeHtml(formatTime(report.start_time))}–${escapeHtml(formatTime(report.end_time))}</td>
            </tr>
            <tr>
              <td class="label-cell">Turno</td>
              <td class="value-cell">${escapeHtml(report.shift)}</td>
              <td class="label-cell">Condição da área</td>
              <td class="value-cell">${escapeHtml(report.area_status)}</td>
            </tr>
            <tr>
              <td class="label-cell">Tom</td>
              <td class="value-cell">${escapeHtml(toneLabel(report.report_tone))}</td>
              <td class="label-cell">Total de fotos</td>
              <td class="value-cell">${renderableImages.length}</td>
            </tr>
          </table>
        </div>
      </div>

      <!-- 2. OBSERVAÇÕES GERAIS -->
      ${report.general_observations ? `
      <div class="section">
        <div class="section-title">2. Observações gerais</div>
        <div class="section-body">${escapeHtml(report.general_observations)}</div>
      </div>
      ` : ''}

      <!-- 3. SÍNTESE TÉCNICA (IA) -->
      ${aiSummaryText ? `
      <div class="section">
        <div class="section-title">3. Síntese técnica (IA)</div>
        <div class="section-body">${escapeHtml(aiSummaryText)}</div>
      </div>
      ` : ''}

      <!-- 4. REGISTRO FOTOGRÁFICO -->
      <div class="section break-before">
        <div class="section-title">4. Registro fotográfico</div>
        <div class="section-body" style="padding: 10px 0 0">
          ${photoSections || '<p class="muted" style="padding:10px">Nenhuma fotografia vinculada ao relatório.</p>'}
        </div>
      </div>

      <!-- 5. CONCLUSÃO / PARECER TÉCNICO -->
      ${finalConclusionText ? `
      <div class="section break-before">
        <div class="section-title">5. Parecer técnico e conclusão</div>
        <div class="section-body">${escapeHtml(finalConclusionText)}</div>
      </div>
      ` : ''}

      <!-- 6. HISTÓRICO DE EXPORTAÇÕES -->
      <div class="section">
        <div class="section-title">6. Histórico de exportações</div>
        <div class="section-body" style="padding:0">
          <table class="export-table">
            <thead>
              <tr>
                <th style="width:18%">Tipo</th>
                <th>Gerado em</th>
              </tr>
            </thead>
            <tbody>
              ${exportsList || '<tr><td colspan="2" class="muted" style="padding:8px 10px">Nenhuma exportação registrada.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  </body>
</html>`;

  return html;
}
