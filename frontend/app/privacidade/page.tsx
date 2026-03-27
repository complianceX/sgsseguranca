import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowLeft,
  BadgeCheck,
  Database,
  LockKeyhole,
  ShieldCheck,
  UserRoundCheck,
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
    <div className={styles.page}>
      <div className={styles.shell}>
        <Link href="/login" className={styles.backLink}>
          <ArrowLeft size={16} />
          Voltar ao login
        </Link>

        <section className={styles.hero}>
          <div className={styles.heroMain}>
            <span className={styles.heroEyebrow}>
              <ShieldCheck size={14} />
              Privacidade e governança de dados
            </span>
            <h1 className={styles.heroTitle}>Política de Privacidade</h1>
            <p className={styles.heroDescription}>
              Esta política descreve como o SGS trata dados pessoais no contexto da
              plataforma, com linguagem adequada para operação corporativa, suporte a
              auditorias e conformidade com a LGPD. Ela deve ser lida em conjunto com
              os contratos comerciais, eventuais anexos de tratamento de dados e os
              controles internos da organização contratante.
            </p>
            <div className={styles.heroMeta}>
              <span className={styles.metaPill}>
                <BadgeCheck size={14} />
                Última atualização: {lastUpdated}
              </span>
              <span className={styles.metaPill}>
                <Database size={14} />
                Dados operacionais, cadastrais e de auditoria
              </span>
              <span className={styles.metaPill}>
                <UserRoundCheck size={14} />
                Alinhado à LGPD e às orientações da ANPD
              </span>
            </div>
          </div>

          <aside className={styles.heroSide}>
            <p className={styles.sideLabel}>Papel dos agentes</p>
            <h2 className={styles.sideTitle}>Controladoria e operação tratadas com clareza</h2>
            <p className={styles.sideCopy}>
              O papel da SGS muda conforme a atividade de tratamento realizada. Em
              operações da plataforma, esse enquadramento deve ser lido junto com o
              contrato firmado com a empresa cliente.
            </p>
            <div className={styles.sideList}>
              <div className={styles.sideItem}>
                <span className={styles.sideIcon}>
                  <UserRoundCheck size={18} />
                </span>
                <div>
                  <strong>Quando atuamos como controladores</strong>
                  <p>
                    Para dados institucionais, contas sob nossa gestão direta,
                    relacionamento comercial, faturamento, segurança da plataforma e
                    obrigações legais próprias.
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
                    Para dados inseridos pelo Cliente em rotinas de SST, executando o
                    tratamento conforme as instruções e finalidades definidas pela
                    organização contratante.
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
                    )}
                    {' '}· {dpoLabel}
                  </p>
                </div>
              </div>
            </div>
          </aside>
        </section>

        <section className={styles.summaryGrid}>
          <article className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Operadora da plataforma</p>
            <h2 className={styles.summaryTitle}>
              {companyName}
              {companyDocument}
            </h2>
            <p className={styles.summaryText}>
              Endereço informado para esta operação: {companyAddress}.
            </p>
          </article>
          <article className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Atendimento ao titular</p>
            <h2 className={styles.summaryTitle}>Fluxo orientado por papel regulatório</h2>
            <p className={styles.summaryText}>
              Quando a SGS atuar como operadora, pedidos do titular devem ser
              direcionados preferencialmente ao controlador, sem prejuízo do nosso apoio
              operacional e técnico.
            </p>
          </article>
          <article className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Postura enterprise</p>
            <h2 className={styles.summaryTitle}>Segurança, rastreabilidade e retenção</h2>
            <p className={styles.summaryText}>
              Mantemos controles de acesso, logs, segregação multiempresa e processos de
              continuidade compatíveis com uma operação corporativa.
            </p>
          </article>
        </section>

        {hasMissingLegalInfo ? (
          <section className={styles.warningCard}>
            <strong>
              <ShieldCheck size={16} />
              Dados institucionais ainda incompletos
            </strong>
            <p>
              Esta página já está estruturada em padrão enterprise, mas a publicação
              definitiva depende do preenchimento completo dos campos públicos
              obrigatórios da operação.
            </p>
          </section>
        ) : null}

        <div className={styles.content}>
          <section className={styles.section}>
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
                  segurança da plataforma, faturamento, marketing B2B, suporte, gestão de
                  contas e cumprimento de obrigações próprias.
                </p>
              </article>
              <article className={styles.featureCard}>
                <h3>Operador</h3>
                <p>
                  Atuamos predominantemente como operadores quando tratamos dados
                  inseridos pelo Cliente na plataforma para gerir SST, treinamentos,
                  evidências, documentos e rotinas ocupacionais de trabalhadores e
                  terceiros sob responsabilidade da empresa contratante.
                </p>
              </article>
            </div>
            <p className={styles.callout}>
              Para esse segundo cenário, a empresa contratante normalmente é a
              controladora e a SGS presta suporte técnico e operacional conforme contrato
              e instruções válidas do Cliente.
            </p>
          </section>

          <section className={styles.section}>
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

          <section className={styles.section}>
            <h2>3. Finalidades e bases legais</h2>
            <p>
              As bases legais variam conforme o contexto de uso e o papel exercido. A
              tabela abaixo apresenta as hipóteses predominantes na operação padrão da
              plataforma.
            </p>
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
          </section>

          <section className={styles.section}>
            <h2>4. Compartilhamento e cadeia de operadores</h2>
            <p>
              Não comercializamos dados pessoais. O compartilhamento ocorre apenas quando
              necessário para a execução do serviço, para atendimento de obrigação legal
              ou por solicitação do controlador competente.
            </p>
            <ul className={styles.bulletList}>
              <li>
                <strong>Infraestrutura e armazenamento:</strong> provedores de nuvem,
                banco de dados, filas e armazenamento de arquivos utilizados para manter
                a plataforma disponível e resiliente.
              </li>
              <li>
                <strong>Comunicações transacionais:</strong> provedores de e-mail e
                notificações para alertas operacionais, redefinição de senha e mensagens
                essenciais ao serviço.
              </li>
              <li>
                <strong>Suporte e segurança:</strong> ferramentas de monitoramento,
                observabilidade e prevenção a abuso, estritamente vinculadas à operação.
              </li>
              <li>
                <strong>Autoridades públicas e terceiros legitimados:</strong> quando
                exigido por lei, ordem judicial, investigação ou obrigação regulatória.
              </li>
            </ul>
            <p className={styles.callout}>
              Caso a empresa contratante habilite funcionalidades opcionais de IA,
              eventuais integrações adicionais observarão os parâmetros técnicos e
              contratuais específicos daquele recurso.
            </p>
          </section>

          <section className={styles.section}>
            <h2>5. Transferências internacionais</h2>
            <p>
              Alguns provedores tecnológicos utilizados na operação podem tratar dados
              fora do Brasil. Quando isso ocorrer, adotamos medidas contratuais,
              organizacionais e técnicas compatíveis com a LGPD e com as orientações da
              ANPD, buscando garantir um nível adequado de proteção.
            </p>
          </section>

          <section className={styles.section}>
            <h2>6. Retenção, descarte e exportação</h2>
            <p>
              Os dados são mantidos pelo tempo necessário para cumprir a finalidade do
              tratamento, respeitar obrigações legais, preservar evidências de auditoria
              e garantir a continuidade da operação contratada.
            </p>
            <ul className={styles.bulletList}>
              <li>Dados de conta ativa permanecem enquanto houver vínculo contratual ou necessidade operacional.</li>
              <li>Documentos e evidências de SST seguem a política de retenção definida pelo Cliente e a legislação aplicável.</li>
              <li>Logs de auditoria e segurança podem ser mantidos por período superior ao da conta, quando necessários para investigação, defesa ou prestação de contas.</li>
              <li>Ao término do contrato, os dados podem ser exportados pelo Cliente e depois eliminados, anonimizados ou mantidos pelo prazo legal aplicável.</li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2>7. Direitos dos titulares</h2>
            <p>
              Os direitos previstos no art. 18 da LGPD podem ser exercidos contra o
              controlador competente. Quando a SGS atuar como operadora, auxiliaremos o
              Cliente na execução desses pedidos dentro dos limites do contrato e das
              instruções recebidas.
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
              . Para dados sob controle da empresa contratante, o caminho prioritário é o
              administrador ou encarregado indicado pelo seu empregador/organização.
            </p>
          </section>

          <section className={styles.section}>
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
              autoridades competentes, nos termos da legislação e da regulamentação
              aplicável.
            </p>
          </section>

          <section className={styles.section}>
            <h2>9. Cookies e tecnologias estritamente necessárias</h2>
            <p>
              Utilizamos cookies e mecanismos técnicos necessários para autenticação,
              segurança, continuidade de sessão e preferências essenciais da plataforma.
              Não vendemos perfis de navegação nem usamos publicidade comportamental de
              terceiros na área autenticada.
            </p>
          </section>

          <section className={styles.section}>
            <h2>10. Atualizações desta política</h2>
            <p>
              Esta política pode ser revisada para refletir mudanças legais, operacionais
              ou tecnológicas. Alterações relevantes serão comunicadas pelos canais
              adequados, com indicação da nova data de atualização.
            </p>
          </section>

          <section className={styles.section}>
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
          instruções formais do Cliente quando houver tratamento em nome de terceiros.
        </p>
      </div>
    </div>
  );
}
