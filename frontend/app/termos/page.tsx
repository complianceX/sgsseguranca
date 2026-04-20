import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowLeft,
  BadgeCheck,
  BriefcaseBusiness,
  Building2,
  FileLock2,
  Handshake,
  LockKeyhole,
  Shield,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from 'lucide-react';
import { getPublicLegalConfig } from '@/lib/legal';
import styles from '../legal-pages.module.css';

export const metadata: Metadata = {
  title: 'Termos de Uso | SGS',
  description:
    'Termos e condições de uso da plataforma SGS - Sistema de Gestão de Segurança.',
};

export const dynamic = 'force-dynamic';

const useRestrictions = [
  'Inserir dados falsos, ilícitos ou sem autorização adequada.',
  'Tentar acessar dados de outras empresas, quebrar isolamento multiempresa ou contornar permissões.',
  'Realizar scraping, engenharia reversa, automação abusiva, testes intrusivos ou exploração não autorizada.',
  'Compartilhar credenciais, usar contas de terceiros ou burlar controles de autenticação e trilha de auditoria.',
  'Utilizar a plataforma em desacordo com a legislação, políticas internas do Cliente ou finalidades contratuais.',
];

const customerDuties = [
  'Definir administradores autorizados, perfis, fluxos de aprovação e usuários habilitados.',
  'Inserir dados lícitos, corretos, atualizados e compatíveis com a finalidade do tratamento.',
  'Observar as Normas Regulamentadoras, regras internas e exigências legais aplicáveis à sua operação.',
  'Revisar documentos, relatórios e saídas operacionais antes de uso oficial, especialmente quando exigirem validação técnica ou assinatura profissional.',
];

const executivePoints = [
  {
    icon: Building2,
    label: 'Operação corporativa',
    title: 'Estrutura B2B com governança clara',
    text: 'Papéis, acessos, limites e responsabilidades definidos para uso empresarial.',
  },
  {
    icon: ShieldCheck,
    label: 'Segurança e rastreabilidade',
    title: 'Credenciais individuais e trilha de auditoria',
    text: 'Cada ação relevante pode ser vinculada ao usuário e ao contexto de uso.',
  },
  {
    icon: FileLock2,
    label: 'Base documental',
    title: 'Contrato específico prevalece',
    text: 'SLAs, propostas, anexos e instrumentos assinados complementam estes termos.',
  },
];

const platformPillars = [
  {
    title: 'Ambiente multiempresa',
    text: 'Segregação lógica, políticas de acesso e estrutura pronta para operação de múltiplas empresas.',
  },
  {
    title: 'Uso orientado por governança',
    text: 'O SGS apoia o processo, mas não substitui validação técnica, decisão jurídica ou responsabilidade ocupacional.',
  },
  {
    title: 'Serviço evolutivo',
    text: 'A plataforma pode receber melhorias visuais, técnicas e operacionais para elevar segurança e performance.',
  },
];

const clauseHighlights = [
  'Objeto e aceitação',
  'Contas, credenciais e elegibilidade',
  'Responsabilidades do Cliente',
  'Uso permitido e condutas vedadas',
  'Privacidade e dados pessoais',
  'Disponibilidade, suporte e evolução',
  'IA como apoio, não substituição técnica',
  'Propriedade intelectual e confidencialidade',
];

export default function TermosPage() {
  const lastUpdated = '26 de março de 2026';
  const legal = getPublicLegalConfig();

  const supportChannel =
    legal.supportEmail ||
    'canal oficial de suporte informado ao administrador da sua organização';
  const supportHref = legal.supportEmail ? `mailto:${legal.supportEmail}` : null;
  const forumLabel =
    legal.forumCityState || 'foro definido no contrato comercial firmado entre as partes';
  const companyName =
    legal.companyName || 'a operadora identificada na documentação contratual';
  const hasMissingLegalInfo = legal.missingRequiredFields.length > 0;

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <Link href="/login" className={styles.backLink}>
          <ArrowLeft size={16} />
          Voltar ao login
        </Link>

        <section className={styles.termsHero}>
          <div className={styles.termsHeroGlow} aria-hidden="true" />
          <div className={styles.termsHeroGlowSecondary} aria-hidden="true" />
          <div className={styles.termsHeroGrid}>
            <div className={styles.termsHeroMain}>
              <span className={styles.termsHeroEyebrow}>
                <Handshake size={14} />
                Regras de uso, governança e responsabilidade operacional
              </span>

              <h1 className={styles.termsHeroTitle}>
                Termos de Uso com presença visual de
                <span className={styles.termsHeroAccent}> plataforma enterprise</span>
              </h1>

              <p className={styles.termsHeroDescription}>
                Estes termos organizam a relação entre a operadora do SGS, a empresa
                contratante e os usuários autorizados. O objetivo é dar clareza
                contratual, segurança operacional e mais confiança institucional ao uso
                da plataforma.
              </p>

              <div className={styles.termsHeroMeta}>
                <span className={styles.metaPill}>
                  <BadgeCheck size={14} />
                  Última atualização: {lastUpdated}
                </span>
                <span className={styles.metaPill}>
                  <BriefcaseBusiness size={14} />
                  SaaS corporativo para SST
                </span>
                <span className={styles.metaPill}>
                  <LockKeyhole size={14} />
                  Regras, limites e proteção do ambiente
                </span>
              </div>

              <div className={styles.termsTrustStrip}>
                <div className={styles.termsTrustItem}>
                  <strong>Uso B2B</strong>
                  <span>Foco em operação empresarial</span>
                </div>
                <div className={styles.termsTrustItem}>
                  <strong>Auditoria</strong>
                  <span>Rastreabilidade por usuário</span>
                </div>
                <div className={styles.termsTrustItem}>
                  <strong>Contrato</strong>
                  <span>Instrumento específico prevalece</span>
                </div>
                <div className={styles.termsTrustItem}>
                  <strong>Suporte</strong>
                  <span>Canal oficial centralizado</span>
                </div>
              </div>
            </div>

            <aside className={styles.termsHeroPanel}>
              <div className={styles.termsPanelTop}>
                <span className={styles.termsPanelBadge}>
                  <Sparkles size={14} />
                  Visão executiva
                </span>
                <h2 className={styles.termsPanelTitle}>
                  Termos desenhados para transmitir solidez
                </h2>
                <p className={styles.termsPanelText}>
                  Este documento não substitui proposta comercial, pedido, aditivo, DPA
                  ou SLA específico. Ele cria a base geral de governança para uso da
                  plataforma em contexto profissional.
                </p>
              </div>

              <div className={styles.termsMiniList}>
                <div className={styles.sideItem}>
                  <span className={styles.sideIcon}>
                    <UsersRound size={18} />
                  </span>
                  <div>
                    <strong>Cliente</strong>
                    <p>
                      Pessoa jurídica que contrata a solução e define administradores,
                      perfis, fluxo de uso e finalidade operacional.
                    </p>
                  </div>
                </div>

                <div className={styles.sideItem}>
                  <span className={styles.sideIcon}>
                    <Shield size={18} />
                  </span>
                  <div>
                    <strong>Usuário autorizado</strong>
                    <p>
                      Pessoa vinculada ao Cliente que acessa o SGS com credenciais
                      individuais e responsabilidade rastreável.
                    </p>
                  </div>
                </div>

                <div className={styles.sideItem}>
                  <span className={styles.sideIcon}>
                    <Handshake size={18} />
                  </span>
                  <div>
                    <strong>Canal oficial</strong>
                    <p>
                      {supportHref ? (
                        <a href={supportHref} className={styles.inlineLink}>
                          {supportChannel}
                        </a>
                      ) : (
                        supportChannel
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </section>

        <section className={styles.executiveGrid}>
          {executivePoints.map(({ icon: Icon, label, title, text }) => (
            <article key={title} className={styles.executiveCard}>
              <span className={styles.executiveIcon}>
                <Icon size={18} />
              </span>
              <p className={styles.executiveLabel}>{label}</p>
              <h2 className={styles.executiveTitle}>{title}</h2>
              <p className={styles.executiveText}>{text}</p>
            </article>
          ))}
        </section>

        <section className={styles.impactBand}>
          <div className={styles.impactBandMain}>
            <p className={styles.summaryLabel}>Leitura rápida</p>
            <h2 className={styles.impactBandTitle}>Os Termos em menos de 30 segundos</h2>
            <p className={styles.summaryText}>
              O SGS fornece uma base contratual para uso empresarial da plataforma. O
              Cliente administra usuários, responde pelo conteúdo e valida tecnicamente
              suas operações. A SGS responde pela operação técnica da solução, dentro dos
              limites do contrato aplicável.
            </p>
          </div>

          <div className={styles.glanceGrid}>
            {platformPillars.map((item) => (
              <article key={item.title} className={styles.glanceCard}>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </section>

        {hasMissingLegalInfo ? (
          <section className={styles.warningCard}>
            <strong>
              <Shield size={16} />
              Identificação institucional incompleta
            </strong>
            <p>
              Antes da publicação final, revise os dados públicos da operação para manter
              consistência entre estes termos, a política de privacidade, o canal de
              suporte e o contrato comercial.
            </p>
          </section>
        ) : null}

        <section className={styles.clauseOverview}>
          <div className={styles.clauseOverviewHeader}>
            <p className={styles.summaryLabel}>Mapa do documento</p>
            <h2 className={styles.summaryTitle}>Principais frentes cobertas nestes termos</h2>
          </div>

          <div className={styles.clauseGrid}>
            {clauseHighlights.map((item, index) => (
              <div key={item} className={styles.clauseCard}>
                <span className={styles.clauseNumber}>
                  {(index + 1).toString().padStart(2, '0')}
                </span>
                <p>{item}</p>
              </div>
            ))}
          </div>
        </section>

        <div className={styles.content}>
          <section className={styles.section}>
            <h2>1. Objeto e aceitação</h2>
            <p>
              Ao acessar ou utilizar a plataforma SGS, a empresa contratante
              (&quot;Cliente&quot;) e seus usuários autorizados concordam com estes
              termos. O uso continuado da solução após atualizações relevantes também
              representa aceitação das condições vigentes.
            </p>
            <p>
              Estes termos disciplinam o uso padrão do serviço e devem ser interpretados
              em conjunto com a Política de Privacidade, proposta comercial, contratos,
              anexos de proteção de dados e demais instrumentos formalmente celebrados.
            </p>
          </section>

          <section className={styles.section}>
            <h2>2. Descrição da plataforma</h2>
            <p>
              O SGS é uma plataforma SaaS para gestão corporativa de Segurança e Saúde no
              Trabalho, com recursos de cadastro, evidências, documentos, treinamentos,
              alertas, relatórios, auditoria e governança operacional.
            </p>

            <div className={styles.featureGrid}>
              <article className={styles.featureCard}>
                <h3>Ambiente multiempresa</h3>
                <p>
                  Cada Cliente opera em contexto isolado, com políticas de acesso,
                  segregação lógica e rastreabilidade compatíveis com operação B2B.
                </p>
              </article>

              <article className={styles.featureCard}>
                <h3>Serviço evolutivo</h3>
                <p>
                  A SGS pode atualizar fluxos, componentes e integrações para melhorias
                  de segurança, desempenho, confiabilidade e experiência de uso.
                </p>
              </article>
            </div>
          </section>

          <section className={styles.section}>
            <h2>3. Elegibilidade, contas e credenciais</h2>
            <p>
              O acesso é concedido pelo Cliente aos usuários expressamente autorizados. As
              credenciais são pessoais, intransferíveis e vinculadas à trilha de auditoria
              da plataforma.
            </p>
            <ul className={styles.bulletList}>
              <li>Os administradores do Cliente respondem pela criação, revisão e revogação de acessos.</li>
              <li>O usuário deve manter sigilo sobre senha, tokens, segundo fator e demais meios de autenticação.</li>
              <li>Qualquer indício de uso indevido, comprometimento de conta ou acesso não autorizado deve ser comunicado imediatamente.</li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2>4. Responsabilidades do Cliente</h2>
            <p>
              O Cliente é responsável pela finalidade de uso da plataforma e pelo conteúdo
              operacional por ele inserido, administrado ou exportado.
            </p>
            <ul className={styles.bulletList}>
              {customerDuties.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className={styles.callout}>
              O SGS é ferramenta de apoio operacional e governança. A validação técnica,
              jurídica e ocupacional dos atos praticados pelo Cliente permanece sob
              responsabilidade da organização e de seus profissionais habilitados.
            </p>
          </section>

          <section className={styles.section}>
            <h2>5. Uso permitido e condutas vedadas</h2>
            <p>
              A plataforma deve ser utilizada apenas para finalidades legítimas,
              compatíveis com a contratação e com a legislação aplicável.
            </p>
            <ul className={styles.bulletList}>
              {useRestrictions.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className={styles.section}>
            <h2>6. Privacidade, segurança e dados pessoais</h2>
            <p>
              O tratamento de dados pessoais no SGS segue a Política de Privacidade e o
              arranjo contratual aplicável entre as partes. Dependendo da operação, a SGS
              poderá atuar como controladora ou operadora, conforme a natureza do
              tratamento realizado.
            </p>
            <p>
              O Cliente permanece responsável por definir base legal, instruções de
              tratamento, retenção e governança dos dados que insere na plataforma, quando
              atuar como controlador.
            </p>
            <p className={styles.callout}>
              Para mais detalhes, consulte a{' '}
              <Link href="/privacidade" className={styles.inlineLink}>
                Política de Privacidade
              </Link>
              .
            </p>
          </section>

          <section className={styles.section}>
            <h2>7. Disponibilidade, suporte e evolução do serviço</h2>
            <p>
              Empreendemos esforços comercialmente razoáveis para manter a plataforma
              disponível, segura e com desempenho adequado. Janelas de manutenção,
              atualizações de segurança e mudanças técnicas podem ocorrer para preservar a
              continuidade do serviço.
            </p>
            <p>
              Salvo estipulação específica em SLA assinado, não há garantia de
              disponibilidade absolutamente ininterrupta. Eventos de terceiros, falhas de
              conectividade, força maior ou dependências externas podem afetar a
              disponibilidade sem caracterizar inadimplemento automático.
            </p>
          </section>

          <section className={styles.section}>
            <h2>8. Funcionalidades opcionais de IA</h2>
            <p>
              Recursos de IA, quando disponibilizados e formalmente habilitados para o
              Cliente, terão caráter auxiliar. Eles não substituem validação técnica,
              parecer profissional, decisão ocupacional ou responsabilidade regulatória da
              organização contratante.
            </p>
            <p>
              O Cliente responde pela revisão e pela decisão final sobre qualquer conteúdo
              gerado, resumido, sugerido ou classificado por ferramentas de IA.
            </p>
          </section>

          <section className={styles.section}>
            <h2>9. Propriedade intelectual e licença de uso</h2>
            <p>
              A plataforma, sua marca, arquitetura, documentação, interfaces e elementos
              de software são de titularidade da SGS ou de seus licenciantes. O Cliente
              recebe licença limitada, não exclusiva, revogável e intransferível para uso
              da solução durante a vigência contratual.
            </p>
            <p>
              Os dados e documentos inseridos pelo Cliente permanecem de sua titularidade
              ou da titularidade de quem legitimamente os detenha.
            </p>
          </section>

          <section className={styles.section}>
            <h2>10. Confidencialidade e integridade operacional</h2>
            <p>
              Informações técnicas, comerciais, documentos internos, relatórios e dados
              acessados em razão da relação contratual devem ser tratados com
              confidencialidade, observado o nível de sigilo aplicável a cada caso.
            </p>
            <p>
              O Cliente e seus usuários concordam em preservar a integridade do ambiente e
              não praticar atos que comprometam a segurança, estabilidade ou reputação da
              plataforma.
            </p>
          </section>

          <section className={styles.section}>
            <h2>11. Suspensão, encerramento e exportação</h2>
            <p>
              A SGS poderá suspender ou restringir acessos em caso de descumprimento
              material destes termos, risco relevante de segurança, uso abusivo ou
              determinação legal. Sempre que viável, a medida será acompanhada da devida
              comunicação ao Cliente.
            </p>
            <p>
              No encerramento da relação contratual, a exportação e a retenção dos dados
              seguirão o instrumento comercial e a Política de Privacidade, observadas as
              obrigações legais e regulatórias aplicáveis.
            </p>
          </section>

          <section className={styles.section}>
            <h2>12. Limitação de responsabilidade</h2>
            <p>
              Na extensão permitida pela legislação aplicável, a SGS não responde por
              danos decorrentes de uso inadequado da plataforma, inserção de dados
              incorretos pelo Cliente, decisões operacionais tomadas sem validação
              técnica, indisponibilidades causadas por terceiros ou eventos fora do
              controle razoável da operadora.
            </p>
            <p>
              Eventuais limites específicos de responsabilidade, multas, créditos de
              serviço e SLAs serão aqueles previstos no contrato comercial ou aditivo
              firmado entre as partes.
            </p>
          </section>

          <section className={styles.section}>
            <h2>13. Lei aplicável e foro</h2>
            <p>
              Estes termos são regidos pelas leis da República Federativa do Brasil. Fica
              eleito o foro da comarca de <strong>{forumLabel}</strong> para dirimir
              controvérsias oriundas deste instrumento, sem prejuízo de eventual foro
              diverso expressamente previsto em contrato específico entre as partes.
            </p>
          </section>

          <section className={styles.section}>
            <h2>14. Contato e suporte</h2>
            <p>
              Dúvidas contratuais, operacionais ou solicitações de suporte podem ser
              encaminhadas para{' '}
              {supportHref ? (
                <a href={supportHref} className={styles.inlineLink}>
                  {supportChannel}
                </a>
              ) : (
                supportChannel
              )}
              .
            </p>
          </section>
        </div>

        <section className={styles.ctaBand}>
          <div>
            <p className={styles.summaryLabel}>Base jurídica do produto</p>
            <h2 className={styles.ctaTitle}>Clareza contratual também comunica valor</h2>
            <p className={styles.ctaText}>
              Uma página de Termos forte transmite maturidade, segurança e seriedade para
              clientes corporativos, auditorias e processos comerciais.
            </p>
          </div>

          <div className={styles.ctaActions}>
            <Link href="/privacidade" className={styles.ctaPrimary}>
              Ver Política de Privacidade
            </Link>
            <Link href="/login" className={styles.ctaSecondary}>
              Ir para o login
            </Link>
          </div>
        </section>

        <div className={styles.footerNav}>
          <Link href="/login">Login</Link>
          <Link href="/privacidade">Política de Privacidade</Link>
        </div>

        <p className={styles.footnote}>
          Estes termos foram estruturados para dar mais clareza empresarial ao uso do
          SGS, mas não substituem contratos comerciais, ordens de serviço, anexos de
          tratamento de dados ou SLAs firmados especificamente entre as partes.
        </p>
      </div>
    </div>
  );
}