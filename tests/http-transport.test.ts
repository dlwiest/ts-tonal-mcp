import assert from 'node:assert/strict';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { once } from 'node:events';
import { connect, createServer } from 'node:net';
import test, { after, before } from 'node:test';

const TOKEN = 'test-token';
const MCP_HEADERS = {
  Authorization: `Bearer ${TOKEN}`,
  'Content-Type': 'application/json',
  Accept: 'application/json, text/event-stream',
};

let port: number;
let child: ChildProcessWithoutNullStreams;
let stderr = '';

before(async () => {
  const probe = createServer().listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const address = probe.address();
  assert.ok(address && typeof address === 'object');
  port = address.port;
  probe.close();

  child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    env: {
      ...process.env,
      MCP_TRANSPORT: 'http',
      MCP_AUTH_TOKEN: TOKEN,
      PORT: String(port),
      TONAL_USERNAME: 'user@example.com',
      TONAL_PASSWORD: 'unused',
    },
  });

  // Promise.withResolvers is ES2024; the project targets ES2022.
  await new Promise<void>((resolve, reject) => {
    child.stderr.setEncoding('utf8').on('data', chunk => {
      stderr += chunk;
      if (stderr.includes('listening')) resolve();
    });
    child.once('exit', code => reject(new Error(`server exited early (${code}): ${stderr}`)));
  });
});

after(() => { child.kill(); });

// Sends a raw request so the target reaches the server unnormalized.
async function rawRequest(target: string): Promise<string> {
  const socket = connect(port, '127.0.0.1');
  await once(socket, 'connect');
  socket.end(`GET ${target} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n`);
  let response = '';
  socket.setEncoding('utf8').on('data', chunk => { response += chunk; });
  await once(socket, 'close');
  return response;
}

function mcp(init: RequestInit): Promise<Response> {
  return fetch(`http://127.0.0.1:${port}/mcp`, { ...init, signal: AbortSignal.timeout(5000) });
}

test('an unparseable request target does not take down the HTTP server', async () => {
  assert.match(await rawRequest('//['), /^HTTP\/1\.1 404 /);
  assert.match(await rawRequest('/health'), /^HTTP\/1\.1 200 /);
  assert.equal(child.exitCode, null, stderr);
});

test('authenticated non-POST requests get 405 instead of an idle event stream', async () => {
  for (const method of ['GET', 'DELETE']) {
    const response = await mcp({ method, headers: { ...MCP_HEADERS, Accept: 'text/event-stream' } });
    assert.equal(response.status, 405, method);
    assert.equal(response.headers.get('allow'), 'POST', method);
  }
});

test('unauthenticated requests are rejected before the method or body is considered', async () => {
  const response = await mcp({ method: 'GET' });
  assert.equal(response.status, 401);
});

test('request bodies over 1 MB are rejected, whether declared or still streaming', async () => {
  const oversized = 'x'.repeat(1024 * 1024 + 1);
  const declared = await mcp({ method: 'POST', headers: MCP_HEADERS, body: oversized });
  assert.equal(declared.status, 413);

  // A chunked sender still uploading past the limit must get its 413 on an open
  // connection: closing mid-upload resets the socket, which can drop the response.
  // Finishing the body and reusing the connection proves the server drained it.
  const socket = connect(port, '127.0.0.1');
  await once(socket, 'connect');
  // One set of listeners for the whole exchange; each wait just checks the accumulated response.
  let response = '';
  let failure: Error | undefined;
  let notify = (): void => {};
  socket.setEncoding('utf8').on('data', data => { response += data; notify(); });
  socket.on('error', error => { failure = error; notify(); });
  socket.on('close', () => { failure ??= new Error(`connection closed early: ${JSON.stringify(response)}`); notify(); });
  const responseMatches = (pattern: RegExp): Promise<void> => new Promise((resolve, reject) => {
    notify = () => {
      if (pattern.test(response)) resolve();
      else if (failure) reject(failure);
    };
    notify();
  });
  try {
    socket.write(
      'POST /mcp HTTP/1.1\r\nHost: localhost\r\nTransfer-Encoding: chunked\r\n' +
      `Authorization: Bearer ${TOKEN}\r\nContent-Type: application/json\r\n` +
      'Accept: application/json, text/event-stream\r\n\r\n'
    );
    const frame = `${(64 * 1024).toString(16)}\r\n${'x'.repeat(64 * 1024)}\r\n`;
    for (let sent = 0; sent <= 2 * 1024 * 1024; sent += 64 * 1024) socket.write(frame);
    await responseMatches(/^HTTP\/1\.1 413 [\s\S]*\r\n\r\n/);

    socket.write('0\r\n\r\nGET /health HTTP/1.1\r\nHost: localhost\r\n\r\n');
    await responseMatches(/\r\n\r\n[\s\S]*HTTP\/1\.1 200 /);
  } finally {
    socket.destroy();
  }
});

test('a malformed JSON body gets a JSON-RPC parse error', async () => {
  const response = await mcp({ method: 'POST', headers: MCP_HEADERS, body: '{"jsonrpc":' });
  assert.equal(response.status, 400);
  const body = await response.json() as { error: { code: number } };
  assert.equal(body.error.code, -32700);
});

test('a valid request within the limit reaches the MCP server', async () => {
  const response = await mcp({
    method: 'POST',
    headers: MCP_HEADERS,
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  });
  assert.equal(response.status, 200);
  assert.match(await response.text(), /"name":"get_muscle_readiness"/);
});
