// 领域目录：合作类别、角色、合作阶段（承诺五类统计口径）、证据类型。
// 所有业务标识与取值范围以本文件为准，样例数据、服务、接口共用同一套词汇。

// 合作类别（科技产业大类）
export const CATEGORIES = Object.freeze({
  SEMICONDUCTOR: 'semiconductor',
  BIOELECTRONICS: 'bioelectronics',
  FINANCE: 'finance',
  SOFTWARE: 'software'
});

export const CATEGORY_LABELS = Object.freeze({
  semiconductor: '半导体',
  bioelectronics: '生物电子',
  finance: '金融服务',
  software: '软件研发'
});

// 论坛里的角色
export const ROLES = Object.freeze({
  TAIWAN_ENTERPRISE: 'taiwan_enterprise',
  BEIJING_RESEARCH: 'beijing_research',
  scene_owner: 'scene_owner',
  SPECIALIST: 'specialist'
});

export const ROLE_LABELS = Object.freeze({
  taiwan_enterprise: '台企（能力提供方）',
  beijing_research: '北京科研资源方',
  scene_owner: '场景需求方',
  specialist: '京台科技项目专员（记账与核验）'
});

// 合作阶段：复盘页必须分开统计的五个口径，顺序即推进顺序。
// contact 接洽 —— 必须有实质接洽记录，仅“交换名片”不得计入。
export const STAGES = Object.freeze({
  CONTACT: 'contact',
  SIGNING: 'signing',
  RESOURCE: 'resource',
  VALIDATION: 'validation',
  ORDER: 'order'
});

export const STAGE_ORDER = Object.freeze([
  'contact',
  'signing',
  'resource',
  'validation',
  'order'
]);

export const STAGE_LABELS = Object.freeze({
  contact: '接洽',
  signing: '签约',
  resource: '资源投入',
  validation: '验证完成',
  order: '订单形成'
});

// 各阶段认可的证据类型。证据强度决定里程碑是否成立。
// weak 类证据（如仅交换名片）不能单独支撑任何阶段。
export const EVIDENCE_TYPES = Object.freeze({
  MEETING_MINUTES: 'meeting_minutes',       // 实质会谈纪要（议题+结论）
  MOA: 'moa',                               // 合作意向书
  SIGNED_CONTRACT: 'signed_contract',       // 正式签署合同（有效版本）
  RESOURCE_PLAN: 'resource_plan',           // 经确认的资源投入计划
  RESOURCE_PROOF: 'resource_proof',         // 资源实际投入凭证（入厂、开户、设备进场等）
  VALIDATION_REPORT: 'validation_report',   // 联合验证/中试报告
  PURCHASE_ORDER: 'purchase_order',         // 订单/采购合同
  PAYMENT_PROOF: 'payment_proof',           // 回款凭证
  BUSINESS_CARD: 'business_card',           // 名片（弱凭证，永不单独计入接洽）
  OTHER: 'other'
});

export const EVIDENCE_LABELS = Object.freeze({
  meeting_minutes: '实质会谈纪要',
  moa: '合作意向书',
  signed_contract: '正式签署合同',
  resource_plan: '资源投入计划',
  resource_proof: '资源投入凭证',
  validation_report: '验证完成报告',
  purchase_order: '订单',
  payment_proof: '回款凭证',
  business_card: '名片（弱凭证）',
  other: '其他材料'
});

// 每个阶段成立所需的证据类型（满足其一即可，但名片永远不算）。
export const STAGE_REQUIRED_EVIDENCE = Object.freeze({
  contact: ['meeting_minutes', 'moa'],
  signing: ['signed_contract'],
  resource: ['resource_plan', 'resource_proof'],
  validation: ['validation_report'],
  order: ['purchase_order', 'payment_proof']
});

// 弱证据类型：只能作为附件，不能支撑任何阶段统计。
export const WEAK_EVIDENCE_TYPES = new Set(['business_card']);

// 意向/承诺生命周期状态
export const INTENT_STATUS = Object.freeze({
  DRAFT: 'draft',           // 资料未齐、各方未全部确认
  ACTIVE: 'active',         // 各方确认一致，可进入执行
  SUPERSEDED: 'superseded', // 被新版本替代
  WITHDRAWN: 'withdrawn'    // 撤回：仅终止后续动作
});

export const INTENT_STATUS_LABELS = Object.freeze({
  draft: '待确认',
  active: '执行中',
  superseded: '已被新版替代',
  withdrawn: '已撤回'
});

// 里程碑状态
export const MILESTONE_STATUS = Object.freeze({
  PENDING: 'pending',       // 前置未满足
  OPEN: 'open',             // 前置满足、待完成
  DONE: 'done',             // 已完成（证据齐备并核验）
  BLOCKED: 'blocked',       // 版本变更导致需重新确认
  TERMINATED: 'terminated'  // 意向撤回，后续动作终止
});

export const MILESTONE_STATUS_LABELS = Object.freeze({
  pending: '前置未满足',
  open: '进行中',
  done: '已完成',
  blocked: '版本变更待确认',
  terminated: '已终止'
});

// 尽调材料密级
export const CONFIDENTIAL_LEVELS = Object.freeze({
  NORMAL: 'normal',
  SECRET: 'secret' // 商业秘密：仅参与方可见
});

export function assertCategory(value) {
  if (!Object.values(CATEGORIES).includes(value)) {
    throw new Error(`未知合作类别：${value}`);
  }
}

export function assertStage(value) {
  if (!STAGE_ORDER.includes(value)) {
    throw new Error(`未知合作阶段：${value}`);
  }
}

export function assertRole(value) {
  if (!Object.values(ROLES).includes(value)) {
    throw new Error(`未知角色：${value}`);
  }
}

// 判断证据类型能否支撑某阶段（名片等弱凭证直接排除）。
export function evidenceSupportsStage(evidenceType, stage) {
  if (WEAK_EVIDENCE_TYPES.has(evidenceType)) return false;
  return (STAGE_REQUIRED_EVIDENCE[stage] || []).includes(evidenceType);
}
