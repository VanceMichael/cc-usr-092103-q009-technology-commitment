// 领域常量与错误类型：合作类别、承诺阶段、参与方角色。

export const CATEGORIES = {
  semiconductor: '半导体',
  bioelectronics: '生物电子',
  'financial-services': '金融服务',
  'software-rnd': '软件研发',
};

// 复盘页必须分开统计的五个阶段，顺序即项目推进方向。
export const STAGES = [
  { key: 'engagement', label: '接洽' },
  { key: 'signing', label: '签约' },
  { key: 'resource-investment', label: '资源投入' },
  { key: 'verification', label: '验证完成' },
  { key: 'order', label: '订单形成' },
];
export const STAGE_KEYS = STAGES.map((s) => s.key);
export const STAGE_LABELS = Object.fromEntries(STAGES.map((s) => [s.key, s.label]));

export const PARTY_KINDS = {
  specialist: '项目专员',
  'taiwan-enterprise': '台企',
  'research-institute': '科研机构',
  'scenario-owner': '场景方',
};

export class DomainError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}

export const validation = (msg) => new DomainError('VALIDATION', msg);
export const notFound = (msg) => new DomainError('NOT_FOUND', msg);
export const conflict = (msg) => new DomainError('CONFLICT', msg);
export const forbidden = (msg) => new DomainError('FORBIDDEN', msg);
export const invalidState = (msg) => new DomainError('INVALID_STATE', msg);

// 项目去重键：标题归一化 + 类别 + 排序后的参与方。
export function projectKey(title, category, partyIds) {
  const norm = (s) => String(s).trim().toLowerCase().replace(/\s+/g, ' ');
  return [norm(title), category, ...[...partyIds].sort()].join('|');
}
