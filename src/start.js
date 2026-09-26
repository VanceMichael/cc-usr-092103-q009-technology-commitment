import { CommitmentService } from './service.js';
import { createApp } from './server.js';
import { seedFromFile } from './seed.js';

const service = new CommitmentService();
seedFromFile(service, new URL('../fixtures/seed.json', import.meta.url));

const port = Number(process.env.PORT ?? 3000);
createApp(service).listen(port, () => {
  console.log(`承诺管理后台已启动: http://localhost:${port}`);
  console.log(`复盘报告: http://localhost:${port}/review?asParty=<partyId>`);
});
