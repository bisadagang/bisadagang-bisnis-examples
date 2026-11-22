import { request, run } from './client.mjs';

await run(async () => {
  const category = process.argv[2];
  const query = category ? '?' + new URLSearchParams({ category }) : '';
  // sample_size, sample_size_30d, and sample_size_90d are bands or null.
  console.log(JSON.stringify(await request('GET', '/products' + query), null, 2));
});
