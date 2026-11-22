import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { link, mkdir, open, unlink } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { requiredEnv } from './client.ts';
import type { webhooks } from './src/types/openapi.ts';

type WebhookEvent = webhooks[keyof webhooks]['post']['requestBody']['content']['application/json'];

const secret = requiredEnv('BISADAGANG_WEBHOOK_SECRET');
const inbox = '.webhook-inbox';
const maxBody = 1024 * 1024;
await mkdir(inbox, { recursive: true, mode: 0o700 });

function verify(timestamp: string, body: Buffer, header: string) {
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

async function enqueue(id: string, body: Buffer) {
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
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  } finally {
    await unlink(temp).catch(() => {});
  }
}

createServer(async (req, res) => {
  const reply = (status: number) => res.writeHead(status).end();
  if (req.url !== '/webhook') return reply(404);
  if (req.method !== 'POST') return res.writeHead(405, { Allow: 'POST' }).end();

  try {
    const chunks: Buffer[] = [];
    let length = 0;
    for await (const chunk of req.iterator({ destroyOnReturn: false }) as AsyncIterable<Buffer>) {
      length += chunk.length;
      if (length > maxBody) {
        req.resume();
        return reply(413);
      }
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);
    const timestamp = req.headers['x-bisadagang-timestamp'] as string | undefined;
    const signature = req.headers['x-bisadagang-signature'] as string | undefined;
    if (!verify(timestamp ?? '', body, signature ?? '')) return reply(401);

    let event: WebhookEvent;
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
    console.error((error as Error).message);
    return reply(500);
  }
}).listen(8080, '127.0.0.1', () => console.log('Listening on http://127.0.0.1:8080/webhook'));
