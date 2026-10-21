import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { connect, createServer } from 'node:net';
import test from 'node:test';

async function freePort(): Promise<number> {
  const probe = createServer().listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const address = probe.address();
  assert.ok(address && typeof address === 'object');
  probe.close();
  return address.port;
}

// Sends a raw request so the target reaches the server unnormalized.
async function rawRequest(port: number, target: string): Promise<string> {
  const socket = connect(port, '127.0.0.1');
  await once(socket, 'connect');
  socket.end(`GET ${target} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n`);
  let response = '';
  socket.setEncoding('utf8').on('data', chunk => { response += chunk; });
  await once(socket, 'close');
  return response;
}

test('an unparseable request target does not take down the HTTP server', async (t) => {
  const port = await freePort();
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    env: {
      ...process.env,
      MCP_TRANSPORT: 'http',
      MCP_AUTH_TOKEN: 'test-token',
      PORT: String(port),
      TONAL_USERNAME: 'user@example.com',
      TONAL_PASSWORD: 'unused',
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  t.after(() => { child.kill(); });

  let stderr = '';
  await new Promise<void>((resolve, reject) => {
    child.stderr.setEncoding('utf8').on('data', chunk => {
      stderr += chunk;
      if (stderr.includes('listening')) resolve();
    });
    child.once('exit', code => reject(new Error(`server exited early (${code}): ${stderr}`)));
  });

  assert.match(await rawRequest(port, '//['), /^HTTP\/1\.1 404 /);
  assert.match(await rawRequest(port, '/health'), /^HTTP\/1\.1 200 /);
  assert.equal(child.exitCode, null, stderr);
});
