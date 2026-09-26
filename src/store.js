// 账本：内存集合 + 追加式事件日志。
// 所有状态变化都留下事件，撤回只追加终止事件、不改写历史，
// 半年后的复盘可以按项目重放全部经过。
export class Ledger {
  constructor({ now } = {}) {
    this.now = now ?? (() => new Date().toISOString());
    this.collections = {
      parties: new Map(),
      capabilities: new Map(),
      researchResources: new Map(),
      scenarioDemands: new Map(),
      dueDiligence: new Map(),
      projects: new Map(),
      intents: new Map(),
      commitments: new Map(),
      contracts: new Map(),
      milestones: new Map(),
      evidence: new Map(),
    };
    this.events = [];
    this.counters = new Map();
  }

  nextId(prefix) {
    const n = (this.counters.get(prefix) ?? 0) + 1;
    this.counters.set(prefix, n);
    return `${prefix}_${n}`;
  }

  put(collection, value) {
    this.collections[collection].set(value.id, value);
    return value;
  }

  get(collection, id) {
    return this.collections[collection].get(id) ?? null;
  }

  all(collection) {
    return [...this.collections[collection].values()];
  }

  record(type, payload = {}) {
    const event = { seq: this.events.length + 1, type, at: this.now(), ...payload };
    this.events.push(event);
    return event;
  }

  projectHistory(projectId) {
    return this.events.filter((e) => e.projectId === projectId);
  }
}
