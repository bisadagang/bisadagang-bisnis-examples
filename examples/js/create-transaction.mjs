import { randomBytes } from 'node:crypto';
import { request, run, validateRef } from './client.mjs';

await run(async () => {
  const [product_code, customer_no, reference] = process.argv.slice(2);
  if (!product_code || !customer_no || process.argv.length > 5) {
    throw new Error('Usage: node create-transaction.mjs PRODUCT_CODE CUSTOMER_NO [REF_ID]');
  }
  const ref_id = validateRef(reference ?? 'demo-' + randomBytes(16).toString('hex'));
  // Save this before sending. Repeat with the same arguments after an ambiguous outcome.
  console.error('ref_id=' + ref_id);
  const result = await request('POST', '/transactions',
    { product_code, customer_no, ref_id }, 'prepaid:' + ref_id);
  console.log(JSON.stringify(result, null, 2));
});
