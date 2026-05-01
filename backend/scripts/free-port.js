const { execFileSync } = require('child_process');
const net = require('net');

const requestedPort = Number(process.env.PORT || 3011);
const port =
  Number.isInteger(requestedPort) && requestedPort > 0 && requestedPort <= 65535
    ? requestedPort
    : 3011;

function isPortBusy(targetPort) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (error) => {
      resolve(error && error.code === 'EADDRINUSE');
    });
    server.once('listening', () => {
      server.close(() => resolve(false));
    });
    server.listen(targetPort, '0.0.0.0');
  });
}

function getPidsFromPowerShell(targetPort) {
  const command = [
    `Get-NetTCPConnection -State Listen -LocalPort ${targetPort}`,
    'Select-Object -ExpandProperty OwningProcess',
    'Sort-Object -Unique',
  ].join(' | ');

  const output = execFileSync(
    'powershell',
    ['-NoProfile', '-Command', command],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    },
  );

  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((pid) => /^\d+$/.test(pid));
}

function getPidsFromNetstat(targetPort) {
  const output = execFileSync('netstat', ['-ano', '-p', 'tcp'], {
    encoding: 'utf8',
  });
  const lines = output
    .split(/\r?\n/)
    .filter(
      (line) => line.includes(`:${targetPort}`) && line.includes('LISTENING'),
    );
  return [
    ...new Set(
      lines.map((line) => line.trim().split(/\s+/).pop()).filter(Boolean),
    ),
  ];
}

function killPortWindows(targetPort) {
  let pids = [];
  try {
    pids = getPidsFromPowerShell(targetPort);
  } catch {
    try {
      pids = getPidsFromNetstat(targetPort);
    } catch {
      pids = [];
    }
  }

  for (const pid of pids) {
    try {
      execFileSync('taskkill', ['/PID', pid, '/F'], { stdio: 'ignore' });
    } catch {
      // segue mesmo se não conseguir finalizar um PID específico
    }
  }
  return pids;
}

function killPortUnix(targetPort) {
  try {
    const output = execFileSync('lsof', ['-ti', `tcp:${targetPort}`], {
      encoding: 'utf8',
    }).trim();
    if (!output) return [];
    const pids = [...new Set(output.split(/\r?\n/).filter(Boolean))];
    for (const pid of pids) {
      execFileSync('kill', ['-9', pid], { stdio: 'ignore' });
    }
    return pids;
  } catch {
    return [];
  }
}

(async () => {
  try {
    const busy = await isPortBusy(port);
    if (!busy) {
      return;
    }

    const platform = process.platform;
    const pids =
      platform === 'win32' ? killPortWindows(port) : killPortUnix(port);

    if (pids.length > 0) {
      console.log(
        `[free-port] Porta ${port} estava ocupada. PID(s) finalizados: ${pids.join(', ')}`,
      );
    } else {
      console.log(
        `[free-port] Porta ${port} ocupada, mas nenhum PID pôde ser finalizado automaticamente.`,
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[free-port] Não foi possível liberar a porta ${port} automaticamente: ${message}`,
    );
  }
})();
