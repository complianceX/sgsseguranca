const supportedMajors = [20, 22, 24];
const preferredMajor = 24;
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

if (!supportedMajors.includes(major)) {
  console.warn(
    [
      `Aviso: versões validadas para o projeto são Node.js ${supportedMajors.join(', ')}.`,
      `Versão atual detectada: ${version}.`,
      `Se ocorrer erro de build/dev, prefira Node ${preferredMajor}.x.`,
    ].join('\n'),
  );
}
