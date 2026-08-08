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

function shiftLabel(shift: PhotographicReportShift | string): string {
  return String(shift ?? '-');
}

/**
 * Tom visual da classificação, alinhado às status-tag do PDF de APR.
 */
function classificationTone(value: string | null | undefined): string {
  switch (value) {
    case 'Muito satisfatória':
      return 'success';
    case 'Satisfatória':
      return 'info';
    case 'Ponto de atenção preventivo':
      return 'warning';
    case 'Atenção necessária':
      return 'critical';
    default:
      return 'neutral';
  }
}

function renderBulletList(items: string[] | null | undefined): string {
  if (!items || items.length === 0) return '<span class="muted">-</span>';
  return `<ul class="bullets">${items
    .map((i) => `<li>${escapeHtml(i)}</li>`)
    .join('')}</ul>`;
}

function groupImagesByDay(
  days: PhotographicReportDayResponse[],
  images: PhotographicReportRenderableImage[],
): {
  day: PhotographicReportDayResponse | null;
  items: PhotographicReportRenderableImage[];
}[] {
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

function summarizeClassifications(
  images: PhotographicReportRenderableImage[],
): Record<string, number> {
  const summary = {
    total: images.length,
    muitoSatisfatoria: 0,
    satisfatoria: 0,
    preventiva: 0,
    atencao: 0,
    semAnalise: 0,
  };

  for (const image of images) {
    switch (image.ai_condition_classification) {
      case 'Muito satisfatória':
        summary.muitoSatisfatoria += 1;
        break;
      case 'Satisfatória':
        summary.satisfatoria += 1;
        break;
      case 'Ponto de atenção preventivo':
        summary.preventiva += 1;
        break;
      case 'Atenção necessária':
        summary.atencao += 1;
        break;
      default:
        summary.semAnalise += 1;
        break;
    }
  }

  return summary;
}

function renderPhotoCard(
  image: PhotographicReportRenderableImage,
  seq: number,
): string {
  const points = (image.ai_positive_points || []).slice(0, 5);
  const recommendations = (image.ai_recommendations || []).slice(0, 5);
  const conditions = image.photo_conditions || [];
  const source = image.data_url;
  const orderLabel = String(seq).padStart(2, '0');
  const classification = image.ai_condition_classification;
  const tone = classificationTone(classification);

  const title = image.ai_title || image.manual_caption || null;
  const description = image.ai_description || null;
  const caption =
    image.manual_caption && image.manual_caption !== title
      ? image.manual_caption
      : null;
  const assessment = image.ai_technical_assessment || null;

  const conditionsHtml =
    conditions.length > 0
      ? `<div class="chip-row">${conditions
          .map((c) => `<span class="chip">${escapeHtml(c)}</span>`)
          .join('')}</div>`
      : '<span class="muted">Nenhuma condição registrada.</span>';

  const detailRows = [
    title
      ? `<div class="kv-box"><div class="kv-label">Título</div><div class="kv-value">${escapeHtml(title)}</div></div>`
      : '',
    `<div class="kv-box"><div class="kv-label">Classificação</div><div class="kv-value"><span class="status-tag status-tag--${escapeHtml(tone)}">${escapeHtml(classification || 'Sem análise')}</span></div></div>`,
  ]
    .filter(Boolean)
    .join('');

  return `
    <article class="photo-card">
      <div class="photo-card-bar">
        <span class="photo-seq">Foto ${escapeHtml(orderLabel)}</span>
        <span class="photo-date">${escapeHtml(image.activity_date_label || 'Sem data')}</span>
        <span class="status-tag status-tag--${escapeHtml(tone)}">${escapeHtml(classification || 'Sem análise')}</span>
      </div>

      ${
        source
          ? `<figure class="photo-figure"><img src="${escapeHtml(source)}" alt="Registro fotográfico ${escapeHtml(orderLabel)}" /></figure>`
          : '<div class="photo-figure photo-figure--empty">Imagem indisponível</div>'
      }

      <div class="photo-body">
        ${detailRows ? `<div class="kv-grid kv-grid--2">${detailRows}</div>` : ''}

        ${
          description
            ? `<div class="notes-block"><div class="kv-label">Descrição técnica</div><div class="notes-content">${escapeHtml(description)}</div></div>`
            : ''
        }
        ${
          caption
            ? `<div class="notes-block"><div class="kv-label">Legenda do responsável</div><div class="notes-content">${escapeHtml(caption)}</div></div>`
            : ''
        }
        ${
          assessment
            ? `<div class="notes-block"><div class="kv-label">Avaliação técnica</div><div class="notes-content">${escapeHtml(assessment)}</div></div>`
            : ''
        }
        ${
          points.length > 0
            ? `<div class="notes-block"><div class="kv-label">Pontos positivos</div>${renderBulletList(points)}</div>`
            : ''
        }
        ${
          recommendations.length > 0
            ? `<div class="notes-block"><div class="kv-label">Recomendações</div>${renderBulletList(recommendations)}</div>`
            : ''
        }
        <div class="notes-block">
          <div class="kv-label">Condições observadas</div>
          <div class="notes-content">${conditionsHtml}</div>
        </div>
      </div>
    </article>
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
  const documentCode = String(report.id || '')
    .replace(/-/g, '')
    .slice(0, 8)
    .toUpperCase();
  const summary = summarizeClassifications(renderableImages);
  const dayCount = groupedImages.filter((g) => g.items.length > 0).length;

  const exportsRows = (report.exports || [])
    .slice()
    .sort((a, b) => a.generated_at.localeCompare(b.generated_at))
    .map(
      (entry, index) => `
        <tr>
          <td style="text-align:center">${index + 1}</td>
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
        <section class="section-card">
          <div class="section-banner section-banner--teal">
            <span>${escapeHtml(dateLabel)}</span>
            <span class="banner-meta">${group.items.length} registro(s)</span>
          </div>
          <div class="section-body">
            ${
              daySummary
                ? `<div class="notes-block" style="margin-top:0"><div class="kv-label">Resumo do dia</div><div class="notes-content">${escapeHtml(daySummary)}</div></div>`
                : ''
            }
            ${group.items.map((img) => renderPhotoCard(img, ++seqCounter)).join('')}
          </div>
        </section>
      `;
    })
    .join('');

  const aiSummaryText = report.ai_summary?.trim() ? report.ai_summary : null;
  const finalConclusionText = report.final_conclusion?.trim()
    ? report.final_conclusion
    : null;

  const style = `
    <style>
      @page {
        size: A4 portrait;
        margin: 10mm 11mm 12mm 11mm;
      }
      :root {
        color-scheme: light;
        --paper: #ffffff;
        --ink: #0f172a;
        --muted: #2a455e;
        --line: #0d3457;
        --soft-line: #9cbdd8;
        --teal: #1d5b8d;
        --teal-soft: #eaf4fb;
        --header-gray: #d7e6f3;
        --acceptable: #15803d;
        --attention: #1d5b8d;
        --substantial: #d97706;
        --critical: #b3261e;
        --row-soft: #f8fbff;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: var(--paper);
        color: var(--ink);
        font-family: Arial, Helvetica, sans-serif;
        font-size: 10px;
        line-height: 1.35;
      }
      h1, h2, h3, p { margin: 0; }
      .page { width: 100%; }
      .stack > * + * { margin-top: 8px; }
      .muted { color: var(--muted); }

      /* ── CABEÇALHO TÉCNICO ─────────────────────────────── */
      .tech-header {
        border: 1px solid var(--soft-line);
        border-radius: 12px;
        background: linear-gradient(180deg,
          #1865B0 0px, #1865B0 5px,
          #18517C 5px, #18517C 7px,
          #ffffff 7px, #ffffff 100%);
        overflow: hidden;
        box-shadow: 0 2px 6px rgba(9,30,66,0.08), 0 0 1px rgba(9,30,66,0.08);
      }
      .doc-title-row { border-bottom: 1px solid var(--line); }
      .doc-title-table,
      .tech-table,
      .support-table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
      }
      .doc-title-table td {
        border-right: 1px solid var(--soft-line);
        padding: 8px 10px;
        vertical-align: middle;
      }
      .doc-title-table td:last-child { border-right: 0; }
      .logo-box {
        width: 14%;
        text-align: center;
        padding: 4px !important;
      }
      .logo-img {
        max-width: 100%;
        max-height: 42px;
        object-fit: contain;
        display: block;
        margin: 0 auto;
      }
      .doc-title-main {
        text-align: center;
        font-weight: 800;
        font-size: 15px;
        letter-spacing: .05em;
        color: var(--teal);
        text-transform: uppercase;
      }
      .doc-title-main small {
        display: block;
        font-size: 8px;
        font-weight: 400;
        letter-spacing: .03em;
        text-transform: none;
        color: var(--muted);
        margin-top: 3px;
      }
      .doc-code-box {
        width: 16%;
        font-size: 8px;
        text-align: center;
        background: linear-gradient(180deg, #eef6fd 0%, #e4f0f9 100%);
      }
      .tech-table td,
      .support-table td,
      .support-table th {
        border: 1px solid var(--soft-line);
        padding: 4px 6px;
        vertical-align: top;
        word-break: break-word;
      }
      .teal-cell {
        background: var(--teal);
        color: #fff;
        font-weight: 700;
        width: 15%;
      }
      .tech-value { background: #fdfefe; }

      /* ── STATUS TAGS ───────────────────────────────────── */
      .status-tag {
        display: inline-block;
        padding: 2px 8px;
        border: 1px solid var(--soft-line);
        border-radius: 999px;
        font-size: 8px;
        font-weight: 700;
        white-space: nowrap;
      }
      .status-tag--success  { background: #e8f5e9; color: #166534; border-color: #a7d7b4; }
      .status-tag--critical { background: #fef2f2; color: #991b1b; border-color: #fca5a5; }
      .status-tag--warning  { background: #fffbeb; color: #92400e; border-color: #fde68a; }
      .status-tag--info     { background: #eff6ff; color: #1e40af; border-color: #bfdbfe; }
      .status-tag--neutral  { background: #f9fafb; color: #374151; border-color: #e5e7eb; }

      /* ── MÉTRICAS ──────────────────────────────────────── */
      .metrics-grid {
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 6px;
      }
      .metric-card {
        border: 1px solid var(--soft-line);
        border-radius: 10px;
        background: linear-gradient(180deg, #ffffff 0%, #f4f9ff 100%);
        padding: 8px 10px;
        box-shadow: 0 1px 3px rgba(9,30,66,0.05);
      }
      .metric-bar {
        height: 4px;
        border-radius: 999px;
        margin-bottom: 7px;
        background: var(--teal);
        box-shadow: 0 1px 2px rgba(29,91,141,0.25);
      }
      .metric-card--acceptable .metric-bar { background: var(--acceptable); box-shadow: 0 1px 2px rgba(21,128,61,0.25); }
      .metric-card--attention .metric-bar  { background: var(--attention); box-shadow: 0 1px 2px rgba(29,91,141,0.25); }
      .metric-card--substantial .metric-bar { background: var(--substantial); box-shadow: 0 1px 2px rgba(217,119,6,0.25); }
      .metric-card--critical .metric-bar   { background: var(--critical); box-shadow: 0 1px 2px rgba(179,38,30,0.25); }
      .metric-label {
        font-size: 7.5px;
        text-transform: uppercase;
        letter-spacing: .07em;
        color: var(--muted);
        font-weight: 700;
      }
      .metric-value {
        margin-top: 3px;
        font-size: 14px;
        font-weight: 800;
        color: var(--ink);
        line-height: 1.1;
      }

      /* ── CARDS DE SEÇÃO ────────────────────────────────── */
      .section-card {
        border: 1px solid var(--soft-line);
        border-radius: 12px;
        background: #fff;
        overflow: hidden;
        box-shadow: 0 1px 4px rgba(9,30,66,0.06), 0 0 1px rgba(9,30,66,0.07);
      }
      .section-banner {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 7px 12px;
        font-size: 10px;
        font-weight: 700;
        border-bottom: 1px solid var(--soft-line);
        color: var(--teal);
        letter-spacing: .04em;
      }
      .section-banner--teal {
        background: linear-gradient(90deg, #ddf0fa 0%, #eef8fd 100%);
        border-left: 6px solid var(--teal);
      }
      .section-banner--amber {
        background: linear-gradient(90deg, #fef3e2 0%, #fffcf7 100%);
        border-left: 6px solid var(--substantial);
        color: var(--substantial);
      }
      .banner-meta {
        font-size: 8px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: .06em;
        color: var(--muted);
      }
      .section-body { padding: 8px 10px 10px; }

      /* ── KEY / VALUE ───────────────────────────────────── */
      .kv-grid { display: grid; gap: 6px; }
      .kv-grid--2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .kv-grid--3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .kv-box {
        min-height: 46px;
        border: 1px solid #dbe7f2;
        border-left: 3px solid #b0cfe8;
        padding: 7px 8px 7px 10px;
        background: linear-gradient(180deg, #ffffff 0%, #f6fbff 100%);
        border-radius: 8px;
        box-shadow: 0 1px 2px rgba(9,30,66,0.04);
      }
      .kv-label {
        font-size: 7.5px;
        text-transform: uppercase;
        letter-spacing: .07em;
        color: #355070;
        font-weight: 700;
      }
      .kv-value {
        margin-top: 4px;
        font-size: 11.5px;
        font-weight: 700;
        color: var(--ink);
      }
      .notes-block {
        margin-top: 6px;
        border-top: 1px solid #dbe7f2;
        padding: 7px 0 0;
        background: transparent;
      }
      .notes-content {
        margin-top: 4px;
        white-space: pre-wrap;
      }

      /* ── FOTOS ─────────────────────────────────────────── */
      .photo-card {
        border: 1px solid var(--soft-line);
        border-radius: 10px;
        overflow: hidden;
        background: #fff;
        box-shadow: 0 1px 3px rgba(9,30,66,0.05);
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .photo-card + .photo-card { margin-top: 8px; }
      .photo-card-bar {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 10px;
        background: linear-gradient(90deg, #ddf0fa 0%, #eef8fd 100%);
        border-bottom: 1px solid var(--soft-line);
        border-left: 6px solid var(--teal);
      }
      .photo-seq {
        font-size: 10px;
        font-weight: 800;
        color: var(--teal);
        letter-spacing: .05em;
        text-transform: uppercase;
      }
      .photo-date {
        flex: 1;
        font-size: 8px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: .06em;
        color: var(--muted);
      }
      .photo-figure {
        margin: 0;
        padding: 8px;
        background: #f4f9ff;
        border-bottom: 1px solid #dbe7f2;
        text-align: center;
      }
      .photo-figure img {
        max-width: 100%;
        max-height: 105mm;
        object-fit: contain;
        display: block;
        margin: 0 auto;
        border: 1px solid #dbe7f2;
        border-radius: 6px;
        background: #fff;
      }
      .photo-figure--empty {
        padding: 20px;
        color: var(--muted);
        font-size: 10px;
      }
      .photo-body { padding: 8px 10px 10px; }
      .photo-body .notes-block:first-child { margin-top: 0; border-top: 0; padding-top: 0; }

      /* ── CHIPS ─────────────────────────────────────────── */
      .chip-row { display: flex; flex-wrap: wrap; gap: 4px; }
      .chip {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 999px;
        background: var(--teal-soft);
        border: 1px solid var(--soft-line);
        color: var(--teal);
        font-size: 8px;
        font-weight: 700;
      }

      /* ── LISTAS ────────────────────────────────────────── */
      .bullets { margin: 4px 0 0; padding-left: 14px; }
      .bullets li { margin-bottom: 2px; line-height: 1.4; }

      /* ── TABELA DE APOIO ───────────────────────────────── */
      .support-table th {
        background: linear-gradient(180deg, #e4f0f9 0%, #edf4fa 100%);
        text-transform: uppercase;
        font-size: 8px;
        letter-spacing: .05em;
        color: var(--teal);
        font-weight: 700;
        text-align: left;
      }
      .support-table tbody tr:nth-child(even) td { background: var(--row-soft); }

      /* ── RODAPÉ ────────────────────────────────────────── */
      .doc-footer {
        margin-top: 10px;
        border-top: 1px solid var(--soft-line);
        padding-top: 6px;
        font-size: 7.5px;
        color: var(--muted);
        display: flex;
        justify-content: space-between;
        gap: 10px;
      }
    </style>
  `;

  const logoHtml = options.logoDataUrl
    ? `<td class="logo-box"><img src="${escapeHtml(options.logoDataUrl)}" class="logo-img" alt="Logo" /></td>`
    : '';

  return `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>Relatório Fotográfico - ${escapeHtml(report.project_name)}</title>
    ${style}
  </head>
  <body>
    <div class="page stack">

      <section class="tech-header">
        <div class="doc-title-row">
          <table class="doc-title-table">
            <tr>
              ${logoHtml}
              <td class="doc-title-main" style="width: ${options.logoDataUrl ? '70%' : '84%'}">
                RELATÓRIO FOTOGRÁFICO
                <small>Registro técnico de inspeção — Sistema de Gestão de Segurança</small>
              </td>
              <td class="doc-code-box">
                <div><strong>Código</strong></div>
                <div>${escapeHtml(documentCode || '-')}</div>
              </td>
            </tr>
          </table>
        </div>
        <table class="tech-table">
          <tbody>
            <tr>
              <td class="teal-cell">Cliente:</td>
              <td class="tech-value">${escapeHtml(report.client_name)}</td>
              <td class="teal-cell">Obra / projeto:</td>
              <td class="tech-value">${escapeHtml(report.project_name)}</td>
            </tr>
            <tr>
              <td class="teal-cell">Atividade:</td>
              <td class="tech-value">${escapeHtml(report.activity_type)}</td>
              <td class="teal-cell">Empresa executora:</td>
              <td class="tech-value">${escapeHtml(report.contractor_company)}</td>
            </tr>
            <tr>
              <td class="teal-cell">Responsável:</td>
              <td class="tech-value">${escapeHtml(report.responsible_name)}</td>
              <td class="teal-cell">Período:</td>
              <td class="tech-value">${escapeHtml(buildPeriodLabel(report))} · ${escapeHtml(formatTime(report.start_time))} às ${escapeHtml(formatTime(report.end_time))}</td>
            </tr>
            <tr>
              <td class="teal-cell">Unidade:</td>
              <td class="tech-value">${escapeHtml(report.unit_name || '-')}</td>
              <td class="teal-cell">Local específico:</td>
              <td class="tech-value">${escapeHtml(report.location || '-')}</td>
            </tr>
            <tr>
              <td class="teal-cell">Turno:</td>
              <td class="tech-value">${escapeHtml(shiftLabel(report.shift))}</td>
              <td class="teal-cell">Condição da área:</td>
              <td class="tech-value">${escapeHtml(report.area_status)}</td>
            </tr>
            <tr>
              <td class="teal-cell">Abordagem:</td>
              <td class="tech-value">${escapeHtml(toneLabel(report.report_tone))}</td>
              <td class="teal-cell">Emitido em:</td>
              <td class="tech-value">${escapeHtml(generatedAtLabel)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="metrics-grid">
        <article class="metric-card">
          <div class="metric-bar"></div>
          <div class="metric-label">Registros</div>
          <div class="metric-value">${summary.total}</div>
        </article>
        <article class="metric-card metric-card--acceptable">
          <div class="metric-bar"></div>
          <div class="metric-label">Muito satisf.</div>
          <div class="metric-value">${summary.muitoSatisfatoria}</div>
        </article>
        <article class="metric-card metric-card--attention">
          <div class="metric-bar"></div>
          <div class="metric-label">Satisfatória</div>
          <div class="metric-value">${summary.satisfatoria}</div>
        </article>
        <article class="metric-card metric-card--substantial">
          <div class="metric-bar"></div>
          <div class="metric-label">Preventiva</div>
          <div class="metric-value">${summary.preventiva}</div>
        </article>
        <article class="metric-card metric-card--critical">
          <div class="metric-bar"></div>
          <div class="metric-label">Atenção</div>
          <div class="metric-value">${summary.atencao}</div>
        </article>
      </section>

      ${
        report.general_observations
          ? `
      <section class="section-card">
        <div class="section-banner section-banner--teal">
          <span>Observações gerais</span>
        </div>
        <div class="section-body">
          <div class="notes-content">${escapeHtml(report.general_observations)}</div>
        </div>
      </section>
      `
          : ''
      }

      ${
        aiSummaryText
          ? `
      <section class="section-card">
        <div class="section-banner section-banner--teal">
          <span>Síntese técnica</span>
          <span class="banner-meta">Gerada por IA</span>
        </div>
        <div class="section-body">
          <div class="notes-content">${escapeHtml(aiSummaryText)}</div>
        </div>
      </section>
      `
          : ''
      }

      <section class="section-card">
        <div class="section-banner section-banner--teal">
          <span>Registro fotográfico</span>
          <span class="banner-meta">${summary.total} foto(s) · ${dayCount} dia(s)</span>
        </div>
        <div class="section-body">
          ${
            photoSections ||
            '<div class="muted" style="text-align:center;padding:10px">Nenhuma fotografia vinculada ao relatório.</div>'
          }
        </div>
      </section>

      ${
        finalConclusionText
          ? `
      <section class="section-card">
        <div class="section-banner section-banner--amber">
          <span>Parecer técnico e conclusão</span>
        </div>
        <div class="section-body">
          <div class="notes-content">${escapeHtml(finalConclusionText)}</div>
        </div>
      </section>
      `
          : ''
      }

      <section class="section-card">
        <div class="section-banner section-banner--teal">
          <span>Histórico de exportações</span>
        </div>
        <table class="support-table">
          <thead>
            <tr>
              <th style="width:8%;text-align:center">#</th>
              <th style="width:22%">Formato</th>
              <th>Gerado em</th>
            </tr>
          </thead>
          <tbody>
            ${
              exportsRows ||
              '<tr><td colspan="3" class="muted" style="text-align:center;padding:8px">Nenhuma exportação registrada.</td></tr>'
            }
          </tbody>
        </table>
      </section>

      <div class="doc-footer">
        <span>${escapeHtml(options.companyName)} · Relatório ${escapeHtml(documentCode || '-')}</span>
        <span>Documento gerado pelo SGS em ${escapeHtml(generatedAtLabel)}</span>
      </div>

    </div>
  </body>
</html>`;
}
