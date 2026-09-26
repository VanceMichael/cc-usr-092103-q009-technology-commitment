import test from 'node:test';
import assert from 'node:assert/strict';
import { CommitmentService } from '../src/service.js';
import { createApp } from '../src/server.js';
import { seedFromFile } from '../src/seed.js';

async function withServer(t, service) {
  const server = createApp(service);
  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (method, path, body) =>
    fetch(base + path, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }).then(async (res) => ({ status: res.status, body: await res.json() }));
  return call;
}

function seededService() {
  const s = new CommitmentService({ now: () => '2026-09-26T00:00:00.000Z' });
  seedFromFile(s, new URL('../fixtures/seed.json', import.meta.url));
  return s;
}

test('HTTP 后台：健康检查与复盘页', async (t) => {
  const call = await withServer(t, seededService());
  const health = await call('GET', '/health');
  assert.equal(health.status, 200);
  const review = await call('GET', '/review?asParty=pty_1');
  assert.equal(review.status, 200);
  assert.equal(review.body.stages.order.count, 1);
  assert.equal(review.body.stages.engagement.count, 4);
});

test('HTTP 后台：重复项目提交返回同一项目', async (t) => {
  const call = await withServer(t, seededService());
  const payload = { title: '功率器件联合验证项目', category: 'semiconductor', partyIds: ['pty_2', 'pty_3', 'pty_4'] };
  const res = await call('POST', '/projects', payload);
  assert.equal(res.status, 201);
  assert.equal(res.body.deduplicated, true);
  assert.equal(res.body.project.id, 'prj_1');
});

test('HTTP 后台：多方同时确认只产生一个有效版本', async (t) => {
  const s = seededService();
  const { project } = s.createProject({ title: '并发确认演练', category: 'software-rnd', partyIds: ['pty_10', 'pty_11'] });
  const intent = s.draftIntent({
    projectId: project.id,
    commitments: [{ stage: 'engagement', responsiblePartyId: 'pty_10', scope: '对接', evidenceRequirements: ['会议纪要'] }],
  });
  const call = await withServer(t, s);
  // 同一方并发重复确认 + 另一方确认同时到达。
  const results = await Promise.all([
    call('POST', `/intents/${intent.id}/confirm`, { partyId: 'pty_10', version: 1 }),
    call('POST', `/intents/${intent.id}/confirm`, { partyId: 'pty_10', version: 1 }),
    call('POST', `/intents/${intent.id}/confirm`, { partyId: 'pty_11', version: 1 }),
  ]);
  assert.ok(results.every((r) => r.status === 201));
  assert.equal(intent.confirmations.length, 2, '重复确认被幂等合并');
  assert.equal(intent.status, 'confirmed');
  const dup = await call('POST', `/projects/${project.id}/intents`, {
    commitments: [{ stage: 'engagement', responsiblePartyId: 'pty_10', scope: '另一版', evidenceRequirements: ['会议纪要'] }],
  });
  assert.equal(dup.status, 409, '已确认项目不得再起第二个有效意向版本');
});

test('HTTP 后台：同时激活签约版本只有一个成功', async (t) => {
  const s = seededService();
  const call = await withServer(t, s);
  // prj_4 当前有效版本为 v2（种子数据中 v1 已被取代）；两份草稿按同一期望版本并发激活。
  const draftA = await call('POST', '/projects/prj_4/contracts', { byPartyId: 'pty_10', terms: '补充协议C', affects: [] });
  const draftB = await call('POST', '/projects/prj_4/contracts', { byPartyId: 'pty_12', terms: '补充协议D', affects: [] });
  assert.equal(draftA.status, 201);
  assert.equal(draftB.status, 201);
  const [a, b] = await Promise.all([
    call('POST', `/contracts/${draftA.body.id}/activate`, { expectedValidVersion: 2 }),
    call('POST', `/contracts/${draftB.body.id}/activate`, { expectedValidVersion: 2 }),
  ]);
  const statuses = [a.status, b.status].sort();
  assert.deepEqual(statuses, [201, 409], '并发激活只有一单生效，另一单因版本漂移冲突');
  const valid = s.ledger.all('contracts').filter((c) => c.projectId === 'prj_4' && c.status === 'valid');
  assert.equal(valid.length, 1, '系统内始终只有一个有效版本');
});

test('HTTP 后台：错误映射与未知路由', async (t) => {
  const call = await withServer(t, seededService());
  const missing = await call('GET', '/projects/prj_999');
  assert.equal(missing.status, 404);
  const bad = await call('POST', '/parties', { name: '缺角色' });
  assert.equal(bad.status, 400);
  const noIdentity = await call('GET', '/due-diligence');
  assert.equal(noIdentity.status, 400);
  const unknown = await call('GET', '/nope');
  assert.equal(unknown.status, 404);
});
