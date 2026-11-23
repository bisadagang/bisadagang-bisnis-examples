import { request, run } from './client.ts';

await run(async () => {
  const category = process.argv[2];
  const query = category ? `?${new URLSearchParams({ category })}` as const : '';
  console.log(JSON.stringify(await request('GET', `/products${query}`), null, 2));
});
