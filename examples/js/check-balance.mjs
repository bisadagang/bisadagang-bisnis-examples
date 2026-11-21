import { request, run } from './client.mjs';

await run(async () => console.log(JSON.stringify(await request('GET', '/balance'), null, 2)));
