import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Company } from '../../companies/entities/company.entity';
import { Site } from '../../sites/entities/site.entity';
import { User } from '../../users/entities/user.entity';

@Entity('inspections')
export class Inspection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // 1. IDENTIFICAÇÃO DA EMPRESA
  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column()
  company_id: string;

  @ManyToOne(() => Site)
  @JoinColumn({ name: 'site_id' })
  site: Site;

  @Column()
  site_id: string;

  @Column()
  setor_area: string;

  // 2. IDENTIFICAÇÃO DA INSPEÇÃO
  @Column()
  tipo_inspecao: string; // Rotina / Programada / Especial / Atendimento a NR

  @Column({ type: 'date' })
  data_inspecao: Date;

  @Column()
  horario: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'responsavel_id' })
  responsavel: User;

  @Column()
  responsavel_id: string;

  // 3. OBJETIVO DO RELATÓRIO
  @Column({ type: 'text', nullable: true })
  objetivo: string | null;

  // 4. DESCRIÇÃO DO LOCAL E DAS ATIVIDADES
  @Column({ type: 'text', nullable: true })
  descricao_local_atividades: string | null;

  // 5. METODOLOGIA UTILIZADA
  @Column({ type: 'json', nullable: true })
  metodologia: string[] | null; // Array of strings (options checked)

  // 6. IDENTIFICAÇÃO DE PERIGOS, AVALIAÇÃO E CONTROLE DOS RISCOS
  @Column({ type: 'json', nullable: true })
  perigos_riscos:
    | {
        grupo_risco: string; // Físico / Químico / Biológico / Ergonômico / Acidente
        perigo_fator_risco: string;
        fonte_circunstancia: string;
        trabalhadores_expostos: string;
        tipo_exposicao: string; // Permanente / Intermitente / Ocasional
        medidas_existentes: string;
        severidade: string;
        probabilidade: string;
        nivel_risco: string;
        classificacao_risco: string; // Baixo / Médio / Alto
        acoes_necessarias: string;
        prazo: string;
        responsavel: string;
      }[]
    | null;

  // 7. PLANO DE AÇÃO
  @Column({ type: 'json', nullable: true })
  plano_acao:
    | {
        acao: string;
        responsavel: string;
        prazo: string;
        status: string;
      }[]
    | null;

  // 8. EVIDÊNCIAS
  @Column({ type: 'json', nullable: true })
  evidencias:
    | {
        descricao: string;
        url?: string;
        original_name?: string;
      }[]
    | null;

  // 9. CONCLUSÃO
  @Column({ type: 'text', nullable: true })
  conclusao: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
