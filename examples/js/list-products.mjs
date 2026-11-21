import { request, run } from './client.mjs';

await run(async () => {
  const category = process.argv[2];
  const query = category ? '?' + new URLSearchParams({ category }) : '';
  console.log(JSON.stringify(await request('GET', '/products' + query), null, 2));
});
