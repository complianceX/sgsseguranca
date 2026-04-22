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
    'Execução do contrato, legítimo interesse e proteção do crédito/segurança operacional',
  ],
  [
    'Gestão de documentos, treinamentos, evidências e rotinas de SST',
    'Execução do contrato e cumprimento de obrigações legais/regulatórias do Cliente',
  ],
  [
    'Trilha de auditoria, logs e rastreabilidade',
    'Legítimo interesse, prevenção a fraudes e suporte a apuração de incidentes',
  ],
  [
    'Atendimento, suporte e continuidade do serviço',
    'Execução do contrato e legítimo interesse',
  ],
  [
    'Faturamento, relacionamento comercial e comunicações institucionais',
    'Execução do contrato, cumprimento de obrigação legal e legítimo interesse',
  ],
  [
    'Funcionalidades opcionais de IA, quando habilitadas pelo Cliente',
    'Execução do contrato, legítimo interesse e, quando aplicável, consentimento/instrumento específico',
  ],
];

const dataCategories = [
  'Dados cadastrais e profissionais, como nome, CPF, e-mail, cargo, matrícula ou identificadores internos.',
  'Credenciais de acesso, hash de senha, tokens de sessão, dados de MFA/segurança e sinais de dispositivo.',
  'Registros operacionais e documentos de SST enviados pela organização contratante, como treinamentos, APRs, PTAs, checklists, CATs, evidências fotográficas, exames e laudos.',
  'Logs de acesso, endereço IP, User-Agent, carimbos de data/hora e eventos de auditoria necessários à segurança e à prestação de contas.',
  'Dados de suporte, chamados, trocas de e-mail e interações comerciais ligadas ao uso da plataforma.',
];

const securityMeasures = [
  'Criptografia em trânsito, controles de sessão, cookies seguros e isolamento multiempresa por políticas de acesso.',
  'Trilha de auditoria, monitoramento, rate limiting, proteção contra abuso automatizado e controles de autenticação.',
  'Privilégios mínimos, segregação de ambiente, backups governados e mecanismos de rastreabilidade.',
  'Processos de análise, contenção e resposta a incidentes com comunicação ao controlador e, quando exigido, à ANPD e aos titulares.',
];

const rightsList = [
  'Confirmação da existência de tratamento e acesso aos dados pessoais.',
  'Correção de dados incompletos, inexatos ou desatualizados.',
  'Anonimização, bloqueio ou eliminação, quando cabível.',
  'Portabilidade, observados segredos comercial e industrial e requisitos técnicos aplicáveis.',
  'Informação sobre compartilhamentos, bases legais e consequências de eventual negativa.',
  'Revogação do consentimento e oposição, nas hipóteses admitidas pela LGPD.',
];

const quickLinks = [
  { id: 'escopo', label: 'Escopo e agentes' },
  { id: 'dados', label: 'Dados tratados' },
  { id: 'bases', label: 'Finalidades e bases legais' },
  { id: 'compartilhamento', label: 'Compartilhamento' },
  { id: 'retencao', label: 'Retenção' },
  { id: 'direitos', label: 'Direitos dos titulares' },
  { id: 'seguranca', label: 'Segurança e incidentes' },
  { id: 'contato', label: 'Contato' },
];

export default function PrivacidadePage() {
  const lastUpdated = '26 de março de 2026';
  const legal = getPublicLegalConfig();
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
  const dpoLabel = legal.dpoName || 'canal de privacidade e proteção de dados';
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
                  Última atualização: {lastUpdated}
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
                    <strong>Canal oficial</strong>
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
              Endereço informado para esta operação: {companyAddress}.
            </p>
          </article>

          <article className={`${styles.summaryCard} ${styles.privacySummaryCard}`}>
            <p className={styles.summaryLabel}>Atendimento ao titular</p>
            <h2 className={styles.summaryTitle}>Fluxo orientado por papel regulatório</h2>
            <p className={styles.summaryText}>
              Quando a SGS atuar como operadora, pedidos do titular devem ser
              direcionados preferencialmente ao controlador.
            </p>
          </article>

          <article className={`${styles.summaryCard} ${styles.privacySummaryCard}`}>
            <p className={styles.summaryLabel}>Postura enterprise</p>
            <h2 className={styles.summaryTitle}>Segurança, retenção e governança</h2>
            <p className={styles.summaryText}>
              Mantemos controles de acesso, segregação multiempresa, logs e continuidade
              operacional.
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
              sede em <strong>{companyAddress}</strong>. Em conformidade com a LGPD, a
              qualificação jurídica da SGS depende da atividade de tratamento e do papel
              concretamente desempenhado em cada operação.
            </p>

            <div className={styles.featureGrid}>
              <article className={styles.featureCard}>
                <h3>Controlador</h3>
                <p>
                  Atuamos como controladores quando definimos finalidade, meios e
                  decisões sobre tratamento relacionado à nossa operação institucional,
                  segurança da plataforma, faturamento, marketing B2B, suporte e gestão
                  de contas.
                </p>
              </article>

              <article className={styles.featureCard}>
                <h3>Operador</h3>
                <p>
                  Atuamos predominantemente como operadores quando tratamos dados
                  inseridos pelo Cliente na plataforma para gerir SST, treinamentos,
                  evidências, documentos e rotinas ocupacionais.
                </p>
              </article>
            </div>

            <p className={styles.callout}>
              Para esse segundo cenário, a empresa contratante normalmente é a
              controladora e a SGS atua conforme contrato e instruções válidas do Cliente.
            </p>
          </section>

          <section className={styles.section} id="dados">
            <h2>2. Categorias de dados tratados</h2>
            <p>
              Tratamos apenas os dados adequados, pertinentes e necessários para prestar
              o serviço, manter a segurança do ambiente e cumprir obrigações contratuais,
              legais e regulatórias.
            </p>
            <ul className={styles.bulletList}>
              {dataCategories.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className={styles.section} id="bases">
            <h2>3. Finalidades e bases legais</h2>
            <p>
              As bases legais variam conforme o contexto de uso e o papel exercido. A
              tabela abaixo apresenta as hipóteses predominantes na operação padrão da
              plataforma.
            </p>

            <div className={styles.tableWrap}>
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th>Finalidade</th>
                    <th>Base legal predominante</th>
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
            <h2>4. Compartilhamento e cadeia de operadores</h2>
            <p>
              Não comercializamos dados pessoais. O compartilhamento ocorre apenas quando
              necessário para a execução do serviço, para atendimento de obrigação legal
              ou por solicitação do controlador competente.
            </p>
            <ul className={styles.bulletList}>
              <li>
                <strong>Infraestrutura e armazenamento:</strong> provedores de nuvem,
                banco de dados, filas e armazenamento de arquivos.
              </li>
              <li>
                <strong>Comunicações transacionais:</strong> provedores de e-mail e
                notificações para alertas operacionais e redefinição de senha.
              </li>
              <li>
                <strong>Suporte e segurança:</strong> ferramentas de monitoramento,
                observabilidade e prevenção a abuso.
              </li>
              <li>
                <strong>Autoridades públicas e terceiros legitimados:</strong> quando
                exigido por lei, ordem judicial, investigação ou obrigação regulatória.
              </li>
            </ul>
            <p className={styles.callout}>
              Funcionalidades opcionais de IA, quando habilitadas, devem observar
              parâmetros técnicos e contratuais específicos.
            </p>
          </section>

          <section className={styles.section}>
            <h2>5. Transferências internacionais</h2>
            <p>
              Alguns provedores tecnológicos podem tratar dados fora do Brasil. Quando
              isso ocorrer, adotamos medidas contratuais, organizacionais e técnicas
              compatíveis com a LGPD e com as orientações da ANPD.
            </p>
          </section>

          <section className={styles.section} id="retencao">
            <h2>6. Retenção, descarte e exportação</h2>
            <p>
              Os dados são mantidos pelo tempo necessário para cumprir a finalidade do
              tratamento, respeitar obrigações legais, preservar evidências de auditoria
              e garantir a continuidade da operação contratada.
            </p>
            <ul className={styles.bulletList}>
              <li>Dados de conta ativa permanecem enquanto houver vínculo contratual ou necessidade operacional.</li>
              <li>Documentos e evidências de SST seguem a política de retenção definida pelo Cliente e a legislação aplicável.</li>
              <li>Logs de auditoria e segurança podem ser mantidos por período superior quando necessários para investigação, defesa ou prestação de contas.</li>
              <li>Ao término do contrato, os dados podem ser exportados pelo Cliente e depois eliminados, anonimizados ou mantidos pelo prazo legal aplicável.</li>
            </ul>
          </section>

          <section className={styles.section} id="direitos">
            <h2>7. Direitos dos titulares</h2>
            <p>
              Os direitos previstos no art. 18 da LGPD podem ser exercidos contra o
              controlador competente. Quando a SGS atuar como operadora, auxiliaremos o
              Cliente na execução desses pedidos dentro dos limites do contrato.
            </p>
            <ul className={styles.bulletList}>
              {rightsList.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className={styles.callout}>
              Para dados diretamente controlados por nós, entre em contato por{' '}
              {privacyHref ? (
                <a href={privacyHref} className={styles.inlineLink}>
                  {privacyChannel}
                </a>
              ) : (
                privacyChannel
              )}
              .
            </p>
          </section>

          <section className={styles.section} id="seguranca">
            <h2>8. Segurança da informação e resposta a incidentes</h2>
            <p>
              Adotamos medidas técnicas e administrativas compatíveis com o risco da
              operação, observando boas práticas de mercado, monitoramento contínuo e
              governança de acesso.
            </p>
            <ul className={styles.bulletList}>
              {securityMeasures.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className={styles.callout}>
              Em caso de incidente com potencial de risco ou dano relevante, aplicaremos
              medidas de contenção, análise, registro e comunicação ao controlador e às
              autoridades competentes.
            </p>
          </section>

          <section className={styles.section}>
            <h2>9. Cookies e tecnologias estritamente necessárias</h2>
            <p>
              Utilizamos cookies e mecanismos técnicos necessários para autenticação,
              segurança, continuidade de sessão e preferências essenciais da plataforma.
            </p>
          </section>

          <section className={styles.section}>
            <h2>10. Atualizações desta política</h2>
            <p>
              Esta política pode ser revisada para refletir mudanças legais, operacionais
              ou tecnológicas. Alterações relevantes serão comunicadas pelos canais
              adequados.
            </p>
          </section>

          <section className={styles.section} id="contato">
            <h2>11. Contato e autoridade supervisora</h2>
            <p>
              Dúvidas, solicitações ou comunicações relacionadas a esta política podem ser
              encaminhadas para{' '}
              {privacyHref ? (
                <a href={privacyHref} className={styles.inlineLink}>
                  {privacyChannel}
                </a>
              ) : (
                privacyChannel
              )}
              .
            </p>

            {showDedicatedSupportChannel ? (
              <p>
                Para suporte técnico ou operacional da plataforma, utilize{' '}
                {supportHref ? (
                  <a href={supportHref} className={styles.inlineLink}>
                    {supportChannel}
                  </a>
                ) : (
                  supportChannel
                )}
                .
              </p>
            ) : null}

            <p>
              O titular também pode peticionar perante a Autoridade Nacional de Proteção
              de Dados (ANPD), conforme os canais oficiais divulgados em{' '}
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
        </div>

        <p className={styles.footnote}>
          Esta política foi redigida para a operação padrão do SGS e deve ser interpretada
          em conjunto com o contrato comercial, eventuais anexos de proteção de dados e
          instruções formais do Cliente.
        </p>
      </div>
    </div>
  );
}
