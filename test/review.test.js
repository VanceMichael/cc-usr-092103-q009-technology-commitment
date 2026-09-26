import test from 'node:test';
import assert from 'node:assert/strict';
import { CommitmentService } from '../src/service.js';
import { seedFromFile } from '../src/seed.js';

const SEED = new URL('../fixtures/seed.json', import.meta.url);

function seeded() {
  const s = new CommitmentService({ now: () => '2026-09-26T00:00:00.000Z' });
  seedFromFile(s, SEED);
  return s;
}

test('复盘页五个阶段分开统计', () => {
  const review = seeded().review({ asPartyId: 'pty_1' });
  assert.deepEqual(
    Object.fromEntries(Object.entries(review.stages).map(([k, v]) => [k, v.count])),
    { engagement: 4, signing: 3, 'resource-investment': 2, verification: 2, order: 1 },
  );
});

test('每个数字可下钻到责任主体、适用范围、前置条件与证据', () => {
  const review = seeded().review({ asPartyId: 'pty_1' });
  for (const stage of Object.values(review.stages)) {
    for (const item of stage.items) {
      assert.ok(item.responsiblePartyId, '责任主体');
      assert.ok(item.scope, '适用范围');
      assert.ok(Array.isArray(item.preconditions), '前置条件');
      assert.ok(item.evidence.length > 0, '相应证据');
      assert.ok(item.projectTitle && item.categoryLabel, '可回溯到项目与产业类别');
    }
  }
});

test('四个样例项目分别走到签约、验证完成、接洽、订单形成', () => {
  const review = seeded().review({ asPartyId: 'pty_1' });
  const byTitle = Object.fromEntries(review.projects.map((p) => [p.title, p.currentStageLabel]));
  assert.equal(byTitle['功率器件联合验证项目'], '签约');
  assert.equal(byTitle['远程监护生物传感验证'], '验证完成');
  assert.equal(byTitle['跨境支付风控试点'], '接洽');
  assert.equal(byTitle['仓储视觉质检联合研发'], '订单形成');
});

test('商业秘密证据按参与方隔离：无权者只见脱敏引用，有权者见全文', () => {
  const s = seeded();
  // e6 临床数据摘要仅 tBio(pty_5) 与 sHosp(pty_7) 可见；rMed(pty_6) 是参与方但无权。
  const asRmed = s.review({ asPartyId: 'pty_6' });
  const item = asRmed.stages.verification.items.find((i) => i.projectTitle === '远程监护生物传感验证');
  const hidden = item.evidence.find((e) => e.kind === '验证报告');
  assert.equal(hidden.redacted, true);
  assert.equal(hidden.summary, undefined);
  assert.ok(hidden.hash, '脱敏后仍保留哈希供核实');
  const asHosp = s.review({ asPartyId: 'pty_7' });
  const shown = asHosp.stages.verification.items
    .find((i) => i.projectTitle === '远程监护生物传感验证')
    .evidence.find((e) => e.kind === '验证报告');
  assert.equal(shown.summary, '90 天临床数据摘要');
});

test('撤回与版本变化在复盘中留痕', () => {
  const s = seeded();
  const review = s.review({ asPartyId: 'pty_1' });
  const fin = review.projects.find((p) => p.title === '跨境支付风控试点');
  assert.equal(fin.commitments.terminated, 2, '被撤回意向的未完成承诺保留记录');
  assert.deepEqual(
    fin.intentVersions.map((v) => v.status),
    ['withdrawn', 'executing'],
  );
  const soft = review.projects.find((p) => p.title === '仓储视觉质检联合研发');
  assert.equal(soft.commitments.superseded, 1, '签约版本 v2 影响的未完成承诺被标记');
  const history = s.projectHistory(soft.projectId);
  const activated = history.filter((e) => e.type === 'contract.activated');
  assert.equal(activated.length, 2);
  assert.deepEqual(activated[1].affectedCommitments.length, 1, '版本变化明确记录了影响的未完成承诺');
});

test('项目专员未列入商业秘密可见名单时同样被隔离', () => {
  const review = seeded().review({ asPartyId: 'pty_1' });
  const order = review.stages.order.items.find((i) => i.projectTitle === '仓储视觉质检联合研发');
  const restricted = order.evidence.find((e) => e.classification === 'restricted');
  assert.equal(restricted.redacted, true);
});
