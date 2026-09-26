import { createServer } from 'node:http';
import { DomainError } from './domain.js';

const STATUS_BY_CODE = {
  VALIDATION: 400,
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  CONFLICT: 409,
  INVALID_STATE: 422,
};

// 路由表：[方法, 路径模式, 处理函数]。:name 匹配单段路径。
const ROUTES = [
  ['GET', '/health', (s) => ({ ok: true, events: s.ledger.events.length })],
  ['POST', '/parties', (s, b) => s.registerParty(b)],
  ['GET', '/parties', (s) => s.listParties()],
  ['POST', '/capabilities', (s, b) => s.addCapability(b)],
  ['GET', '/capabilities', (s) => s.ledger.all('capabilities')],
  ['POST', '/research-resources', (s, b) => s.addResearchResource(b)],
  ['GET', '/research-resources', (s) => s.ledger.all('researchResources')],
  ['POST', '/scenario-demands', (s, b) => s.addScenarioDemand(b)],
  ['GET', '/scenario-demands', (s) => s.ledger.all('scenarioDemands')],
  ['POST', '/due-diligence', (s, b) => s.submitDueDiligence(b)],
  ['GET', '/due-diligence', (s, _b, q) => s.listDueDiligence({ asPartyId: q.get('asParty') })],
  ['POST', '/projects', (s, b) => s.createProject(b)],
  ['GET', '/projects', (s) => s.listProjects()],
  ['GET', '/projects/:id', (s, _b, _q, p) => s.getProject(p.id)],
  ['GET', '/projects/:id/history', (s, _b, _q, p) => s.projectHistory(p.id)],
  ['POST', '/projects/:id/intents', (s, b, _q, p) => s.draftIntent({ ...b, projectId: p.id })],
  ['POST', '/projects/:id/contracts', (s, b, _q, p) => s.createContractVersion({ ...b, projectId: p.id })],
  ['POST', '/projects/:id/milestones', (s, b, _q, p) => s.addMilestone({ ...b, projectId: p.id })],
  ['POST', '/intents/:id/confirm', (s, b, _q, p) => s.confirmIntent({ ...b, intentId: p.id })],
  ['POST', '/intents/:id/start-execution', (s, b, _q, p) => s.startExecution({ ...b, intentId: p.id })],
  ['POST', '/intents/:id/withdraw', (s, b, _q, p) => s.withdrawIntent({ ...b, intentId: p.id })],
  ['POST', '/commitments/:id/fulfill', (s, b, _q, p) => s.fulfillCommitment({ ...b, commitmentId: p.id })],
  ['POST', '/commitments/:id/withdraw', (s, b, _q, p) => s.withdrawCommitment({ ...b, commitmentId: p.id })],
  ['POST', '/contracts/:id/activate', (s, b, _q, p) => s.activateContract({ ...b, contractId: p.id })],
  ['POST', '/contracts/:id/withdraw', (s, b, _q, p) => s.withdrawContract({ ...b, contractId: p.id })],
  ['POST', '/milestones/:id/complete', (s, b, _q, p) => s.completeMilestone({ ...b, milestoneId: p.id })],
  ['POST', '/evidence', (s, b) => s.submitEvidence(b)],
  ['GET', '/review', (s, _b, q) => s.review({ asPartyId: q.get('asParty') ?? undefined })],
];

function match(pattern, pathname) {
  const pp = pattern.split('/').filter(Boolean);
  const pa = pathname.split('/').filter(Boolean);
  if (pp.length !== pa.length) return null;
  const params = {};
  for (let i = 0; i < pp.length; i++) {
    if (pp[i].startsWith(':')) params[pp[i].slice(1)] = decodeURIComponent(pa[i]);
    else if (pp[i] !== pa[i]) return null;
  }
  return params;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('请求体不是合法 JSON'), { code: 'VALIDATION' });
  }
}

export function createApp(service) {
  return createServer(async (req, res) => {
    const send = (status, obj) => {
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(obj));
    };
    try {
      const url = new URL(req.url, 'http://localhost');
      for (const [method, pattern, handler] of ROUTES) {
        if (method !== req.method) continue;
        const params = match(pattern, url.pathname);
        if (!params) continue;
        const body = req.method === 'POST' ? await readBody(req) : {};
        const result = handler(service, body, url.searchParams, params);
        send(method === 'POST' ? 201 : 200, result);
        return;
      }
      send(404, { error: { code: 'NOT_FOUND', message: `未知路由: ${req.method} ${url.pathname}` } });
    } catch (err) {
      if (err instanceof DomainError || STATUS_BY_CODE[err.code]) {
        send(STATUS_BY_CODE[err.code] ?? 500, { error: { code: err.code, message: err.message } });
      } else {
        send(500, { error: { code: 'INTERNAL', message: err.message } });
      }
    }
  });
}
