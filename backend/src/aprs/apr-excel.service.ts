import { BadRequestException, Injectable } from '@nestjs/common';
import { readExcelBuffer, aoaToExcelBuffer } from '../common/utils/excel.util';
import { Apr } from './entities/apr.entity';
import { AprRiskItem } from './entities/apr-risk-item.entity';
import { AprExcelImportPreviewDto } from './dto/apr-excel-import-preview.dto';
import { AprRiskItemInputDto } from './dto/apr-risk-item-input.dto';
import {
  AprRiskEvaluation,
  AprRiskMatrixService,
} from './apr-risk-matrix.service';

type WorksheetRow = Array<string | number | Date | null | undefined>;
type WorksheetData = { sheetName: string; rows: WorksheetRow[] };

type MetadataField =
  | 'numero'
  | 'titulo'
  | 'descricao'
  | 'data_inicio'
  | 'data_fim'
  | 'periodo'
  | 'company_name'
  | 'cnpj'
  | 'site_name'
  | 'unidade_setor'
  | 'local_atividade'
  | 'elaborador_name'
  | 'aprovador_name';

type RiskField =
  | 'atividade_processo'
  | 'agente_ambiental'
  | 'condicao_perigosa'
  | 'fonte_circunstancia'
  | 'possiveis_lesoes'
  | 'probabilidade'
  | 'severidade'
  | 'categoria_risco'
  | 'medidas_prevencao'
  | 'responsavel'
  | 'prazo'
  | 'status_acao';

const METADATA_LABELS: Record<MetadataField, string[]> = {
  numero: ['codigo', 'código', 'numero', 'número', 'codigo apr', 'número apr'],
  titulo: ['titulo', 'título', 'atividade', 'titulo apr', 'título apr'],
  descricao: ['descricao', 'descrição', 'escopo', 'descricao atividade'],
  data_inicio: [
    'data emissao',
    'data emissão',
    'data de emissao',
    'data de emissão',
    'data inicio',
    'data início',
  ],
  data_fim: [
    'data revisao',
    'data revisão',
    'data de revisao',
    'data de revisão',
    'data fim',
    'validade',
  ],
  periodo: ['periodo', 'período'],
  company_name: ['empresa', 'razao social', 'razão social'],
  cnpj: ['cnpj'],
  site_name: [
    'obra',
    'site',
    'unidade',
    'obra unidade',
    'obra/unidade',
    'site obra',
  ],
  unidade_setor: ['unidade/setor', 'unidade setor', 'setor'],
  local_atividade: ['local atividade', 'local da atividade', 'local'],
  elaborador_name: [
    'responsavel elaboracao',
    'responsável elaboração',
    'elaborador',
  ],
  aprovador_name: [
    'responsavel aprovacao',
    'responsável aprovação',
    'aprovador',
  ],
};

const RISK_COLUMN_LABELS: Record<RiskField, string[]> = {
  atividade_processo: [
    'atividade/processo',
    'atividade processo',
    'atividade',
    'processo',
  ],
  agente_ambiental: ['agente ambiental', 'agente', 'categoria de risco'],
  condicao_perigosa: [
    'condicao perigosa',
    'condição perigosa',
    'perigo',
    'condicao insegura',
    'condição insegura',
  ],
  fonte_circunstancia: [
    'fonte/circunstancia',
    'fonte/circunstância',
    'fonte circunstancia',
    'fontes circunstâncias',
    'fonte',
    'circunstancia',
    'circunstância',
  ],
  possiveis_lesoes: [
    'possiveis lesoes',
    'possíveis lesões',
    'lesoes',
    'lesões',
    'consequencias',
    'consequências',
    'danos',
  ],
  probabilidade: ['probabilidade', 'p'],
  severidade: ['severidade', 's'],
  categoria_risco: [
    'categoria de risco',
    'categoria risco',
    'categoria',
    'grau de risco',
  ],
  medidas_prevencao: [
    'medidas de controle',
    'medidas de prevencao',
    'medidas de prevenção',
    'controles',
    'medidas preventivas',
    'acoes de controle',
    'ações de controle',
  ],
  responsavel: ['responsavel', 'responsável', 'responsavel pela acao'],
  prazo: ['prazo', 'data prazo'],
  status_acao: ['status', 'status acao', 'status ação', 'situacao'],
};

const REQUIRED_RISK_COLUMNS: RiskField[] = [
  'atividade_processo',
  'condicao_perigosa',
  'probabilidade',
  'severidade',
];

@Injectable()
export class AprExcelService {
  constructor(private readonly aprRiskMatrixService: AprRiskMatrixService) {}

  private stringifyScalar(
    value: string | number | boolean | Date | null | undefined,
  ): string {
    if (value instanceof Date) {
      return value.toISOString();
    }

    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return String(value);
    }

    return '';
  }

  private parseExcelDateCode(
    value: number,
  ): { y: number; m: number; d: number } | null {
    if (!Number.isFinite(value) || value <= 0) {
      return null;
    }

    const excelEpochUtc = Date.UTC(1899, 11, 30);
    const parsedDate = new Date(excelEpochUtc + value * 24 * 60 * 60 * 1000);
    if (Number.isNaN(parsedDate.getTime())) {
      return null;
    }

    return {
      y: parsedDate.getUTCFullYear(),
      m: parsedDate.getUTCMonth() + 1,
      d: parsedDate.getUTCDate(),
    };
  }

  private formatDateForWorkbook(
    value: string | Date | null | undefined,
  ): string {
    if (!value) {
      return '';
    }

    if (typeof value === 'string') {
      const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (isoMatch) {
        const [, year, month, day] = isoMatch;
        return `${day}/${month}/${year}`;
      }
    }

    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return this.stringifyScalar(typeof value === 'string' ? value : null);
    }

    return `${String(parsed.getUTCDate()).padStart(2, '0')}/${String(
      parsed.getUTCMonth() + 1,
    ).padStart(2, '0')}/${parsed.getUTCFullYear()}`;
  }

  private normalizeLabel(value: unknown): string {
    const scalarValue =
      value instanceof Date ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
        ? value
        : null;

    return this.stringifyScalar(scalarValue)
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[_:/()-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  private formatCell(value: unknown): string {
    if (value instanceof Date) {
      return value.toISOString().slice(0, 10);
    }
    if (typeof value === 'number' && Number.isFinite(value) && value > 25569) {
      const parsed = this.parseExcelDateCode(value);
      if (parsed) {
        return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
      }
    }

    return this.stringifyScalar(
      typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
        ? value
        : null,
    ).trim();
  }

  private parseOptionalDate(value: unknown): string | undefined {
    const raw = this.formatCell(value);
    if (!raw) {
      return undefined;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return raw;
    }

    const ptBrMatch = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (ptBrMatch) {
      const [, day, month, year] = ptBrMatch;
      return `${year}-${month}-${day}`;
    }

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      return undefined;
    }

    return parsed.toISOString().slice(0, 10);
  }

  private parseOptionalNumber(value: unknown): number | undefined {
    if (value === null || value === undefined || value === '') {
      return undefined;
    }

    const normalized = this.stringifyScalar(
      typeof value === 'string' || typeof value === 'number' ? value : null,
    )
      .replace(',', '.')
      .trim();
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private getMetadataField(label: string): MetadataField | undefined {
    return (
      Object.entries(METADATA_LABELS) as Array<[MetadataField, string[]]>
    ).find(([, aliases]) => aliases.includes(label))?.[0];
  }

  private getRiskField(label: string): RiskField | undefined {
    return (
      Object.entries(RISK_COLUMN_LABELS) as Array<[RiskField, string[]]>
    ).find(([, aliases]) => aliases.includes(label))?.[0];
  }

  private async getWorkbookSheets(buffer: Buffer): Promise<WorksheetData[]> {
    const rawSheets = await readExcelBuffer(buffer);

    if (rawSheets.length === 0) {
      throw new BadRequestException(
        'A planilha enviada está vazia ou não possui abas válidas.',
      );
    }

    const sheets = rawSheets.filter(
      (sheet) => Array.isArray(sheet.rows) && sheet.rows.length > 0,
    );

    if (sheets.length === 0) {
      throw new BadRequestException(
        'A planilha enviada não possui conteúdo processável.',
      );
    }

    return sheets.map((s) => ({ sheetName: s.sheetName, rows: s.rows }));
  }

  private detectTableHeader(rows: WorksheetRow[]): {
    headerRowIndex: number;
    matchedColumns: Record<string, string>;
  } {
    let bestMatch = {
      headerRowIndex: -1,
      matchedColumns: {} as Record<string, string>,
    };

    rows.forEach((row, index) => {
      const matchedColumns = row.reduce<Record<string, string>>((acc, cell) => {
        const field = this.getRiskField(this.normalizeLabel(cell));
        if (field && !acc[field]) {
          acc[field] = this.formatCell(cell);
        }
        return acc;
      }, {});

      if (
        Object.keys(matchedColumns).length >
        Object.keys(bestMatch.matchedColumns).length
      ) {
        bestMatch = { headerRowIndex: index, matchedColumns };
      }
    });

    return bestMatch;
  }

  private extractMetadataFromRows(
    rows: WorksheetRow[],
  ): Partial<Record<MetadataField, string>> {
    const metadata: Partial<Record<MetadataField, string>> = {};

    rows.forEach((row) => {
      const key = this.normalizeLabel(row[0]);
      const field = this.getMetadataField(key);
      const value = this.formatCell(row[1]);
      if (field && value && !metadata[field]) {
        metadata[field] = value;
      }
    });

    const periodo = metadata.periodo;
    if (periodo) {
      const [startRaw, endRaw] = periodo
        .split(/\s+-\s+/)
        .map((value) => value.trim());
      const start = this.parseOptionalDate(startRaw);
      const end = this.parseOptionalDate(endRaw);
      if (start && !metadata.data_inicio) {
        metadata.data_inicio = start;
      }
      if (end && !metadata.data_fim) {
        metadata.data_fim = end;
      }
    }

    return metadata;
  }

  async previewImport(
    buffer: Buffer,
    fileName: string,
  ): Promise<AprExcelImportPreviewDto> {
    const sheets = await this.getWorkbookSheets(buffer);
    const metadata = sheets.reduce<Partial<Record<MetadataField, string>>>(
      (acc, sheet) => ({
        ...this.extractMetadataFromRows(sheet.rows),
        ...acc,
      }),
      {},
    );
    const bestSheet = sheets
      .map((sheet) => ({
        sheetName: sheet.sheetName,
        rows: sheet.rows,
        ...this.detectTableHeader(sheet.rows),
      }))
      .sort(
        (left, right) =>
          Object.keys(right.matchedColumns).length -
          Object.keys(left.matchedColumns).length,
      )[0];

    if (
      !bestSheet ||
      bestSheet.headerRowIndex < 0 ||
      Object.keys(bestSheet.matchedColumns).length === 0
    ) {
      throw new BadRequestException(
        'Não foi possível localizar a tabela de riscos na planilha.',
      );
    }

    const { rows, sheetName, headerRowIndex, matchedColumns } = bestSheet;
    const warnings: string[] = [];
    const errors: string[] = [];
    const riskColumnMap = new Map<number, RiskField>();

    const headerRow = rows[headerRowIndex] || [];
    headerRow.forEach((cell, index) => {
      const field = this.getRiskField(this.normalizeLabel(cell));
      if (field) {
        riskColumnMap.set(index, field);
      }
    });

    const missingColumns = REQUIRED_RISK_COLUMNS.filter(
      (field) => !Array.from(riskColumnMap.values()).includes(field),
    );

    if (missingColumns.length > 0) {
      errors.push(
        `Colunas obrigatórias ausentes: ${missingColumns
          .map((field) => field.replace(/_/g, ' '))
          .join(', ')}.`,
      );
    }

    const importedItems: AprRiskItemInputDto[] = [];
    let ignoredRows = 0;

    rows.slice(headerRowIndex + 1).forEach((row, rowOffset) => {
      const isEmpty = row.every((cell) => !this.formatCell(cell));
      if (isEmpty) {
        ignoredRows += 1;
        return;
      }

      const currentRow = rowOffset + headerRowIndex + 2;
      const partialItem: Record<RiskField, string | number | undefined> =
        {} as Record<RiskField, string | number | undefined>;

      riskColumnMap.forEach((field, columnIndex) => {
        const cellValue = row[columnIndex];
        if (field === 'probabilidade' || field === 'severidade') {
          partialItem[field] = this.parseOptionalNumber(cellValue);
        } else if (field === 'prazo') {
          partialItem[field] = this.parseOptionalDate(cellValue);
        } else {
          const formatted = this.formatCell(cellValue);
          partialItem[field] = formatted || undefined;
        }
      });

      const evaluation: AprRiskEvaluation = this.aprRiskMatrixService.evaluate(
        typeof partialItem.probabilidade === 'number'
          ? partialItem.probabilidade
          : undefined,
        typeof partialItem.severidade === 'number'
          ? partialItem.severidade
          : undefined,
      );

      if (!partialItem.atividade_processo || !partialItem.condicao_perigosa) {
        warnings.push(
          `Linha ${currentRow} ignorada por falta de atividade/processo ou condição perigosa.`,
        );
        ignoredRows += 1;
        return;
      }

      if (!evaluation.categoria) {
        warnings.push(
          `Linha ${currentRow} importada sem categoria automática porque probabilidade/severidade estão incompletas.`,
        );
      }

      importedItems.push({
        atividade_processo: String(partialItem.atividade_processo || ''),
        agente_ambiental: String(partialItem.agente_ambiental || ''),
        condicao_perigosa: String(partialItem.condicao_perigosa || ''),
        fonte_circunstancia: String(partialItem.fonte_circunstancia || ''),
        possiveis_lesoes: String(partialItem.possiveis_lesoes || ''),
        probabilidade:
          typeof partialItem.probabilidade === 'number'
            ? partialItem.probabilidade
            : undefined,
        severidade:
          typeof partialItem.severidade === 'number'
            ? partialItem.severidade
            : undefined,
        categoria_risco: evaluation.categoria ?? undefined,
        medidas_prevencao: String(partialItem.medidas_prevencao || ''),
        responsavel: String(partialItem.responsavel || ''),
        prazo:
          typeof partialItem.prazo === 'string' ? partialItem.prazo : undefined,
        status_acao: String(partialItem.status_acao || ''),
      });
    });

    if (importedItems.length === 0) {
      errors.push('Nenhuma linha válida de risco foi encontrada na planilha.');
    }

    return {
      fileName,
      sheetName,
      importedRows: importedItems.length,
      ignoredRows,
      warnings,
      errors,
      matchedColumns,
      draft: {
        numero: metadata.numero,
        titulo: metadata.titulo,
        descricao: metadata.descricao,
        data_inicio: this.parseOptionalDate(metadata.data_inicio),
        data_fim: this.parseOptionalDate(metadata.data_fim),
        company_name: metadata.company_name,
        cnpj: metadata.cnpj,
        site_name: metadata.site_name,
        unidade_setor: metadata.unidade_setor,
        local_atividade: metadata.local_atividade,
        elaborador_name: metadata.elaborador_name,
        aprovador_name: metadata.aprovador_name,
        risk_items: importedItems,
      },
    };
  }

  async buildTemplateWorkbook(): Promise<Buffer> {
    const rows = [
      ['Código APR', 'APR-2026-001'],
      ['Título', 'Inspeção de atividade crítica'],
      ['Descrição', 'APR gerada a partir do template corporativo'],
      ['Data Emissão', '2026-03-19'],
      ['Data Revisão', '2026-03-26'],
      ['Empresa', 'Empresa exemplo'],
      ['CNPJ', '00.000.000/0001-00'],
      ['Obra', 'Obra / Unidade'],
      ['Tipo de Atividade', 'Trabalho em altura'],
      ['Frente de Trabalho', 'Manutenção estrutural'],
      ['Área de Risco', 'Cobertura industrial'],
      ['Responsável elaboração', 'Nome do elaborador'],
      ['Responsável aprovação', 'Nome do aprovador'],
      [],
      [
        'Atividade/Processo',
        'Agente Ambiental',
        'Condição Perigosa',
        'Fonte/Circunstância',
        'Possíveis Lesões',
        'Probabilidade',
        'Severidade',
        'Categoria de Risco',
        'Etapa',
        'Hierarquia de Controle',
        'Medidas de Controle',
        'Responsável',
        'Prazo',
        'Status',
        'Risco Residual P',
        'Risco Residual S',
        'Score Residual',
        'Categoria Residual',
      ],
      [
        'Montagem de linha de vida',
        'Queda de altura',
        'Acesso sem ancoragem',
        'Trabalho em altura com deslocamento horizontal',
        'Fraturas e trauma grave',
        3,
        3,
        'Crítico',
        'Execução',
        'epc',
        'Linha de vida certificada, inspeção prévia e supervisão permanente',
        'Supervisor SST',
        '2026-03-20',
        'Aberta',
        2,
        3,
        6,
        'Atenção',
      ],
    ];

    return aoaToExcelBuffer([
      {
        name: 'Template APR',
        rows,
        colWidths: [
          22, 32, 24, 28, 26, 16, 12, 12, 18, 22, 34, 24, 18, 16, 14, 14, 12,
          16,
        ],
      },
    ]);
  }

  async buildDetailWorkbook(apr: Apr): Promise<Buffer> {
    const riskItems = Array.isArray(apr.risk_items) ? apr.risk_items : [];
    const summaryRows = [
      ['Relatório APR'],
      [],
      ['Código', apr.numero || ''],
      ['Título', apr.titulo || ''],
      ['Descrição', apr.descricao || ''],
      ['Tipo de Atividade', apr.tipo_atividade || ''],
      ['Frente de Trabalho', apr.frente_trabalho || ''],
      ['Área de Risco', apr.area_risco || ''],
      ['Empresa', apr.company?.razao_social || ''],
      ['CNPJ', apr.company?.cnpj || ''],
      ['Site / Obra', apr.site?.nome || ''],
      ['Elaborador', apr.elaborador?.nome || ''],
      ['Aprovador', apr.aprovado_por?.nome || ''],
      ['Status', apr.status || ''],
      [
        'Período',
        `${this.formatDateForWorkbook(apr.data_inicio)} - ${this.formatDateForWorkbook(apr.data_fim)}`,
      ],
      ['Versão', apr.versao ?? 1],
    ];

    const riskRows = [
      [
        'Ordem',
        'Atividade/Processo',
        'Agente Ambiental',
        'Condição Perigosa',
        'Fonte/Circunstância',
        'Possíveis Lesões',
        'Probabilidade',
        'Severidade',
        'Score',
        'Categoria',
        'Etapa',
        'Hierarquia de Controle',
        'Medidas de Controle',
        'Responsável',
        'Prazo',
        'Status',
        'Risco Residual P',
        'Risco Residual S',
        'Score Residual',
        'Categoria Residual',
      ],
      ...riskItems.map((item: AprRiskItem) => [
        item.ordem + 1,
        item.atividade || '',
        item.agente_ambiental || '',
        item.condicao_perigosa || '',
        item.fonte_circunstancia || '',
        item.lesao || '',
        item.probabilidade ?? '',
        item.severidade ?? '',
        item.score_risco ?? '',
        item.categoria_risco || '',
        item.etapa || '',
        item.hierarquia_controle || '',
        item.medidas_prevencao || '',
        item.responsavel || '',
        this.formatDateForWorkbook(item.prazo),
        item.status_acao || '',
        item.residual_probabilidade ?? '',
        item.residual_severidade ?? '',
        item.residual_score ?? '',
        item.residual_categoria || '',
      ]),
    ];

    const matrixRows = [
      ['Matriz de Risco APR'],
      [],
      ['Score', 'Categoria', 'Prioridade'],
      ...this.aprRiskMatrixService
        .getBands()
        .map((band) => [
          `${band.minScore}–${band.maxScore}`,
          band.category,
          band.priority,
        ]),
    ];

    return aoaToExcelBuffer([
      {
        name: 'Resumo APR',
        rows: summaryRows,
        colWidths: [24, 68],
        merges: [{ startRow: 1, startCol: 1, endRow: 1, endCol: 2 }],
      },
      {
        name: 'Riscos APR',
        rows: riskRows,
        colWidths: [
          8, 24, 22, 24, 28, 24, 14, 12, 10, 16, 18, 22, 34, 20, 14, 16, 14, 14,
          12, 16,
        ],
      },
      {
        name: 'Matriz APR',
        rows: matrixRows,
        colWidths: [12, 18, 28],
        merges: [{ startRow: 1, startCol: 1, endRow: 1, endCol: 3 }],
      },
    ]);
  }
}
