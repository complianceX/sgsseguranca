import type { Metadata } from 'next';
import Link from 'next/link';
import { getPublicLegalConfig } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Termos de Uso | SGS',
  description: 'Termos e condições de uso da plataforma SGS — Sistema de Gestão de Segurança.',
};

export const dynamic = 'force-dynamic';

export default function TermosPage() {
  const lastUpdated = '25 de março de 2026';
  const legal = getPublicLegalConfig();
  const contactChannel =
    legal.contactEmail || 'canal comercial informado ao administrador da sua organizacao';
  const contactHref = legal.contactEmail ? `mailto:${legal.contactEmail}` : null;
  const forumLabel =
    legal.forumCityState || 'foro definido no contrato comercial firmado entre as partes';
  const hasMissingLegalInfo = legal.missingRequiredFields.length > 0;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-app)', color: 'var(--text-primary)' }}>
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '3rem 1.5rem 4rem' }}>

        {/* Header */}
        <div style={{ marginBottom: '2.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1.5rem' }}>
          <Link
            href="/login"
            style={{ fontSize: '0.85rem', color: 'var(--ds-color-text-secondary)', textDecoration: 'none', display: 'inline-block', marginBottom: '1.5rem' }}
          >
            ← Voltar ao login
          </Link>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.5rem' }}>
            Termos de Uso
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--ds-color-text-secondary)' }}>
            SGS — Sistema de Gestão de Segurança &nbsp;·&nbsp; Última atualização: {lastUpdated}
          </p>
        </div>

        {/* Content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', lineHeight: 1.7 }}>

          {hasMissingLegalInfo ? (
            <section
              style={{
                border: '1px solid #f59e0b',
                background: '#fff7ed',
                color: '#9a3412',
                borderRadius: 12,
                padding: '1rem 1.25rem',
              }}
            >
              <strong>Revisao juridica pendente.</strong>
              <p style={{ marginTop: '0.5rem' }}>
                Esta implantacao ainda usa texto institucional de contingencia. Antes do go-live,
                configure os dados finais do fornecedor/controlador para publicar termos com
                identificacao societaria, canais de contato e foro corretos.
              </p>
            </section>
          ) : null}

          <section>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.75rem' }}>1. Aceitação</h2>
            <p>
              Ao acessar ou utilizar a plataforma SGS, você (usuário final) e a organização contratante
              (doravante &quot;Cliente&quot;) concordam com estes Termos de Uso. O uso continuado da plataforma
              constitui aceitação de quaisquer atualizações. Caso não concorde com os termos, interrompa
              o uso imediatamente.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.75rem' }}>2. Descrição do Serviço</h2>
            <p>
              O SGS é um sistema SaaS (<em>Software as a Service</em>) de gestão de Segurança e Saúde no Trabalho,
              oferecendo funcionalidades como controle de APRs, PTAs, checklists, DDS, treinamentos,
              exames médicos, não conformidades, relatórios e gestão documental, em conformidade com
              as Normas Regulamentadoras do MTE.
            </p>
            <p style={{ marginTop: '0.75rem' }}>
              O serviço é oferecido no modelo multi-tenant: cada organização contratante opera em
              ambiente isolado, com dados segregados por política de Row-Level Security no banco de dados.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.75rem' }}>3. Cadastro e Contas</h2>
            <ul style={{ paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <li>O acesso é concedido pela organização contratante, que é responsável por gerenciar perfis e permissões.</li>
              <li>Você é responsável por manter a confidencialidade das suas credenciais.</li>
              <li>Atividades suspeitas devem ser reportadas imediatamente ao administrador da sua organização.</li>
              <li>Contas individuais são intransferíveis.</li>
            </ul>
          </section>

          <section>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.75rem' }}>4. Uso Permitido</h2>
            <p>Você pode utilizar a plataforma exclusivamente para fins legítimos de gestão de SST. É vedado:</p>
            <ul style={{ paddingLeft: '1.25rem', marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <li>Inserir dados falsos, fraudulentos ou de terceiros sem autorização.</li>
              <li>Tentar acessar dados de outras organizações ou contornar controles de acesso.</li>
              <li>Realizar engenharia reversa, scraping automatizado ou uso da API além do permitido.</li>
              <li>Utilizar a plataforma para fins ilegais ou em violação a normas trabalhistas.</li>
              <li>Compartilhar credenciais de acesso com terceiros não autorizados.</li>
            </ul>
          </section>

          <section>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.75rem' }}>5. Responsabilidade pelo Conteúdo</h2>
            <p>
              O Cliente e seus usuários são integralmente responsáveis pela veracidade, precisão e
              completude dos dados inseridos na plataforma. O SGS não valida a conformidade técnica
              dos documentos SST com as NRs — esta responsabilidade é do SESMT ou profissional
              habilitado da organização.
            </p>
            <p style={{ marginTop: '0.75rem' }}>
              Documentos gerados pela plataforma (PDFs, relatórios) devem ser revisados por
              profissional qualificado antes de uso oficial ou entrega a órgãos fiscalizadores.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.75rem' }}>6. Inteligência Artificial (Sophie)</h2>
            <p>
              A funcionalidade de IA (Sophie) é <strong>opcional</strong> e desativada por padrão.
              Quando habilitada pela organização contratante:
            </p>
            <ul style={{ paddingLeft: '1.25rem', marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <li>Respostas geradas por IA têm caráter <strong>informativo e auxiliar</strong>, não substituindo parecer técnico especializado.</li>
              <li>O Cliente assume responsabilidade pelas decisões tomadas com base nas sugestões da IA.</li>
              <li>Dados de SST podem ser processados pela API da OpenAI; consulte nossa <Link href="/privacidade" style={{ color: 'var(--brand)' }}>Política de Privacidade</Link> para detalhes.</li>
              <li>A funcionalidade só é ativada após formalização de Data Processing Agreement (DPA) com a OpenAI.</li>
            </ul>
          </section>

          <section>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.75rem' }}>7. Disponibilidade e SLA</h2>
            <p>
              Empreendemos esforços razoáveis para manter a plataforma disponível 24/7, mas não
              garantimos disponibilidade ininterrupta. Manutenções programadas serão comunicadas
              com antecedência mínima de 24 horas. Não nos responsabilizamos por perdas decorrentes
              de indisponibilidade fora do nosso controle (falhas de provedor, força maior).
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.75rem' }}>8. Propriedade Intelectual</h2>
            <p>
              Todo o código-fonte, design, marca SGS e documentação são de propriedade exclusiva
              do fornecedor. Os dados inseridos pelo Cliente permanecem de propriedade do Cliente.
              Concedemos ao Cliente licença limitada, não exclusiva e intransferível de uso da
              plataforma durante a vigência contratual.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.75rem' }}>9. Limitação de Responsabilidade</h2>
            <p>
              Na máxima extensão permitida pela lei, nossa responsabilidade total por quaisquer
              danos diretos está limitada ao valor pago pelo Cliente nos últimos 3 meses de serviço.
              Não nos responsabilizamos por danos indiretos, lucros cessantes, perda de dados por
              falha do usuário, ou penalidades aplicadas por órgãos fiscalizadores decorrentes
              de documentação SST incorreta ou incompleta.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.75rem' }}>10. Vigência e Rescisão</h2>
            <p>
              Estes termos vigoram enquanto o contrato de prestação de serviços estiver ativo.
              O fornecedor poderá suspender o acesso imediatamente em caso de violação grave
              destes termos. Após encerramento, os dados do Cliente serão mantidos por 90 dias
              para download e então excluídos, salvo obrigação legal de retenção.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.75rem' }}>11. Lei Aplicável e Foro</h2>
            <p>
              Estes termos são regidos pelas leis da República Federativa do Brasil. Fica eleito
              o foro da Comarca de <strong>{forumLabel}</strong> para dirimir quaisquer
              controvérsias decorrentes deste instrumento, com renúncia a qualquer outro,
              por mais privilegiado que seja.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.75rem' }}>12. Contato</h2>
            <p>
              Dúvidas sobre estes termos:{' '}
              {contactHref ? (
                <a href={contactHref} style={{ color: 'var(--brand)' }}>{contactChannel}</a>
              ) : (
                <span>{contactChannel}</span>
              )}
            </p>
          </section>

        </div>

        {/* Footer nav */}
        <div style={{ marginTop: '3rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '1.5rem', fontSize: '0.875rem' }}>
          <Link href="/login" style={{ color: 'var(--ds-color-text-secondary)', textDecoration: 'none' }}>Login</Link>
          <Link href="/privacidade" style={{ color: 'var(--ds-color-text-secondary)', textDecoration: 'none' }}>Política de Privacidade</Link>
        </div>

      </div>
    </div>
  );
}
