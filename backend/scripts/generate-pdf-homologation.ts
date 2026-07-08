import * as fs from 'fs';
import * as path from 'path';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  applyFooterGovernance,
  applyInstitutionalDocumentHeader,
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
  drawRdoBlueprint,
  drawTrainingBlueprint,
  formatDateTime,
} from '../../frontend/src/lib/pdf-system';
import { generateMonthlyReportPdf } from '../../frontend/src/lib/pdf/monthlyReportGenerator';
import type { Rdo } from '../../frontend/src/services/rdosService';

// Homologation is a standalone Node process, so it has no browser origin.
process.env.NEXT_PUBLIC_APP_URL ??= 'https://app.sgsseguranca.com.br';

const tinyImage =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9sotXnQAAAAASUVORK5CYII=';

const rdoEvidenceImage =
  'data:image/jpeg;base64,' +
  [
    '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBAUEBAYFBQUGBgYHCQ4JCQgICRINDQoOFRIWFhUSFBQXGiEcFxgfGRQUHScdHyIjJSUlFhwpLCgkKyEkJST/',
    '2wBDAQYGBgkICREJCREkGBQYJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCT/wAARCAAeADIDASIAAhEBAxEB/8QA',
    'HwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkK',
    'FhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXG',
    'x8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAEC',
    'AxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOE',
    'hYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwCWysvCej+C',
    'PD+p6n4Y/tW71L7T5kn26WHHly7RwuR0I7Dp71B/bHgX/on/AP5WJ/8ACjWP+SbeCv8At/8A/R4rPg8J6xNDHPJapZwyqHhkvp47VZlIzmMysocYI5XOMjPU',
    'V9XRpU5Q5pvq+rXV+Z8lVqVFPlgui6J9F5Gh/bHgX/on/wD5WJ/8KP7Y8C/9E/8A/KxP/hVL7F4fsObrVJ9UcciLTozFGw6YMsqhlYcnAiYEYGeTtP8AhJfs',
    'fy6Pptlp2OBPs864OPut5kmdjjruiEfJzgYXGn1em/hT+9r9b/gR7ea+Jr7k/wBLfidDZWHh6/tkvIvhfOtk+cXk2rzRW/BxzK+EHIxyevHXitfw/ofw21nV',
    '4NIk0CAXtxuCrZ6hcTpEyqWYO52L2wDGZAcHkDBPmd7fXWpXL3V7cz3VxJjfLM5d2wMDJPJ4AH4V1Hwn/wCSgaV/22/9EvWdbCqNOUrtWT6v9WaUcS5VIxsn',
    'drov0R5tRRRUCPevDOoWmhfBKw1y4sPtctl5nlGOYwTJvuih2SqNyZzzt6gYPBrhZ/HnhG6mknn8BvLNKxd5H1qZmdickkkZJJ707RfilY2PgiHwlqXhr+0r',
    'RN3mN9uaHzMymQfdTIwSO/b8Kpf8JX4F/wCid/8AlZn/AMK8qpSxSm3Sdl6nXUnGSik1oluuv3M6LwbqXgzxb4ks9F/4Qj7J9p3/AL7+1Jn27UZvu4Gfu469',
    '60fE8Pgzw5rlzpf/AAh/2jyNn7z+0pk3bkDdOcdcda5nRviJ4U8P6lDqWm+Avs93Du8uT+15W25UqeGUjoT2qzqnxV8O6zfS3194G865lxvf+1ZFzgADgIB0',
    'ArlxVLNJU0qFS0r9X0/E78tqYCnJ/XYqS8l6enmWP7W8Gf8AQj/+VWb/AArtfhlaeGdW1C41DT/Dv9m3Wn7dkn22SbPmB1PBwOgPr1rzj/hYPhL/AKEH/wAq',
    '8v8A8TWpofxo0jw5539l+DPs/n7fM/4mbvu25x95Djqa5cPh86VRfWKt4dVfy9EehiMTkzpv2FO0ujt5+rPKqKKK+pPlT//Z',
  ].join('');

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
  const safeFilename = path.basename(filename);
  if (safeFilename !== filename || !safeFilename.endsWith('.pdf')) {
    throw new Error(`Nome de PDF inválido: ${filename}`);
  }
  const buffer = Buffer.from(doc.output('arraybuffer'));
  fs.writeFileSync(`${outputDir}${path.sep}${safeFilename}`, buffer);
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
    status: 'Encerrada',
    company_id: 'EMP-001',
    site_id: 'SITE-001',
    site: { nome: 'Obra Industrial Norte' },
    responsavel_id: 'USR-002',
    responsavel: { nome: 'Mariana Engenheira' },
    executantes: [{ nome: 'Carlos Silva' }, { nome: 'Aline Souza' }],
    trabalho_altura: true,
    espaco_confinado: true,
    trabalho_quente: false,
    eletricidade: true,
    escavacao: false,
    contato_emergencia: 'Brigada interna — (11) 99999-0000 / ramal 220',
    ponto_encontro: 'Portaria principal — area de concentracao',
    plano_resgate:
      'Equipe de resgate propria treinada em NR-33, com tripé, guincho e conjunto autonomo de ar posicionados na entrada. Tempo de resposta estimado: 3 minutos.',
    vigia_nome: 'Pedro Lima',
    epis_obrigatorios: [
      'Cinto paraquedista',
      'Capacete com jugular',
      'Detector multigas portatil',
      'Luva isolante classe 0',
    ],
    medicoes_atmosfericas: [
      { id: 'm1', hora: '07:45', oxigenio: 20.9, inflamaveis_lel: 0, co: 2, h2s: 0, instrumento: 'Detector MX6-2210', responsavel: 'Fabio TST' },
      { id: 'm2', hora: '09:30', oxigenio: 20.8, inflamaveis_lel: 0, co: 1, h2s: 0, instrumento: 'Detector MX6-2210', responsavel: 'Fabio TST' },
      { id: 'm3', hora: '11:15', oxigenio: 20.9, inflamaveis_lel: 1, co: 2, h2s: 0, instrumento: 'Detector MX6-2210', responsavel: 'Pedro Lima' },
    ],
    fotos_evidencia: [
      {
        ref: 'gst:pt-photo:homolog-antes',
        legenda: 'Area isolada e sinalizada antes do inicio',
        fase: 'antes',
        uploaded_at: new Date(Date.now() - 5 * 3600000).toISOString(),
      },
      {
        ref: 'gst:pt-photo:homolog-depois',
        legenda: 'Area limpa e desmobilizada apos a atividade',
        fase: 'depois',
        uploaded_at: new Date().toISOString(),
      },
    ],
    encerrado_por: { nome: 'Mariana Engenheira' },
    data_hora_real_fim: new Date(Date.now() + 5 * 3600000).toISOString(),
    condicao_area_encerramento: 'Limpa e liberada',
    observacoes_encerramento:
      'Bloqueios removidos, sistema reenergizado e area devolvida a operacao sem pendencias.',
    trabalho_espaco_confinado_checklist: [
      { id: 'entrada', section: 'Entrada', pergunta: 'A entrada e permitida?', resposta: 'Sim' },
      { id: 'entrada_sinalizada_controlada', section: 'Entrada', pergunta: 'A entrada do espaco confinado esta identificada, isolada e com sinalizacao visivel sobre a condicao de acesso?', resposta: 'Sim' },
      { id: 'meios_acesso', section: 'Entrada', pergunta: 'Foram fornecidos meios de acesso (por exemplo, escadas)?', resposta: 'Sim' },
      { id: 'pt_quente_emitida', section: 'Entrada', pergunta: 'Se trabalhos a quente foram realizados no espaco confinado, foi emitida Permissao para Trabalhos a Quente?', resposta: 'Nao aplicavel' },
      { id: 'instrumentos_calibrados', section: 'Teste de atmosfera', pergunta: 'Os instrumentos usados nos testes atmosfericos estao corretamente calibrados?', resposta: 'Sim' },
      { id: 'atmosfera_testada_antes', section: 'Teste de atmosfera', pergunta: 'A atmosfera no espaco confinado foi testada antes da entrada?', resposta: 'Sim' },
      { id: 'testador_autorizado', section: 'Teste de atmosfera', pergunta: 'Os testes de gas sao realizados por testador de gas autorizado?', resposta: 'Sim' },
      { id: 'oxigenio_faixa', section: 'Teste de atmosfera', pergunta: 'O oxigenio estava pelo menos a 19,5% e nao ultrapassou 23,5%?', resposta: 'Sim', justificativa: 'Medido com detector calibrado' },
      { id: 'gases_limites', section: 'Teste de atmosfera', pergunta: 'Os gases toxicos, inflamaveis ou asfixiantes estavam dentro dos limites exigidos?', resposta: 'Sim' },
      { id: 'monitoramento_durante', section: 'Monitoramento', pergunta: 'A atmosfera no espaco sera monitorada enquanto o trabalho estiver em andamento?', resposta: 'Sim' },
      { id: 'monitoramento_continuo', section: 'Monitoramento', pergunta: 'Monitoramento continuo?', resposta: 'Sim' },
      { id: 'monitoramento_periodico', section: 'Monitoramento', pergunta: 'Monitoramento periodico?', resposta: 'Nao aplicavel' },
      { id: 'espaco_limpo', section: 'Limpeza / Ventilacao', pergunta: 'O espaco foi limpo antes da entrada?', resposta: 'Sim' },
      { id: 'espaco_vaporizado', section: 'Limpeza / Ventilacao', pergunta: 'O espaco foi vaporizado? Se sim, foi permitido esfriar?', resposta: 'Nao aplicavel' },
      { id: 'espaco_ventilado', section: 'Limpeza / Ventilacao', pergunta: 'O espaco foi ventilado antes da entrada?', resposta: 'Sim' },
      { id: 'ventilacao_continua', section: 'Limpeza / Ventilacao', pergunta: 'A ventilacao sera continua durante a ocupacao do espaco confinado?', resposta: 'Sim' },
      { id: 'entrada_ar_segura', section: 'Limpeza / Ventilacao', pergunta: 'A entrada de ar para ventilacao esta em area livre de substancias perigosas?', resposta: 'Sim' },
      { id: 'reteste_antes_entrada', section: 'Limpeza / Ventilacao', pergunta: 'Se a atmosfera era inaceitavel e ventilada, foi feito RETESTE antes da entrada?', resposta: 'Nao aplicavel' },
      { id: 'isolamento_sistemas', section: 'Isolamento', pergunta: 'O espaco esta isolado de outros sistemas e/ou fontes de energia?', resposta: 'Sim' },
      { id: 'bloqueio_eletrico', section: 'Isolamento', pergunta: 'Os equipamentos eletricos estao bloqueados?', resposta: 'Sim' },
      { id: 'desconexoes_quando_possivel', section: 'Isolamento', pergunta: 'Sao usadas desconexoes quando possivel?', resposta: 'Sim' },
      { id: 'bloqueio_mecanico', section: 'Isolamento', pergunta: 'Equipamentos mecanicos estao bloqueados/obstruidos/desconectados quando necessario?', resposta: 'Sim' },
      { id: 'linhas_tampadas_drenadas', section: 'Isolamento', pergunta: 'As linhas sob pressao sao tampadas e drenadas?', resposta: 'Sim' },
      { id: 'epi_especial', section: 'Equipamento / Protecao respiratoria', pergunta: 'Sao permitidas roupas/EPIs especiais (botas, uniformes quimicos, oculos etc.)?', resposta: 'Sim' },
      { id: 'ferramentas_especiais', section: 'Equipamento / Protecao respiratoria', pergunta: 'Sao necessarias ferramentas especiais (a prova de faisca, baixa tensao)?', resposta: 'Nao' },
      { id: 'protecao_respiratoria_disponivel', section: 'Equipamento / Protecao respiratoria', pergunta: 'A protecao respiratoria necessaria esta disponivel conforme avaliacao de riscos?', resposta: 'Nao aplicavel' },
      { id: 'protecao_respiratoria_adequada', section: 'Equipamento / Protecao respiratoria', pergunta: 'A protecao respiratoria disponivel e adequada?', resposta: 'Sim' },
      { id: 'treinamento_entrada', section: 'Capacitacao', pergunta: 'Colaboradores designados para entrar no espaco confinado foram treinados adequadamente?', resposta: 'Sim' },
      { id: 'treinamento_respiratoria', section: 'Capacitacao', pergunta: 'Colaboradores foram treinados no uso da protecao respiratoria necessaria?', resposta: 'Sim' },
      { id: 'primeiros_socorros_rcp', section: 'Capacitacao', pergunta: 'A quantidade de pessoas treinadas em primeiros socorros/RCP e adequada?', resposta: 'Sim' },
      { id: 'pessoal_reserva_suficiente', section: 'Stand-by / Resgate', pergunta: 'Ha vigia/stand-by designado em numero suficiente e sem atividade concorrente durante a entrada?', resposta: 'Sim' },
      { id: 'reserva_treinada', section: 'Stand-by / Resgate', pergunta: 'Os colaboradores de reserva foram treinados adequadamente?', resposta: 'Sim' },
      { id: 'registro_entrada_saida', section: 'Stand-by / Resgate', pergunta: 'A folha de registro de entrada/saida esta disponivel e atualizada?', resposta: 'Sim' },
      { id: 'comunicacao_constante', section: 'Stand-by / Resgate', pergunta: 'Colaboradores de reserva manterao comunicacao visual/auditiva constante com quem esta dentro?', resposta: 'Sim' },
      { id: 'procedimentos_resgate_disponiveis', section: 'Stand-by / Resgate', pergunta: 'Procedimentos de resgate estao disponiveis e podem ser seguidos em emergencia?', resposta: 'Sim' },
      { id: 'equipamento_resgate_proximo', section: 'Stand-by / Resgate', pergunta: 'Equipamento/veiculo de resgate esta disponivel nas proximidades e acessivel?', resposta: 'Sim' },
      { id: 'responsaveis_resgate_treinados', section: 'Stand-by / Resgate', pergunta: 'Responsaveis pelo resgate sao treinados adequadamente?', resposta: 'Sim' },
      { id: 'resgate_informado', section: 'Stand-by / Resgate', pergunta: 'Responsaveis pelo resgate foram informados sobre a atividade antes do inicio?', resposta: 'Sim' },
      { id: 'meios_comunicacao_apoio_externo', section: 'Stand-by / Resgate', pergunta: 'Estao disponiveis meios de comunicacao e numeros de apoio externo para emergencia?', resposta: 'Sim' },
    ],
    trabalho_altura_checklist: [
      { id: 'parte_solo', pergunta: 'Parte do trabalho pode ser realizada ao nivel do solo?', resposta: 'Nao' },
      { id: 'colaboradores_aptos', pergunta: 'Todos os envolvidos sao aptos, autorizados e treinados para trabalho em altura?', resposta: 'Sim' },
      { id: 'checklist_telhado', pergunta: 'Para atividade em telhados e coberturas, foi executado o CHECKLIST (HSE-FORM-006)?', resposta: 'Nao aplicavel' },
      { id: 'checklist_escadas', pergunta: 'Foi preenchido checklist de seguranca para uso de escadas fixas/portateis ou plataforma elevatoria conforme HSE-PRO-007?', resposta: 'Sim' },
      { id: 'protecao_area', pergunta: 'As protecoes coletivas da area (guarda-corpo, rodape e protecao inferior, quando aplicavel) estao instaladas, integras e eficazes?', resposta: 'Sim' },
      { id: 'distancia_borda', pergunta: 'As pessoas na atividade serao mantidas a mais de 2m de borda nao protegida?', resposta: 'Sim' },
      { id: 'linha_vida', pergunta: 'A linha de vida ou sistema equivalente esta instalado, identificado e com laudo/inspecao vigente disponivel?', resposta: 'Sim', justificativa: 'Conferida antes da tarefa' },
      { id: 'rotas_sinalizadas', pergunta: 'As passarelas e rotas de saida/emergencia estao devidamente sinalizadas?', resposta: 'Sim' },
      { id: 'retirada_risco', pergunta: 'As pessoas podem ser retiradas da area de risco de queda?', resposta: 'Sim' },
      { id: 'isolamento_sinalizacao', pergunta: 'E obrigatorio o uso de area de isolamento/barreiras e sinalizacao?', resposta: 'Sim' },
      { id: 'controle_acesso', pergunta: 'Todos os riscos de queda e areas restritas foram identificados e controlados para evitar circulacao nao autorizada?', resposta: 'Sim' },
      { id: 'equipamentos_secundarios', pergunta: 'Os elementos do sistema de protecao contra quedas (cinto, talabarte, trava-quedas, mosquetoes etc.) sao adequados a tarefa?', resposta: 'Sim', justificativa: 'Sem avarias visiveis' },
      { id: 'risco_queda_objetos', pergunta: 'Existe risco de queda de materiais/objetos de altura?', resposta: 'Sim' },
      { id: 'proximidade_energia', pergunta: 'Atividade em altura esta proxima a linhas/equipamentos energizados e foi realizado desligamento conforme NR-10 por profissionais autorizados?', resposta: 'Sim' },
      { id: 'ferramentas_presilhas', pergunta: 'As ferramentas estao presas com cordas/bolsa de seguranca para evitar queda?', resposta: 'Sim' },
      { id: 'restricao_prevencao_parada', pergunta: 'As diferencas entre restricao/prevencao de queda e parada de queda foram identificadas e os equipamentos adequados selecionados?', resposta: 'Sim' },
      { id: 'requisitos_equipamentos', pergunta: 'Os equipamentos para trabalho em altura foram inspecionados antes do uso, estao sem avarias e com certificacao aplicavel?', resposta: 'Sim' },
      { id: 'cabos_retrateis', pergunta: 'Se necessarios cabos retrateis, os pontos de fixacao estao corretamente localizados e seguros?', resposta: 'Nao aplicavel' },
      { id: 'ancoragem', pergunta: 'Os pontos de ancoragem sao adequados, funcionais, em bom estado e com laudos vigentes?', resposta: 'Sim' },
      { id: 'plano_resgate', pergunta: 'Existe plano de resgate compativel com a atividade, equipe e tempo de resposta?', resposta: 'Sim' },
      { id: 'condicoes_climaticas', pergunta: 'Nao ha condicoes impeditivas para a atividade em altura (chuva, ventos fortes, baixa visibilidade, superficies escorregadias, descargas atmosfericas etc.)?', resposta: 'Sim' },
    ],
    trabalho_eletrico_checklist: [
      { id: '1', pergunta: 'Ausencia de tensao confirmada', resposta: 'Sim', justificativa: 'Instrumento aferido' },
    ],
    recomendacoes_gerais_checklist: [
      { id: '1', pergunta: 'Estou ciente de que devo interromper a atividade diante de risco grave e iminente.', resposta: 'Ciente' },
      { id: '2', pergunta: 'Mudanca de escopo exige reavaliacao e nova PT antes do reinicio.', resposta: 'Ciente' },
    ],
    analise_risco_rapida_checklist: [
      { id: '1', pergunta: 'Estou ciente dos perigos e riscos desta tarefa?', secao: 'basica', resposta: 'Sim' },
      { id: '2', pergunta: 'Tenho as competencias e treinamento necessarios?', secao: 'basica', resposta: 'Sim' },
      { id: '3', pergunta: 'Este trabalho requer permissao especifica adicional?', secao: 'adicional', resposta: 'Nao' },
    ],
    analise_risco_rapida_observacoes: 'Nenhuma condicao incomum identificada no momento da liberacao.',
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
    client_id: 'CLIENT-001',
    project_id: 'SITE-001',
    client_name: 'Gandra Tecnologia',
    project_name: 'Obra Industrial Norte',
    unit_name: 'Galpao de manutencao',
    location: 'Frente de troca de luminarias',
    activity_type: 'Manutencao de infraestrutura industrial',
    report_tone: 'Preventivo',
    area_status: 'Area controlada',
    shift: 'Diurno',
    start_date: new Date().toISOString(),
    end_date: null,
    start_time: '08:30',
    end_time: '11:30',
    responsible_name: 'Fabio TST',
    contractor_company: 'Gandra Tecnologia',
    general_observations:
      'Registrar condicoes de trabalho em altura e adequacao de protecoes coletivas.',
    ai_summary:
      'A frente apresenta condicoes de execucao com necessidade de ajuste imediato no isolamento.',
    final_conclusion:
      'Completar o isolamento e validar a ancoragem antes da continuidade do servico.',
    status: 'Analisado',
    created_by: 'USR-004',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    day_count: 1,
    image_count: 2,
    export_count: 0,
    last_exported_at: null,
    days: [
      {
        id: 'ins-day-001',
        report_id: 'ins-homolog-001',
        activity_date: new Date().toISOString(),
        day_summary: 'Registro da frente de trabalho antes da liberacao operacional.',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        image_count: 2,
      },
    ],
    images: [
      {
        id: 'ins-image-001',
        report_id: 'ins-homolog-001',
        report_day_id: 'ins-day-001',
        image_url: tinyImage,
        download_url: tinyImage,
        image_order: 1,
        manual_caption: 'Plataforma posicionada para manutencao.',
        ai_title: 'Frente de trabalho preparada',
        ai_description: 'Plataforma posicionada para manutencao.',
        ai_positive_points: ['Equipamento posicionado na area prevista.'],
        ai_technical_assessment: 'Validar isolamento antes do inicio da atividade.',
        ai_condition_classification: 'Atencao',
        ai_recommendations: ['Completar o isolamento lateral.'],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'ins-image-002',
        report_id: 'ins-homolog-001',
        report_day_id: 'ins-day-001',
        image_url: tinyImage,
        download_url: tinyImage,
        image_order: 2,
        manual_caption: 'Barreira lateral incompleta junto ao corredor.',
        ai_title: 'Isolamento lateral pendente',
        ai_description: 'Barreira lateral incompleta junto ao corredor.',
        ai_positive_points: null,
        ai_technical_assessment: 'A segregacao deve ser concluida antes da liberacao.',
        ai_condition_classification: 'Nao conforme',
        ai_recommendations: ['Instalar barreira continua no corredor.'],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ],
    exports: [],
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

  const rdo = {
    id: 'rdo-homolog-001',
    numero: 'RDO-202603-001',
    data: '2026-03-19',
    status: 'aprovado',
    version: 1,
    company_id: 'EMP-001',
    company: { id: 'EMP-001', razao_social: 'Gandra Tecnologia' },
    site_id: 'SITE-001',
    site: { id: 'SITE-001', nome: 'Obra Industrial Norte', cidade: 'Araguaina', estado: 'TO' },
    responsavel_id: 'USR-008',
    responsavel: { id: 'USR-008', nome: 'Maria Tecnica' },
    clima_manha: 'ensolarado',
    clima_tarde: 'parcialmente_nublado',
    temperatura_min: 24,
    temperatura_max: 33,
    condicao_terreno: 'Seco, com acesso liberado e frentes sinalizadas',
    mao_de_obra: [
      { funcao: 'Pedreiro', quantidade: 8, turno: 'manha', horas: 8 },
      { funcao: 'Servente', quantidade: 12, turno: 'manha', horas: 8 },
      { funcao: 'Eletricista', quantidade: 3, turno: 'tarde', horas: 6 },
    ],
    equipamentos: [
      {
        nome: 'Retroescavadeira',
        quantidade: 1,
        horas_trabalhadas: 6,
        horas_ociosas: 2,
        observacao: 'Disponivel para escavacao controlada',
      },
      {
        nome: 'Plataforma elevatoria',
        quantidade: 1,
        horas_trabalhadas: 5,
        horas_ociosas: 1,
        observacao: 'Checklist pre-uso aprovado',
      },
    ],
    materiais_recebidos: [
      {
        descricao: 'Concreto usinado FCK 30',
        unidade: 'm3',
        quantidade: 24,
        fornecedor: 'Fornecedor Demo',
      },
      {
        descricao: 'Eletroduto galvanizado',
        unidade: 'm',
        quantidade: 180,
        fornecedor: 'Fornecedor Eletrico',
      },
    ],
    servicos_executados: [
      {
        descricao: 'Concretagem parcial da laje do bloco B',
        percentual_concluido: 82,
        observacao: 'Execucao dentro do plano do dia',
        fotos: [rdoEvidenceImage],
      },
      {
        descricao: 'Infraestrutura eletrica do mezanino',
        percentual_concluido: 45,
        observacao: 'Aguardando liberacao da proxima frente',
        fotos: [rdoEvidenceImage],
      },
    ],
    ocorrencias: [
      {
        tipo: 'visita',
        descricao: 'Visita tecnica do cliente para validacao de avanco fisico.',
        hora: '10:30',
      },
      {
        tipo: 'incidente',
        descricao:
          'Quase incidente por isolamento incompleto; frente pausada e barreira recomposta.',
        hora: '15:10',
      },
    ],
    houve_acidente: false,
    houve_paralisacao: true,
    motivo_paralisacao: 'Recomposicao preventiva de isolamento de area',
    observacoes:
      'Documento sintetico de homologacao visual do RDO. Dados sem PII real.',
    programa_servicos_amanha:
      'Finalizar concretagem do bloco B, liberar infraestrutura eletrica e revisar sinalizacao das frentes.',
    created_at: '2026-03-19T08:00:00.000Z',
    updated_at: '2026-03-19T18:00:00.000Z',
  } satisfies Rdo;

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
    await drawPtBlueprint(ctx, autoTable, pt as any, signatures as any, code, buildValidationUrl(code), {
      resolveEvidencePhotoDataUrl: async () => rdoEvidenceImage,
    });
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
    await drawDdsBlueprint(ctx, autoTable, dds as any, signatures as any, [], code, buildValidationUrl(code));
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

  currentDocument = '10-rdo-homologacao.pdf';
  await renderDocument('10-rdo-homologacao.pdf', 'operational', 'RDO', rdo.numero, 'portrait', async (ctx, code) => {
    ctx.y = applyInstitutionalDocumentHeader(ctx, {
      title: 'RELATORIO DIARIO DE OBRA',
      subtitle:
        'Documento oficial de acompanhamento diario de producao, recursos, ocorrencias e condicoes operacionais de campo.',
      code,
      date: rdo.data,
      status: rdo.status,
      version: String(rdo.version),
      company: rdo.company.razao_social,
      site: `${rdo.site.nome} - ${rdo.site.cidade}/${rdo.site.estado}`,
      logoUrl: null,
    });

    await drawRdoBlueprint(
      ctx,
      autoTable,
      rdo,
      [
        {
          label: 'Responsavel pela obra',
          name: 'Maria Tecnica',
          role: 'Responsavel pela obra - CPF ***.***.***-09',
          date: new Date().toISOString(),
          image: null,
        },
        {
          label: 'Engenheiro responsavel',
          name: 'Joao Engenheiro',
          role: 'Engenheiro responsavel - CPF ***.***.***-11',
          date: new Date().toISOString(),
          image: null,
        },
      ],
      code,
      buildValidationUrl(code),
      undefined,
      false,
    );
  });

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
      '- 10-rdo-homologacao.pdf',
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
