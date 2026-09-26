import test from 'node:test';
import assert from 'node:assert/strict';
import { CommitmentStore, DomainError } from '../src/store.js';
import { CommitmentService, intentContentHash } from '../src/service.js';
import { buildSeedState } from '../src/seed.js';
import { INTENT_STATUS, MILESTONE_STATUS } from '../src/catalog.js';

function freshStore() { return new CommitmentStore(buildSeedState()); }
function svc(store = freshStore()) { return new CommitmentService(store); }

function expectError(code, fn) {
  assert.throws(fn, (err) => {
    assert.ok(err instanceof DomainError);
    assert.equal(err.code, code);
    return true;
  });
}

// —— 多方确认完整才执行 ——
test('确认与激活：缺一方确认或缺尽调都不能进入执行，齐备后激活且只激活一次', () => {
  const store = freshStore();
  const s = svc(store);
  const intent = store.listIntents().find((i) => i.id === 'intent-fin'); // 草案：2/3 确认，ddr-2 缺失
  assert.equal(intent.status, 'draft');

  // 尽调缺失：即便第三方确认也不激活
  let r = s.confirmIntent('intent-fin', 'p-n-jingcheng');
  assert.equal(r.intent.status, 'draft');
  assert.ok(r.missingDd.some((d) => d.title.includes('数据接入安全评估')));

  // 补齐尽调（材料由责任方京城银行提交）
  s.submitMaterial({
    intentId: 'intent-fin', ownerPartyId: 'p-n-jingcheng',
    name: '数据接入安全评估报告', level: 'normal', ref: 'SEC-JC-09'
  });
  r = s.confirmIntent('intent-fin', 'p-n-jingcheng');
  assert.equal(r.intent.status, 'active');
  assert.equal(r.activated, true);

  // 已激活后重复确认不改变状态、不产生第二份有效版本
  r = s.confirmIntent('intent-fin', 'p-t-xintong');
  assert.equal(r.intent.status, 'active');
  assert.equal(r.activated, false);
  const active = store.findByProjectKey('fin-risk-jingcheng').filter((i) => i.status === 'active');
  assert.equal(active.length, 1);
});

test('非参与方不能确认；内容指纹不一致拒绝确认', () => {
  const s = svc();
  expectError('not_participant', () => s.withdraw('intent-semi', 'p-t-hesheng', 'x'));
  const semi = freshStore().getIntent('intent-semi');
  const hash = intentContentHash(semi);
  expectError('content_mismatch', () => svc().confirmIntent('intent-semi', 'p-n-huachi', hash + 'x'));
});

test('重复项目登记一律拒绝，改走新版本；同一项目始终最多一个 active', () => {
  const store = freshStore();
  const s = svc(store);
  expectError('duplicate_active_intent', () => s.registerIntent({
    projectKey: 'Semi-SIC-Huachi', // 大小写归一后与已有 active 相同
    category: 'semiconductor', title: '重复登记的 SiC 项目',
    participantPartyIds: ['p-t-jingyuan', 'p-r-s3gen']
  }));

  // 新版本：旧版 superseded，未完成里程碑（验证/订单）挂起
  const cur = store.getIntent('intent-semi');
  const result = s.registerNewVersion('intent-semi', {
    title: '车规 SiC 模块 v2：扩到 800V 平台',
    changesNote: '适用范围扩展至 800V 平台，机时与样件数量变化',
    commitments: [
      { partyId: 'p-r-s3gen', text: '新增 800V 平台联调，机时增至 160。' },
      { partyId: 'p-t-jingyuan', text: '提供 800V 设计文件。' },
      { partyId: 'p-n-huachi', text: '提供 800V 台架。' }
    ]
  });
  assert.equal(store.getIntent('intent-semi').status, 'superseded');
  assert.equal(result.newIntent.version, 2);
  const blocked = store.listMilestones().filter((m) => m.intentId === 'intent-semi' && m.status === 'blocked');
  assert.ok(blocked.length >= 2, '验证/订单等未完成承诺应挂起');
  assert.ok(blocked.every((m) => m.affectedByVersion === 2));
  const activeNow = store.findByProjectKey('semi-sic-huachi').filter((i) => i.status === 'active');
  assert.equal(activeNow.length, 0, '新版为草案，确认完整前没有 active 版本');

  // 新版确认完整（参与方 + 尽调沿用上一版已转抄）后，仍只有一个 active
  const draft = result.newIntent;
  for (const pid of draft.participantPartyIds) {
    const rr = s.confirmIntent(draft.id, pid);
    if (rr.missingDd) assert.fail('新版尽调应已转抄，不应再缺材料');
  }
  const activeFinal = store.findByProjectKey('semi-sic-huachi').filter((i) => i.status === 'active');
  assert.equal(activeFinal.length, 1);
  assert.equal(activeFinal[0].version, 2);
});

test('新版本归档复制尽调材料：新材料归属新意向、密级与可见范围保持、尽调项重新映射', () => {
  const store = freshStore();
  const s = svc(store);
  const { newIntent } = s.registerNewVersion('intent-semi', {
    title: 'SiC v2', changesNote: '范围变化',
    commitments: [{ partyId: 'p-t-jingyuan', text: '新承诺' }]
  });
  const mats = s.listMaterialsForViewer(newIntent.id, 'p-t-jingyuan');
  assert.equal(mats.length, 2, '两份材料应复制到新版');
  const secret = mats.find((m) => m.level === 'secret');
  assert.ok(secret, '商业秘密材料应随版归档');
  assert.deepEqual(secret.visibleToPartyIds.sort(), ['p-n-huachi', 'p-r-s3gen', 'p-t-jingyuan'].sort());
  // 尽调项指向新材料 ID，而非旧版材料
  for (const d of newIntent.ddRequired) {
    assert.ok(d.materialId, '尽调项应已映射材料');
    assert.ok(store.getMaterial(d.materialId).intentId === newIntent.id, '材料必须归属新意向');
  }
  // 外部方在新版同样看不到秘密本体
  assert.equal(s.listMaterialsForViewer(newIntent.id, 'p-t-hesheng').length, 1);
});

test('撤回只终止后续动作：done 里程碑保留，未完成终止', () => {
  const store = freshStore();
  const s = svc(store);
  const result = s.withdraw('intent-semi', 'p-n-huachi', '台架排期冲突');
  assert.equal(result.intent.status, 'withdrawn');
  assert.equal(result.terminatedMilestones, 2); // 验证 open + 订单 pending
  assert.equal(store.getMilestone('ms-semi-val').status, MILESTONE_STATUS.TERMINATED);
  assert.equal(store.getMilestone('ms-semi-order').status, MILESTONE_STATUS.TERMINATED);
  // 已完成的接洽/签约/资源投入事实保留
  for (const id of ['ms-semi-contact', 'ms-semi-sign', 'ms-semi-res']) {
    assert.equal(store.getMilestone(id).status, 'done');
  }
  expectError('already_withdrawn', () => s.withdraw('intent-semi', 'p-n-huachi', '再撤一次'));
  expectError('intent_withdrawn', () => s.confirmIntent('intent-semi', 'p-t-jingyuan'));
});

test('商业秘密按参与方隔离：所有方可见、被授权方可见、专员见元数据、外部方过滤', () => {
  const store = freshStore();
  const s = svc(store);
  // 外部台企（非半导体意向参与方）
  assert.equal(s.listMaterialsForViewer('intent-semi', 'p-t-hesheng').length, 1); // 仅普通 NDA
  // 被授权参与方
  assert.equal(s.listMaterialsForViewer('intent-semi', 'p-r-s3gen').length, 2);
  // 所有方
  assert.equal(s.listMaterialsForViewer('intent-semi', 'p-t-jingyuan').length, 2);
  // 无身份访问全部遮蔽/过滤
  assert.equal(s.listMaterialsForViewer('intent-semi', null).length, 1);
  // 专员看到 2 条，但秘密那一条正文遮蔽
  const specMats = s.listMaterialsForViewer('intent-semi', 'p-spec');
  assert.equal(specMats.length, 2);
  const secretOne = specMats.find((m) => m.level === 'secret');
  assert.equal(secretOne.ref, '【商业秘密·专员不可见】');
});

test('商业秘密授权给非参与方时被拒绝', () => {
  const s = svc();
  expectError('secret_scope_violation', () => s.submitMaterial({
    intentId: 'intent-semi', ownerPartyId: 'p-t-jingyuan',
    name: '违规授权材料', level: 'secret', visibleToPartyIds: ['p-t-hesheng']
  }));
});

test('多方同时确认（同步并发）只产生一个有效版本', () => {
  const store = freshStore();
  const s = svc(store);
  // 先补齐金融意向缺失尽调，再“同时”确认最后一方与重复确认
  s.submitMaterial({
    intentId: 'intent-fin', ownerPartyId: 'p-n-jingcheng',
    name: '数据接入安全评估报告', level: 'normal', ref: 'SEC-JC-09'
  });
  s.confirmIntent('intent-fin', 'p-n-jingcheng'); // 触发激活
  s.confirmIntent('intent-fin', 'p-n-jingcheng'); // 重复
  s.confirmIntent('intent-fin', 'p-r-fintechlab');
  const active = store.listIntents().filter((i) => i.projectKey === 'fin-risk-jingcheng' && i.status === 'active');
  assert.equal(active.length, 1);
  assert.equal(activationCount(store, 'intent-fin'), 1);
});

test('里程碑核验：名片不能成立，强证据 + 前置满足 + 有效意向才可成立', () => {
  const store = freshStore();
  const s = svc(store);
  // 草案意向的里程碑不能核验
  expectError('intent_not_active', () => s.verifyMilestone('ms-fin-contact', 'p-spec'));
  // active 意向半导体的验证里程碑：目前无证据 → 拒绝
  expectError('insufficient_evidence', () => s.verifyMilestone('ms-semi-val', 'p-spec'));

  // 附名片 → 仍不成立
  s.attachEvidence('ms-semi-val', { type: 'business_card', ref: 'CARD-x', partyId: 'p-r-s3gen' });
  expectError('insufficient_evidence', () => s.verifyMilestone('ms-semi-val', 'p-spec'));

  // 附强证据 validation_report
  s.attachEvidence('ms-semi-val', { type: 'validation_report', ref: 'VR-1', partyId: 'p-r-s3gen' });
  const ms = s.verifyMilestone('ms-semi-val', 'p-spec');
  assert.equal(ms.status, 'done');

  // 非专员不能核验
  expectError('forbidden', () => s.verifyMilestone('ms-semi-order', 'p-n-huachi'));
});

test('新版本草案未确认时，新版里程碑不能核验，旧版 blocked 里程碑需在新版登记', () => {
  const store = freshStore();
  const s = svc(store);
  const { newIntent } = s.registerNewVersion('intent-semi', {
    title: 'SiC v2',
    changesNote: '范围变化',
    commitments: [{ partyId: 'p-t-jingyuan', text: '新承诺' }]
  });
  // 旧版资源之后的里程碑处于 blocked
  assert.equal(store.getMilestone('ms-semi-val').status, 'blocked');
  expectError('milestone_blocked', () => s.verifyMilestone('ms-semi-val', 'p-spec'));
  // 注册新版里程碑
  const ms2 = s.addMilestone({
    intentId: newIntent.id, stage: 'validation', title: '800V 验证',
    responsiblePartyIds: ['p-r-s3gen'], scope: '800V 平台',
    prerequisites: [{ kind: 'stage', ref: 'resource' }]
  });
  // 新版草案 → 不能核验
  expectError('intent_not_active', () => s.verifyMilestone(ms2.id, 'p-spec'));
});

function activationCount(store, intentId) {
  return store.state.auditLog.filter((a) => a.action === 'intent.activate' && a.detail.includes(intentId)).length;
}
