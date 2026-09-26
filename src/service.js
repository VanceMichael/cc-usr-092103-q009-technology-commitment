import { Ledger } from './store.js';
import {
  CATEGORIES,
  STAGE_KEYS,
  PARTY_KINDS,
  projectKey,
  validation,
  notFound,
  conflict,
  forbidden,
  invalidState,
} from './domain.js';
import { buildReview } from './review.js';

// 同一项目同一时间只允许一个进行中的意向版本。
const ACTIVE_INTENT = new Set(['confirming', 'confirmed', 'executing']);

export class CommitmentService {
  constructor({ now } = {}) {
    this.ledger = new Ledger({ now });
  }

  // ---------- 基础校验 ----------

  requireParty(id) {
    const party = this.ledger.get('parties', id);
    if (!party) throw notFound(`参与方不存在: ${id}`);
    return party;
  }

  requireProject(id) {
    const project = this.ledger.get('projects', id);
    if (!project) throw notFound(`项目不存在: ${id}`);
    return project;
  }

  requireIntent(id) {
    const intent = this.ledger.get('intents', id);
    if (!intent) throw notFound(`意向不存在: ${id}`);
    return intent;
  }

  requireCommitment(id) {
    const commitment = this.ledger.get('commitments', id);
    if (!commitment) throw notFound(`承诺不存在: ${id}`);
    return commitment;
  }

  assertCategory(category) {
    if (!CATEGORIES[category]) throw validation(`未知合作类别: ${category}`);
  }

  assertParticipant(project, partyId) {
    if (!project.partyIds.includes(partyId)) {
      throw forbidden(`${partyId} 不是项目 ${project.id} 的参与方`);
    }
  }

  // ---------- 参与方 ----------

  registerParty({ name, kind }) {
    if (!name || !PARTY_KINDS[kind]) throw validation('参与方需要名称与合法角色');
    const party = { id: this.ledger.nextId('pty'), name, kind, createdAt: this.ledger.now() };
    this.ledger.put('parties', party);
    this.ledger.record('party.registered', { partyId: party.id });
    return party;
  }

  listParties() {
    return this.ledger.all('parties');
  }

  // ---------- 台企能力 / 北京科研资源 / 场景需求 ----------

  addCapability({ partyId, category, title, summary }) {
    const party = this.requireParty(partyId);
    if (party.kind !== 'taiwan-enterprise') throw validation('台企能力只能登记在台企名下');
    this.assertCategory(category);
    if (!title) throw validation('能力需要标题');
    const cap = { id: this.ledger.nextId('cap'), partyId, category, title, summary: summary ?? '', createdAt: this.ledger.now() };
    this.ledger.put('capabilities', cap);
    this.ledger.record('capability.added', { partyId, capabilityId: cap.id });
    return cap;
  }

  addResearchResource({ partyId, category, title, summary }) {
    const party = this.requireParty(partyId);
    if (party.kind !== 'research-institute') throw validation('科研资源只能登记在科研机构名下');
    this.assertCategory(category);
    if (!title) throw validation('科研资源需要标题');
    const res = { id: this.ledger.nextId('res'), partyId, category, title, summary: summary ?? '', createdAt: this.ledger.now() };
    this.ledger.put('researchResources', res);
    this.ledger.record('research-resource.added', { partyId, resourceId: res.id });
    return res;
  }

  addScenarioDemand({ partyId, category, title, summary }) {
    const party = this.requireParty(partyId);
    if (party.kind !== 'scenario-owner') throw validation('场景需求只能登记在场景方名下');
    this.assertCategory(category);
    if (!title) throw validation('场景需求需要标题');
    const dem = { id: this.ledger.nextId('scn'), partyId, category, title, summary: summary ?? '', createdAt: this.ledger.now() };
    this.ledger.put('scenarioDemands', dem);
    this.ledger.record('scenario-demand.added', { partyId, demandId: dem.id });
    return dem;
  }

  // ---------- 尽调材料（商业秘密按参与方隔离） ----------

  submitDueDiligence({ subjectPartyId, submittedByPartyId, kind, summary, visibleTo }) {
    this.requireParty(subjectPartyId);
    this.requireParty(submittedByPartyId);
    if (!kind) throw validation('尽调材料需要类型');
    const audience = [...new Set(visibleTo?.length ? visibleTo : [submittedByPartyId, subjectPartyId])];
    audience.forEach((id) => this.requireParty(id));
    const doc = {
      id: this.ledger.nextId('dd'),
      subjectPartyId,
      submittedByPartyId,
      kind,
      summary: summary ?? '',
      visibleTo: audience,
      createdAt: this.ledger.now(),
    };
    this.ledger.put('dueDiligence', doc);
    this.ledger.record('due-diligence.submitted', { docId: doc.id, subjectPartyId });
    return doc;
  }

  // 只返回 asPartyId 有权查看的材料；无身份时不暴露任何材料。
  listDueDiligence({ asPartyId }) {
    if (!asPartyId) throw validation('查阅尽调材料必须指定身份 asPartyId');
    return this.ledger
      .all('dueDiligence')
      .filter((d) => d.visibleTo.includes(asPartyId) || d.submittedByPartyId === asPartyId);
  }

  // ---------- 项目（重复项目去重） ----------

  createProject({ title, category, partyIds, clientKey }) {
    this.assertCategory(category);
    if (!title) throw validation('项目需要标题');
    if (!Array.isArray(partyIds) || partyIds.length === 0) throw validation('项目需要参与方');
    const uniqueParties = [...new Set(partyIds)];
    uniqueParties.forEach((id) => this.requireParty(id));
    const key = clientKey ? `client:${clientKey}` : projectKey(title, category, uniqueParties);
    const existing = this.ledger.all('projects').find((p) => p.key === key);
    if (existing) return { project: existing, deduplicated: true };
    const project = {
      id: this.ledger.nextId('prj'),
      key,
      title,
      category,
      partyIds: uniqueParties,
      status: 'forming',
      createdAt: this.ledger.now(),
    };
    this.ledger.put('projects', project);
    this.ledger.record('project.created', { projectId: project.id, category });
    return { project, deduplicated: false };
  }

  getProject(id) {
    return this.requireProject(id);
  }

  listProjects() {
    return this.ledger.all('projects');
  }

  projectHistory(id) {
    this.requireProject(id);
    return this.ledger.projectHistory(id);
  }

  // ---------- 意向与承诺 ----------

  activeIntentOf(projectId) {
    return this.ledger.all('intents').find((i) => i.projectId === projectId && ACTIVE_INTENT.has(i.status)) ?? null;
  }

  draftIntent({ projectId, commitments, supersede = false }) {
    const project = this.requireProject(projectId);
    if (!Array.isArray(commitments) || commitments.length === 0) throw validation('意向需要至少一条承诺');
    for (const c of commitments) {
      if (!STAGE_KEYS.includes(c.stage)) throw validation(`未知承诺阶段: ${c.stage}`);
      this.assertParticipant(project, c.responsiblePartyId);
      if (!c.scope) throw validation('承诺需要适用范围');
      // 没有证据要求的承诺会把"交换过名片"包装成成果，一律拒绝。
      if (!Array.isArray(c.evidenceRequirements) || c.evidenceRequirements.length === 0) {
        throw validation('每条承诺必须声明至少一种履约证据');
      }
    }
    const active = this.activeIntentOf(projectId);
    let version = 1;
    if (active) {
      if (!supersede) throw conflict(`项目已存在进行中的意向版本 v${active.version}，不得产生第二个有效版本`);
      if (active.status !== 'confirming') throw invalidState('意向已确认，条款变更须通过签约版本进行');
      active.status = 'superseded';
      this.terminateCommitments(active, '意向版本被替换');
      this.ledger.record('intent.superseded', { projectId, intentId: active.id, version: active.version });
      version = active.version + 1;
    }
    const intent = {
      id: this.ledger.nextId('int'),
      projectId,
      version,
      status: 'confirming',
      commitmentIds: [],
      confirmations: [],
      createdAt: this.ledger.now(),
    };
    this.ledger.put('intents', intent);
    for (const c of commitments) {
      const commitment = {
        id: this.ledger.nextId('cmt'),
        intentId: intent.id,
        intentVersion: version,
        projectId,
        stage: c.stage,
        responsiblePartyId: c.responsiblePartyId,
        scope: c.scope,
        preconditions: c.preconditions ?? [],
        evidenceRequirements: c.evidenceRequirements,
        status: 'pending',
        evidenceIds: [],
      };
      this.ledger.put('commitments', commitment);
      intent.commitmentIds.push(commitment.id);
    }
    this.ledger.record('intent.drafted', { projectId, intentId: intent.id, version });
    return intent;
  }

  // 多方同时确认：同一方重复确认幂等；版本号不匹配即拒绝，保证只有一个有效版本。
  confirmIntent({ intentId, partyId, version }) {
    const intent = this.requireIntent(intentId);
    const project = this.requireProject(intent.projectId);
    this.assertParticipant(project, partyId);
    const already = intent.confirmations.find((c) => c.partyId === partyId && c.version === intent.version);
    if (already) return { intent, alreadyConfirmed: true };
    if (intent.status !== 'confirming') throw invalidState(`意向当前状态 ${intent.status}，不能确认`);
    if (version !== intent.version) throw conflict(`意向已变为 v${intent.version}，请确认最新版本`);
    intent.confirmations.push({ partyId, version, at: this.ledger.now() });
    this.ledger.record('intent.confirmed', { projectId: project.id, intentId, partyId, version });
    if (project.partyIds.every((id) => intent.confirmations.some((c) => c.partyId === id && c.version === version))) {
      intent.status = 'confirmed';
      intent.confirmedAt = this.ledger.now();
      this.ledger.record('intent.all-confirmed', { projectId: project.id, intentId, version });
    }
    return { intent, alreadyConfirmed: false };
  }

  // 只有各方确认完整的意向才能进入执行。
  startExecution({ intentId }) {
    const intent = this.requireIntent(intentId);
    if (intent.status !== 'confirmed') throw invalidState('只有各方确认完整的意向才能进入执行');
    intent.status = 'executing';
    intent.startedAt = this.ledger.now();
    const project = this.requireProject(intent.projectId);
    project.status = 'executing';
    this.ledger.record('intent.executing', { projectId: project.id, intentId, version: intent.version });
    return intent;
  }

  // 撤回只终止后续动作：未完成的承诺终止，已履约的保持原样，历史事件保留。
  withdrawIntent({ intentId, byPartyId, reason }) {
    const intent = this.requireIntent(intentId);
    const project = this.requireProject(intent.projectId);
    this.assertParticipant(project, byPartyId);
    if (!ACTIVE_INTENT.has(intent.status)) throw invalidState(`意向当前状态 ${intent.status}，不能撤回`);
    intent.status = 'withdrawn';
    intent.withdrawnBy = byPartyId;
    intent.withdrawnReason = reason ?? '';
    intent.withdrawnAt = this.ledger.now();
    this.terminateCommitments(intent, '意向已撤回');
    for (const m of this.ledger.all('milestones')) {
      if (m.projectId === project.id && m.status === 'open') m.status = 'terminated';
    }
    this.ledger.record('intent.withdrawn', { projectId: project.id, intentId, byPartyId, reason: reason ?? '' });
    return intent;
  }

  terminateCommitments(intent, reason) {
    for (const id of intent.commitmentIds) {
      const c = this.ledger.get('commitments', id);
      if (c.status === 'pending') {
        c.status = 'terminated';
        c.terminatedReason = reason;
      }
    }
  }

  // ---------- 履约与证据 ----------

  submitEvidence({ projectId, commitmentId, milestoneId, kind, summary, hash, submittedByPartyId, classification = 'shared', visibleTo }) {
    const project = this.requireProject(projectId);
    this.assertParticipant(project, submittedByPartyId);
    if (!kind) throw validation('证据需要类型');
    if (commitmentId) {
      const c = this.requireCommitment(commitmentId);
      if (c.projectId !== projectId) throw validation('证据与承诺不属于同一项目');
    }
    if (milestoneId) {
      const m = this.ledger.get('milestones', milestoneId);
      if (!m) throw notFound(`里程碑不存在: ${milestoneId}`);
      if (m.projectId !== projectId) throw validation('证据与里程碑不属于同一项目');
    }
    if (!['shared', 'restricted'].includes(classification)) throw validation(`未知证据级别: ${classification}`);
    let audience = null;
    if (classification === 'restricted') {
      if (!Array.isArray(visibleTo) || visibleTo.length === 0) throw validation('商业秘密证据必须指定可见参与方');
      audience = [...new Set([...visibleTo, submittedByPartyId])];
      audience.forEach((id) => this.assertParticipant(project, id));
    }
    const ev = {
      id: this.ledger.nextId('evd'),
      projectId,
      commitmentId: commitmentId ?? null,
      milestoneId: milestoneId ?? null,
      kind,
      summary: summary ?? '',
      hash: hash ?? null,
      submittedByPartyId,
      classification,
      visibleTo: audience,
      createdAt: this.ledger.now(),
    };
    this.ledger.put('evidence', ev);
    this.ledger.record('evidence.submitted', { projectId, evidenceId: ev.id, kind, classification });
    return ev;
  }

  fulfillCommitment({ commitmentId, evidenceIds = [], byPartyId }) {
    const c = this.requireCommitment(commitmentId);
    const intent = this.requireIntent(c.intentId);
    const project = this.requireProject(c.projectId);
    if (intent.status !== 'executing') throw invalidState('意向未进入执行，不能登记履约');
    if (c.status !== 'pending') throw invalidState(`承诺当前状态 ${c.status}，不能登记履约`);
    const actor = this.requireParty(byPartyId);
    this.assertParticipant(project, byPartyId);
    if (byPartyId !== c.responsiblePartyId && actor.kind !== 'specialist') {
      throw forbidden('只能由责任主体或项目专员登记履约');
    }
    for (const evId of evidenceIds) {
      const ev = this.ledger.get('evidence', evId);
      if (!ev) throw notFound(`证据不存在: ${evId}`);
      if (ev.projectId !== c.projectId) throw validation('证据与承诺不属于同一项目');
      if (ev.commitmentId && ev.commitmentId !== commitmentId) throw validation('证据已归属其他承诺');
      ev.commitmentId = commitmentId;
      if (!c.evidenceIds.includes(evId)) c.evidenceIds.push(evId);
    }
    const attachedKinds = new Set(c.evidenceIds.map((id) => this.ledger.get('evidence', id).kind));
    const missing = c.evidenceRequirements.filter((k) => !attachedKinds.has(k));
    if (missing.length > 0) throw validation(`缺少履约证据: ${missing.join('、')}`);
    c.status = 'fulfilled';
    c.fulfilledAt = this.ledger.now();
    c.fulfilledBy = byPartyId;
    this.ledger.record('commitment.fulfilled', { projectId: c.projectId, commitmentId, stage: c.stage, byPartyId });
    return c;
  }

  withdrawCommitment({ commitmentId, byPartyId, reason }) {
    const c = this.requireCommitment(commitmentId);
    const project = this.requireProject(c.projectId);
    const actor = this.requireParty(byPartyId);
    this.assertParticipant(project, byPartyId);
    if (byPartyId !== c.responsiblePartyId && actor.kind !== 'specialist') {
      throw forbidden('只能由责任主体或项目专员撤回承诺');
    }
    if (c.status === 'fulfilled') throw invalidState('已履约承诺不可撤回');
    if (c.status !== 'pending') throw invalidState(`承诺当前状态 ${c.status}，不能撤回`);
    c.status = 'terminated';
    c.terminatedReason = reason ?? '承诺撤回';
    this.ledger.record('commitment.withdrawn', { projectId: project.id, commitmentId, byPartyId, reason: reason ?? '' });
    return c;
  }

  // ---------- 签约版本 ----------

  // 版本变化必须明确影响哪些未完成承诺；affects 只能引用未完成承诺。
  createContractVersion({ projectId, terms, affects = [], byPartyId }) {
    const project = this.requireProject(projectId);
    this.assertParticipant(project, byPartyId);
    const active = this.activeIntentOf(projectId);
    if (!active || active.status !== 'executing') throw invalidState('意向未进入执行，不能登记签约版本');
    if (!terms) throw validation('签约版本需要条款内容');
    for (const cmtId of affects) {
      const c = this.requireCommitment(cmtId);
      if (c.projectId !== projectId) throw validation('影响声明引用了其他项目的承诺');
      if (c.status !== 'pending') throw validation(`承诺 ${cmtId} 已完成或已终止，版本影响只能声明未完成承诺`);
    }
    const versions = this.ledger.all('contracts').filter((ct) => ct.projectId === projectId);
    const contract = {
      id: this.ledger.nextId('ctr'),
      projectId,
      version: versions.length === 0 ? 1 : Math.max(...versions.map((v) => v.version)) + 1,
      terms,
      affects: [...new Set(affects)],
      status: 'draft',
      createdBy: byPartyId,
      createdAt: this.ledger.now(),
    };
    this.ledger.put('contracts', contract);
    this.ledger.record('contract.drafted', { projectId, contractId: contract.id, version: contract.version, affects: contract.affects });
    return contract;
  }

  // 激活采用比较并交换：调用方声明期望的当前有效版本，不一致即冲突，
  // 多方同时激活时只有一个成功，系统内始终最多一个有效版本。
  activateContract({ contractId, expectedValidVersion = null }) {
    const contract = this.ledger.get('contracts', contractId);
    if (!contract) throw notFound(`签约版本不存在: ${contractId}`);
    if (contract.status !== 'draft') throw invalidState(`签约版本当前状态 ${contract.status}，不能激活`);
    const currentValid = this.ledger.all('contracts').find((ct) => ct.projectId === contract.projectId && ct.status === 'valid') ?? null;
    const currentVersion = currentValid ? currentValid.version : null;
    if (currentVersion !== expectedValidVersion) {
      throw conflict(`当前有效版本为 ${currentVersion ?? '无'}，与期望 ${expectedValidVersion ?? '无'} 不一致，激活失败`);
    }
    if (currentValid) {
      currentValid.status = 'superseded';
      this.ledger.record('contract.superseded', { projectId: contract.projectId, contractId: currentValid.id, version: currentValid.version });
    }
    contract.status = 'valid';
    contract.activatedAt = this.ledger.now();
    const affected = [];
    for (const cmtId of contract.affects) {
      const c = this.ledger.get('commitments', cmtId);
      if (c.status === 'pending') {
        c.status = 'superseded';
        c.supersededBy = contractId;
        affected.push(cmtId);
      }
    }
    this.ledger.record('contract.activated', { projectId: contract.projectId, contractId, version: contract.version, affectedCommitments: affected });
    return contract;
  }

  withdrawContract({ contractId, byPartyId, reason }) {
    const contract = this.ledger.get('contracts', contractId);
    if (!contract) throw notFound(`签约版本不存在: ${contractId}`);
    const project = this.requireProject(contract.projectId);
    this.assertParticipant(project, byPartyId);
    if (!['draft', 'valid'].includes(contract.status)) throw invalidState(`签约版本当前状态 ${contract.status}，不能撤回`);
    contract.status = 'withdrawn';
    contract.withdrawnBy = byPartyId;
    contract.withdrawnReason = reason ?? '';
    contract.withdrawnAt = this.ledger.now();
    this.ledger.record('contract.withdrawn', { projectId: project.id, contractId, byPartyId, reason: reason ?? '' });
    return contract;
  }

  // ---------- 里程碑 ----------

  addMilestone({ projectId, stage, title, dueDate, commitmentId }) {
    this.requireProject(projectId);
    if (!STAGE_KEYS.includes(stage)) throw validation(`未知里程碑阶段: ${stage}`);
    if (!title) throw validation('里程碑需要标题');
    if (commitmentId) {
      const c = this.requireCommitment(commitmentId);
      if (c.projectId !== projectId) throw validation('里程碑与承诺不属于同一项目');
    }
    const m = {
      id: this.ledger.nextId('mil'),
      projectId,
      stage,
      title,
      dueDate: dueDate ?? null,
      commitmentId: commitmentId ?? null,
      status: 'open',
      evidenceIds: [],
      createdAt: this.ledger.now(),
    };
    this.ledger.put('milestones', m);
    this.ledger.record('milestone.added', { projectId, milestoneId: m.id, stage });
    return m;
  }

  completeMilestone({ milestoneId, evidenceIds = [], byPartyId }) {
    const m = this.ledger.get('milestones', milestoneId);
    if (!m) throw notFound(`里程碑不存在: ${milestoneId}`);
    const project = this.requireProject(m.projectId);
    this.assertParticipant(project, byPartyId);
    if (project.status !== 'executing') throw invalidState('项目未进入执行，不能完成里程碑');
    if (m.status !== 'open') throw invalidState(`里程碑当前状态 ${m.status}，不能完成`);
    for (const evId of evidenceIds) {
      const ev = this.ledger.get('evidence', evId);
      if (!ev) throw notFound(`证据不存在: ${evId}`);
      if (ev.projectId !== m.projectId) throw validation('证据与里程碑不属于同一项目');
      ev.milestoneId = milestoneId;
      if (!m.evidenceIds.includes(evId)) m.evidenceIds.push(evId);
    }
    m.status = 'done';
    m.completedAt = this.ledger.now();
    this.ledger.record('milestone.completed', { projectId: m.projectId, milestoneId, byPartyId });
    return m;
  }

  // ---------- 复盘 ----------

  review({ asPartyId } = {}) {
    return buildReview(this.ledger, { asPartyId });
  }
}
