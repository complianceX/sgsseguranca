import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowLeft,
  BadgeCheck,
  ChevronRight,
  Database,
  LockKeyhole,
  ShieldCheck,
  UserRoundCheck,
  FileCheck2,
  Fingerprint,
  Globe2,
  Scale,
  Sparkles,
} from 'lucide-react';
import { getPublicLegalConfig } from '@/lib/legal';
import styles from '../legal-pages.module.css';

export const metadata: Metadata = {
  title: 'Política de Privacidade | SGS',
  description:
    'Política de privacidade e tratamento de dados pessoais do SGS - Sistema de Gestão de Segurança.',
};

export const dynamic = 'force-dynamic';

const purposeRows = [
  [
    'Autenticação, segurança da conta e prevenção a fraude',
    'Execução do contrato (Art. 7, V), legítimo interesse (Art. 7, IX) e proteção ao crédito (Art. 7, X)',
  ],
  [
    'Gestão de documentos, treinamentos, evidências e rotinas de SST',
    'Execução do contrato (Art. 7, V) e cumprimento de obrigação legal/regulatória do Cliente (Art. 7, II)',
  ],
  [
    'Exames médicos, laudos e dados de saúde ocupacional (Art. 11, LGPD)',
    'Execução de contrato no contexto de saúde ocupacional (Art. 11, II, "b") e cumprimento de obrigação legal (Art. 11, II, "a")',
  ],
  [
    'Trilha de auditoria, logs e rastreabilidade',
    'Legítimo interesse (Art. 7, IX), prevenção a fraudes e suporte à apuração de incidentes',
  ],
  [
    'Atendimento, suporte e continuidade do serviço',
    'Execução do contrato (Art. 7, V) e legítimo interesse (Art. 7, IX)',
  ],
  [
    'Faturamento, relacionamento comercial e comunicações institucionais',
    'Execução do contrato (Art. 7, V), cumprimento de obrigação legal (Art. 7, II) e legítimo interesse (Art. 7, IX)',
  ],
  [
    'Funcionalidades opcionais de IA, quando habilitadas pelo Cliente',
    'Consentimento (Art. 7, I) ou execução do contrato com instrumento específico (Art. 7, V)',
  ],
];

const dataCategories = [
  'Dados cadastrais e profissionais: nome, CPF, e-mail, cargo, matrícula ou identificadores internos.',
  'Credenciais de acesso: hash de senha, tokens de sessão, dados de MFA/segurança e sinais de dispositivo.',
  'Registros operacionais de SST: treinamentos, APRs, PTAs, checklists, CATs, evidências fotográficas.',
  'Dados de saúde ocupacional (dados sensíveis): exames médicos, laudos, atestados e resultados de avaliações (Art. 11 LGPD).',
  'Logs de acesso: endereço IP, User-Agent, carimbos de data/hora e eventos de auditoria.',
  'Dados de suporte: chamados, trocas de e-mail e interações comerciais ligadas ao uso da plataforma.',
  'Dados de IA (quando habilitado): perguntas e respostas ao assistente SST, anonimizados antes do envio ao modelo.',
];

const subprocessors = [
  {
    name: 'Supabase / Postgres',
    purpose: 'Banco de dados relacional, autenticação e armazenamento de arquivos',
    country: 'EUA',
    safeguard: 'DPA contratual, certificações SOC 2 Type II',
  },
  {
    name: 'OpenAI',
    purpose: 'Geração de linguagem natural nas funcionalidades de IA (quando habilitadas)',
    country: 'EUA',
    safeguard: 'Dados anonimizados pré-envio; Enterprise Privacy Agreement',
  },
  {
    name: 'Cloudflare',
    purpose: 'CDN, proteção DDoS, WAF e bot mitigation',
    country: 'EUA / Global',
    safeguard: 'DPA contratual, adequação SCCs EU',
  },
  {
    name: 'Sentry',
    purpose: 'Monitoramento de erros e desempenho de aplicação',
    country: 'EUA',
    safeguard: 'DPA contratual; dados de erro anonimizados antes do envio',
  },
  {
    name: 'New Relic',
    purpose: 'Observabilidade, métricas e rastreamento de performance',
    country: 'EUA',
    safeguard: 'DPA contratual; sem dados pessoais em payload de métricas',
  },
  {
    name: 'Provedor de e-mail transacional',
    purpose: 'Envio de notificações operacionais, redefinição de senha e alertas',
    country: 'Variável conforme contrato',
    safeguard: 'DPA contratual',
  },
  {
    name: 'Redis / BullMQ',
    purpose: 'Filas de processamento assíncrono e cache de sessão',
    country: 'Mesma região do banco de dados',
    safeguard: 'Dados em trânsito e em repouso criptografados; TTL configurado',
  },
];

const cookieRows = [
  {
    name: 'sb-access-token / sb-refresh-token',
    type: 'Estritamente necessário',
    purpose: 'Manutenção de sessão autenticada via Supabase Auth',
    duration: 'Sessão / 7 dias',
    thirdParty: 'Não',
  },
  {
    name: '__cf_bm',
    type: 'Estritamente necessário',
    purpose: 'Mitigação de bots e proteção Cloudflare',
    duration: '30 minutos',
    thirdParty: 'Cloudflare',
  },
  {
    name: 'sgs_company_id',
    type: 'Estritamente necessário',
    purpose: 'Isolamento multi-tenant durante a sessão',
    duration: 'Sessão',
    thirdParty: 'Não',
  },
  {
    name: 'sgs_consent_ack',
    type: 'Funcional',
    purpose: 'Registro local de exibição do modal de consentimento',
    duration: '90 dias',
    thirdParty: 'Não',
  },
  {
    name: 'XSRF-TOKEN / csrf',
    type: 'Estritamente necessário',
    purpose: 'Proteção contra Cross-Site Request Forgery',
    duration: 'Sessão',
    thirdParty: 'Não',
  },
];

const securityMeasures = [
  'Criptografia TLS 1.2+ em trânsito e AES-256 em repouso para dados sensíveis (CPF, PII).',
  'Controles de sessão, cookies httpOnly/Secure/SameSite=Strict e isolamento multi-tenant por Row Level Security (RLS) no banco.',
  'Trilha de auditoria imutável, monitoramento contínuo, rate limiting e proteção Cloudflare contra ataques automatizados.',
  'Princípio de privilégios mínimos, segregação de ambientes, backups governados e procedimentos de continuidade.',
  'Resposta a incidentes: contenção, análise forense, comunicação ao controlador e, quando exigido por lei, notificação à ANPD e aos titulares.',
];

const rightsList = [
  'Confirmação da existência de tratamento e acesso aos dados pessoais (Art. 18, I e II).',
  'Correção de dados incompletos, inexatos ou desatualizados (Art. 18, III).',
  'Anonimização, bloqueio ou eliminação de dados desnecessários, excessivos ou tratados sem base legal (Art. 18, IV).',
  'Portabilidade a outro fornecedor, observados segredo comercial e requisitos técnicos aplicáveis (Art. 18, V).',
  'Eliminação dos dados tratados com base no consentimento (Art. 18, VI).',
  'Informação sobre compartilhamentos, bases legais e consequências de eventual negativa (Art. 18, VII e VIII).',
  'Revogação do consentimento e oposição, nas hipóteses admitidas pela LGPD (Art. 18, IX e §2º).',
  'Revisão de decisões automatizadas relevantes que afetem interesses do titular (Art. 20).',
];

const retentionRows = [
  { context: 'Conta ativa', period: 'Durante o vínculo contratual', basis: 'Execução do contrato' },
  { context: 'Logs de auditoria e segurança', period: '2 anos após geração', basis: 'Legítimo interesse e obrigação legal' },
  { context: 'Interações com IA (anonimizadas)', period: '1 ano após anonimização por solicitação LGPD', basis: 'Legítimo interesse' },
  { context: 'Notificações e e-mails transacionais', period: '90 dias após envio', basis: 'Legítimo interesse' },
  { context: 'Sessões expiradas', period: '30 dias após expiração', basis: 'Execução do contrato' },
  { context: 'Documentos e evidências de SST', period: 'Conforme lei aplicável e instrução do Cliente', basis: 'Cumprimento de obrigação legal' },
  { context: 'Dados após término do contrato', period: 'Exportação em até 30 dias; eliminação subsequente salvo retenção legal', basis: 'Execução do contrato e obrigação legal' },
];

const quickLinks = [
  { id: 'escopo', label: 'Escopo e agentes' },
  { id: 'dados', label: 'Dados tratados' },
  { id: 'saude', label: 'Dados de saúde' },
  { id: 'bases', label: 'Finalidades e bases legais' },
  { id: 'compartilhamento', label: 'Suboperadores' },
  { id: 'transferencias', label: 'Transferências internacionais' },
  { id: 'retencao', label: 'Retenção' },
  { id: 'cookies', label: 'Cookies' },
  { id: 'direitos', label: 'Direitos dos titulares' },
  { id: 'seguranca', label: 'Segurança e incidentes' },
  { id: 'contato', label: 'DPO e contato' },
];

export default function PrivacidadePage() {
  const legal = getPublicLegalConfig();
  const lastUpdated = legal.policyVersion || '—';
  const companyName =
    legal.companyName || 'a operadora identificada no instrumento contratual aplicável';
  const companyDocument = legal.companyDocument
    ? `, inscrita no CPF/CNPJ ${legal.companyDocument}`
    : '';
  const companyAddress =
    legal.companyAddress || 'endereço informado no contrato comercial vigente';
  const privacyChannel =
    legal.privacyEmail ||
    'canal de privacidade informado ao administrador da organização';
  const privacyHref = legal.privacyEmail ? `mailto:${legal.privacyEmail}` : null;
  const supportChannel = legal.supportEmail;
  const supportHref = legal.supportEmail ? `mailto:${legal.supportEmail}` : null;
  const showDedicatedSupportChannel =
    Boolean(supportChannel) && supportChannel !== legal.privacyEmail;
  const dpoLabel = legal.dpoName || 'Encarregado de Proteção de Dados (DPO)';
  const dpoEmail = legal.dpoEmail;
  const dpoPhone = legal.dpoPhone;
  const hasMissingLegalInfo = legal.missingRequiredFields.length > 0;

  return (
    <div className={`${styles.page} ${styles.privacyPage}`}>
      <div className={`${styles.ambientGlow} ${styles.privacyAmbientGlow}`} />
      <div className={`${styles.ambientGlowSecondary} ${styles.privacyAmbientGlowSecondary}`} />

      <div className={styles.shell}>
        <Link href="/login" className={styles.backLink}>
          <ArrowLeft size={16} />
          Voltar ao login
        </Link>

        <section className={`${styles.hero} ${styles.privacyHero}`}>
          <div className={`${styles.heroBadge} ${styles.privacyHeroBadge}`}>
            <Sparkles size={14} />
            Privacidade, segurança e governança de dados
          </div>

          <div className={`${styles.heroGrid} ${styles.privacyHeroGrid}`}>
            <div className={`${styles.heroMain} ${styles.privacyHeroMain}`}>
              <h1 className={`${styles.heroTitle} ${styles.privacyHeroTitle}`}>
                Política de Privacidade
              </h1>
              <p className={`${styles.heroDescription} ${styles.privacyHeroDescription}`}>
                Transparência, rastreabilidade e proteção de dados em padrão corporativo.
                Esta política explica como o SGS trata dados pessoais dentro da
                plataforma, com foco em conformidade com a LGPD, segurança operacional e
                confiança institucional.
              </p>

              <div className={styles.heroMeta}>
                <span className={`${styles.metaPill} ${styles.privacyMetaPill}`}>
                  <BadgeCheck size={14} />
                  Versão: {lastUpdated}
                </span>
                <span className={`${styles.metaPill} ${styles.privacyMetaPill}`}>
                  <Database size={14} />
                  Dados operacionais, cadastrais e auditoráveis
                </span>
                <span className={`${styles.metaPill} ${styles.privacyMetaPill}`}>
                  <ShieldCheck size={14} />
                  Estrutura alinhada à LGPD
                </span>
              </div>

              <div className={styles.heroActions}>
                <a href="#escopo" className={styles.primaryButton}>
                  Ler política
                  <ChevronRight size={16} />
                </a>
                <a href="#contato" className={styles.secondaryButton}>
                  Canal de privacidade
                </a>
              </div>
            </div>

            <aside className={`${styles.heroPanel} ${styles.privacyHeroPanel}`}>
              <p className={styles.panelEyebrow}>Visão executiva</p>
              <h2 className={styles.panelTitle}>Uma política com postura enterprise</h2>
              <p className={styles.panelText}>
                O SGS organiza o tratamento de dados com clareza de papéis, base legal,
                rastreabilidade, retenção e resposta a incidentes.
              </p>

              <div className={styles.sideList}>
                <div className={styles.sideItem}>
                  <span className={styles.sideIcon}>
                    <UserRoundCheck size={18} />
                  </span>
                  <div>
                    <strong>Quando atuamos como controladores</strong>
                    <p>
                      Dados institucionais, relacionamento comercial, faturamento,
                      segurança da plataforma e obrigações próprias.
                    </p>
                  </div>
                </div>

                <div className={styles.sideItem}>
                  <span className={styles.sideIcon}>
                    <Database size={18} />
                  </span>
                  <div>
                    <strong>Quando atuamos como operadores</strong>
                    <p>
                      Dados inseridos pelo Cliente em rotinas de SST, conforme contrato
                      e instruções válidas.
                    </p>
                  </div>
                </div>

                <div className={styles.sideItem}>
                  <span className={styles.sideIcon}>
                    <LockKeyhole size={18} />
                  </span>
                  <div>
                    <strong>Canal oficial / DPO</strong>
                    <p>
                      {privacyHref ? (
                        <a href={privacyHref} className={styles.inlineLink}>
                          {privacyChannel}
                        </a>
                      ) : (
                        privacyChannel
                      )}{' '}
                      · {dpoLabel}
                    </p>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </section>

        <section className={`${styles.trustStrip} ${styles.privacyTrustStrip}`}>
          <article className={`${styles.trustCard} ${styles.privacyTrustCard}`}>
            <ShieldCheck size={18} />
            <div>
              <strong>Segurança operacional</strong>
              <p>Controles, monitoramento e resposta a incidentes.</p>
            </div>
          </article>
          <article className={`${styles.trustCard} ${styles.privacyTrustCard}`}>
            <Fingerprint size={18} />
            <div>
              <strong>Rastreabilidade</strong>
              <p>Logs, trilhas de auditoria e evidências de tratamento.</p>
            </div>
          </article>
          <article className={`${styles.trustCard} ${styles.privacyTrustCard}`}>
            <Scale size={18} />
            <div>
              <strong>Conformidade</strong>
              <p>LGPD, governança interna e suporte regulatório.</p>
            </div>
          </article>
          <article className={`${styles.trustCard} ${styles.privacyTrustCard}`}>
            <Globe2 size={18} />
            <div>
              <strong>Postura corporativa</strong>
              <p>Estrutura preparada para operações multiempresa.</p>
            </div>
          </article>
        </section>

        <section className={`${styles.quickNav} ${styles.privacyQuickNav}`}>
          <div className={`${styles.quickNavHeader} ${styles.privacyQuickNavHeader}`}>
            <FileCheck2 size={18} />
            Navegação rápida
          </div>
          <div className={`${styles.quickNavList} ${styles.privacyQuickNavList}`}>
            {quickLinks.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className={`${styles.quickNavLink} ${styles.privacyQuickNavLink}`}
              >
                {item.label}
              </a>
            ))}
          </div>
        </section>

        <section className={`${styles.summaryGrid} ${styles.privacySummaryGrid}`}>
          <article className={`${styles.summaryCard} ${styles.privacySummaryCard}`}>
            <p className={styles.summaryLabel}>Operadora da plataforma</p>
            <h2 className={styles.summaryTitle}>
              {companyName}
              {companyDocument}
            </h2>
            <p className={styles.summaryText}>
              Endereço: {companyAddress}.
            </p>
          </article>

          <article className={`${styles.summaryCard} ${styles.privacySummaryCard}`}>
            <p className={styles.summaryLabel}>Atendimento ao titular</p>
            <h2 className={styles.summaryTitle}>Fluxo orientado por papel regulatório</h2>
            <p className={styles.summaryText}>
              Quando a SGS atuar como operadora, pedidos do titular devem ser
              direcionados preferencialmente ao controlador (empresa contratante).
            </p>
          </article>

          <article className={`${styles.summaryCard} ${styles.privacySummaryCard}`}>
            <p className={styles.summaryLabel}>Postura enterprise</p>
            <h2 className={styles.summaryTitle}>Segurança, retenção e governança</h2>
            <p className={styles.summaryText}>
              Controles de acesso, segregação multi-tenant por RLS, logs auditáveis
              e procedimentos documentados de continuidade.
            </p>
          </article>
        </section>

        {hasMissingLegalInfo ? (
          <section className={`${styles.warningCard} ${styles.privacyWarningCard}`}>
            <strong>
              <ShieldCheck size={16} />
              Dados institucionais ainda incompletos
            </strong>
            <p>
              A estrutura da política está pronta, mas a publicação definitiva depende
              do preenchimento completo dos campos públicos obrigatórios.
            </p>
          </section>
        ) : null}

        <div className={styles.content}>
          <section className={styles.section} id="escopo">
            <h2>1. Escopo e agentes de tratamento</h2>
            <p>
              O SGS é operado por <strong>{companyName}{companyDocument}</strong>, com
              sede em <strong>{companyAddress}</strong>. A qualificação jurídica como
              controlador ou operador depende da atividade de tratamento concretamente
              desempenhada em cada operação.
            </p>

            <div className={styles.featureGrid}>
              <article className={styles.featureCard}>
                <h3>Controlador</h3>
                <p>
                  Atuamos como controladores quando definimos finalidade, meios e
                  decisões sobre tratamento relacionado à nossa operação institucional:
                  segurança da plataforma, faturamento, marketing B2B, suporte e gestão
                  de contas.
                </p>
              </article>

              <article className={styles.featureCard}>
                <h3>Operador</h3>
                <p>
                  Atuamos como operadores quando tratamos dados inseridos pelo Cliente
                  para gerir SST, treinamentos, evidências, documentos e rotinas
                  ocupacionais — conforme contrato e instruções válidas do Cliente.
                </p>
              </article>
            </div>

            <p className={styles.callout}>
              Para o cenário de operador, a empresa contratante é a controladora.
              Pedidos de titulares relacionados a esses dados devem ser encaminhados
              preferencialmente ao controlador.
            </p>
          </section>

          <section className={styles.section} id="dados">
            <h2>2. Categorias de dados tratados</h2>
            <p>
              Tratamos apenas os dados adequados, pertinentes e necessários para prestar
              o serviço, manter a segurança do ambiente e cumprir obrigações contratuais,
              legais e regulatórias (princípio da necessidade, Art. 6, III, LGPD).
            </p>
            <ul className={styles.bulletList}>
              {dataCategories.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className={styles.section} id="saude">
            <h2>3. Dados sensíveis de saúde ocupacional (Art. 11, LGPD)</h2>
            <p>
              O SGS pode processar dados de saúde inseridos pelo Cliente, como exames
              médicos periódicos, atestados, CATs (Comunicações de Acidente de Trabalho)
              e laudos ocupacionais. Esses dados são classificados como <strong>dados
              sensíveis</strong> nos termos do art. 5, II e do art. 11 da LGPD.
            </p>
            <ul className={styles.bulletList}>
              <li>
                <strong>Base legal aplicável:</strong> execução de contrato no contexto
                de saúde ocupacional (Art. 11, II, &ldquo;b&rdquo;) e cumprimento de
                obrigação legal (Art. 11, II, &ldquo;a&rdquo;), conforme NR-7 e demais
                normas regulamentadoras.
              </li>
              <li>
                <strong>Acesso restrito:</strong> os dados de saúde são acessíveis
                apenas a usuários autorizados pelo Cliente dentro da mesma organização
                (isolamento multi-tenant por RLS).
              </li>
              <li>
                <strong>Anonimização em IA:</strong> quando funcionalidades de IA são
                habilitadas, dados de saúde são anonimizados e sanitizados antes de
                qualquer envio ao provedor de modelo.
              </li>
              <li>
                <strong>Retenção:</strong> conforme legislação trabalhista e de saúde
                ocupacional aplicável, e instrução do controlador (Cliente).
              </li>
            </ul>
          </section>

          <section className={styles.section} id="bases">
            <h2>4. Finalidades e bases legais</h2>
            <p>
              As bases legais variam conforme o contexto de uso e o papel exercido.
            </p>

            <div className={styles.tableWrap}>
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th>Finalidade</th>
                    <th>Base legal predominante (LGPD)</th>
                  </tr>
                </thead>
                <tbody>
                  {purposeRows.map(([purpose, basis]) => (
                    <tr key={purpose}>
                      <td>{purpose}</td>
                      <td>{basis}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className={styles.section} id="compartilhamento">
            <h2>5. Suboperadores e cadeia de processamento</h2>
            <p>
              Não comercializamos dados pessoais. Compartilhamos dados apenas com
              suboperadores necessários para a execução do serviço, todos contratados
              com cláusulas de proteção de dados compatíveis com a LGPD.
            </p>

            <div className={styles.tableWrap}>
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th>Suboperador</th>
                    <th>Finalidade</th>
                    <th>País</th>
                    <th>Salvaguarda</th>
                  </tr>
                </thead>
                <tbody>
                  {subprocessors.map((sp) => (
                    <tr key={sp.name}>
                      <td><strong>{sp.name}</strong></td>
                      <td>{sp.purpose}</td>
                      <td>{sp.country}</td>
                      <td>{sp.safeguard}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className={styles.callout}>
              Também podemos compartilhar dados com autoridades públicas, órgãos
              regulatórios ou terceiros legitimados quando exigido por lei, ordem judicial
              ou investigação formal.
            </p>
          </section>

          <section className={styles.section} id="transferencias">
            <h2>6. Transferências internacionais (Art. 33, LGPD)</h2>
            <p>
              Alguns suboperadores processam dados fora do Brasil. Conforme a tabela
              acima, adotamos as seguintes salvaguardas para cada transferência:
            </p>
            <ul className={styles.bulletList}>
              <li>
                <strong>Cláusulas Contratuais Padrão (SCCs):</strong> para provedores
                em jurisdições sem decisão de adequação formal da ANPD.
              </li>
              <li>
                <strong>Acordos de Processamento de Dados (DPAs):</strong> firmados com
                todos os suboperadores, incluindo OpenAI, Supabase, Cloudflare, Sentry
                e New Relic.
              </li>
              <li>
                <strong>Minimização técnica:</strong> dados de saúde e PII sensível são
                anonimizados ou pseudonimizados antes de qualquer transmissão
                internacional quando tecnicamente viável.
              </li>
              <li>
                <strong>Certificações reconhecidas:</strong> preferência a provedores
                com SOC 2 Type II, ISO 27001 ou equivalente.
              </li>
            </ul>
          </section>

          <section className={styles.section} id="retencao">
            <h2>7. Retenção, descarte e exportação</h2>
            <p>
              Os dados são mantidos pelo tempo necessário para cumprir a finalidade,
              respeitar obrigações legais e garantir a continuidade operacional.
            </p>

            <div className={styles.tableWrap}>
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th>Contexto</th>
                    <th>Período</th>
                    <th>Base</th>
                  </tr>
                </thead>
                <tbody>
                  {retentionRows.map((r) => (
                    <tr key={r.context}>
                      <td>{r.context}</td>
                      <td>{r.period}</td>
                      <td>{r.basis}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className={styles.callout}>
              Ao término do contrato, o Cliente tem até 30 dias para exportar seus dados.
              Após esse prazo, os dados são eliminados ou anonimizados, salvo retenção
              exigida por lei.
            </p>
          </section>

          <section className={styles.section} id="cookies">
            <h2>8. Cookies e tecnologias semelhantes</h2>
            <p>
              Utilizamos apenas cookies estritamente necessários para autenticação,
              segurança e continuidade de sessão. Não utilizamos cookies de rastreamento,
              publicidade ou analytics de terceiros.
            </p>

            <div className={styles.tableWrap}>
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th>Cookie</th>
                    <th>Categoria</th>
                    <th>Finalidade</th>
                    <th>Duração</th>
                    <th>Terceiro</th>
                  </tr>
                </thead>
                <tbody>
                  {cookieRows.map((c) => (
                    <tr key={c.name}>
                      <td><code>{c.name}</code></td>
                      <td>{c.type}</td>
                      <td>{c.purpose}</td>
                      <td>{c.duration}</td>
                      <td>{c.thirdParty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p>
              Para detalhes completos, acesse nossa{' '}
              <Link href="/cookies" className={styles.inlineLink}>
                Política de Cookies
              </Link>
              .
            </p>
          </section>

          <section className={styles.section} id="direitos">
            <h2>9. Direitos dos titulares (Art. 18, LGPD)</h2>
            <p>
              Os direitos abaixo podem ser exercidos contra o controlador competente.
              Quando a SGS atuar como operadora, auxiliaremos o Cliente na execução
              desses pedidos dentro dos limites do contrato.
            </p>
            <ul className={styles.bulletList}>
              {rightsList.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className={styles.callout}>
              Para dados diretamente controlados por nós, envie sua solicitação para{' '}
              {privacyHref ? (
                <a href={privacyHref} className={styles.inlineLink}>
                  {privacyChannel}
                </a>
              ) : (
                privacyChannel
              )}
              . Respondemos em até 15 dias úteis.
            </p>
          </section>

          <section className={styles.section} id="seguranca">
            <h2>10. Segurança da informação e resposta a incidentes</h2>
            <p>
              Adotamos medidas técnicas e administrativas compatíveis com o risco da
              operação, observando boas práticas de mercado e monitoramento contínuo.
            </p>
            <ul className={styles.bulletList}>
              {securityMeasures.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className={styles.callout}>
              Em caso de incidente com potencial de risco ou dano relevante, aplicaremos
              medidas de contenção, análise forense e comunicação ao controlador e às
              autoridades competentes. Notificação à ANPD ocorrerá dentro do prazo legal
              aplicável.
            </p>
          </section>

          <section className={styles.section}>
            <h2>11. Atualizações desta política</h2>
            <p>
              Esta política pode ser revisada para refletir mudanças legais, operacionais
              ou tecnológicas. Alterações relevantes serão comunicadas pelos canais
              adequados com antecedência razoável. A versão vigente é sempre identificada
              pelo número de versão no cabeçalho desta página.
            </p>
          </section>

          <section className={styles.section} id="contato">
            <h2>12. Encarregado de Proteção de Dados (DPO) e contato</h2>
            <p>
              Nosso Encarregado de Proteção de Dados ({dpoLabel}) pode ser
              contactado pelos seguintes canais:
            </p>
            <ul className={styles.bulletList}>
              {privacyHref ? (
                <li>
                  <strong>E-mail de privacidade:</strong>{' '}
                  <a href={privacyHref} className={styles.inlineLink}>
                    {privacyChannel}
                  </a>
                </li>
              ) : (
                <li>
                  <strong>Canal de privacidade:</strong> {privacyChannel}
                </li>
              )}
              {dpoEmail && dpoEmail !== legal.privacyEmail ? (
                <li>
                  <strong>E-mail do DPO:</strong>{' '}
                  <a href={`mailto:${dpoEmail}`} className={styles.inlineLink}>
                    {dpoEmail}
                  </a>
                </li>
              ) : null}
              {dpoPhone ? (
                <li>
                  <strong>Telefone do DPO:</strong>{' '}
                  <a href={`tel:${dpoPhone}`} className={styles.inlineLink}>
                    {dpoPhone}
                  </a>
                </li>
              ) : null}
              {showDedicatedSupportChannel ? (
                <li>
                  <strong>Suporte técnico:</strong>{' '}
                  {supportHref ? (
                    <a href={supportHref} className={styles.inlineLink}>
                      {supportChannel}
                    </a>
                  ) : (
                    supportChannel
                  )}
                </li>
              ) : null}
            </ul>

            <p>
              O titular também pode peticionar perante a Autoridade Nacional de Proteção
              de Dados (ANPD) pelos canais oficiais em{' '}
              <a
                href="https://www.gov.br/anpd"
                target="_blank"
                rel="noopener noreferrer"
                className={styles.inlineLink}
              >
                www.gov.br/anpd
              </a>
              .
            </p>
          </section>
        </div>

        <div className={styles.footerNav}>
          <Link href="/login">Login</Link>
          <Link href="/termos">Termos de Uso</Link>
          <Link href="/cookies">Política de Cookies</Link>
        </div>

        <p className={styles.footnote}>
          Esta política foi redigida para a operação padrão do SGS (versão {lastUpdated}) e deve ser
          interpretada em conjunto com o contrato comercial, eventuais Acordos de Processamento de
          Dados (DPAs) e instruções formais do Cliente.
        </p>
      </div>
    </div>
  );
}
