import JSZip from 'jszip';
import {
  PhotographicReportAreaStatus,
  PhotographicReportShift,
  PhotographicReportStatus,
  PhotographicReportTone,
} from './entities/photographic-report.entity';
import { PhotographicReportExportType } from './entities/photographic-report-export.entity';
import type {
  PhotographicReportResponse,
  PhotographicReportDayResponse,
  PhotographicReportImageResponse,
} from './photographic-reports.types';
import { buildPhotographicReportWordBuffer } from './photographic-reports.word';

function buildSampleReport(): PhotographicReportResponse {
  const day: PhotographicReportDayResponse = {
    id: 'day-1',
    report_id: 'report-1',
    activity_date: '2026-05-15',
    day_summary:
      'Serviço executado com organização operacional e controle da frente.',
    created_at: '2026-05-15T10:00:00.000Z',
    updated_at: '2026-05-15T10:05:00.000Z',
    image_count: 1,
  };

  const image: PhotographicReportImageResponse = {
    id: 'image-1',
    report_id: 'report-1',
    report_day_id: day.id,
    image_url: 'https://storage.example/report-1/image-1.png',
    download_url: null,
    image_order: 1,
    manual_caption: 'Frente de serviço organizada',
    ai_title: 'Organização da área de trabalho',
    ai_description:
      'Área com boa organização e controle visual das atividades.',
    ai_positive_points: ['Frente limpa', 'Materiais organizados'],
    ai_technical_assessment:
      'Condição técnica satisfatória para execução da atividade.',
    ai_condition_classification: 'Muito satisfatória',
    ai_recommendations: ['Manter a organização atual'],
    created_at: '2026-05-15T10:10:00.000Z',
    updated_at: '2026-05-15T10:12:00.000Z',
    day,
  };

  return {
    id: 'report-1',
    company_id: 'company-1',
    client_id: 'client-1',
    project_id: 'project-1',
    client_name: 'Cliente Exemplo',
    project_name: 'Obra Exemplo',
    unit_name: 'Unidade Central',
    location: 'Corredor principal',
    activity_type: 'Organização de frente de serviço',
    report_tone: PhotographicReportTone.POSITIVO,
    area_status: PhotographicReportAreaStatus.LOJA_FECHADA,
    shift: PhotographicReportShift.NOTURNO,
    start_date: '2026-05-15',
    end_date: null,
    start_time: '20:00:00',
    end_time: '22:00:00',
    responsible_name: 'Responsável Técnico',
    contractor_company: 'Empresa Executora LTDA',
    general_observations: 'Observações gerais do relatório.',
    ai_summary: 'Resumo consolidado do serviço fotográfico.',
    final_conclusion: 'Conclusão final aprovada.',
    status: PhotographicReportStatus.ANALISADO,
    created_by: 'user-1',
    created_at: '2026-05-15T10:00:00.000Z',
    updated_at: '2026-05-15T10:30:00.000Z',
    day_count: 1,
    image_count: 1,
    export_count: 1,
    last_exported_at: '2026-05-15T10:40:00.000Z',
    days: [day],
    images: [image],
    exports: [
      {
        id: 'export-1',
        report_id: 'report-1',
        export_type: PhotographicReportExportType.WORD,
        file_url:
          'documents/company-1/photographic-report/report-1/export.docx',
        download_url: null,
        generated_by: 'user-1',
        generated_at: '2026-05-15T10:40:00.000Z',
      },
    ],
  };
}

describe('buildPhotographicReportWordBuffer', () => {
  it('gera um pacote docx válido com conteúdo e mídia embutida', async () => {
    const report = buildSampleReport();
    const image = report.images[0];
    if (!image) {
      throw new Error('Imagem de teste ausente.');
    }
    const buffer = await buildPhotographicReportWordBuffer(report, {
      companyName: 'SGS',
      generatedAt: '2026-05-15T10:45:00.000Z',
      renderableImages: [
        {
          ...image,
          data_url:
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6Z0M8AAAAASUVORK5CYII=',
          activity_date_label: '15/05/2026',
        },
      ],
    });

    const zip = await JSZip.loadAsync(buffer);
    const contentTypes = await zip.file('[Content_Types].xml')!.async('string');
    const documentXml = await zip.file('word/document.xml')!.async('string');
    const relationshipsXml = await zip
      .file('word/_rels/document.xml.rels')!
      .async('string');

    expect(contentTypes).toContain(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml',
    );
    expect(documentXml).toContain('RELATÓRIO FOTOGRÁFICO');
    expect(documentXml).toContain('Registro Fotográfico 01');
    expect(documentXml).toContain('Organização da área de trabalho');
    expect(relationshipsXml).toContain('media/image1.png');
    expect(zip.file('word/media/image1.png')).not.toBeNull();
  });
});
