const preferredMajor = 20;
const minimumMajor = 20;
const version = process.versions?.node || '';
const match = /^(\d+)\./.exec(version);
const major = match ? Number(match[1]) : NaN;

if (!Number.isFinite(major) || major < minimumMajor) {
  console.error(
    [
      `Node.js ${minimumMajor}+ é obrigatório para este projeto.`,
      `Versão atual: ${version}`,
      '',
      `Instale/ative o Node ${preferredMajor} LTS ou superior e rode novamente:`,
      `  - nvm use ${preferredMajor} (se você usa nvm)`,
      `  - ou instale o Node ${preferredMajor} LTS do site oficial`,
    ].join('\n'),
  );
  process.exit(1);
}

if (major !== preferredMajor) {
  console.warn(
    [
      `Aviso: versão recomendada para o projeto é Node.js ${preferredMajor}.x.`,
      `Versão atual detectada: ${version}.`,
      'Se ocorrer erro de build/dev, troque para Node 20 LTS.',
    ].join('\n'),
  );
}
