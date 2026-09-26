import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/server.js';
import { CommitmentStore } from '../src/store.js';
import { buildSeedState } from '../src/seed.js';

function start() {
  const server = createServer(new CommitmentStore(buildSeedState()));
  return new Promise((resolve) => server.listen(0, () => {
    const { port } = server.address();
    resolve({ server, base: `http://127.0.0.1:${port}` });
  }));
}

async function json(base, path, opts) {
  const r = await fetch(base + path, {
    headers: { 'content-type': 'application/json', ...(opts && opts.headers) },
    ...opts
  });
  const body = await r.json();
  return { status: r.status, body };
}
const post = (base, path, payload) => json(base, path, { method: 'POST', body: JSON.stringify(payload || {}) });

test('后台页面与目录接口可访问', async () => {
  const { server, base } = await start();
  try {
    const page = await fetch(base + '/');
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-type'), /text\/html/);
    const { body: cat } = await json(base, '/api/catalog');
    assert.deepEqual(cat.stageOrder, ['contact', 'signing', 'resource', 'validation', 'order']);
    assert.ok(cat.weakEvidenceTypes.includes('business_card'));
  } finally { server.close(); }
});

test('GET /api/report 五阶段分开计数', async () => {
  const { server, base } = await start();
  try {
    const { body: r } = await json(base, '/api/report');
    assert.equal(r.stages.length, 5);
    assert.deepEqual(r.stages.map((s) => s.count), [3, 3, 2, 1, 1]);
    assert.ok(r.countingRule.some((x) => x.includes('名片')));
  } finally { server.close(); }
});

test('商业秘密隔离随查看身份变化', async () => {
  const { server, base } = await start();
  try {
    const outsider = await json(base, '/api/intents?viewerPartyId=p-t-hesheng');
    const semiOut = outsider.body.find((i) => i.id === 'intent-semi');
    assert.ok(!semiOut.materials.some((m) => m.id === 'mat-semi-dd-01'));

    const spec = await json(base, '/api/intents?viewerPartyId=p-spec');
    const semiSpec = spec.body.find((i) => i.id === 'intent-semi');
    const secret = semiSpec.materials.find((m) => m.id === 'mat-semi-dd-01');
    assert.equal(secret._secretMasked, true);
  } finally { server.close(); }
});

test('端到端：补齐尽调→多方确认→激活，重复登记返回 409', async () => {
  const { server, base } = await start();
  try {
    const dup = await post(base, '/api/intents', {
      projectKey: 'semi-sic-huachi', category: 'semiconductor', title: '重复项目',
      participantPartyIds: ['p-t-jingyuan', 'p-n-huachi']
    });
    assert.equal(dup.status, 409);
    assert.equal(dup.body.error.code, 'duplicate_active_intent');

    const mat = await post(base, '/api/materials', {
      intentId: 'intent-fin', ownerPartyId: 'p-n-jingcheng',
      name: '数据接入安全评估报告', level: 'normal', ref: 'SEC-JC-09'
    });
    assert.equal(mat.status, 201);

    const conf = await post(base, '/api/intents/intent-fin/confirm', { partyId: 'p-n-jingcheng' });
    assert.equal(conf.body.intent.status, 'active');

    const report = await json(base, '/api/report');
    // 草案金融意向即使补了材料也没有里程碑 done，数字不变
    assert.deepEqual(report.body.stages.map((s) => s.count), [3, 3, 2, 1, 1]);
  } finally { server.close(); }
});

test('端到端：名片证据后专员核验被拒，强证据后成立并进入复盘数字', async () => {
  const { server, base } = await start();
  try {
    const card = await post(base, '/api/milestones/ms-semi-val/evidence', {
      type: 'business_card', ref: 'CARD-9', partyId: 'p-r-s3gen'
    });
    assert.equal(card.status, 201);
    const reject = await post(base, '/api/milestones/ms-semi-val/verify', { partyId: 'p-spec' });
    assert.equal(reject.status, 409);
    assert.equal(reject.body.error.code, 'insufficient_evidence');

    await post(base, '/api/milestones/ms-semi-val/evidence', {
      type: 'validation_report', ref: 'VR-20260926-01', partyId: 'p-r-s3gen'
    });
    const ok = await post(base, '/api/milestones/ms-semi-val/verify', { partyId: 'p-spec' });
    assert.equal(ok.body.status, 'done');

    const { body: r } = await json(base, '/api/report');
    assert.equal(r.stages.find((s) => s.stage === 'validation').count, 2);
  } finally { server.close(); }
});

test('端到端：撤回后已完成事实保留、未完成终止，且不进成果数字', async () => {
  const { server, base } = await start();
  try {
    const w = await post(base, '/api/intents/intent-semi/withdraw', {
      partyId: 'p-n-huachi', reason: '台架排期冲突，暂停合作'
    });
    assert.equal(w.body.intent.status, 'withdrawn');
    assert.equal(w.body.terminatedMilestones, 2);

    const { body: r } = await json(base, '/api/report');
    const keys = r.stages.flatMap((s) => s.items.map((i) => i.projectKey));
    assert.ok(!keys.includes('semi-sic-huachi'));
    const wd = r.withdrawnProjects.find((x) => x.projectKey === 'semi-sic-huachi');
    assert.deepEqual(wd.factsRetained, ['接洽', '签约', '资源投入']);
  } finally { server.close(); }
});

test('端到端：登记新版本挂起旧版未完成里程碑，返回受影响清单', async () => {
  const { server, base } = await start();
  try {
    const v = await post(base, '/api/intents/intent-semi/new-version', {
      title: 'SiC 合作 v2', changesNote: '范围扩展至 800V',
      commitments: [{ partyId: 'p-t-jingyuan', text: '提供 800V 设计文件' }]
    });
    assert.equal(v.status, 201);
    assert.equal(v.body.newIntent.version, 2);
    assert.ok(v.body.affectedMilestoneIds.includes('ms-semi-val'));
    assert.ok(v.body.affectedMilestoneIds.includes('ms-semi-order'));

    // 旧版仍计已完成的历史阶段（active 已变 superseded → 不再计入）；v2 草案未确认，也不计入
    const { body: r } = await json(base, '/api/report');
    const keys = r.stages.flatMap((s) => s.items.map((i) => i.projectKey));
    assert.ok(!keys.includes('semi-sic-huachi'), '交替期间无有效版本，不计入成果');
  } finally { server.close(); }
});

test('非法 JSON 返回 400，未知接口返回 404', async () => {
  const { server, base } = await start();
  try {
    const bad = await fetch(base + '/api/materials', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{not-json'
    });
    assert.equal(bad.status, 400);
    const nf = await json(base, '/api/nope');
    assert.equal(nf.status, 404);
  } finally { server.close(); }
});
