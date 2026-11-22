import { setTimeout as sleep } from 'node:timers/promises';
import { ApiError, request, run, validateRef } from './client.ts';

await run(async () => {
  const ref = validateRef(process.argv[2]);
  let delay = 2;
  for (let attempt = 1; attempt <= 8; attempt++) {
    let wait = delay;
    try {
      const result = await request('GET', `/transactions/${encodeURIComponent(ref)}`);
      console.log(JSON.stringify(result, null, 2));
      // message is display-only; use status for integration decisions.
      if (['success', 'failed'].includes(result.data.status)) return;
      if (result.data.status !== 'pending') throw new Error('Unexpected transaction status');
    } catch (error) {
      if (!(error instanceof ApiError) || (error.status !== 429 && error.status < 500)) throw error;
      console.error(error.message);
      wait = Math.max(delay, error.retryAfter || 0);
    }
    if (attempt < 8) await sleep(wait * 1000);
    delay = Math.min(delay * 2, 15);
  }
  throw new Error('Polling ended without a final status. Check again with the same ref_id.');
});
