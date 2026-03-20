import { BadRequestException, Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { Apr } from './entities/apr.entity';
import { AprRiskItem } from './entities/apr-risk-item.entity';
import { AprExcelImportPreviewDto } from './dto/apr-excel-import-preview.dto';
import { AprRiskItemInputDto } from './dto/apr-risk-item-input.dto';
import {
  AprRiskEvaluation,
  AprRiskMatrixService,
} from './apr-risk-matrix.service';

type WorksheetRow = Array<string | number | Date | null | undefined>;

type MetadataField =
  | 'numero'
  | 'titulo'
  | 'descricao'
  | 'data_inicio'
  | 'data_fim'
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
  data_inicio: ['data emissao', 'data emissão', 'data inicio', 'data início'],
  data_fim: ['data revisao', 'data revisão', 'data fim', 'validade'],
  company_name: ['empresa', 'razao social', 'razão social'],
  cnpj: ['cnpj'],
  site_name: ['obra', 'site', 'unidade', 'obra/unidade'],
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
  atividade_processo: ['atividade/processo', 'atividade processo', 'atividade'],
  agente_ambiental: ['agente ambiental', 'agente'],
  condicao_perigosa: ['condicao perigosa', 'condição perigosa', 'perigo'],
  fonte_circunstancia: [
    'fonte/circunstancia',
    'fonte/circunstância',
    'fonte circunstancia',
    'fontes circunstâncias',
  ],
  possiveis_lesoes: [
    'possiveis lesoes',
    'possíveis lesões',
    'lesoes',
    'lesões',
  ],
  probabilidade: ['probabilidade'],
  severidade: ['severidade'],
  categoria_risco: ['categoria de risco', 'categoria risco', 'categoria'],
  medidas_prevencao: [
    'medidas de controle',
    'medidas de prevencao',
    'medidas de prevenção',
    'controles',
  ],
  responsavel: ['responsavel', 'responsável'],
  prazo: ['prazo', 'data prazo'],
  status_acao: ['status', 'status acao', 'status ação'],
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

  private toWorkbookBuffer(workbook: XLSX.WorkBook): Buffer {
    const output = XLSX.write(workbook, {
      type: 'buffer',
      bookType: 'xlsx',
    }) as unknown;

    if (Buffer.isBuffer(output)) {
      return output;
    }

    if (output instanceof Uint8Array) {
      return Buffer.from(output);
    }

    throw new BadRequestException('Falha ao gerar workbook da APR.');
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

  private getWorksheetRows(buffer: Buffer): {
    rows: WorksheetRow[];
    sheetName: string;
  } {
    const workbook = XLSX.read(buffer, {
      type: 'buffer',
      cellDates: true,
      raw: false,
    });
    const firstSheetName = workbook.SheetNames[0];

    if (!firstSheetName) {
      throw new BadRequestException(
        'A planilha enviada está vazia ou não possui abas válidas.',
      );
    }

    const worksheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json<WorksheetRow>(worksheet, {
      header: 1,
      raw: false,
      defval: '',
      blankrows: false,
    });

    if (!Array.isArray(rows) || rows.length === 0) {
      throw new BadRequestException(
        'A planilha enviada não possui conteúdo processável.',
      );
    }

    return {
      rows,
      sheetName: firstSheetName,
    };
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

    if (bestMatch.headerRowIndex < 0) {
      throw new BadRequestException(
        'Não foi possível localizar a tabela de riscos na planilha.',
      );
    }

    return bestMatch;
  }

  previewImport(buffer: Buffer, fileName: string): AprExcelImportPreviewDto {
    const { rows, sheetName } = this.getWorksheetRows(buffer);
    const { headerRowIndex, matchedColumns } = this.detectTableHeader(rows);
    const warnings: string[] = [];
    const errors: string[] = [];
    const metadata: Partial<Record<MetadataField, string>> = {};
    const riskColumnMap = new Map<number, RiskField>();

    rows.slice(0, headerRowIndex).forEach((row) => {
      const key = this.normalizeLabel(row[0]);
      const field = this.getMetadataField(key);
      const value = this.formatCell(row[1]);
      if (field && value) {
        metadata[field] = value;
      }
    });

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

  buildTemplateWorkbook(): Buffer {
    const rows = [
      ['Código APR', 'APR-2026-001'],
      ['Título', 'Inspeção de atividade crítica'],
      ['Descrição', 'APR gerada a partir do template corporativo'],
      ['Data Emissão', '2026-03-19'],
      ['Data Revisão', '2026-03-26'],
      ['Empresa', 'Empresa exemplo'],
      ['CNPJ', '00.000.000/0001-00'],
      ['Obra', 'Obra / Unidade'],
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
        'Medidas de Controle',
        'Responsável',
        'Prazo',
        'Status',
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
        'Linha de vida certificada, inspeção prévia e supervisão permanente',
        'Supervisor SST',
        '2026-03-20',
        'Aberta',
      ],
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    worksheet['!cols'] = [
      { wch: 22 },
      { wch: 32 },
      { wch: 24 },
      { wch: 28 },
      { wch: 26 },
      { wch: 16 },
      { wch: 12 },
      { wch: 12 },
      { wch: 20 },
      { wch: 24 },
      { wch: 18 },
      { wch: 16 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Template APR');
    return this.toWorkbookBuffer(workbook);
  }

  buildDetailWorkbook(apr: Apr): Buffer {
    const riskItems = Array.isArray(apr.risk_items) ? apr.risk_items : [];
    const summaryRows = [
      ['Relatório APR'],
      [],
      ['Código', apr.numero || ''],
      ['Título', apr.titulo || ''],
      ['Descrição', apr.descricao || ''],
      ['Empresa', apr.company?.razao_social || ''],
      ['CNPJ', apr.company?.cnpj || ''],
      ['Site / Obra', apr.site?.nome || ''],
      ['Elaborador', apr.elaborador?.nome || ''],
      ['Aprovador', apr.aprovado_por?.nome || ''],
      ['Status', apr.status || ''],
      [
        'Período',
        `${apr.data_inicio ? new Date(apr.data_inicio).toLocaleDateString('pt-BR') : ''} - ${apr.data_fim ? new Date(apr.data_fim).toLocaleDateString('pt-BR') : ''}`,
      ],
      ['Versão', apr.versao ?? 1],
    ];

    const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
    summarySheet['!cols'] = [{ wch: 24 }, { wch: 68 }];
    summarySheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];

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
        'Medidas de Controle',
        'Responsável',
        'Prazo',
        'Status',
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
        item.medidas_prevencao || '',
        item.responsavel || '',
        item.prazo ? new Date(item.prazo).toLocaleDateString('pt-BR') : '',
        item.status_acao || '',
      ]),
    ];

    const riskSheet = XLSX.utils.aoa_to_sheet(riskRows);
    riskSheet['!cols'] = [
      { wch: 8 },
      { wch: 24 },
      { wch: 22 },
      { wch: 24 },
      { wch: 28 },
      { wch: 24 },
      { wch: 14 },
      { wch: 12 },
      { wch: 10 },
      { wch: 16 },
      { wch: 34 },
      { wch: 20 },
      { wch: 14 },
      { wch: 16 },
    ];

    const matrixRows = [
      ['Matriz de Risco APR'],
      [],
      ['Score', 'Categoria', 'Prioridade'],
      ...this.aprRiskMatrixService
        .getRules()
        .map((rule) => [rule.scores.join(', '), rule.category, rule.priority]),
    ];

    const matrixSheet = XLSX.utils.aoa_to_sheet(matrixRows);
    matrixSheet['!cols'] = [{ wch: 12 }, { wch: 18 }, { wch: 28 }];
    matrixSheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumo APR');
    XLSX.utils.book_append_sheet(workbook, riskSheet, 'Riscos APR');
    XLSX.utils.book_append_sheet(workbook, matrixSheet, 'Matriz APR');

    return this.toWorkbookBuffer(workbook);
  }
}
