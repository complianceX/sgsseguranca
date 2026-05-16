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

function buildPeriodLabel(report: PhotographicReportListItemResponse): string {
  const start = formatDate(report.start_date);
  const end = report.end_date ? formatDate(report.end_date) : start;
  return start === end ? start : `${start} a ${end}`;
}

function buildCoverHighlight(
  report: PhotographicReportListItemResponse,
): string {
  if (
    report.area_status === PhotographicReportAreaStatus.LOJA_FECHADA ||
    report.area_status === PhotographicReportAreaStatus.AREA_CONTROLADA ||
    report.shift === PhotographicReportShift.NOTURNO
  ) {
    return 'ATIVIDADE REGISTRADA COM CONTROLE OPERACIONAL, MENOR INTERFERÊNCIA EXTERNA E CONDIÇÕES FAVORÁVEIS PARA EXECUÇÃO SEGURA.';
  }

  return 'ATIVIDADE REGISTRADA COM ORGANIZAÇÃO OPERACIONAL, CONTROLE DA FRENTE DE SERVIÇO E BOAS CONDIÇÕES DE EXECUÇÃO.';
}

function toneClass(tone: PhotographicReportTone): string {
  switch (tone) {
    case PhotographicReportTone.TECNICO:
      return 'tone-tecnico';
    case PhotographicReportTone.PREVENTIVO:
      return 'tone-preventivo';
    default:
      return 'tone-positivo';
  }
}

function renderKeyValue(
  label: string,
  value: string | null | undefined,
): string {
  return `
    <div class="kv">
      <span class="k">${escapeHtml(label)}</span>
      <span class="v">${escapeHtml(value || '-')}</span>
    </div>
  `;
}

function renderDetailField(
  label: string,
  value: string | null | undefined,
): string {
  return `
    <div class="kv">
      <span class="k">${escapeHtml(label)}</span>
      <span class="v">${escapeHtml(value || '-')}</span>
    </div>
  `;
}

function renderBulletList(items: string[] | null | undefined): string {
  const list = (items || [])
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join('');
  if (!list) {
    return '<p class="muted">Sem itens registrados.</p>';
  }
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

function renderPhotoCard(image: PhotographicReportRenderableImage): string {
  const points = (image.ai_positive_points || []).slice(0, 5);
  const recommendations = (image.ai_recommendations || []).slice(0, 5);
  const source = image.data_url;

  return `
    <article class="photo-card">
      <div class="photo-media">
        ${
          source
            ? `<img src="${escapeHtml(source)}" alt="${escapeHtml(image.ai_title || image.manual_caption || 'Foto do relatório')}" />`
            : '<div class="photo-placeholder">Imagem indisponível</div>'
        }
      </div>
      <div class="photo-body">
        <div class="photo-head">
          <div>
            <p class="photo-kicker">Registro fotográfico ${String(image.image_order).padStart(2, '0')} · ${escapeHtml(image.activity_date_label || 'Sem data')}</p>
            <h3>${escapeHtml(image.ai_title || image.manual_caption || 'Registro fotográfico')}</h3>
          </div>
          <span class="classification">${escapeHtml(image.ai_condition_classification || 'Satisfatória')}</span>
        </div>

        <p class="photo-text">${escapeHtml(image.ai_description || image.manual_caption || 'Sem descrição informada.')}</p>

        ${
          image.manual_caption
            ? `<p class="manual-caption"><strong>Legenda manual:</strong> ${escapeHtml(image.manual_caption)}</p>`
            : ''
        }

        <div class="photo-grid">
          <div>
            <h4>Pontos positivos observados</h4>
            ${renderBulletList(points)}
          </div>
          <div>
            <h4>Avaliação técnica</h4>
            <p class="tech-text">${escapeHtml(image.ai_technical_assessment || 'Avaliação técnica não informada.')}</p>
          </div>
        </div>

        ${
          recommendations.length > 0
            ? `<div class="recommendation"><h4>Recomendação preventiva</h4>${renderBulletList(recommendations)}</div>`
            : ''
        }
      </div>
    </article>
  `;
}

function renderPhotoDetail(image: PhotographicReportRenderableImage): string {
  const points = (image.ai_positive_points || []).slice(0, 5);
  const recommendations = (image.ai_recommendations || []).slice(0, 5);

  return `
    <section class="detail-block">
      <h3>Registro Fotográfico ${String(image.image_order).padStart(2, '0')}</h3>
      <div class="detail-grid">
        ${renderDetailField('Data', image.activity_date_label)}
        ${renderDetailField('Título', image.ai_title || image.manual_caption || 'Sem título')}
        ${renderDetailField('Descrição', image.ai_description || image.manual_caption || 'Sem descrição informada.')}
        ${renderDetailField('Pontos positivos', points.join(' · ') || 'Sem itens registrados.')}
        ${renderDetailField('Avaliação técnica', image.ai_technical_assessment || 'Avaliação técnica não informada.')}
        ${renderDetailField('Classificação', image.ai_condition_classification || 'Satisfatória')}
        ${renderDetailField('Recomendação preventiva', recommendations.join(' · ') || 'Sem recomendação preventiva.')}
      </div>
    </section>
  `;
}

export function buildPhotographicReportHtml(
  report: PhotographicReportResponse,
  options: {
    companyName: string;
    generatedAt?: string;
    renderableImages?: PhotographicReportRenderableImage[];
  },
): string {
  const renderableImages = options.renderableImages || [];
  const groupedImages = groupImagesByDay(report.days || [], renderableImages);
  const generatedAtLabel = options.generatedAt
    ? formatDateTime(options.generatedAt)
    : '-';
  const exportsList = (report.exports || [])
    .slice()
    .sort((left, right) => left.generated_at.localeCompare(right.generated_at))
    .map(
      (entry) => `
        <tr>
          <td>${escapeHtml(entry.export_type.toUpperCase())}</td>
          <td>${escapeHtml(formatDateTime(entry.generated_at))}</td>
          <td>${escapeHtml(entry.download_url || entry.file_url)}</td>
        </tr>
      `,
    )
    .join('');

  const daySummaryMap = new Map(
    (report.days || []).map((day) => [day.id, day.day_summary || '']),
  );

  const photoSections = groupedImages
    .map((group) => {
      const title = group.day
        ? `Registro da data ${escapeHtml(formatDate(group.day.activity_date))}`
        : 'Registros sem data vinculada';
      const daySummary = group.day ? daySummaryMap.get(group.day.id) : '';
      return `
        <section class="day-section">
          <div class="section-head">
            <div>
              <h2>${title}</h2>
              ${
                group.day
                  ? `<p class="muted">Resumo do dia: ${escapeHtml(daySummary || 'Sem resumo informado.')}</p>`
                  : '<p class="muted">Fotos ainda não vinculadas a uma data específica.</p>'
              }
            </div>
            <span class="badge">${group.items.length} foto(s)</span>
          </div>
          <div class="photos">
            ${group.items.map((image) => renderPhotoCard(image)).join('')}
          </div>
        </section>
      `;
    })
    .join('');

  const photoDetails = renderableImages
    .map((image) => renderPhotoDetail(image))
    .join('');

  const style = `
    <style>
      @page { size: A4 portrait; margin: 18mm 14mm 18mm 14mm; }
      * { box-sizing: border-box; }
      body {
        font-family: Arial, Helvetica, sans-serif;
        margin: 0;
        color: #15222f;
        background: #f4f6f8;
      }
      .page {
        padding: 0;
      }
      .sheet {
        background: #fff;
        padding: 0;
      }
      .cover {
        min-height: 250mm;
        border: 1px solid #dbe3ea;
        border-radius: 18px;
        overflow: hidden;
        background:
          radial-gradient(circle at top right, rgba(24, 92, 151, 0.12), transparent 28%),
          linear-gradient(180deg, #f8fbff 0%, #ffffff 42%, #eef5fb 100%);
        padding: 18mm 16mm;
      }
      .brand {
        font-size: 11px;
        letter-spacing: .18em;
        text-transform: uppercase;
        color: #5c7185;
        font-weight: 700;
      }
      .cover-top {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
      }
      .cover-tag {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 7px 12px;
        border-radius: 999px;
        background: rgba(20, 50, 75, 0.08);
        color: #17324c;
        font-size: 10px;
        font-weight: 800;
        letter-spacing: .08em;
        text-transform: uppercase;
      }
      .cover-hero {
        margin-top: 8mm;
        display: grid;
        grid-template-columns: 1.6fr .9fr;
        gap: 14px;
        align-items: stretch;
      }
      .cover-main {
        padding: 18px 20px;
        border-radius: 18px;
        background: rgba(255,255,255,.78);
        border: 1px solid rgba(219,227,234,.95);
        box-shadow: 0 14px 30px rgba(18, 43, 68, 0.08);
      }
      .title {
        margin: 4mm 0 3mm;
        font-size: 31px;
        line-height: 1.02;
        letter-spacing: -0.03em;
      }
      .subtitle {
        font-size: 13px;
        color: #567086;
        margin-bottom: 8mm;
        line-height: 1.6;
      }
      .cover-side {
        padding: 18px 18px 16px;
        border-radius: 18px;
        background: linear-gradient(180deg, rgba(20,50,75,.96), rgba(20,50,75,.88));
        color: #ffffff;
        box-shadow: 0 14px 30px rgba(18, 43, 68, 0.12);
      }
      .cover-side .k,
      .cover-side .v {
        color: #fff;
      }
      .cover-side .kv {
        border-color: rgba(255,255,255,.16);
        background: rgba(255,255,255,.08);
      }
      .cover-highlight {
        margin-top: 14px;
        padding: 14px 16px;
        border-radius: 14px;
        background: #14324b;
        color: #ffffff;
        font-weight: 700;
        letter-spacing: .03em;
        line-height: 1.5;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }
      .kv {
        padding: 10px 12px;
        border-radius: 12px;
        background: rgba(255,255,255,.78);
        border: 1px solid #dbe3ea;
      }
      .k {
        display: block;
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: .08em;
        color: #6a7e91;
        margin-bottom: 5px;
      }
      .v {
        display: block;
        font-size: 13px;
        font-weight: 700;
        color: #15222f;
        line-height: 1.35;
      }
      .section {
        margin-top: 14mm;
        padding: 14mm 14mm 0;
      }
      .section-panel {
        border: 1px solid #dbe3ea;
        border-radius: 18px;
        background: #ffffff;
        box-shadow: 0 10px 24px rgba(18, 43, 68, 0.05);
        padding: 14mm 14mm 12mm;
      }
      .section-title {
        margin: 0 0 8px;
        font-size: 18px;
      }
      .section-text {
        margin: 0 0 10px;
        font-size: 11.5px;
        line-height: 1.7;
        color: #31465a;
      }
      .muted {
        color: #5c7185;
        font-size: 11px;
        line-height: 1.6;
      }
      .badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 6px 10px;
        border-radius: 999px;
        background: #e8eff7;
        color: #17324c;
        font-size: 11px;
        font-weight: 700;
      }
      .tone-positivo { background: #e7f7ec; color: #176b37; }
      .tone-tecnico { background: #eef2ff; color: #3246a8; }
      .tone-preventivo { background: #fff4df; color: #a16207; }
      .day-section {
        margin-top: 14mm;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .section-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 10px;
      }
      .photos {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .photo-card {
        border: 1px solid #dbe3ea;
        border-radius: 16px;
        overflow: hidden;
        background: #ffffff;
        box-shadow: 0 8px 24px rgba(18, 43, 68, 0.05);
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .photo-media {
        width: 100%;
        min-height: 88mm;
        background: #eef4f8;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .photo-media img {
        width: 100%;
        max-height: 90mm;
        object-fit: cover;
        display: block;
      }
      .photo-placeholder {
        color: #6a7e91;
        font-size: 13px;
        padding: 20px;
      }
      .photo-body {
        padding: 12px 14px 14px;
      }
      .photo-head {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        align-items: flex-start;
        margin-bottom: 8px;
      }
      .photo-kicker {
        margin: 0 0 4px;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: .12em;
        text-transform: uppercase;
        color: #6a7e91;
      }
      .photo-head h3 {
        margin: 0;
        font-size: 15px;
      }
      .classification {
        font-size: 11px;
        font-weight: 700;
        padding: 6px 10px;
        border-radius: 999px;
        background: #f1f5f9;
        color: #17324c;
        white-space: nowrap;
      }
      .photo-text,
      .tech-text {
        margin: 0;
        font-size: 11.5px;
        line-height: 1.7;
        color: #31465a;
      }
      .document-footer {
        margin-top: 10mm;
        padding: 10px 14px;
        border-radius: 12px;
        border: 1px solid #dbe3ea;
        background: #f8fbff;
        color: #5c7185;
        font-size: 10px;
        display: flex;
        justify-content: space-between;
        gap: 12px;
      }
      .manual-caption,
      .recommendation {
        margin-top: 10px;
        padding: 10px 12px;
        border-radius: 12px;
        background: #f8fbff;
        border: 1px solid #dbe3ea;
      }
      .photo-grid {
        margin-top: 10px;
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }
      .detail-block {
        margin-top: 14px;
        padding: 12px 14px;
        border: 1px solid #dbe3ea;
        border-radius: 14px;
        background: #f8fbff;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .detail-block h3 {
        margin: 0 0 10px;
        font-size: 14px;
      }
      .detail-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }
      .photo-grid h4,
      .recommendation h4 {
        margin: 0 0 6px;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: .08em;
        color: #5c7185;
      }
      .bullets {
        margin: 0;
        padding-left: 16px;
        color: #31465a;
      }
      .bullets li {
        margin-bottom: 4px;
        line-height: 1.55;
        font-size: 11px;
      }
      .summary-box {
        margin-top: 10px;
        padding: 12px 14px;
        border-radius: 14px;
        border: 1px solid #dbe3ea;
        background: #f7fafc;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 11px;
      }
      th, td {
        border: 1px solid #dbe3ea;
        padding: 8px 10px;
        text-align: left;
        vertical-align: top;
      }
      th {
        background: #edf4fb;
      }
      .footer-space {
        height: 14mm;
      }
      .export-history {
        margin-top: 10mm;
      }
      .page-break {
        break-before: page;
        page-break-before: always;
      }
    </style>
  `;

  const exportHistory =
    exportsList ||
    '<tr><td colspan="3">Nenhuma exportação registrada até o momento.</td></tr>';

  const sections = `
    <section class="sheet cover">
      <div class="cover-top">
        <div class="brand">SGS · Sistema de Gestão de Segurança</div>
        <div class="cover-tag">Gerado em ${escapeHtml(generatedAtLabel)}</div>
      </div>

      <div class="cover-hero">
        <div class="cover-main">
          <h1 class="title">RELATÓRIO FOTOGRÁFICO</h1>
          <div class="subtitle">
            ${escapeHtml(options.companyName)} · documento profissional de registro visual, análise técnica e histórico operacional.
          </div>

          <div class="grid">
            ${renderKeyValue('Cliente', report.client_name)}
            ${renderKeyValue('Obra', report.project_name)}
            ${renderKeyValue('Unidade', report.unit_name)}
            ${renderKeyValue('Local', report.location)}
            ${renderKeyValue('Data', buildPeriodLabel(report))}
            ${renderKeyValue('Período', `${formatTime(report.start_time)} às ${formatTime(report.end_time)}`)}
            ${renderKeyValue('Tipo de atividade', report.activity_type)}
            ${renderKeyValue('Responsável', report.responsible_name)}
            ${renderKeyValue('Empresa executora', report.contractor_company)}
            ${renderKeyValue('Turno', report.shift)}
            ${renderKeyValue('Condição da área', report.area_status)}
            ${renderKeyValue('Tom do relatório', report.report_tone)}
          </div>

          <div class="cover-highlight ${toneClass(report.report_tone)}">
            ${escapeHtml(buildCoverHighlight(report))}
          </div>
        </div>

        <aside class="cover-side">
          <div class="grid">
            ${renderKeyValue('Resumo', report.ai_summary || 'Consolidação técnica em andamento')}
            ${renderKeyValue('Conclusão', report.final_conclusion || 'Em edição')}
            ${renderKeyValue('Fotos', String(renderableImages.length))}
            ${renderKeyValue('Datas', String((report.days || []).length))}
          </div>
        </aside>
      </div>

      <div class="document-footer">
        <span>Relatório fotográfico consolidado para leitura técnica e operacional.</span>
        <span>Uso interno SGS</span>
      </div>
    </section>

    <section class="section section-panel page-break">
      <h2 class="section-title">2. Dados da obra</h2>
      <div class="grid">
        ${renderKeyValue('Cliente', report.client_name)}
        ${renderKeyValue('Obra', report.project_name)}
        ${renderKeyValue('Unidade', report.unit_name)}
        ${renderKeyValue('Local específico', report.location)}
        ${renderKeyValue('Responsável', report.responsible_name)}
        ${renderKeyValue('Empresa executora', report.contractor_company)}
      </div>
    </section>

    <section class="section section-panel">
      <h2 class="section-title">3. Objetivo do relatório</h2>
      <p class="section-text">${escapeHtml(
        'O presente relatório fotográfico tem por objetivo documentar visualmente a atividade executada, organizar as evidências por data e apresentar leitura técnica objetiva, com linguagem profissional e compatível com o contexto operacional registrado.',
      )}</p>
    </section>

    <section class="section section-panel">
      <h2 class="section-title">4. Descrição geral da atividade</h2>
      <p class="section-text">${escapeHtml(
        report.general_observations ||
          `Atividade de ${report.activity_type.toLowerCase()} executada com registro fotográfico da frente de serviço, evidenciando organização operacional, rastreabilidade e acompanhamento do cenário de campo.`,
      )}</p>
    </section>

    <section class="section section-panel">
      <h2 class="section-title">5. Condições gerais observadas</h2>
      <p class="section-text">${escapeHtml(report.ai_summary || buildCoverHighlight(report))}</p>
    </section>

    <section class="section section-panel page-break">
      <h2 class="section-title">6. Registro fotográfico separado por data</h2>
      <p class="section-text">As imagens estão agrupadas por data de atividade para facilitar a leitura operacional e a rastreabilidade do documento.</p>
      ${photoSections || '<p class="muted">Nenhuma fotografia vinculada ao relatório.</p>'}
    </section>

    <section class="section section-panel page-break">
      <h2 class="section-title">7. Detalhamento de cada foto</h2>
      <p class="section-text">Cada registro fotográfico apresenta legenda, análise técnica, classificação da condição observada e, quando necessário, recomendação preventiva leve.</p>
      ${photoDetails || '<p class="muted">Nenhuma fotografia vinculada ao relatório.</p>'}
    </section>

    <section class="section section-panel page-break">
      <h2 class="section-title">8. Avaliação consolidada</h2>
      <p class="section-text">${escapeHtml(
        report.ai_summary ||
          'Avaliação consolidada pendente de geração automática ou edição manual.',
      )}</p>
    </section>

    <section class="section section-panel">
      <h2 class="section-title">9. Parecer técnico</h2>
      <p class="section-text">${escapeHtml(
        report.final_conclusion ||
          'Parecer técnico em edição. Utilize a tela de edição para concluir a redação final.',
      )}</p>
    </section>

    <section class="section section-panel">
      <h2 class="section-title">10. Conclusão final</h2>
      <p class="section-text">${escapeHtml(
        report.final_conclusion ||
          'Conclusão final em aberto. Registre ou regenere a síntese antes da finalização.',
      )}</p>
    </section>

    <section class="section section-panel page-break export-history">
      <h2 class="section-title">Histórico de exportações</h2>
      <table>
        <thead>
          <tr>
            <th>Tipo</th>
            <th>Gerado em</th>
            <th>Arquivo / URL</th>
          </tr>
        </thead>
        <tbody>
          ${exportHistory}
        </tbody>
      </table>
    </section>
  `;

  return `<!DOCTYPE html>
  <html lang="pt-BR">
    <head>
      <meta charset="UTF-8" />
      <meta http-equiv="X-UA-Compatible" content="IE=edge" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Relatório Fotográfico</title>
      ${style}
    </head>
    <body>
      <div class="page">
        ${sections}
      </div>
    </body>
  </html>`;
}
