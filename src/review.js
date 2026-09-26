// 论坛复盘：五个阶段分开统计，每个数字可下钻到责任主体、适用范围、前置条件、证据。
// 口径（防止“交换名片”被包装成成果）：
//  1. 只统计专员已核验成立（done）的里程碑，且其意向必须是当前有效版本（active）；
//  2. 被替代版本（superseded）的里程碑永不计入；撤回项目单列，不混入成果数字；
//  3. 仅有名片等弱凭证的接洽，列入“弱凭证剔除”，不计入接洽；
//  4. 同一项目同一阶段只计一次（以 projectKey 去重），不会因重复登记翻倍。
import {
  STAGE_ORDER, STAGE_LABELS, CATEGORY_LABELS, ROLE_LABELS,
  EVIDENCE_LABELS, INTENT_STATUS_LABELS, MILESTONE_STATUS,
  evidenceSupportsStage, WEAK_EVIDENCE_TYPES
} from './catalog.js';

export class ReviewBoard {
  constructor(store) {
    this.store = store;
  }

  _partyName(id) {
    const p = this.store.getParty(id);
    return p ? { id, name: p.name, role: p.role, roleLabel: ROLE_LABELS[p.role] || p.role } : { id, name: id, role: 'unknown', roleLabel: '未知方' };
  }

  // 当前有效版本：每个项目键最多一个 active；否则取最新版本号（draft/withdrawn）。
  _effectiveIntentByProject() {
    const map = new Map();
    for (const intent of this.store.listIntents()) {
      const cur = map.get(intent.projectKey);
      if (!cur) { map.set(intent.projectKey, intent); continue; }
      if (intent.status === 'active') {
        map.set(intent.projectKey, cur.status === 'active' ? cur : intent);
      } else if (cur.status !== 'active' && intent.version > cur.version) {
        map.set(intent.projectKey, intent);
      }
    }
    return map;
  }

  _drillItem(intent, ms) {
    return {
      projectKey: intent.projectKey,
      projectTitle: intent.title,
      category: intent.category,
      categoryLabel: CATEGORY_LABELS[intent.category] || intent.category,
      intentId: intent.id,
      version: intent.version,
      milestoneId: ms.id,
      stage: ms.stage,
      stageLabel: STAGE_LABELS[ms.stage],
      milestoneTitle: ms.title,
      status: ms.status,
      // 责任主体
      responsibleParties: (ms.responsiblePartyIds || []).map((id) => this._partyName(id)),
      // 适用范围
      scope: ms.scope || intent.scope || '（未标注适用范围）',
      // 前置条件及是否满足
      prerequisites: (ms.prerequisites || []).map((pre) => {
        let met = true;
        if (pre.kind === 'stage') {
          met = this.store.milestonesOfIntent(intent.id)
            .some((m) => m.stage === pre.ref && m.status === MILESTONE_STATUS.DONE);
        }
        return {
          kind: pre.kind,
          ref: pre.ref || null,
          refLabel: pre.kind === 'stage' ? STAGE_LABELS[pre.ref] || pre.ref : pre.ref,
          description: pre.description || '',
          met
        };
      }),
      // 相应证据：逐条标注是否足以支撑该阶段
      evidence: (ms.evidence || []).map((e) => ({
        id: e.id,
        type: e.type,
        typeLabel: EVIDENCE_LABELS[e.type] || e.type,
        ref: e.ref,
        at: e.at,
        note: e.note || '',
        uploadedBy: this._partyName(e.uploadedByPartyId),
        weak: WEAK_EVIDENCE_TYPES.has(e.type),
        supportsStage: evidenceSupportsStage(e.type, ms.stage)
      })),
      verifiedAt: ms.verifiedAt || null,
      commitments: (intent.commitments || []).map((c) => ({
        party: this._partyName(c.partyId), text: c.text
      }))
    };
  }

  // 五阶段分开计数
  stageCounts() {
    const effective = this._effectiveIntentByProject();
    const stages = STAGE_ORDER.map((stage) => ({ stage, stageLabel: STAGE_LABELS[stage], projectKeys: new Set(), items: [] }));

    for (const [projectKey, intent] of effective) {
      if (intent.status !== 'active') continue; // 草案/撤回不进入成果数字
      for (const ms of this.store.milestonesOfIntent(intent.id)) {
        if (ms.status !== MILESTONE_STATUS.DONE) continue;
        const bucket = stages.find((s) => s.stage === ms.stage);
        if (!bucket) continue;
        if (bucket.projectKeys.has(projectKey)) continue; // 同项目同阶段只计一次
        bucket.projectKeys.add(projectKey);
        bucket.items.push(this._drillItem(intent, ms));
      }
    }

    return stages.map((s) => ({
      stage: s.stage,
      stageLabel: s.stageLabel,
      count: s.projectKeys.size,
      items: s.items
    }));
  }

  // 按合作类别分解（半导体/生物电子/金融服务/软件研发各自走到哪一步）
  byCategory() {
    const counts = this.stageCounts();
    const result = {};
    for (const cat of Object.keys(CATEGORY_LABELS)) {
      result[cat] = {
        category: cat,
        categoryLabel: CATEGORY_LABELS[cat],
        stages: STAGE_ORDER.map((stage) => {
          const bucket = counts.find((c) => c.stage === stage);
          const items = bucket.items.filter((i) => i.category === cat);
          return { stage, stageLabel: STAGE_LABELS[stage], count: items.length, items };
        })
      };
    }
    return result;
  }

  // 逐项目时间线：半年后复盘仍能核实每个项目走到了哪一步
  projectTimelines() {
    const effective = this._effectiveIntentByProject();
    const lines = [];
    for (const [projectKey, intent] of [...effective.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const all = this.store.milestonesOfIntent(intent.id);
      const doneStages = new Set(all.filter((m) => m.status === MILESTONE_STATUS.DONE).map((m) => m.stage));
      const orderIdx = STAGE_ORDER.map((s, i) => (doneStages.has(s) ? i : -1)).filter((i) => i >= 0);
      const highest = orderIdx.length ? STAGE_ORDER[orderIdx[orderIdx.length - 1]] : null;

      lines.push({
        projectKey,
        title: intent.title,
        category: intent.category,
        categoryLabel: CATEGORY_LABELS[intent.category] || intent.category,
        currentVersion: intent.version,
        status: intent.status,
        statusLabel: INTENT_STATUS_LABELS[intent.status] || intent.status,
        highestReachedStage: highest,
        highestReachedStageLabel: highest ? STAGE_LABELS[highest] : '未形成有效接洽',
        withdrawnReason: intent.withdrawReason || null,
        changesNote: intent.changesNote || null,
        // 同项目的历史版本：被改版挂起的未完成承诺在此显式留痕
        priorVersions: this.store.findByProjectKey(projectKey)
          .filter((v) => v.id !== intent.id)
          .map((v) => ({
            intentId: v.id,
            version: v.version,
            status: v.status,
            statusLabel: INTENT_STATUS_LABELS[v.status] || v.status,
            changesNote: v.changesNote || null,
            affectedMilestones: this.store.milestonesOfIntent(v.id)
              .filter((m) => m.status === MILESTONE_STATUS.BLOCKED || m.status === MILESTONE_STATUS.TERMINATED)
              .map((m) => ({
                stage: m.stage,
                stageLabel: STAGE_LABELS[m.stage],
                title: m.title,
                status: m.status,
                reason: m.blockedReason || m.terminatedReason || null,
                affectedByVersion: m.affectedByVersion || null
              }))
          })),
        stages: STAGE_ORDER.map((stage) => {
          const ms = all.find((m) => m.stage === stage);
          if (!ms) return { stage, stageLabel: STAGE_LABELS[stage], state: 'not_started', stateLabel: '未登记' };
          return {
            stage,
            stageLabel: STAGE_LABELS[stage],
            state: ms.status,
            stateLabel: this._milestoneStateLabel(ms.status),
            milestoneId: ms.id,
            drill: this._drillItem(intent, ms),
            weakOnly: ms.status !== MILESTONE_STATUS.DONE &&
              (ms.evidence || []).length > 0 &&
              !(ms.evidence || []).some((e) => evidenceSupportsStage(e.type, ms.stage))
          };
        })
      });
    }
    return lines;
  }

  _milestoneStateLabel(status) {
    const map = {
      pending: '前置未满足/未成立',
      open: '进行中（证据未齐）',
      done: '已核验成立',
      blocked: '版本变更挂起',
      terminated: '撤回终止'
    };
    return map[status] || status;
  }

  // 弱凭证剔除清单：有名片等材料但不构成接洽（或任何阶段）的里程碑
  weakEvidenceRejections() {
    const rejections = [];
    for (const intent of this.store.listIntents()) {
      for (const ms of this.store.milestonesOfIntent(intent.id)) {
        const evs = ms.evidence || [];
        if (evs.length === 0) continue;
        if (ms.status === MILESTONE_STATUS.DONE) continue;
        const strong = evs.filter((e) => evidenceSupportsStage(e.type, ms.stage));
        if (strong.length === 0) {
          rejections.push({
            projectKey: intent.projectKey,
            projectTitle: intent.title,
            intentId: intent.id,
            version: intent.version,
            intentStatus: intent.status,
            milestoneId: ms.id,
            stage: ms.stage,
            stageLabel: STAGE_LABELS[ms.stage],
            reason: WEAK_EVIDENCE_TYPES.has(evs[0].type)
              ? '仅有名片等弱凭证，按口径不计入任何阶段成果'
              : '证据类型不足以支撑该阶段，或里程碑尚未核验',
            evidence: evs.map((e) => ({
              type: e.type,
              typeLabel: EVIDENCE_LABELS[e.type] || e.type,
              ref: e.ref, at: e.at,
              weak: WEAK_EVIDENCE_TYPES.has(e.type)
            }))
          });
        }
      }
    }
    return rejections;
  }

  // 完整复盘报告
  fullReport() {
    const stages = this.stageCounts();
    const effective = this._effectiveIntentByProject();
    const withdrawn = [];
    for (const intent of this.store.listIntents()) {
      if (intent.status !== 'withdrawn') continue;
      const all = this.store.milestonesOfIntent(intent.id);
      const doneStages = all.filter((m) => m.status === MILESTONE_STATUS.DONE).map((m) => STAGE_LABELS[m.stage] || m.stage);
      withdrawn.push({
        projectKey: intent.projectKey,
        title: intent.title,
        category: intent.category,
        categoryLabel: CATEGORY_LABELS[intent.category] || intent.category,
        version: intent.version,
        withdrawnAt: intent.withdrawnAt,
        withdrawnBy: intent.withdrawnByPartyId ? this._partyName(intent.withdrawnByPartyId) : null,
        reason: intent.withdrawReason,
        factsRetained: doneStages,
        nextStepsTerminated: all.filter((m) => m.status === MILESTONE_STATUS.TERMINATED).map((m) => ({
          stage: m.stage, stageLabel: STAGE_LABELS[m.stage], title: m.title
        }))
      });
    }

    return {
      generatedAt: new Date().toISOString(),
      countingRule: [
        '仅统计当前有效版本（active）上、经专员核验成立的里程碑',
        '被替代版本不计入；撤回项目单列且不进入成果数字',
        '名片等弱凭证永不单独计入接洽',
        '同一项目同一阶段按项目标识去重，只计一次'
      ],
      totals: {
        projects: effective.size,
        activeProjects: [...effective.values()].filter((i) => i.status === 'active').length
      },
      stages,
      byCategory: this.byCategory(),
      projects: this.projectTimelines(),
      weakEvidenceRejections: this.weakEvidenceRejections(),
      withdrawnProjects: withdrawn
    };
  }
}
