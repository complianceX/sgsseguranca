import {
  PhotographicReportAreaStatus,
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
  const list = (items || [])
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join('');
  if (!list) return '<span class="muted">—</span>';
  return `<ul class="bullets">${list}</ul>`;
}

function groupImagesByDay(
  days: PhotographicReportDayResponse[],
  images: PhotographicReportRenderableImage[],
): Array<{
  day: PhotographicReportDayResponse | null;
  items: PhotographicReportRenderableImage[];
}> {
  const buckets = new Map<string, PhotographicReportRenderableImage[]>();
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

function renderPhotoCard(image: PhotographicReportRenderableImage): string {
  const points = (image.ai_positive_points || []).slice(0, 5);
  const recommendations = (image.ai_recommendations || []).slice(0, 5);
  const conditions = image.photo_conditions || [];
  const source = image.data_url;
  const orderLabel = String(image.image_order).padStart(2, '0');
  const classification = image.ai_condition_classification || 'Satisfatória';

  const conditionsHtml =
    conditions.length > 0
      ? conditions
          .map((c) => `<span class="cond-chip">${escapeHtml(c)}</span>`)
          .join('')
      : '<span class="muted">Nenhuma condição registrada.</span>';

  return `
    <div class="photo-card">
      <div class="photo-card-header">
        <span class="photo-seq">Foto ${orderLabel}</span>
        <span class="photo-date">${escapeHtml(image.activity_date_label || 'Sem data')}</span>
        <span class="${escapeHtml(classificationTagClass(classification))}">${escapeHtml(classification)}</span>
      </div>

      <div class="photo-img-wrap">
        ${
          source
            ? `<img src="${escapeHtml(source)}" alt="Foto ${orderLabel}" />`
            : '<div class="photo-no-img">Imagem indisponível</div>'
        }
      </div>

      <table class="photo-meta-table">
        <tr>
          <td class="label-cell" style="width:15%">Título</td>
          <td colspan="3">${escapeHtml(image.ai_title || image.manual_caption || '—')}</td>
        </tr>
        <tr>
          <td class="label-cell">Descrição</td>
          <td colspan="3">${escapeHtml(image.ai_description || image.manual_caption || '—')}</td>
        </tr>
        ${
          image.manual_caption
            ? `<tr><td class="label-cell">Legenda manual</td><td colspan="3">${escapeHtml(image.manual_caption)}</td></tr>`
            : ''
        }
        <tr>
          <td class="label-cell" style="width:15%;vertical-align:top">Pontos positivos</td>
          <td style="width:40%;vertical-align:top">${renderBulletList(points)}</td>
          <td class="label-cell" style="width:15%;vertical-align:top">Avaliação técnica</td>
          <td style="width:30%;vertical-align:top">${escapeHtml(image.ai_technical_assessment || '—')}</td>
        </tr>
        ${
          recommendations.length > 0
            ? `<tr>
                <td class="label-cell" style="vertical-align:top">Recomendação</td>
                <td colspan="3" style="vertical-align:top">${renderBulletList(recommendations)}</td>
               </tr>`
            : ''
        }
        <tr>
          <td class="label-cell" style="vertical-align:top">Condições observadas</td>
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

  const photoSections = groupedImages
    .map((group) => {
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
          ${group.items.map((img) => renderPhotoCard(img)).join('')}
        </div>
      `;
    })
    .join('');

  const style = `
    <style>
      @page { size: A4 portrait; margin: 12mm 12mm 14mm 12mm; }
      * { box-sizing: border-box; }

      :root {
        color-scheme: light;
        --paper: #ffffff;
        --ink: #0f172a;
        --muted: #2a455e;
        --line: #0d3457;
        --soft-line: #9cbdd8;
        --teal: #1d5b8d;
        --teal-dark: #18517C;
        --teal-bright: #1865B0;
        --teal-soft: #eaf4fb;
        --header-gray: #d7e6f3;
        --row-soft: #f8fbff;
        --label-bg: #1d5b8d;
      }

      body {
        margin: 0;
        background: var(--paper);
        color: var(--ink);
        font-family: Arial, Helvetica, sans-serif;
        font-size: 10px;
        line-height: 1.4;
      }
      h1, h2, h3, h4, p { margin: 0; }

      /* ── CABEÇALHO TÉCNICO ─────────────────────────────── */
      .tech-header {
        border: 1px solid var(--soft-line);
        border-radius: 10px;
        background: linear-gradient(180deg,
          var(--teal-bright) 0px, var(--teal-bright) 5px,
          var(--teal-dark)   5px, var(--teal-dark)   7px,
          #ffffff            7px, #ffffff            100%);
        overflow: hidden;
        box-shadow: 0 2px 6px rgba(9,30,66,0.08);
        margin-bottom: 10px;
      }
      .header-table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
      }
      .header-table td {
        border-right: 1px solid var(--soft-line);
        padding: 8px 10px;
        vertical-align: middle;
      }
      .header-table td:last-child { border-right: 0; }
      .logo-cell {
        width: 13%;
        text-align: center;
      }
      .logo-cell img {
        max-width: 100%;
        max-height: 36px;
        object-fit: contain;
        display: block;
        margin: 0 auto;
      }
      .logo-cell .logo-fallback {
        font-size: 8px;
        font-weight: 800;
        color: var(--teal);
        letter-spacing: .04em;
      }
      .title-cell {
        text-align: center;
        font-size: 13px;
        font-weight: 800;
        letter-spacing: .06em;
        color: var(--teal);
        text-transform: uppercase;
      }
      .title-cell small {
        display: block;
        font-size: 9px;
        font-weight: 400;
        color: var(--muted);
        text-transform: none;
        letter-spacing: 0;
        margin-top: 2px;
      }
      .code-cell {
        width: 18%;
        font-size: 8px;
        text-align: center;
        background: linear-gradient(180deg, #eef6fd 0%, #e4f0f9 100%);
        color: var(--muted);
      }
      .code-cell strong {
        display: block;
        font-size: 10px;
        color: var(--teal);
      }

      /* ── TABELA DE METADADOS ───────────────────────────── */
      .meta-table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
        font-size: 10px;
        margin-bottom: 10px;
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
      }
      .meta-table .value-cell {
        background: #fdfefe;
        width: 32%;
      }

      /* ── SEÇÕES ────────────────────────────────────────── */
      .section {
        margin-bottom: 10px;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .section-title {
        background: var(--teal);
        color: #ffffff;
        font-size: 10px;
        font-weight: 800;
        letter-spacing: .06em;
        text-transform: uppercase;
        padding: 5px 10px;
        border-radius: 6px 6px 0 0;
      }
      .section-body {
        border: 1px solid var(--soft-line);
        border-top: 0;
        padding: 10px;
        border-radius: 0 0 6px 6px;
        font-size: 10px;
        line-height: 1.6;
        color: var(--ink);
        background: #fafcff;
      }

      /* ── STATUS TAGS ───────────────────────────────────── */
      .status-tag {
        display: inline-block;
        padding: 2px 8px;
        border: 1px solid var(--soft-line);
        border-radius: 999px;
        font-size: 9px;
        font-weight: 700;
        white-space: nowrap;
      }
      .status-tag--success    { background: #e8f5e9; color: #166534; border-color: #a7d7b4; }
      .status-tag--critical   { background: #fef2f2; color: #991b1b; border-color: #fca5a5; }
      .status-tag--warning    { background: #fffbeb; color: #92400e; border-color: #fde68a; }
      .status-tag--info       { background: #eff6ff; color: #1e40af; border-color: #bfdbfe; }
      .status-tag--neutral    { background: #f9fafb; color: #374151; border-color: #e5e7eb; }

      /* ── FOTOS ─────────────────────────────────────────── */
      .day-block {
        margin-bottom: 14px;
      }
      .day-header {
        display: flex;
        justify-content: space-between;
        background: var(--teal-soft);
        border: 1px solid var(--soft-line);
        border-radius: 6px;
        padding: 5px 10px;
        font-size: 9px;
        font-weight: 700;
        color: var(--teal);
        text-transform: uppercase;
        letter-spacing: .05em;
        margin-bottom: 8px;
      }
      .photo-card {
        border: 1px solid var(--soft-line);
        border-radius: 8px;
        overflow: hidden;
        margin-bottom: 10px;
        break-inside: avoid;
        page-break-inside: avoid;
        background: #ffffff;
      }
      .photo-card-header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 5px 10px;
        background: var(--teal);
        color: #ffffff;
      }
      .photo-seq {
        font-size: 9px;
        font-weight: 800;
        letter-spacing: .08em;
        text-transform: uppercase;
      }
      .photo-date {
        font-size: 9px;
        color: rgba(255,255,255,.78);
        flex: 1;
      }
      .photo-img-wrap {
        width: 100%;
        background: #eef4f8;
        border-bottom: 1px solid var(--soft-line);
        text-align: center;
      }
      .photo-img-wrap img {
        max-width: 100%;
        max-height: 100mm;
        object-fit: contain;
        display: block;
        margin: 0 auto;
      }
      .photo-no-img {
        padding: 20px;
        color: var(--muted);
        font-size: 10px;
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
        background: var(--teal-soft);
        color: var(--teal);
        font-weight: 700;
        font-size: 9px;
        text-transform: uppercase;
        letter-spacing: .04em;
        white-space: nowrap;
      }

      /* ── CONDIÇÕES ─────────────────────────────────────── */
      .cond-row {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
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
      .muted { color: var(--muted); }

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
        background: var(--header-gray);
        color: var(--teal);
        font-weight: 700;
        font-size: 9px;
        text-transform: uppercase;
        letter-spacing: .04em;
      }
      .export-table tr:nth-child(even) td {
        background: var(--row-soft);
      }

      /* ── RODAPÉ ────────────────────────────────────────── */
      .doc-footer {
        margin-top: 10mm;
        padding: 6px 10px;
        border-top: 2px solid var(--teal);
        display: flex;
        justify-content: space-between;
        font-size: 8px;
        color: var(--muted);
      }

      .page-break {
        break-before: page;
        page-break-before: always;
      }
    </style>
  `;

  const logoHtml = options.logoDataUrl
    ? `<img src="${escapeHtml(options.logoDataUrl)}" alt="Logo" />`
    : `<div class="logo-fallback">SGS</div>`;

  const aiSummaryText =
    report.ai_summary ||
    'Avaliação consolidada pendente de geração automática ou edição manual.';

  const finalConclusionText =
    report.final_conclusion ||
    'Parecer técnico em edição. Utilize a tela de edição para concluir a redação.';

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <title>Relatório Fotográfico</title>
    ${style}
  </head>
  <body>
    <div class="page">

      <!-- CABEÇALHO TÉCNICO -->
      <div class="tech-header">
        <table class="header-table">
          <tr>
            <td class="logo-cell">${logoHtml}</td>
            <td class="title-cell">
              RELATÓRIO FOTOGRÁFICO
              <small>${escapeHtml(options.companyName)}</small>
            </td>
            <td class="code-cell">
              <strong>${escapeHtml(buildPeriodLabel(report))}</strong>
              Emitido em<br />${escapeHtml(generatedAtLabel)}
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
              <td class="label-cell">Tipo de atividade</td>
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
              <td class="label-cell">Tom do relatório</td>
              <td class="value-cell">${escapeHtml(toneLabel(report.report_tone))}</td>
              <td class="label-cell">Total de fotos</td>
              <td class="value-cell">${renderableImages.length}</td>
            </tr>
          </table>
        </div>
      </div>

      <!-- 2. OBSERVAÇÕES GERAIS -->
      <div class="section">
        <div class="section-title">2. Observações gerais</div>
        <div class="section-body">
          ${escapeHtml(
            report.general_observations ||
              `Atividade de ${report.activity_type.toLowerCase()} executada com registro fotográfico da frente de serviço, evidenciando organização operacional e acompanhamento do cenário de campo.`,
          )}
        </div>
      </div>

      <!-- 3. SÍNTESE DA IA -->
      <div class="section">
        <div class="section-title">3. Síntese técnica (gerada por IA)</div>
        <div class="section-body">${escapeHtml(aiSummaryText)}</div>
      </div>

      <!-- 4. REGISTRO FOTOGRÁFICO (nova página) -->
      <div class="page-break"></div>
      <div class="section">
        <div class="section-title">4. Registro fotográfico</div>
        <div class="section-body" style="padding: 10px 0 0">
          ${
            photoSections ||
            '<p class="muted" style="padding:10px">Nenhuma fotografia vinculada ao relatório.</p>'
          }
        </div>
      </div>

      <!-- 5. AVALIAÇÃO CONSOLIDADA -->
      <div class="section page-break">
        <div class="section-title">5. Avaliação consolidada</div>
        <div class="section-body">${escapeHtml(aiSummaryText)}</div>
      </div>

      <!-- 6. PARECER TÉCNICO -->
      <div class="section">
        <div class="section-title">6. Parecer técnico / Conclusão</div>
        <div class="section-body">${escapeHtml(finalConclusionText)}</div>
      </div>

      <!-- 7. HISTÓRICO DE EXPORTAÇÕES -->
      <div class="section">
        <div class="section-title">7. Histórico de exportações</div>
        <div class="section-body" style="padding:0">
          <table class="export-table">
            <thead>
              <tr>
                <th style="width:20%">Tipo</th>
                <th>Gerado em</th>
              </tr>
            </thead>
            <tbody>
              ${
                exportsList ||
                '<tr><td colspan="2" class="muted" style="padding:8px 10px">Nenhuma exportação registrada.</td></tr>'
              }
            </tbody>
          </table>
        </div>
      </div>

      <!-- RODAPÉ -->
      <div class="doc-footer">
        <span>SGS · Sistema de Gestão de Segurança · Relatório Fotográfico · ${escapeHtml(options.companyName)}</span>
        <span>Gerado em ${escapeHtml(generatedAtLabel)}</span>
      </div>

    </div>
  </body>
</html>`;

  return html;
}
