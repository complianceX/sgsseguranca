import type { Metadata } from 'next';
import Link from 'next/link';
import { getPublicLegalConfig } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Política de Privacidade | SGS',
  description: 'Política de privacidade e tratamento de dados pessoais do SGS — Sistema de Gestão de Segurança.',
};

export const dynamic = 'force-dynamic';

export default function PrivacidadePage() {
  const lastUpdated = '25 de março de 2026';
  const legal = getPublicLegalConfig();
  const operatorName =
    legal.companyName || 'a empresa operadora identificada no contrato vigente';
  const operatorDocument = legal.companyDocument
    ? `, inscrita no CPF/CNPJ ${legal.companyDocument}`
    : '';
  const operatorAddress =
    legal.companyAddress ||
    'com sede informada no instrumento contratual aplicavel';
  const privacyChannel =
    legal.privacyEmail || 'canal de privacidade informado ao administrador da sua organizacao';
  const privacyHref = legal.privacyEmail ? `mailto:${legal.privacyEmail}` : null;
  const dpoLabel = legal.dpoName || 'canal LGPD do controlador';
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
            Política de Privacidade
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
                configure os dados finais do controlador para publicar a politica com razao social,
                CPF/CNPJ, endereco, canal LGPD e foro contratual corretos.
              </p>
            </section>
          ) : null}

          <section>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.75rem' }}>1. Controlador dos Dados</h2>
            <p>
              O SGS (Sistema de Gestao de Seguranca) e operado por <strong>{operatorName}{operatorDocument}</strong>,
              com sede em <strong>{operatorAddress}</strong>. Para fins da Lei Geral de Protecao de Dados (LGPD
              — Lei nº 13.709/2018), esta entidade atua como <strong>controladora</strong> dos dados pessoais tratados
              na plataforma.
            </p>
            <p style={{ marginTop: '0.75rem' }}>
              Encarregado de protecao de dados (DPO): <strong>{dpoLabel}</strong> —{' '}
              {privacyHref ? (
                <a href={privacyHref} style={{ color: 'var(--brand)' }}>{privacyChannel}</a>
              ) : (
                <span>{privacyChannel}</span>
              )}
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.75rem' }}>2. Dados Coletados</h2>
            <p>Coletamos os dados estritamente necessários para a prestação do serviço:</p>
            <ul style={{ paddingLeft: '1.25rem', marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <li><strong>Identificação:</strong> nome completo, CPF, e-mail, cargo/função.</li>
              <li><strong>Autenticação:</strong> hash de senha (argon2id), tokens JWT em cookie HttpOnly.</li>
              <li><strong>Dados de uso:</strong> logs de acesso, ações realizadas (trilha de auditoria).</li>
              <li><strong>Dados SST:</strong> documentos de segurança do trabalho inseridos pela sua empresa (APRs, PTAs, checklists, CATs, treinamentos, exames médicos).</li>
              <li><strong>Dispositivo:</strong> endereço IP, User-Agent (para detecção de sessões suspeitas).</li>
            </ul>
          </section>

          <section>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.75rem' }}>3. Finalidades e Base Legal</h2>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ background: 'var(--bg-subtle)', textAlign: 'left' }}>
                  <th style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border)' }}>Finalidade</th>
                  <th style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border)' }}>Base Legal (LGPD)</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Autenticação e controle de acesso', 'Art. 7º, II — execução de contrato'],
                  ['Gestão de documentos SST', 'Art. 7º, II — execução de contrato'],
                  ['Cumprimento de obrigações legais NR', 'Art. 7º, II — obrigação legal'],
                  ['Trilha de auditoria e segurança', 'Art. 7º, IX — legítimo interesse'],
                  ['Envio de alertas e notificações', 'Art. 7º, II — execução de contrato'],
                  ['Melhoria do serviço (analytics internos)', 'Art. 7º, IX — legítimo interesse'],
                ].map(([finalidade, base]) => (
                  <tr key={finalidade} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.5rem 0.75rem' }}>{finalidade}</td>
                    <td style={{ padding: '0.5rem 0.75rem', color: 'var(--ds-color-text-secondary)' }}>{base}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.75rem' }}>4. Compartilhamento de Dados</h2>
            <p>Seus dados <strong>não são vendidos</strong>. Compartilhamos apenas com:</p>
            <ul style={{ paddingLeft: '1.25rem', marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <li><strong>Provedores de infraestrutura:</strong> Railway (hospedagem), AWS S3 (armazenamento de arquivos) — localizados fora do Brasil, com cláusulas contratuais adequadas.</li>
              <li><strong>Serviço de e-mail:</strong> Resend / Brevo — apenas para disparo de notificações operacionais.</li>
              <li><strong>Autoridades públicas:</strong> quando exigido por lei ou ordem judicial.</li>
            </ul>
            <p style={{ marginTop: '0.75rem' }}>
              <strong>Inteligência Artificial (Sophie):</strong> quando habilitada pela sua organização, dados relevantes
              podem ser processados pela API da OpenAI. Esta funcionalidade requer aceitação de termos específicos e só
              é ativada após formalização de contrato de processamento de dados (DPA) com a OpenAI.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.75rem' }}>5. Retenção de Dados</h2>
            <ul style={{ paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <li>Dados de conta ativa: enquanto o contrato estiver vigente.</li>
              <li>Documentos SST: mínimo de 5 anos (conforme NR-1 e legislação trabalhista).</li>
              <li>Logs de auditoria (trilha forense): 7 anos.</li>
              <li>Após encerramento do contrato: exclusão ou anonimização em até 90 dias, salvo obrigação legal.</li>
            </ul>
          </section>

          <section>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.75rem' }}>6. Seus Direitos (LGPD Art. 18)</h2>
            <p>Você tem direito a:</p>
            <ul style={{ paddingLeft: '1.25rem', marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <li><strong>Confirmação e acesso</strong> aos dados que possuímos sobre você.</li>
              <li><strong>Portabilidade</strong> dos seus dados em formato estruturado (disponível via <em>Configurações → Exportar meus dados</em>).</li>
              <li><strong>Correção</strong> de dados inexatos ou desatualizados.</li>
              <li><strong>Eliminação</strong> dos dados tratados com base em consentimento.</li>
              <li><strong>Revogação do consentimento</strong> para funcionalidades opcionais (ex.: IA).</li>
              <li><strong>Oposição</strong> ao tratamento baseado em legítimo interesse.</li>
            </ul>
            <p style={{ marginTop: '0.75rem' }}>
              Para exercer seus direitos, contate:{' '}
              {privacyHref ? (
                <a href={privacyHref} style={{ color: 'var(--brand)' }}>{privacyChannel}</a>
              ) : (
                <span>{privacyChannel}</span>
              )}
              {' '}— resposta em ate 15 dias corridos.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.75rem' }}>7. Segurança</h2>
            <p>
              Adotamos as seguintes medidas técnicas e organizacionais: criptografia em trânsito (TLS 1.2+),
              hash de senhas com argon2id (fator de custo elevado), autenticação via tokens JWT de curta duração
              (15 min) em cookies HttpOnly/Secure, Row-Level Security no banco de dados para isolamento
              multi-tenant, e trilha de auditoria imutável com encadeamento de hashes.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.75rem' }}>8. Cookies</h2>
            <p>
              Utilizamos apenas cookies estritamente necessários para a sessão autenticada
              (token de acesso e refresh token em cookies HttpOnly). Não utilizamos cookies de rastreamento
              de terceiros ou publicidade.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.75rem' }}>9. Alterações nesta Política</h2>
            <p>
              Reservamo-nos o direito de atualizar esta política periodicamente. Alterações relevantes serão
              comunicadas via e-mail e/ou notificação na plataforma com antecedência mínima de 30 dias.
              A data da última atualização está sempre indicada no topo desta página.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.75rem' }}>10. Contato e ANPD</h2>
            <p>
              Em caso de dúvidas ou para exercer seus direitos:{' '}
              {privacyHref ? (
                <a href={privacyHref} style={{ color: 'var(--brand)' }}>{privacyChannel}</a>
              ) : (
                <span>{privacyChannel}</span>
              )}
            </p>
            <p style={{ marginTop: '0.5rem' }}>
              Você também pode peticionar à Autoridade Nacional de Proteção de Dados (ANPD):{' '}
              <a href="https://www.gov.br/anpd" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--brand)' }}>
                www.gov.br/anpd
              </a>
            </p>
          </section>

        </div>

        {/* Footer nav */}
        <div style={{ marginTop: '3rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '1.5rem', fontSize: '0.875rem' }}>
          <Link href="/login" style={{ color: 'var(--ds-color-text-secondary)', textDecoration: 'none' }}>Login</Link>
          <Link href="/termos" style={{ color: 'var(--ds-color-text-secondary)', textDecoration: 'none' }}>Termos de Uso</Link>
        </div>

      </div>
    </div>
  );
}
