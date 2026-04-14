import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';

const PORT = Number(process.env.PORT || '8080');
const CLAMD_HOST = process.env.CLAMD_HOST || '127.0.0.1';
const CLAMD_PORT = Number(process.env.CLAMD_PORT || '3310');
const MAX_SCAN_BYTES = Number(process.env.MAX_SCAN_BYTES || '26214400');
const SIGNATURE_MAX_AGE_HOURS = Number(
  process.env.CLAMAV_SIGNATURE_MAX_AGE_HOURS || '24',
);

function signatureIsFresh() {
  try {
    const stats = fs.statSync('/var/lib/clamav/freshclam.dat');
    const ageMs = Date.now() - stats.mtimeMs;
    return ageMs <= SIGNATURE_MAX_AGE_HOURS * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function clamdReady() {
  return new Promise((resolve) => {
    const socket = net.createConnection({
      host: CLAMD_HOST,
      port: CLAMD_PORT,
    });

    socket.setTimeout(2000);
    socket.on('connect', () => {
      socket.end();
      resolve(true);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => resolve(false));
  });
}

function scanBuffer(buffer) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: CLAMD_HOST, port: CLAMD_PORT });
    let response = '';

    socket.setTimeout(30000);
    socket.on('timeout', () => socket.destroy(new Error('clamd_timeout')));
    socket.on('error', reject);

    socket.on('connect', () => {
      socket.write('zINSTREAM\0');
      let offset = 0;
      while (offset < buffer.length) {
        const chunk = buffer.subarray(offset, offset + 64 * 1024);
        const len = Buffer.alloc(4);
        len.writeUInt32BE(chunk.length, 0);
        socket.write(len);
        socket.write(chunk);
        offset += chunk.length;
      }
      socket.write(Buffer.alloc(4));
    });

    socket.on('data', (data) => {
      response += data.toString('utf8');
    });

    socket.on('close', () => {
      if (response.includes('FOUND')) {
        const threat =
          response.split(': ')[1]?.replace(' FOUND', '').trim() || 'unknown';
        resolve({ status: 'infected', engine: 'clamav', threat });
        return;
      }

      if (response.includes('OK')) {
        resolve({ status: 'clean', engine: 'clamav' });
        return;
      }

      reject(new Error(`clamd_unexpected_response:${response}`));
    });
  });
}

http
  .createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (req.method === 'GET' && req.url === '/ready') {
      const ready = signatureIsFresh() && (await clamdReady());
      res.writeHead(ready ? 200 : 503, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: ready }));
      return;
    }

    if (req.method !== 'POST' || req.url !== '/scan') {
      res.writeHead(404).end();
      return;
    }

    if (!signatureIsFresh() || !(await clamdReady())) {
      res.writeHead(503, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'blocked', reason: 'scanner_unavailable' }));
      return;
    }

    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_SCAN_BYTES) {
          res.writeHead(413, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ status: 'blocked', reason: 'invalid_upload' }));
          return;
        }
        chunks.push(chunk);
      }

      const result = await scanBuffer(Buffer.concat(chunks));
      res.writeHead(result.status === 'clean' ? 200 : 409, {
        'content-type': 'application/json',
      });
      res.end(JSON.stringify(result));
    } catch {
      res.writeHead(503, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'blocked', reason: 'scanner_unavailable' }));
    }
  })
  .listen(PORT, '0.0.0.0');
