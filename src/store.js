// 内存存储 + 可选 JSON 持久化。所有变更方法同步执行（无 await），
// 利用 Node 单线程事件循环保证“多方同时确认/激活”的检查与写入原子完成。
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export class DomainError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}

export class CommitmentStore {
  constructor(state) {
    this.state = state;
    // 激活串行锁：即便未来在异步流程中调用，也保证同一意向只激活一次。
    this._activationLocks = new Set();
  }

  static empty() {
    return new CommitmentStore({
      parties: [],
      capabilities: [],
      researchResources: [],
      scenarioNeeds: [],
      materials: [],
      intents: [],
      milestones: [],
      auditLog: []
    });
  }

  static async fromFile(path) {
    const raw = await readFile(path, 'utf8');
    return new CommitmentStore(JSON.parse(raw));
  }

  async saveToFile(path) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(this.state, null, 2), 'utf8');
  }

  audit(entry) {
    this.state.auditLog.push({ at: new Date().toISOString(), ...entry });
  }

  // —— 基础目录对象 ——
  listParties() { return this.state.parties; }
  getParty(id) { return this.state.parties.find((p) => p.id === id); }

  addParty(party) {
    if (this.getParty(party.id)) throw new DomainError('duplicate_party', `参与方已存在：${party.id}`);
    this.state.parties.push(party);
    return party;
  }

  addCapability(rec) { this.state.capabilities.push(rec); return rec; }
  addResource(rec) { this.state.researchResources.push(rec); return rec; }
  addNeed(rec) { this.state.scenarioNeeds.push(rec); return rec; }
  listCapabilities(viewerPartyId) {
    return this.state.capabilities.filter((c) => !c.ownerPartyId || this._canSeePartyData(c.ownerPartyId, viewerPartyId));
  }

  // —— 尽调材料 ——
  listMaterials() { return this.state.materials; }
  getMaterial(id) { return this.state.materials.find((m) => m.id === id); }
  addMaterial(rec) { this.state.materials.push(rec); return rec; }
  updateMaterial(id, patch) {
    const mat = this.getMaterial(id);
    if (!mat) throw new DomainError('material_not_found', `材料不存在：${id}`);
    Object.assign(mat, patch);
    return mat;
  }

  // 商业秘密可见性：仅所有方、显式授权参与方可见；专员只见元数据。
  canSeeMaterial(mat, viewerPartyId) {
    if (!viewerPartyId) return false;
    if (mat.level !== 'secret') return true;
    if (mat.ownerPartyId === viewerPartyId) return true;
    return Array.isArray(mat.visibleToPartyIds) && mat.visibleToPartyIds.includes(viewerPartyId);
  }

  viewMaterial(mat, viewerPartyId) {
    const visible = this.canSeeMaterial(mat, viewerPartyId);
    const viewer = this.getParty(viewerPartyId);
    const isSpecialist = viewer && viewer.role === 'specialist';
    if (mat.level === 'secret' && !visible) {
      if (isSpecialist) {
        // 专员要完成记账与核验，但不看秘密本体：元数据可见、内容引用遮蔽。
        return { ...mat, ref: '【商业秘密·专员不可见】', detail: '【商业秘密·专员不可见】', _secretMasked: true };
      }
      return null; // 非参与方：当作不存在
    }
    return { ...mat };
  }

  _canSeePartyData(ownerPartyId, viewerPartyId) {
    if (!viewerPartyId) return false;
    const viewer = this.getParty(viewerPartyId);
    if (viewer && viewer.role === 'specialist') return true;
    return ownerPartyId === viewerPartyId;
  }

  // —— 意向 ——
  listIntents() { return this.state.intents; }
  getIntent(id) { return this.state.intents.find((i) => i.id === id); }
  findByProjectKey(projectKey) { return this.state.intents.filter((i) => i.projectKey === projectKey); }
  addIntent(rec) { this.state.intents.push(rec); return rec; }
  updateIntent(id, patch) {
    const intent = this.getIntent(id);
    if (!intent) throw new DomainError('intent_not_found', `意向不存在：${id}`);
    Object.assign(intent, patch);
    return intent;
  }

  tryLockActivation(intentId) {
    if (this._activationLocks.has(intentId)) return false;
    this._activationLocks.add(intentId);
    return true;
  }
  unlockActivation(intentId) { this._activationLocks.delete(intentId); }

  // —— 里程碑 ——
  listMilestones() { return this.state.milestones; }
  milestonesOfIntent(intentId) { return this.state.milestones.filter((m) => m.intentId === intentId); }
  getMilestone(id) { return this.state.milestones.find((m) => m.id === id); }
  addMilestone(rec) { this.state.milestones.push(rec); return rec; }
  updateMilestone(id, patch) {
    const ms = this.getMilestone(id);
    if (!ms) throw new DomainError('milestone_not_found', `里程碑不存在：${id}`);
    Object.assign(ms, patch);
    return ms;
  }
}
