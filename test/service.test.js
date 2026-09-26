import test from 'node:test';
import assert from 'node:assert/strict';
import { CommitmentService } from '../src/service.js';

// 最小场景：一个专员 + 三方参与的项目，含接洽/签约两条承诺。
function setup() {
  const s = new CommitmentService({ now: () => '2026-09-26T00:00:00.000Z' });
  const spec = s.registerParty({ name: '专员', kind: 'specialist' });
  const tw = s.registerParty({ name: '台企', kind: 'taiwan-enterprise' });
  const ri = s.registerParty({ name: '科研机构', kind: 'research-institute' });
  const so = s.registerParty({ name: '场景方', kind: 'scenario-owner' });
  const { project } = s.createProject({ title: '联合验证', category: 'semiconductor', partyIds: [tw.id, ri.id, so.id] });
  const intent = s.draftIntent({
    projectId: project.id,
    commitments: [
      { stage: 'engagement', responsiblePartyId: tw.id, scope: '需求对齐', preconditions: ['保密协议'], evidenceRequirements: ['会议纪要'] },
      { stage: 'signing', responsiblePartyId: tw.id, scope: '签署协议', preconditions: ['意向确认完整'], evidenceRequirements: ['合同文本'] },
    ],
  });
  return { s, spec, tw, ri, so, project, intent };
}

function confirmAll(s, intent, parties, version = 1) {
  for (const p of parties) s.confirmIntent({ intentId: intent.id, partyId: p.id, version });
}

test('只有各方确认完整的意向才能进入执行', () => {
  const { s, tw, ri, so, intent } = setup();
  s.confirmIntent({ intentId: intent.id, partyId: tw.id, version: 1 });
  s.confirmIntent({ intentId: intent.id, partyId: ri.id, version: 1 });
  assert.throws(() => s.startExecution({ intentId: intent.id }), /只有各方确认完整/);
  s.confirmIntent({ intentId: intent.id, partyId: so.id, version: 1 });
  const started = s.startExecution({ intentId: intent.id });
  assert.equal(started.status, 'executing');
});

test('多方同时确认：同一方重复确认幂等，非参与方被拒绝', () => {
  const { s, tw, ri, so, intent } = setup();
  const first = s.confirmIntent({ intentId: intent.id, partyId: tw.id, version: 1 });
  const again = s.confirmIntent({ intentId: intent.id, partyId: tw.id, version: 1 });
  assert.equal(first.alreadyConfirmed, false);
  assert.equal(again.alreadyConfirmed, true);
  assert.equal(intent.confirmations.length, 1);
  const outsider = s.registerParty({ name: '局外人', kind: 'taiwan-enterprise' });
  assert.throws(() => s.confirmIntent({ intentId: intent.id, partyId: outsider.id, version: 1 }), /不是项目/);
  confirmAll(s, intent, [ri, so]);
  assert.equal(intent.status, 'confirmed');
});

test('重复项目不会产生第二个：同键去重，不同标题另立', () => {
  const { s, tw, ri, so, project } = setup();
  const dup = s.createProject({ title: '  联合验证 ', category: 'semiconductor', partyIds: [so.id, tw.id, ri.id] });
  assert.equal(dup.deduplicated, true);
  assert.equal(dup.project.id, project.id);
  const byKey = s.createProject({ title: '完全不同的名字', category: 'semiconductor', partyIds: [tw.id, ri.id, so.id], clientKey: 'forum-2026-001' });
  assert.equal(byKey.deduplicated, false);
  const again = s.createProject({ title: '随便什么', category: 'semiconductor', partyIds: [tw.id], clientKey: 'forum-2026-001' });
  assert.equal(again.deduplicated, true);
  assert.equal(again.project.id, byKey.project.id);
  assert.equal(s.listProjects().length, 2);
});

test('同一项目不得有两个进行中的意向版本；替换后旧版本确认失效', () => {
  const { s, tw, intent, project } = setup();
  assert.throws(() => s.draftIntent({ projectId: project.id, commitments: [{ stage: 'engagement', responsiblePartyId: tw.id, scope: 'x', evidenceRequirements: ['会议纪要'] }] }), /不得产生第二个有效版本/);
  s.confirmIntent({ intentId: intent.id, partyId: tw.id, version: 1 });
  const v2 = s.draftIntent({
    projectId: project.id,
    supersede: true,
    commitments: [{ stage: 'engagement', responsiblePartyId: tw.id, scope: '新条款', evidenceRequirements: ['会议纪要'] }],
  });
  assert.equal(v2.version, 2);
  assert.equal(intent.status, 'superseded');
  assert.throws(() => s.confirmIntent({ intentId: v2.id, partyId: tw.id, version: 1 }), /请确认最新版本/);
  assert.equal(v2.confirmations.length, 0, '旧版本的确认不得带入新版本');
});

test('撤回只终止后续动作：已履约保留，未完成终止，历史可查', () => {
  const { s, tw, ri, so, intent, project } = setup();
  confirmAll(s, intent, [tw, ri, so]);
  s.startExecution({ intentId: intent.id });
  const ev = s.submitEvidence({ projectId: project.id, commitmentId: intent.commitmentIds[0], kind: '会议纪要', summary: '首轮纪要', submittedByPartyId: tw.id });
  s.fulfillCommitment({ commitmentId: intent.commitmentIds[0], byPartyId: tw.id, evidenceIds: [ev.id] });
  s.withdrawIntent({ intentId: intent.id, byPartyId: so.id, reason: '方向调整' });
  const done = s.ledger.get('commitments', intent.commitmentIds[0]);
  const pending = s.ledger.get('commitments', intent.commitmentIds[1]);
  assert.equal(done.status, 'fulfilled', '已履约承诺不受撤回影响');
  assert.equal(pending.status, 'terminated', '未完成承诺被终止');
  assert.throws(() => s.fulfillCommitment({ commitmentId: pending.id, byPartyId: tw.id, evidenceIds: [] }), /不能登记履约/);
  const history = s.projectHistory(project.id).map((e) => e.type);
  assert.ok(history.includes('commitment.fulfilled') && history.includes('intent.withdrawn'), '半年后复盘仍可核实经过');
});

test('撤回中的意向不再接受新的确认', () => {
  const { s, tw, ri, so, intent } = setup();
  s.confirmIntent({ intentId: intent.id, partyId: tw.id, version: 1 });
  s.withdrawIntent({ intentId: intent.id, byPartyId: so.id, reason: '条款重议' });
  assert.throws(() => s.confirmIntent({ intentId: intent.id, partyId: ri.id, version: 1 }), /不能确认/);
  // 已确认方的重试仍是幂等回执，不产生新动作。
  const replay = s.confirmIntent({ intentId: intent.id, partyId: tw.id, version: 1 });
  assert.equal(replay.alreadyConfirmed, true);
  assert.equal(intent.confirmations.length, 1);
});

test('每条承诺必须声明履约证据，否则拒绝登记', () => {
  const { s, tw, project } = setup();
  assert.throws(
    () => s.draftIntent({ projectId: project.id, commitments: [{ stage: 'engagement', responsiblePartyId: tw.id, scope: '交换名片', evidenceRequirements: [] }] }),
    /至少一种履约证据/,
  );
});

test('履约必须覆盖承诺声明的全部证据类型', () => {
  const { s, tw, ri, so, intent, project } = setup();
  confirmAll(s, intent, [tw, ri, so]);
  s.startExecution({ intentId: intent.id });
  assert.throws(() => s.fulfillCommitment({ commitmentId: intent.commitmentIds[0], byPartyId: tw.id, evidenceIds: [] }), /缺少履约证据: 会议纪要/);
  const wrong = s.submitEvidence({ projectId: project.id, kind: '名片', summary: '交换名片', submittedByPartyId: tw.id });
  assert.throws(() => s.fulfillCommitment({ commitmentId: intent.commitmentIds[0], byPartyId: tw.id, evidenceIds: [wrong.id] }), /缺少履约证据/);
});

test('履约只能由责任主体或项目专员登记', () => {
  const { s, tw, ri, so, intent, project } = setup();
  confirmAll(s, intent, [tw, ri, so]);
  s.startExecution({ intentId: intent.id });
  const ev = s.submitEvidence({ projectId: project.id, kind: '会议纪要', summary: '纪要', submittedByPartyId: tw.id });
  assert.throws(() => s.fulfillCommitment({ commitmentId: intent.commitmentIds[0], byPartyId: ri.id, evidenceIds: [ev.id] }), /责任主体或项目专员/);
});

test('签约版本：影响声明只能指向未完成承诺', () => {
  const { s, tw, ri, so, intent, project } = setup();
  confirmAll(s, intent, [tw, ri, so]);
  s.startExecution({ intentId: intent.id });
  const ev = s.submitEvidence({ projectId: project.id, commitmentId: intent.commitmentIds[0], kind: '会议纪要', summary: '纪要', submittedByPartyId: tw.id });
  s.fulfillCommitment({ commitmentId: intent.commitmentIds[0], byPartyId: tw.id, evidenceIds: [ev.id] });
  assert.throws(
    () => s.createContractVersion({ projectId: project.id, byPartyId: tw.id, terms: 'v1', affects: [intent.commitmentIds[0]] }),
    /只能声明未完成承诺/,
  );
});

test('签约版本：同时激活只有一个成功，被影响的未完成承诺标记为被取代', () => {
  const { s, tw, ri, so, intent, project } = setup();
  confirmAll(s, intent, [tw, ri, so]);
  s.startExecution({ intentId: intent.id });
  const v1 = s.createContractVersion({ projectId: project.id, byPartyId: tw.id, terms: '协议 v1', affects: [] });
  s.activateContract({ contractId: v1.id, expectedValidVersion: null });
  const v2a = s.createContractVersion({ projectId: project.id, byPartyId: tw.id, terms: '补充协议A', affects: [intent.commitmentIds[1]] });
  const v2b = s.createContractVersion({ projectId: project.id, byPartyId: tw.id, terms: '补充协议B', affects: [] });
  s.activateContract({ contractId: v2a.id, expectedValidVersion: 1 });
  // 模拟多方同时激活：另一份草稿按同一期望版本提交，必须冲突。
  assert.throws(() => s.activateContract({ contractId: v2b.id, expectedValidVersion: 1 }), /不一致，激活失败/);
  const valid = s.ledger.all('contracts').filter((c) => c.projectId === project.id && c.status === 'valid');
  assert.equal(valid.length, 1);
  assert.equal(valid[0].id, v2a.id);
  assert.equal(v1.status, 'superseded');
  const affected = s.ledger.get('commitments', intent.commitmentIds[1]);
  assert.equal(affected.status, 'superseded');
  assert.equal(affected.supersededBy, v2a.id);
});

test('尽调材料按参与方隔离，无身份不得查阅', () => {
  const { s, spec, tw, ri } = setup();
  s.submitDueDiligence({ subjectPartyId: tw.id, submittedByPartyId: spec.id, kind: '财务审计', summary: '摘要', visibleTo: [spec.id, ri.id] });
  assert.equal(s.listDueDiligence({ asPartyId: ri.id }).length, 1);
  assert.equal(s.listDueDiligence({ asPartyId: tw.id }).length, 0, '被审对象不在可见名单也看不到');
  assert.throws(() => s.listDueDiligence({}), /必须指定身份/);
});
