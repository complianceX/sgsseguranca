import * as fs from 'fs';
import * as path from 'path';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  applyFooterGovernance,
  buildDocumentCode,
  buildValidationUrl,
  createPdfContext,
  drawAprBlueprint,
  drawAuditBlueprint,
  drawChecklistBlueprint,
  drawDdsBlueprint,
  drawNcBlueprint,
  drawPageBackground,
  drawPhotographicReportBlueprint,
  drawPtBlueprint,
  drawTrainingBlueprint,
  formatDateTime,
} from '../../frontend/lib/pdf-system';
import { generateMonthlyReportPdf } from '../../frontend/lib/pdf/monthlyReportGenerator';

const tinyImage =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9sotXnQAAAAASUVORK5CYII=';

const outputDir = path.join(
  process.cwd(),
  '..',
  'artifacts',
  'pdf-homologation',
  new Date().toISOString().replace(/[:.]/g, '-'),
);

const autoTableWarnings: Array<{ document: string; message: string }> = [];

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function writePdf(doc: jsPDF, filename: string) {
  const buffer = Buffer.from(doc.output('arraybuffer'));
  fs.writeFileSync(path.join(outputDir, filename), buffer);
}

async function renderDocument(
  filename: string,
  variant: 'critical' | 'operational' | 'photographic' | 'compliance' | 'training',
  prefix: string,
  reference: string,
  orientation: 'portrait' | 'landscape',
  draw: (
    ctx: ReturnType<typeof createPdfContext>,
    code: string,
  ) => Promise<void>,
) {
  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
  const ctx = createPdfContext(doc, variant);
  const code = buildDocumentCode(prefix, reference);
  drawPageBackground(ctx);
  await draw(ctx, code);
  applyFooterGovernance(ctx, {
    code,
    generatedAt: formatDateTime(new Date().toISOString()),
    draft: false,
  });
  writePdf(doc, filename);
}

async function main() {
  ensureDir(outputDir);
  const originalWarn = console.warn;
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  let currentDocument = 'unknown';

  const captureWrite =
    (
      writer: typeof process.stdout.write,
      stream: 'stdout' | 'stderr',
    ) =>
    (
      chunk: string | Uint8Array,
      encoding?: BufferEncoding | ((error?: Error | null) => void),
      callback?: (error?: Error | null) => void,
    ) => {
      const text =
        typeof chunk === 'string'
          ? chunk
          : Buffer.isBuffer(chunk)
            ? chunk.toString('utf-8')
            : Buffer.from(chunk).toString('utf-8');

      if (text.includes('Of the table content')) {
        autoTableWarnings.push({
          document: currentDocument,
          message: `${stream}: ${text.trim()}`,
        });
      }

      return writer(chunk as never, encoding as never, callback as never);
    };

  console.warn = (...args: unknown[]) => {
    const message = args
      .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)))
      .join(' ');

    if (message.includes('Of the table content')) {
      autoTableWarnings.push({ document: currentDocument, message });
    }

    originalWarn(...args);
  };
  process.stdout.write = captureWrite(originalStdoutWrite, 'stdout') as typeof process.stdout.write;
  process.stderr.write = captureWrite(originalStderrWrite, 'stderr') as typeof process.stderr.write;

  const signatures = [
    {
      type: 'Responsavel tecnico',
      user: { nome: 'Imperador Gandra' },
      created_at: new Date().toISOString(),
      signed_at: new Date().toISOString(),
      signature_data: null,
    },
  ];

  const apr = {
    id: 'apr-homolog-001',
    numero: 'APR-2026-001',
    titulo: 'Manutencao em plataforma elevatoria',
    descricao:
      'Analise preliminar de risco para manutencao corretiva em altura, com apoio de eletricidade e isolamento de area.',
    data_inicio: new Date().toISOString(),
    data_fim: new Date(Date.now() + 86400000).toISOString(),
    status: 'Aprovada',
    versao: 3,
    company_id: 'EMP-001',
    company: { razao_social: 'Gandra Tecnologia' },
    site_id: 'SITE-001',
    site: { nome: 'Obra Industrial Norte' },
    elaborador_id: 'USR-001',
    elaborador: { nome: 'Joao Tecnico' },
    participants: [{ nome: 'Carlos Silva' }, { nome: 'Aline Souza' }],
    activities: [
      { nome: 'Preparação da área', descricao: 'Isolamento e conferência de acesso' },
      { nome: 'Intervenção elétrica', descricao: 'Bloqueio e manutenção em painel' },
    ],
    risks: [
      { nome: 'Queda de altura', categoria: 'Acidente', medidas_controle: 'Linha de vida e ancoragem certificada' },
      { nome: 'Choque elétrico', categoria: 'Elétrico', medidas_controle: 'Bloqueio/etiquetagem e ausência de tensão' },
    ],
    epis: [
      { nome: 'Cinto paraquedista', ca: '12345', validade_ca: new Date(Date.now() + 120 * 86400000).toISOString(), descricao: 'Uso obrigatório em altura' },
      { nome: 'Luva isolante', ca: '67890', validade_ca: new Date(Date.now() + 180 * 86400000).toISOString(), descricao: 'Proteção para intervenção elétrica' },
    ],
    tools: [
      { nome: 'Detector de tensão', numero_serie: 'DT-7781', descricao: 'Verificação de ausência de tensão' },
      { nome: 'Talabarte duplo', numero_serie: 'TL-1192', descricao: 'Conexão contínua em deslocamento' },
    ],
    machines: [
      { nome: 'Plataforma elevatória', placa: 'PE-420', requisitos_seguranca: 'Checklist pré-uso e operador habilitado' },
    ],
    control_description:
      'Sequenciamento com bloqueio elétrico, inspeção de ancoragem e liberação da frente por responsável SST.',
    residual_risk: 'MEDIUM',
    evidence_document: 'Permissão de trabalho PT-2026-014 e checklist de pré-uso anexados.',
    evidence_photo: 'Registro fotográfico da área e barreiras de isolamento.',
    classificacao_resumo: { total: 3, aceitavel: 1, atencao: 1, substancial: 1, critico: 0 },
    risk_items: [
      {
        id: '1',
        apr_id: 'apr-homolog-001',
        atividade: 'Acesso a plataforma',
        agente_ambiental: 'Queda de altura',
        condicao_perigosa: 'Ancoragem insuficiente',
        fonte_circunstancia: 'Acesso lateral',
        lesao: 'Fraturas e contusões graves',
        probabilidade: 3,
        severidade: 4,
        score_risco: 12,
        categoria_risco: 'Alto',
        prioridade: 'Alta',
        medidas_prevencao: 'Linha de vida, isolamento da area e conferencia de ancoragem',
        responsavel: 'Líder de manutenção',
        prazo: new Date(Date.now() + 86400000).toISOString(),
        status_acao: 'Em andamento',
        ordem: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: '2',
        apr_id: 'apr-homolog-001',
        atividade: 'Intervencao em painel',
        agente_ambiental: 'Choque eletrico',
        condicao_perigosa: 'Circuito energizado',
        fonte_circunstancia: 'Painel de comando',
        lesao: 'Queimaduras e parada cardiorrespiratória',
        probabilidade: 2,
        severidade: 5,
        score_risco: 10,
        categoria_risco: 'Alto',
        prioridade: 'Alta',
        medidas_prevencao: 'Bloqueio, etiquetagem e ausencia de tensao',
        responsavel: 'Técnico eletricista',
        prazo: new Date(Date.now() + 2 * 86400000).toISOString(),
        status_acao: 'Pendente validação',
        ordem: 2,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ],
  };

  const pt = {
    id: 'pt-homolog-001',
    numero: 'PT-2026-014',
    titulo: 'Liberacao de trabalho em altura',
    descricao:
      'Permissao para troca de luminarias em area industrial com necessidade de acesso em altura e desligamento local.',
    data_hora_inicio: new Date().toISOString(),
    data_hora_fim: new Date(Date.now() + 6 * 3600000).toISOString(),
    status: 'Aprovada',
    company_id: 'EMP-001',
    site_id: 'SITE-001',
    site: { nome: 'Obra Industrial Norte' },
    responsavel_id: 'USR-002',
    responsavel: { nome: 'Mariana Engenheira' },
    executantes: [{ nome: 'Carlos Silva' }, { nome: 'Aline Souza' }],
    trabalho_altura: true,
    espaco_confinado: false,
    trabalho_quente: false,
    eletricidade: true,
    escavacao: false,
    trabalho_altura_checklist: [
      { id: '1', pergunta: 'Linha de vida inspecionada', resposta: 'Sim', justificativa: 'Conferida antes da tarefa' },
      { id: '2', pergunta: 'Cinto em bom estado', resposta: 'Sim', justificativa: 'Sem avarias visiveis' },
    ],
    trabalho_eletrico_checklist: [
      { id: '1', pergunta: 'Ausencia de tensao confirmada', resposta: 'Sim', justificativa: 'Instrumento aferido' },
    ],
  };

  const checklist = {
    id: 'chk-homolog-001',
    titulo: 'Checklist de trabalho em altura',
    descricao: 'Verificacao pre-operacional para tarefa critica.',
    equipamento: 'Plataforma articulada',
    foto_equipamento: tinyImage,
    data: new Date().toISOString(),
    status: 'Nao Conforme',
    company_id: 'EMP-001',
    company: { razao_social: 'Gandra Tecnologia' },
    site_id: 'SITE-001',
    site: { nome: 'Obra Industrial Norte' },
    inspetor_id: 'USR-003',
    inspetor: { nome: 'Fabio TST' },
    itens: [
      { item: 'Ancoragem definida', status: 'ok', tipo_resposta: 'sim_nao_na', observacao: 'Conforme' },
      { item: 'Isolamento de area', status: 'nok', tipo_resposta: 'sim_nao_na', observacao: 'Barreiras incompletas' },
      { item: 'Kit de resgate', status: 'na', tipo_resposta: 'sim_nao_na', observacao: 'Nao aplicavel' },
    ],
  };

  const inspection = {
    id: 'ins-homolog-001',
    company_id: 'EMP-001',
    company: { razao_social: 'Gandra Tecnologia' },
    site_id: 'SITE-001',
    site: { nome: 'Obra Industrial Norte' },
    setor_area: 'Galpao de manutencao',
    tipo_inspecao: 'Relatorio fotografico',
    data_inspecao: new Date().toISOString(),
    horario: '08:30',
    responsavel_id: 'USR-004',
    responsavel: { nome: 'Fabio TST' },
    objetivo: 'Registrar condicoes de trabalho em altura e adequacao de protecoes coletivas.',
    descricao_local_atividades:
      'Inspecao realizada em frente de troca de luminarias e manutencao de infraestrutura industrial.',
    perigos_riscos: [
      {
        grupo_risco: 'Acidente',
        perigo_fator_risco: 'Queda de altura',
        fonte_circunstancia: 'Plataforma elevatoria',
        trabalhadores_expostos: 'Equipe de manutencao',
        tipo_exposicao: 'Direta',
        medidas_existentes: 'Cinto e linha de vida',
        severidade: '4',
        probabilidade: '3',
        nivel_risco: '12',
        classificacao_risco: 'Alto',
        acoes_necessarias: 'Reforcar isolamento e validar ancoragem',
        prazo: 'Imediato',
        responsavel: 'Fabio TST',
      },
    ],
    plano_acao: [
      {
        acao: 'Completar isolamento lateral da frente de servico',
        responsavel: 'Lider de manutencao',
        prazo: 'Hoje',
        status: 'Pendente',
      },
    ],
    evidencias: [
      { descricao: 'Plataforma posicionada para manutencao.', url: tinyImage, original_name: 'evidencia-01.png' },
      { descricao: 'Barreira lateral incompleta junto ao corredor.', url: tinyImage, original_name: 'evidencia-02.png' },
    ],
    conclusao:
      'A frente apresenta condicoes de execucao com necessidade de ajuste imediato no isolamento e reforco da governanca de acesso.',
  };

  const nc = {
    id: 'nc-homolog-001',
    codigo_nc: 'NC-2026-009',
    tipo: 'Seguranca operacional',
    data_identificacao: new Date().toISOString(),
    local_setor_area: 'Galpao de manutencao',
    atividade_envolvida: 'Troca de luminarias',
    responsavel_area: 'Mariana Engenheira',
    auditor_responsavel: 'Fabio TST',
    classificacao: ['Critica'],
    descricao: 'Isolamento lateral insuficiente em frente de trabalho em altura.',
    evidencia_observada: 'Fluxo de pessoas ao lado da plataforma sem segregacao completa.',
    condicao_insegura: 'Barreira incompleta',
    requisito_nr: 'NR-35',
    requisito_item: 'Analise preliminar e protecao coletiva',
    risco_perigo: 'Queda de materiais',
    risco_associado: 'Atingimento de terceiros',
    risco_nivel: 'Critico',
    acao_imediata_descricao: 'Interditar frente ate completar isolamento',
    acao_imediata_data: new Date().toISOString(),
    acao_imediata_responsavel: 'Lider de manutencao',
    acao_imediata_status: 'Pendente',
    acao_definitiva_descricao: 'Padronizar kit de isolamento para trabalhos em altura',
    acao_definitiva_prazo: new Date(Date.now() + 7 * 86400000).toISOString(),
    acao_definitiva_responsavel: 'Mariana Engenheira',
    verificacao_resultado: 'Aguardando tratativa e validacao de campo.',
    status: 'ABERTA',
    observacoes_gerais: 'Ocorrencia aberta a partir de inspecao de campo.',
    assinatura_responsavel_area: null,
    assinatura_tecnico_auditor: null,
    assinatura_gestao: null,
    company_id: 'EMP-001',
    site_id: 'SITE-001',
    site: { nome: 'Obra Industrial Norte' },
  };

  const audit = {
    id: 'aud-homolog-001',
    titulo: 'Auditoria interna de SST',
    data_auditoria: new Date().toISOString(),
    tipo_auditoria: 'Interna',
    company_id: 'EMP-001',
    site_id: 'SITE-001',
    site: { nome: 'Obra Industrial Norte' },
    auditor_id: 'USR-005',
    auditor: { nome: 'Imperador Gandra' },
    representantes_empresa: 'Mariana Engenheira; Fabio TST',
    objetivo: 'Verificar conformidade documental e operacional das atividades criticas.',
    escopo: 'APR, PT, checklists e praticas de campo em frente ativa.',
    metodologia: 'Auditoria documental, observacao de campo e entrevistas.',
    resultados_nao_conformidades: [
      {
        descricao: 'Barreiras de isolamento incompletas',
        requisito: 'NR-35 / procedimento interno',
        evidencia: 'Frente em altura com circulacao adjacente',
        classificacao: 'Grave',
      },
    ],
    plano_acao: [
      {
        item: 'NC-2026-009',
        acao: 'Completar isolamento e padronizar kit de segregacao',
        responsavel: 'Mariana Engenheira',
        prazo: '7 dias',
        status: 'Em andamento',
      },
    ],
    conclusao: 'A operacao demonstra maturidade parcial, com necessidade de reforco em controles coletivos e disciplina operacional.',
  };

  const dds = {
    id: 'dds-homolog-001',
    tema: 'Trabalho em altura com plataforma elevatoria',
    conteudo:
      'Reforco sobre uso correto de cinto, segregacao de area, inspecao da plataforma e proibicao de improvisos durante a atividade.',
    data: new Date().toISOString(),
    status: 'publicado',
    company_id: 'EMP-001',
    site_id: 'SITE-001',
    facilitador_id: 'USR-006',
    facilitador: { nome: 'Fabio TST' },
    participants: [{ nome: 'Carlos Silva' }, { nome: 'Aline Souza' }, { nome: 'Pedro Lima' }],
    company: { razao_social: 'Gandra Tecnologia' },
    site: { nome: 'Obra Industrial Norte' },
    is_modelo: false,
    notas_auditoria: 'Conteudo aderente ao risco da frente e participantes corretamente registrados.',
  };

  const training = {
    id: 'trn-homolog-001',
    nome: 'NR-35 Trabalho em Altura',
    nr_codigo: 'NR-35',
    carga_horaria: 8,
    obrigatorio_para_funcao: true,
    bloqueia_operacao_quando_vencido: true,
    data_conclusao: new Date(Date.now() - 10 * 86400000).toISOString(),
    data_vencimento: new Date(Date.now() + 20 * 86400000).toISOString(),
    certificado_url: 'https://gst-sst.app/certificados/nr35-homologacao',
    user_id: 'USR-007',
    user: { nome: 'Carlos Silva' },
    company_id: 'EMP-001',
    notas_auditoria: 'Treinamento dentro da validade e aderente a funcao executada.',
  };

  const report = {
    id: 'rep-homolog-001',
    titulo: 'Fechamento mensal de conformidade',
    mes: 3,
    ano: 2026,
    estatisticas: {
      aprs_count: 14,
      pts_count: 9,
      dds_count: 18,
      checklists_count: 27,
      trainings_count: 11,
    },
    analise_gandra:
      'O periodo apresenta boa disciplina documental, com principal desvio concentrado em isolamento de area em atividades de altura. Recomenda-se reforco imediato de segregacao, auditoria de kits de bloqueio e nova verificacao de campo em 7 dias.',
    created_at: new Date().toISOString(),
  };

  currentDocument = '01-apr-homologacao.pdf';
  await renderDocument('01-apr-homologacao.pdf', 'critical', 'APR', apr.numero, 'landscape', async (ctx, code) => {
    await drawAprBlueprint(ctx, autoTable, apr as any, signatures as any, code, buildValidationUrl(code));
  });

  currentDocument = '02-pt-homologacao.pdf';
  await renderDocument('02-pt-homologacao.pdf', 'critical', 'PT', pt.numero, 'portrait', async (ctx, code) => {
    await drawPtBlueprint(ctx, autoTable, pt as any, signatures as any, code, buildValidationUrl(code));
  });

  currentDocument = '03-checklist-homologacao.pdf';
  await renderDocument('03-checklist-homologacao.pdf', 'operational', 'CHK', checklist.titulo, 'portrait', async (ctx, code) => {
    await drawChecklistBlueprint(ctx, autoTable, checklist as any, signatures as any, code, buildValidationUrl(code));
  });

  currentDocument = '04-relatorio-fotografico-homologacao.pdf';
  await renderDocument(
    '04-relatorio-fotografico-homologacao.pdf',
    'photographic',
    'INS',
    inspection.id,
    'portrait',
    async (ctx, code) => {
      await drawPhotographicReportBlueprint(
        ctx,
        autoTable,
        inspection as any,
        code,
        buildValidationUrl(code),
        async (item) => item.source || null,
      );
    },
  );

  currentDocument = '05-nc-homologacao.pdf';
  await renderDocument('05-nc-homologacao.pdf', 'compliance', 'NC', nc.codigo_nc, 'portrait', async (ctx, code) => {
    await drawNcBlueprint(ctx, autoTable, nc as any, code, buildValidationUrl(code));
  });

  currentDocument = '06-auditoria-homologacao.pdf';
  await renderDocument('06-auditoria-homologacao.pdf', 'compliance', 'AUD', audit.titulo, 'portrait', async (ctx, code) => {
    await drawAuditBlueprint(ctx, autoTable, audit as any, code, buildValidationUrl(code));
  });

  currentDocument = '07-dds-homologacao.pdf';
  await renderDocument('07-dds-homologacao.pdf', 'operational', 'DDS', dds.tema, 'portrait', async (ctx, code) => {
    await drawDdsBlueprint(ctx, autoTable, dds as any, signatures as any, code, buildValidationUrl(code));
  });

  currentDocument = '08-treinamento-homologacao.pdf';
  await renderDocument('08-treinamento-homologacao.pdf', 'training', 'TRN', training.nome, 'portrait', async (ctx, code) => {
    await drawTrainingBlueprint(ctx, autoTable, training as any, signatures as any, code, buildValidationUrl(code));
  });

  currentDocument = '09-relatorio-mensal-homologacao.pdf';
  const monthlyResult = generateMonthlyReportPdf(report, {
    save: false,
    output: 'base64',
    draftWatermark: false,
  }) as {
    filename: string;
    base64: string;
  };
  fs.writeFileSync(
    path.join(outputDir, '09-relatorio-mensal-homologacao.pdf'),
    Buffer.from(monthlyResult.base64, 'base64'),
  );

  fs.writeFileSync(
    path.join(outputDir, 'README.md'),
    [
      '# Rodada de Homologacao de PDFs',
      '',
      `Gerado em: ${new Date().toLocaleString('pt-BR')}`,
      '',
      'Arquivos:',
      '- 01-apr-homologacao.pdf',
      '- 02-pt-homologacao.pdf',
      '- 03-checklist-homologacao.pdf',
      '- 04-relatorio-fotografico-homologacao.pdf',
      '- 05-nc-homologacao.pdf',
      '- 06-auditoria-homologacao.pdf',
      '- 07-dds-homologacao.pdf',
      '- 08-treinamento-homologacao.pdf',
      '- 09-relatorio-mensal-homologacao.pdf',
      '',
      'Objetivo: revisao visual documento por documento apos consolidacao do PDF Master System.',
      '',
      'Warnings de largura do autoTable:',
      ...(autoTableWarnings.length
        ? autoTableWarnings.map((warning) => `- ${warning.document}: ${warning.message}`)
        : ['- Nenhum warning capturado.']),
      '',
    ].join('\n'),
    'utf-8',
  );

  console.warn = originalWarn;
  process.stdout.write = originalStdoutWrite as typeof process.stdout.write;
  process.stderr.write = originalStderrWrite as typeof process.stderr.write;
  console.log(`PDFs de homologacao gerados em: ${outputDir}`);
}

main().catch((error) => {
  console.error('Falha ao gerar PDFs de homologacao:', error);
  process.exitCode = 1;
});
