import test from 'node:test';
import assert from 'node:assert/strict';
import { CommitmentStore } from '../src/store.js';
import { buildSeedState } from '../src/seed.js';
import { ReviewBoard } from '../src/review.js';
import { STAGES } from '../src/catalog.js';

function board() {
  return new ReviewBoard(new CommitmentStore(buildSeedState()));
}

test('五个阶段分开统计，数字与样例事实一致', () => {
  const counts = Object.fromEntries(board().stageCounts().map((s) => [s.stage, s.count]));
  assert.deepEqual(counts, {
    contact: 3,    // 半导体、生物电子 v2、软件研发
    signing: 3,
    resource: 2,   // 半导体、软件研发
    validation: 1, // 软件研发
    order: 1       // 软件研发
  });
});

test('每个统计数字都能下钻到责任主体、适用范围、前置条件和证据', () => {
  const report = board().fullReport();
  for (const stage of report.stages) {
    for (const item of stage.items) {
      assert.ok(item.responsibleParties.length > 0, `${stage.stage} 缺少责任主体`);
      assert.ok(item.scope, `${stage.stage} 缺少适用范围`);
      assert.ok(Array.isArray(item.prerequisites), `${stage.stage} 缺少前置条件字段`);
      const strong = item.evidence.filter((e) => e.supportsStage && !e.weak);
      assert.ok(strong.length > 0, `${stage.stage}/${item.projectKey} 缺少支撑该阶段的强证据`);
      assert.ok(item.verifiedAt, '已计入数字必须有核验时间');
    }
  }
});

test('仅交换名片不计入接洽，并进入弱凭证剔除清单', () => {
  const report = board().fullReport();
  const financeContact = report.byCategory.finance.stages.find((s) => s.stage === STAGES.CONTACT);
  assert.equal(financeContact.count, 0);
  const rejected = report.weakEvidenceRejections.find((w) => w.projectKey === 'fin-risk-jingcheng');
  assert.ok(rejected, '名片事项必须列入剔除清单');
  assert.equal(rejected.stage, 'contact');
  assert.ok(rejected.evidence.every((e) => e.weak), '剔除证据应全部为弱凭证');
});

test('被替代版本（生物电子 v1）不产生签约/资源投入数字，v2 才计入', () => {
  const report = board().fullReport();
  const signingItems = report.stages.find((s) => s.stage === 'signing').items;
  const bio = signingItems.filter((i) => i.projectKey === 'bio-epatch-jingbei');
  assert.equal(bio.length, 1, '同一项目同阶段只计一次');
  assert.equal(bio[0].version, 2, '计入的必须是当前有效版本 v2');
});

test('撤回项目不混入成果数字：接洽签约事实保留，资源投入终止', () => {
  const report = board().fullReport();
  const allKeys = report.stages.flatMap((s) => s.items.map((i) => i.projectKey));
  assert.ok(!allKeys.includes('fin-collect-beifang'), '撤回项目不得进入任何阶段成果数字');
  const w = report.withdrawnProjects.find((x) => x.projectKey === 'fin-collect-beifang');
  assert.deepEqual(w.factsRetained, ['接洽', '签约']);
  assert.deepEqual(w.nextStepsTerminated.map((m) => m.stage), ['resource']);
  assert.ok(w.reason.length > 0);
});

test('四类产业分别可核实走到哪一步', () => {
  const by = board().byCategory();
  assert.deepEqual(by.semiconductor.stages.map((s) => s.count), [1, 1, 1, 0, 0]);
  assert.deepEqual(by.bioelectronics.stages.map((s) => s.count), [1, 1, 0, 0, 0]);
  assert.deepEqual(by.finance.stages.map((s) => s.count), [0, 0, 0, 0, 0]);
  assert.deepEqual(by.software.stages.map((s) => s.count), [1, 1, 1, 1, 1]);
});

test('项目时间线给出每项目最远阶段与各阶段状态', () => {
  const lines = board().projectTimelines();
  const find = (k) => lines.find((p) => p.projectKey === k);
  assert.equal(find('sw-mes-jingxi').highestReachedStage, 'order');
  assert.equal(find('semi-sic-huachi').highestReachedStage, 'resource');
  assert.equal(find('fin-risk-jingcheng').highestReachedStage, null);
  const bio = find('bio-epatch-jingbei');
  assert.equal(bio.currentVersion, 2);
  const resource = bio.stages.find((s) => s.stage === 'resource');
  assert.equal(resource.state, 'open');
});

test('下钻前置条件标注是否满足', () => {
  const item = board().stageCounts()
    .find((s) => s.stage === 'order').items[0];
  const pre = item.prerequisites.find((p) => p.ref === 'validation');
  assert.equal(pre.met, true);
});

test('版本变化影响的未完成承诺在项目时间线的历史版本中留痕', () => {
  const bio = board().projectTimelines().find((p) => p.projectKey === 'bio-epatch-jingbei');
  assert.equal(bio.currentVersion, 2);
  const v1 = bio.priorVersions.find((v) => v.version === 1);
  assert.ok(v1, '应保留 v1 历史版本');
  assert.equal(v1.status, 'superseded');
  const blockedResource = v1.affectedMilestones.find((m) => m.stage === 'resource');
  assert.ok(blockedResource, 'v1 未完成的全院供货里程碑应标注为受 v2 影响挂起');
  assert.equal(blockedResource.affectedByVersion, 2);
  assert.ok(blockedResource.reason.includes('v2'));
});

test('复盘报告满足 JSON 契约的形状约束（contracts/report.schema.json）', () => {
  const r = board().fullReport();
  const stageIds = ['contact', 'signing', 'resource', 'validation', 'order'];
  const cats = ['semiconductor', 'bioelectronics', 'finance', 'software'];

  for (const key of ['generatedAt', 'countingRule', 'totals', 'stages', 'byCategory', 'projects', 'weakEvidenceRejections', 'withdrawnProjects']) {
    assert.ok(key in r, `报告缺字段 ${key}`);
  }
  assert.equal(r.stages.length, 5);
  r.stages.forEach((s, i) => assert.equal(s.stage, stageIds[i]));

  function checkDrill(it) {
    assert.ok(it.projectKey && it.version >= 1);
    assert.ok(stageIds.includes(it.stage));
    assert.ok(it.scope.length >= 1, '下钻必须含适用范围');
    assert.ok(it.responsibleParties.length >= 1, '下钻必须含责任主体');
    assert.ok(Array.isArray(it.prerequisites), '下钻必须含前置条件');
    assert.ok(it.prerequisites.every((p) => typeof p.met === 'boolean'));
    assert.ok(it.evidence.length >= 1, '计入数字必须有证据');
    assert.ok(it.evidence.some((e) => e.supportsStage && !e.weak), '必须有强证据支撑');
  }
  for (const s of r.stages) for (const it of s.items) checkDrill(it);
  for (const cat of cats) {
    assert.equal(r.byCategory[cat].stages.length, 5);
    for (const s of r.byCategory[cat].stages) for (const it of s.items) checkDrill(it);
  }
  for (const p of r.projects) {
    assert.ok(cats.includes(p.category));
    assert.ok(['draft', 'active', 'superseded', 'withdrawn'].includes(p.status));
    assert.equal(p.stages.length, 5);
    assert.ok(p.stages.every((s) => ['not_started', 'pending', 'open', 'done', 'blocked', 'terminated'].includes(s.state)));
  }
  assert.ok(r.weakEvidenceRejections.every((w) => w.evidence.every((e) => e.weak)));
});
