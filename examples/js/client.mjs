import { createHash, createHmac, randomBytes } from 'node:crypto';

export function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error('Set ' + name);
  return value;
}

export function signRequest(secret, method, target, timestamp, nonce, body = '') {
  const bodyHash = createHash('sha256').update(body).digest('hex');
  const canonical = [method.toUpperCase(), target, timestamp, nonce, bodyHash].join('\n');
  return createHmac('sha256', secret).update(canonical).digest('hex');
}

export class ApiError extends Error {
  constructor(response, payload) {
    const code = payload?.error?.code;
    const requestId = payload?.request_id;
    super(['HTTP ' + response.status, code, payload?.error?.message, requestId && 'request_id=' + requestId]
      .filter(Boolean).join(' | '));
    this.status = response.status;
    this.code = code;
    this.retryAfter = Number(response.headers.get('Retry-After'));
  }
}

export async function request(method, endpoint, payload, idempotencyKey) {
  // Sandbox and production share a URL. The API key selects the environment.
  const base = new URL(process.env.BISADAGANG_BASE_URL || 'https://api.bisadagang.com/h2h/v1');
  if (base.protocol !== 'https:' || base.search || base.hash || base.username || base.password) {
    throw new Error('BISADAGANG_BASE_URL must be an HTTPS URL without credentials, query or fragment');
  }
  const url = new URL(base.origin + base.pathname.replace(/\/+$/, '') + endpoint);
  const body = payload === undefined ? undefined : JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = randomBytes(16).toString('hex');
  const headers = {
    Accept: 'application/json',
    'X-Bisadagang-Key': requiredEnv('BISADAGANG_API_KEY'),
    'X-Bisadagang-Timestamp': timestamp,
    'X-Bisadagang-Nonce': nonce,
    'X-Bisadagang-Signature': signRequest(
      requiredEnv('BISADAGANG_API_SECRET'), method, url.pathname + url.search, timestamp, nonce, body,
    ),
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  const response = await fetch(url, {
    method, headers, body, redirect: 'error', signal: AbortSignal.timeout(10_000),
  });
  const text = await response.text();
  let envelope;
  try {
    envelope = JSON.parse(text);
  } catch {
    throw new ApiError(response);
  }
  if (!response.ok || envelope?.success !== true) throw new ApiError(response, envelope);
  return envelope;
}

export function validateRef(ref) {
  if (!ref || !/^[A-Za-z0-9._-]{1,50}$/.test(ref) || /[\r\n]/.test(ref) || ['.', '..'].includes(ref)) {
    throw new Error('ref_id must contain 1–50 letters, digits, dots, underscores or hyphens');
  }
  return ref;
}

export async function run(main) {
  try {
    await main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
