import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowLeft,
  BadgeCheck,
  BriefcaseBusiness,
  FileLock2,
  Handshake,
  Shield,
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

export default function TermosPage() {
  const lastUpdated = '26 de março de 2026';
  const legal = getPublicLegalConfig();
  const supportChannel =
    legal.supportEmail || 'canal oficial de suporte informado ao administrador da sua organização';
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

        <section className={styles.hero}>
          <div className={styles.heroMain}>
            <span className={styles.heroEyebrow}>
              <Handshake size={14} />
              Relação contratual e governança operacional
            </span>
            <h1 className={styles.heroTitle}>Termos de Uso</h1>
            <p className={styles.heroDescription}>
              Estes termos estabelecem as condições padrão para uso corporativo da
              plataforma SGS. Eles organizam responsabilidades entre a operadora da
              solução, a empresa contratante e os usuários autorizados, com linguagem
              mais compatível com uma operação enterprise.
            </p>
            <div className={styles.heroMeta}>
              <span className={styles.metaPill}>
                <BadgeCheck size={14} />
                Última atualização: {lastUpdated}
              </span>
              <span className={styles.metaPill}>
                <BriefcaseBusiness size={14} />
                SaaS corporativo para SST
              </span>
              <span className={styles.metaPill}>
                <FileLock2 size={14} />
                Complementa contrato comercial e política de privacidade
              </span>
            </div>
          </div>

          <aside className={styles.heroSide}>
            <p className={styles.sideLabel}>Visão executiva</p>
            <h2 className={styles.sideTitle}>Termos pensados para uso empresarial</h2>
            <p className={styles.sideCopy}>
              Este documento estrutura papéis, limites e responsabilidades operacionais,
              sem substituir proposta comercial, pedido, aditivo, DPA ou SLA específico
              eventualmente firmado entre as partes.
            </p>
            <div className={styles.sideList}>
              <div className={styles.sideItem}>
                <span className={styles.sideIcon}>
                  <UsersRound size={18} />
                </span>
                <div>
                  <strong>Cliente</strong>
                  <p>
                    Pessoa jurídica que contrata a plataforma, define administradores,
                    perfis de acesso e finalidades operacionais de uso.
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
                    individuais, respeitando estes termos e as regras internas da
                    organização.
                  </p>
                </div>
              </div>
              <div className={styles.sideItem}>
                <span className={styles.sideIcon}>
                  <Handshake size={18} />
                </span>
                <div>
                  <strong>Canal oficial de suporte</strong>
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
        </section>

        <section className={styles.summaryGrid}>
          <article className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Operadora da solução</p>
            <h2 className={styles.summaryTitle}>{companyName}</h2>
            <p className={styles.summaryText}>
              Responsável pela disponibilização, manutenção evolutiva e operação técnica
              da plataforma SGS, nos limites do contrato aplicável.
            </p>
          </article>
          <article className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Governança do Cliente</p>
            <h2 className={styles.summaryTitle}>Administração de usuários e conteúdo</h2>
            <p className={styles.summaryText}>
              A empresa contratante responde por acessos, papéis internos, conteúdo
              inserido, aprovações e aderência das rotinas ao seu contexto regulatório.
            </p>
          </article>
          <article className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Precedência documental</p>
            <h2 className={styles.summaryTitle}>Contrato específico prevalece</h2>
            <p className={styles.summaryText}>
              Quando houver cláusulas comerciais, SLAs ou anexos específicos assinados,
              esses instrumentos complementam e prevalecem sobre as regras gerais aqui
              descritas.
            </p>
          </article>
        </section>

        {hasMissingLegalInfo ? (
          <section className={styles.warningCard}>
            <strong>
              <Shield size={16} />
              Identificação institucional incompleta
            </strong>
            <p>
              Antes de publicação final, revise os dados públicos da operação para garantir
              consistência entre estes termos, a política de privacidade, o canal de
              suporte e o contrato
              comercial.
            </p>
          </section>
        ) : null}

        <div className={styles.content}>
          <section className={styles.section}>
            <h2>1. Objeto e aceitação</h2>
            <p>
              Ao acessar ou utilizar a plataforma SGS, a empresa contratante
              (&quot;Cliente&quot;) e seus usuários autorizados concordam com estes termos.
              O uso continuado da solução após atualizações relevantes também representa
              aceitação das condições vigentes.
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
                  A SGS pode atualizar fluxos, componentes e integrações para melhorias de
                  segurança, desempenho, confiabilidade e experiência de uso.
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
              A plataforma, sua marca, arquitetura, documentação, interfaces e elementos de
              software são de titularidade da SGS ou de seus licenciantes. O Cliente
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

        <div className={styles.footerNav}>
          <Link href="/login">Login</Link>
          <Link href="/privacidade">Política de Privacidade</Link>
        </div>

        <p className={styles.footnote}>
          Estes termos foram estruturados para dar mais clareza empresarial ao uso do SGS,
          mas não substituem contratos comerciais, ordens de serviço, anexos de tratamento
          de dados ou SLAs firmados especificamente entre as partes.
        </p>
      </div>
    </div>
  );
}
