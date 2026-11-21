import assert from 'node:assert/strict';
import { signRequest } from './client.mjs';

// Published test vector from the Bisadagang authentication docs.
const signature = signRequest('rahasia-contoh', 'GET', '/h2h/v1/products?category=Pulsa',
  '1763337600', '0123456789abcdef0123456789abcdef');
assert.equal(signature, '1c70ec830551bf90d017616759d563f395be4fbf5528f0beeb01ac5fad71cae6');
console.log(signature);
