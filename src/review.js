import { STAGES, STAGE_KEYS, STAGE_LABELS, CATEGORIES } from './domain.js';

// 复盘报告：五个阶段分开统计，每个数字可下钻到责任主体、适用范围、
// 前置条件与相应证据；商业秘密证据按参与方隔离，无权查看者只得脱敏引用。
export function buildReview(ledger, { asPartyId } = {}) {
  const projects = ledger.all('projects');
  const commitments = ledger.all('commitments');
  const projectById = new Map(projects.map((p) => [p.id, p]));

  const evidenceView = (ev) => {
    const allowed =
      ev.classification !== 'restricted' ||
      (asPartyId && (ev.visibleTo?.includes(asPartyId) || ev.submittedByPartyId === asPartyId));
    if (!allowed) {
      // 保留可核实的引用（编号、类型、哈希），隐藏内容本身。
      return { id: ev.id, kind: ev.kind, classification: 'restricted', hash: ev.hash, redacted: true };
    }
    return {
      id: ev.id,
      kind: ev.kind,
      summary: ev.summary,
      hash: ev.hash,
      submittedByPartyId: ev.submittedByPartyId,
      classification: ev.classification,
    };
  };

  const stages = {};
  for (const { key, label } of STAGES) {
    const items = commitments
      .filter((c) => c.stage === key && c.status === 'fulfilled')
      .map((c) => {
        const project = projectById.get(c.projectId);
        return {
          commitmentId: c.id,
          projectId: c.projectId,
          projectTitle: project.title,
          category: project.category,
          categoryLabel: CATEGORIES[project.category],
          responsiblePartyId: c.responsiblePartyId,
          scope: c.scope,
          preconditions: c.preconditions,
          fulfilledAt: c.fulfilledAt,
          evidence: c.evidenceIds.map((id) => evidenceView(ledger.get('evidence', id))),
        };
      })
      .sort((a, b) => a.fulfilledAt.localeCompare(b.fulfilledAt));
    stages[key] = { label, count: items.length, items };
  }

  const projectSummaries = projects.map((p) => {
    const pcs = commitments.filter((c) => c.projectId === p.id);
    const fulfilledStages = STAGE_KEYS.filter((k) => pcs.some((c) => c.stage === k && c.status === 'fulfilled'));
    const currentStage = fulfilledStages.length > 0 ? fulfilledStages[fulfilledStages.length - 1] : null;
    const countBy = (status) => pcs.filter((c) => c.status === status).length;
    const intents = ledger.all('intents').filter((i) => i.projectId === p.id);
    const milestones = ledger.all('milestones').filter((m) => m.projectId === p.id);
    return {
      projectId: p.id,
      title: p.title,
      category: p.category,
      categoryLabel: CATEGORIES[p.category],
      status: p.status,
      partyIds: p.partyIds,
      currentStage,
      currentStageLabel: currentStage ? STAGE_LABELS[currentStage] : '尚未履约',
      commitments: {
        fulfilled: countBy('fulfilled'),
        pending: countBy('pending'),
        superseded: countBy('superseded'),
        terminated: countBy('terminated'),
      },
      milestones: {
        open: milestones.filter((m) => m.status === 'open').length,
        done: milestones.filter((m) => m.status === 'done').length,
        terminated: milestones.filter((m) => m.status === 'terminated').length,
      },
      intentVersions: intents.map((i) => ({ intentId: i.id, version: i.version, status: i.status })),
    };
  });

  return {
    generatedAt: ledger.now(),
    viewer: asPartyId ?? null,
    stages,
    projects: projectSummaries,
  };
}
