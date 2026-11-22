import { createHash, createHmac, randomBytes } from 'node:crypto';
import type { components, operations } from './src/types/openapi.ts';

type ExampleOperation = 'getBalance' | 'listProducts' | 'getTransaction' | 'createTransaction';
type Success<Operation extends ExampleOperation> =
  operations[Operation]['responses'][200]['content']['application/json'];
type ErrorEnvelope = components['responses']['Error400']['content']['application/json'];
type CreateTransaction = components['schemas']['CreateTransaction'];

export function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error('Set ' + name);
  return value;
}

export function signRequest(
  secret: string, method: string, target: string, timestamp: string, nonce: string, body = '',
) {
  const bodyHash = createHash('sha256').update(body).digest('hex');
  const canonical = [method.toUpperCase(), target, timestamp, nonce, bodyHash].join('\n');
  return createHmac('sha256', secret).update(canonical).digest('hex');
}

export class ApiError extends Error {
  declare status: number;
  declare code: string | undefined;
  declare retryAfter: number;

  constructor(response: Response, payload?: { error?: { code: string; message: string }; request_id?: string | null }) {
    const code = payload?.error?.code;
    const requestId = payload?.request_id;
    super(['HTTP ' + response.status, code, payload?.error?.message, requestId && 'request_id=' + requestId]
      .filter(Boolean).join(' | '));
    this.status = response.status;
    this.code = code;
    this.retryAfter = Number(response.headers.get('Retry-After'));
  }
}

export function request(method: 'GET', endpoint: '/balance'): Promise<Success<'getBalance'>>;
export function request(method: 'GET', endpoint: '/products' | `/products?${string}`): Promise<Success<'listProducts'>>;
export function request(method: 'GET', endpoint: `/transactions/${string}`): Promise<Success<'getTransaction'>>;
export function request(
  method: 'POST', endpoint: '/transactions', payload: CreateTransaction, idempotencyKey: string,
): Promise<Success<'createTransaction'>>;
export async function request(method: 'GET' | 'POST', endpoint: string, payload?: CreateTransaction, idempotencyKey?: string) {
  // Sandbox and production share a URL. The API key selects the environment.
  const base = new URL(process.env.BISADAGANG_BASE_URL || 'https://api.bisadagang.com/h2h/v1');
  if (base.protocol !== 'https:' || base.search || base.hash || base.username || base.password) {
    throw new Error('BISADAGANG_BASE_URL must be an HTTPS URL without credentials, query or fragment');
  }
  const url = new URL(base.origin + base.pathname.replace(/\/+$/, '') + endpoint);
  const body = payload === undefined ? undefined : JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = randomBytes(16).toString('hex');
  const headers: Record<string, string> = {
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
  // Describe the parsed API response without adding runtime validation to the JS flow.
  let envelope: Success<ExampleOperation> | ErrorEnvelope;
  try {
    envelope = JSON.parse(text);
  } catch {
    throw new ApiError(response);
  }
  if (!response.ok || envelope?.success !== true) throw new ApiError(response, envelope);
  return envelope;
}

export function validateRef(ref: string | undefined) {
  if (!ref || !/^[A-Za-z0-9._-]{1,50}$/.test(ref) || /[\r\n]/.test(ref) || ['.', '..'].includes(ref)) {
    throw new Error('ref_id must contain 1–50 letters, digits, dots, underscores or hyphens');
  }
  return ref;
}

export async function run(main: () => Promise<void>) {
  try {
    await main();
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}
