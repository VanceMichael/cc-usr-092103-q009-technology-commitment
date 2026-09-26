// 承诺管理领域服务：登记、多方确认、版本、撤回、里程碑核验、商业秘密隔离。
import crypto from 'node:crypto';
import { intentContentHash } from './hashing.js';
import {
  CATEGORIES, ROLES, STAGES, STAGE_ORDER,
  INTENT_STATUS, MILESTONE_STATUS, CONFIDENTIAL_LEVELS,
  evidenceSupportsStage, assertCategory, assertRole
} from './catalog.js';
import { DomainError } from './store.js';

export { intentContentHash };

let seq = 0;
function genId(prefix) {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}-${crypto.randomBytes(2).toString('hex')}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export class CommitmentService {
  constructor(store) {
    this.store = store;
  }

  _requireParty(partyId) {
    const p = this.store.getParty(partyId);
    if (!p) throw new DomainError('party_not_found', `参与方不存在：${partyId}`);
    return p;
  }

  // —— 目录对象维护 ——
  registerParty({ id, name, role }) {
    assertRole(role);
    const party = { id, name, role };
    this.store.addParty(party);
    this.store.audit({ actorPartyId: 'system', action: 'party.register', detail: `新增参与方 ${id}（${role}）` });
    return party;
  }

  registerCapability({ ownerPartyId, category, title, detail }) {
    this._requireParty(ownerPartyId);
    assertCategory(category);
    const rec = { id: genId('cap'), ownerPartyId, category, title, detail };
    this.store.addCapability(rec);
    return rec;
  }

  registerResource({ ownerPartyId, category, title, detail }) {
    this._requireParty(ownerPartyId);
    assertCategory(category);
    const rec = { id: genId('res'), ownerPartyId, category, title, detail };
    this.store.addResource(rec);
    return rec;
  }

  registerNeed({ ownerPartyId, category, title, detail }) {
    this._requireParty(ownerPartyId);
    assertCategory(category);
    const rec = { id: genId('need'), ownerPartyId, category, title, detail };
    this.store.addNeed(rec);
    return rec;
  }

  // —— 尽调材料（商业秘密按参与方隔离） ——
  submitMaterial({ intentId, ownerPartyId, name, level = CONFIDENTIAL_LEVELS.NORMAL, visibleToPartyIds = [], ref }) {
    const intent = this.store.getIntent(intentId);
    if (!intent) throw new DomainError('intent_not_found', `意向不存在：${intentId}`);
    this._requireParty(ownerPartyId);
    if (!intent.participantPartyIds.includes(ownerPartyId)) {
      throw new DomainError('not_participant', '只有意向参与方可以提交尽调材料');
    }
    if (level === CONFIDENTIAL_LEVELS.SECRET) {
      // 商业秘密授权对象必须同为参与方，防止跨项目泄露。
      for (const pid of visibleToPartyIds) {
        if (!intent.participantPartyIds.includes(pid)) {
          throw new DomainError('secret_scope_violation', `商业秘密不得授权给非参与方：${pid}`);
        }
      }
    }
    const mat = {
      id: genId('mat'), intentId, ownerPartyId, name,
      level, visibleToPartyIds: level === CONFIDENTIAL_LEVELS.SECRET ? [...new Set(visibleToPartyIds)] : [],
      ref, at: today()
    };
    this.store.addMaterial(mat);
    this.store.audit({ actorPartyId: ownerPartyId, action: 'material.submit', detail: `提交材料 ${mat.name}（${level}）` });
    this._bindDdRequirement(intent, mat);
    return mat;
  }

  // 提交材料后自动匹配同一责任方名下尚未满足的尽调项。
  _bindDdRequirement(intent, mat) {
    const open = (intent.ddRequired || []).find((d) => d.ownerPartyId === mat.ownerPartyId && !d.materialId);
    if (open) {
      open.materialId = mat.id;
      this.store.updateIntent(intent.id, { ddRequired: intent.ddRequired });
    }
  }

  listMaterialsForViewer(intentId, viewerPartyId) {
    return this.store.listMaterials()
      .filter((m) => m.intentId === intentId)
      .map((m) => this.store.viewMaterial(m, viewerPartyId))
      .filter(Boolean);
  }

  // —— 意向登记：重复项目不得再产生有效版本 ——
  registerIntent(input) {
    const {
      projectKey, category, title, participantPartyIds,
      commitments = [], ddRequired = [], scope = '', links = null
    } = input;
    assertCategory(category);
    if (!projectKey || !title) throw new DomainError('invalid_input', '缺少项目标识或标题');
    if (!Array.isArray(participantPartyIds) || participantPartyIds.length < 2) {
      throw new DomainError('invalid_input', '意向至少需要两方参与');
    }
    for (const pid of participantPartyIds) this._requireParty(pid);
    if (!participantPartyIds.some((pid) => this.store.getParty(pid).role === ROLES.TAIWAN_ENTERPRISE)) {
      throw new DomainError('invalid_input', '意向必须包含台企能力提供方');
    }

    // 同一项目键（归一化）只允许一个 active 版本。重复登记直接拒绝，而不是悄悄建第二份。
    const key = projectKey.trim().toLowerCase();
    const existing = this.store.findByProjectKey(key);
    const activeExisting = existing.find((i) => i.status === INTENT_STATUS.ACTIVE);
    if (activeExisting) {
      throw new DomainError('duplicate_active_intent',
        `项目 ${key} 已存在有效版本 ${activeExisting.id}（v${activeExisting.version}）；如需变更请走“新版本登记”，不得另立有效版本`);
    }

    const version = input.version
      || (existing.length ? Math.max(...existing.map((i) => i.version)) + 1 : 1);

    const intent = {
      id: genId('intent'), projectKey: key, category, title,
      version, status: INTENT_STATUS.DRAFT,
      participantPartyIds: [...new Set(participantPartyIds)],
      links, scope,
      commitments: commitments.map((c, idx) => ({ id: `cmt-${idx + 1}`, ...c })),
      ddRequired,
      confirmations: {},
      createdAt: today()
    };
    this.store.addIntent(intent);
    this.store.audit({ actorPartyId: 'system', action: 'intent.register', detail: `登记意向 ${intent.id}（${key} v${version}），状态：待确认` });
    return intent;
  }

  // —— 多方确认：必须确认同一内容指纹 ——
  confirmIntent(intentId, partyId, clientContentHash = null) {
    const intent = this.store.getIntent(intentId);
    if (!intent) throw new DomainError('intent_not_found', `意向不存在：${intentId}`);
    this._requireParty(partyId);
    if (!intent.participantPartyIds.includes(partyId)) {
      throw new DomainError('not_participant', '非参与方不能确认该意向');
    }
    if (intent.status === INTENT_STATUS.WITHDRAWN) {
      throw new DomainError('intent_withdrawn', '意向已撤回，不能再确认');
    }
    if (intent.status === INTENT_STATUS.SUPERSEDED) {
      throw new DomainError('intent_superseded', '该版本已被替代，请确认最新版本');
    }
    const hash = intentContentHash(intent);
    if (clientContentHash && clientContentHash !== hash) {
      throw new DomainError('content_mismatch', '确认内容与当前意向正文不一致，请先核对版本');
    }
    const firstTime = !intent.confirmations[partyId];
    intent.confirmations[partyId] = { at: new Date().toISOString(), hash };
    this.store.updateIntent(intentId, { confirmations: intent.confirmations });
    if (firstTime) {
      this.store.audit({ actorPartyId: partyId, action: 'intent.confirm', detail: `确认意向 ${intentId} v${intent.version}` });
    }
    return this._tryActivate(intent);
  }

  // 只有各方确认完整的意向才能进入执行。检查与写入之间不允许穿插其它变更（事件循环原子性 + 锁）。
  _tryActivate(intent) {
    if (intent.status !== INTENT_STATUS.DRAFT) return { intent, activated: false };
    if (!this.store.tryLockActivation(intent.id)) {
      // 另一路确认正在激活：重读后返回现状，绝不重复激活。
      return { intent: this.store.getIntent(intent.id), activated: false };
    }
    try {
      const fresh = this.store.getIntent(intent.id);
      if (fresh.status !== INTENT_STATUS.DRAFT) return { intent: fresh, activated: false };

      const missingParties = fresh.participantPartyIds.filter((p) => !fresh.confirmations[p]);
      if (missingParties.length > 0) {
        return { intent: fresh, activated: false, waitingParties: missingParties };
      }
      const hashes = new Set(Object.values(fresh.confirmations).map((c) => c.hash));
      if (hashes.size !== 1) {
        throw new DomainError('confirmation_hash_conflict', '各方确认的内容指纹不一致，不能进入执行');
      }
      const missingDd = (fresh.ddRequired || []).filter((d) => !d.materialId);
      if (missingDd.length > 0) {
        return { intent: fresh, activated: false, missingDd };
      }
      // 同一项目键下不得已有 active 版本（并发新版本登记的最后防线）。
      const anotherActive = this.store.findByProjectKey(fresh.projectKey)
        .some((i) => i.id !== fresh.id && i.status === INTENT_STATUS.ACTIVE);
      if (anotherActive) {
        throw new DomainError('duplicate_active_intent', '同一项目已存在有效版本，拒绝重复激活');
      }

      Object.assign(fresh, { status: INTENT_STATUS.ACTIVE, activatedAt: new Date().toISOString() });
      this.store.updateIntent(fresh.id, {
        status: fresh.status, activatedAt: fresh.activatedAt
      });
      // 激活后释放以签约为前置的里程碑。
      for (const ms of this.store.milestonesOfIntent(fresh.id)) {
        if (ms.status === MILESTONE_STATUS.PENDING && this._prereqsMet(fresh, ms)) {
          this.store.updateMilestone(ms.id, { status: MILESTONE_STATUS.OPEN });
        }
      }
      this.store.audit({ actorPartyId: 'system', action: 'intent.activate', detail: `意向 ${fresh.id} 各方确认完整、尽调到齐，进入执行` });
      return { intent: fresh, activated: true };
    } finally {
      this.store.unlockActivation(intent.id);
    }
  }

  // —— 撤回：只终止后续动作，历史事实保留 ——
  withdraw(intentId, partyId, reason) {
    const intent = this.store.getIntent(intentId);
    if (!intent) throw new DomainError('intent_not_found', `意向不存在：${intentId}`);
    if (!intent.participantPartyIds.includes(partyId)) {
      throw new DomainError('not_participant', '只有参与方可以撤回意向');
    }
    if (intent.status === INTENT_STATUS.WITHDRAWN) {
      throw new DomainError('already_withdrawn', '意向已处于撤回状态');
    }
    if (intent.status === INTENT_STATUS.SUPERSEDED) {
      throw new DomainError('intent_superseded', '已被替代的版本不能撤回，请操作最新版本');
    }
    Object.assign(intent, {
      status: INTENT_STATUS.WITHDRAWN,
      withdrawnAt: new Date().toISOString(),
      withdrawnByPartyId: partyId,
      withdrawReason: reason || ''
    });
    this.store.updateIntent(intentId, {
      status: intent.status, withdrawnAt: intent.withdrawnAt,
      withdrawnByPartyId: intent.withdrawnByPartyId, withdrawReason: intent.withdrawReason
    });
    // 仅终止“后续动作”：未完成的里程碑终止；已完成的接洽、签约等事实一律保留。
    let terminated = 0;
    for (const ms of this.store.milestonesOfIntent(intentId)) {
      if (ms.status === MILESTONE_STATUS.DONE) continue;
      if (ms.status !== MILESTONE_STATUS.TERMINATED) {
        this.store.updateMilestone(ms.id, {
          status: MILESTONE_STATUS.TERMINATED,
          terminatedReason: '意向撤回：仅终止后续动作，历史阶段事实保留'
        });
        terminated += 1;
      }
    }
    this.store.audit({ actorPartyId: partyId, action: 'intent.withdraw', detail: `撤回 ${intentId}，终止 ${terminated} 个未完成里程碑；已完成事实保留。原因：${reason || '（未填写）'}` });
    return { intent, terminatedMilestones: terminated };
  }

  // —— 版本变更：旧版标记 superseded，并明确受影响的未完成承诺 ——
  registerNewVersion(currentIntentId, { title, commitments, ddRequired, scope, changesNote, participantPartyIds }) {
    const current = this.store.getIntent(currentIntentId);
    if (!current) throw new DomainError('intent_not_found', `意向不存在：${currentIntentId}`);
    if (current.status === INTENT_STATUS.SUPERSEDED) {
      throw new DomainError('intent_superseded', '只能从当前有效版本派生新版本');
    }
    if (current.status === INTENT_STATUS.WITHDRAWN) {
      throw new DomainError('intent_withdrawn', '已撤回意向不能改版，请重新登记新项目');
    }

    const nextVersion = current.version + 1;
    // 旧版立即被替代；其未完成（非 done/terminated）里程碑受影响，逐条挂起等待新版重新确认。
    Object.assign(current, { status: INTENT_STATUS.SUPERSEDED, supersededAt: new Date().toISOString() });
    this.store.updateIntent(current.id, { status: current.status, supersededAt: current.supersededAt });

    const affectedMilestoneIds = [];
    for (const ms of this.store.milestonesOfIntent(current.id)) {
      if (ms.status === MILESTONE_STATUS.DONE || ms.status === MILESTONE_STATUS.TERMINATED) continue;
      this.store.updateMilestone(ms.id, {
        status: MILESTONE_STATUS.BLOCKED,
        affectedByVersion: nextVersion,
        blockedReason: `v${nextVersion} 改版：${changesNote || '范围/承诺发生变化，需在新版本重新确认'}`
      });
      affectedMilestoneIds.push(ms.id);
    }

    // 尽调材料随版本归档复制：为新版生成新材料记录，并把尽调项重新指向新材料，
    // 密级与可见参与方不变。新版若调整了尽调清单，以传入的 ddRequired 为准。
    const oldMats = this.store.listMaterials().filter((m) => m.intentId === current.id);
    const matIdMap = new Map();
    for (const mat of oldMats) {
      const clone = {
        ...mat,
        id: genId('mat'),
        intentId: null, // 草案创建后回填
        at: today()
      };
      matIdMap.set(mat.id, clone);
      this.store.addMaterial(clone);
    }
    const carriedDd = (current.ddRequired || []).map((d) => ({
      title: d.title,
      ownerPartyId: d.ownerPartyId,
      materialId: d.materialId && matIdMap.has(d.materialId) ? matIdMap.get(d.materialId).id : null
    }));

    const draft = this.registerIntent({
      projectKey: current.projectKey,
      category: current.category,
      title: title || current.title,
      participantPartyIds: participantPartyIds || current.participantPartyIds,
      commitments, ddRequired: ddRequired || carriedDd,
      scope: scope ?? current.scope,
      links: current.links,
      version: nextVersion
    });
    for (const clone of matIdMap.values()) clone.intentId = draft.id;
    Object.assign(draft, { basedOnVersion: current.version, changesNote: changesNote || '' });
    this.store.updateIntent(draft.id, { basedOnVersion: draft.basedOnVersion, changesNote: draft.changesNote });
    this.store.audit({
      actorPartyId: 'system', action: 'intent.new_version',
      detail: `${current.projectKey} v${current.version} → v${nextVersion}；受影响未完成里程碑：${affectedMilestoneIds.join('、') || '无'}`
    });
    return { newIntent: draft, supersededIntentId: current.id, affectedMilestoneIds };
  }

  // —— 里程碑与证据核验 ——
  addMilestone(input) {
    const intent = this.store.getIntent(input.intentId);
    if (!intent) throw new DomainError('intent_not_found', `意向不存在：${input.intentId}`);
    if (!STAGE_ORDER.includes(input.stage)) throw new DomainError('invalid_stage', `未知阶段：${input.stage}`);
    const ms = {
      id: genId('ms'),
      intentId: input.intentId,
      stage: input.stage,
      title: input.title,
      responsiblePartyIds: input.responsiblePartyIds || [],
      scope: input.scope || '',
      prerequisites: input.prerequisites || [],
      evidence: [],
      status: MILESTONE_STATUS.PENDING
    };
    this.store.addMilestone(ms);
    return ms;
  }

  _prereqsMet(intent, ms) {
    for (const pre of ms.prerequisites || []) {
      if (pre.kind === 'stage') {
        const refStage = pre.ref;
        const priorDone = this.store.milestonesOfIntent(intent.id)
          .some((m) => m.stage === refStage && m.status === MILESTONE_STATUS.DONE);
        if (!priorDone) return false;
      }
    }
    return true;
  }

  // 提交证据。弱凭证（名片）只登记附件，不支撑任何阶段成立。
  attachEvidence(milestoneId, { type, ref, partyId, note }) {
    const ms = this.store.getMilestone(milestoneId);
    if (!ms) throw new DomainError('milestone_not_found', `里程碑不存在：${milestoneId}`);
    const intent = this.store.getIntent(ms.intentId);
    if (!intent.participantPartyIds.includes(partyId)) {
      throw new DomainError('not_participant', '只有参与方可以提交证据');
    }
    const record = {
      id: genId('ev'), type, ref: ref || '',
      uploadedByPartyId: partyId, at: new Date().toISOString(), note: note || '',
      supportsStage: evidenceSupportsStage(type, ms.stage)
    };
    ms.evidence.push(record);
    this.store.updateMilestone(milestoneId, { evidence: ms.evidence });
    this.store.audit({ actorPartyId: partyId, action: 'evidence.attach', detail: `里程碑 ${milestoneId} 提交证据 ${type}${record.supportsStage ? '' : '（弱凭证，不支撑阶段）'}` });
    return record;
  }

  // 核验里程碑：前置满足、意向有效、且至少一份与阶段匹配的强证据。
  verifyMilestone(milestoneId, verifierPartyId) {
    const ms = this.store.getMilestone(milestoneId);
    if (!ms) throw new DomainError('milestone_not_found', `里程碑不存在：${milestoneId}`);
    const intent = this.store.getIntent(ms.intentId);
    const verifier = this._requireParty(verifierPartyId);
    if (verifier.role !== ROLES.SPECIALIST) {
      throw new DomainError('forbidden', '只有项目专员可以核验里程碑');
    }
    if (ms.status === MILESTONE_STATUS.TERMINATED) {
      throw new DomainError('milestone_terminated', '已终止里程碑不能核验');
    }
    if (ms.status === MILESTONE_STATUS.BLOCKED) {
      throw new DomainError('milestone_blocked', '版本变更挂起的里程碑需在新版本重新登记');
    }
    if (intent.status !== INTENT_STATUS.ACTIVE) {
      throw new DomainError('intent_not_active', `意向状态为 ${intent.status}，里程碑不能核验成立`);
    }
    if (!this._prereqsMet(intent, ms)) throw new DomainError('prereq_not_met', '前置阶段尚未完成');
    const strong = (ms.evidence || []).filter((e) => evidenceSupportsStage(e.type, ms.stage));
    if (strong.length === 0) {
      throw new DomainError('insufficient_evidence',
        `缺少能支撑“${ms.stage}”阶段的强证据（仅交换名片等弱凭证不计）`);
    }
    this.store.updateMilestone(milestoneId, {
      status: MILESTONE_STATUS.DONE,
      verifiedAt: new Date().toISOString(),
      verifiedByPartyId: verifierPartyId
    });
    this.store.audit({ actorPartyId: verifierPartyId, action: 'milestone.verify', detail: `里程碑 ${milestoneId}（${ms.stage}）核验成立` });

    // 推进后继里程碑。
    for (const next of this.store.milestonesOfIntent(intent.id)) {
      if (next.id === ms.id) continue;
      if (next.status === MILESTONE_STATUS.PENDING && this._prereqsMet(intent, next)) {
        this.store.updateMilestone(next.id, { status: MILESTONE_STATUS.OPEN });
      }
    }
    return this.store.getMilestone(milestoneId);
  }
}
