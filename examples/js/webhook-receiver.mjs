import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { link, mkdir, open, unlink } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { requiredEnv } from './client.mjs';

const secret = requiredEnv('BISADAGANG_WEBHOOK_SECRET');
const inbox = '.webhook-inbox';
const maxBody = 1024 * 1024;
await mkdir(inbox, { recursive: true, mode: 0o700 });

function verify(timestamp, body, header) {
  if (!/^[0-9]{1,12}$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) {
    return false;
  }
  const expected = createHmac('sha256', secret).update(timestamp + '.').update(body).digest();
  return header.split(',').some((value) => {
    const signature = value.trim();
    return /^[0-9a-f]{64}$/.test(signature)
      && timingSafeEqual(expected, Buffer.from(signature, 'hex'));
  });
}

async function enqueue(id, body) {
  // Publish the entire payload at once. Retried deliveries keep the same event_id.
  const temp = join(inbox, randomBytes(16).toString('hex') + '.tmp');
  const file = await open(temp, 'wx', 0o600);
  try {
    try {
      await file.writeFile(body);
      await file.sync();
    } finally {
      await file.close();
    }
    try {
      await link(temp, join(inbox, id + '.json'));
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  } finally {
    await unlink(temp).catch(() => {});
  }
}

createServer(async (req, res) => {
  const reply = (status) => res.writeHead(status).end();
  if (req.url !== '/webhook') return reply(404);
  if (req.method !== 'POST') return res.writeHead(405, { Allow: 'POST' }).end();

  try {
    const chunks = [];
    let length = 0;
    for await (const chunk of req.iterator({ destroyOnReturn: false })) {
      length += chunk.length;
      if (length > maxBody) {
        req.resume();
        return reply(413);
      }
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);
    if (!verify(req.headers['x-bisadagang-timestamp'] ?? '', body,
      req.headers['x-bisadagang-signature'] ?? '')) return reply(401);

    let event;
    try {
      event = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
    } catch {
      return reply(400);
    }
    const id = event?.event_id;
    if (typeof id !== 'string' || !/^whd_[A-Za-z0-9]{24}$/.test(id) || id.length !== 28) {
      return reply(400);
    }
    if (event.event !== 'webhook.test') await enqueue(id, body);
    return reply(200);
  } catch (error) {
    console.error(error.message);
    return reply(500);
  }
}).listen(8080, '127.0.0.1', () => console.log('Listening on http://127.0.0.1:8080/webhook'));
