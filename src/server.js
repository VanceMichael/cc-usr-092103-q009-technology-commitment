// 零依赖 HTTP 服务：复盘查询 + 承诺管理操作 + 单页管理后台。
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { CommitmentService } from './service.js';
import { ReviewBoard } from './review.js';
import { DomainError } from './store.js';
import {
  CATEGORIES, CATEGORY_LABELS, ROLES, ROLE_LABELS,
  STAGES, STAGE_ORDER, STAGE_LABELS, EVIDENCE_TYPES, EVIDENCE_LABELS,
  INTENT_STATUS, INTENT_STATUS_LABELS, MILESTONE_STATUS, MILESTONE_STATUS_LABELS,
  CONFIDENTIAL_LEVELS, STAGE_REQUIRED_EVIDENCE, WEAK_EVIDENCE_TYPES
} from './catalog.js';

const ADMIN_HTML = new URL('../public/admin.html', import.meta.url);

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store'
  });
  res.end(body);
}

function viewerId(req) {
  return new URL(req.url, 'http://x').searchParams.get('viewerPartyId')
    || req.headers['x-viewer-party-id']
    || null;
}

export function createServer(store) {
  const service = new CommitmentService(store);
  const review = new ReviewBoard(store);

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const { pathname } = url;
    try {
      if (req.method === 'GET' && pathname === '/') {
        const html = await readFile(fileURLToPath(ADMIN_HTML), 'utf8');
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        res.end(html);
        return;
      }

      if (req.method === 'GET' && pathname === '/api/catalog') {
        sendJson(res, 200, {
          categories: CATEGORIES, categoryLabels: CATEGORY_LABELS,
          roles: ROLES, roleLabels: ROLE_LABELS,
          stages: STAGES, stageOrder: STAGE_ORDER, stageLabels: STAGE_LABELS,
          evidenceTypes: EVIDENCE_TYPES, evidenceLabels: EVIDENCE_LABELS,
          stageRequiredEvidence: STAGE_REQUIRED_EVIDENCE,
          weakEvidenceTypes: [...WEAK_EVIDENCE_TYPES],
          intentStatuses: INTENT_STATUS, intentStatusLabels: INTENT_STATUS_LABELS,
          milestoneStatuses: MILESTONE_STATUS, milestoneStatusLabels: MILESTONE_STATUS_LABELS,
          confidentialLevels: CONFIDENTIAL_LEVELS
        });
        return;
      }

      if (req.method === 'GET' && pathname === '/api/report') {
        sendJson(res, 200, review.fullReport());
        return;
      }

      if (req.method === 'GET' && pathname === '/api/parties') {
        sendJson(res, 200, store.listParties());
        return;
      }

      if (req.method === 'GET' && pathname === '/api/intents') {
        const v = viewerId(req);
        const payload = store.listIntents().map((intent) => ({
          ...intent,
          materials: service.listMaterialsForViewer(intent.id, v)
        }));
        sendJson(res, 200, payload);
        return;
      }

      const intentMatch = pathname.match(/^\/api\/intents\/([^/]+)(?:\/(confirm|withdraw|new-version))?$/);
      if (req.method === 'GET' && intentMatch && !intentMatch[2]) {
        const intent = store.getIntent(intentMatch[1]);
        if (!intent) throw new DomainError('intent_not_found', '意向不存在');
        sendJson(res, 200, {
          ...intent,
          materials: service.listMaterialsForViewer(intent.id, viewerId(req)),
          milestones: store.milestonesOfIntent(intent.id)
        });
        return;
      }

      if (req.method === 'GET' && pathname === '/api/assets') {
        sendJson(res, 200, {
          capabilities: store.state.capabilities,
          resources: store.state.researchResources,
          needs: store.state.scenarioNeeds,
          milestones: store.listMilestones()
        });
        return;
      }

      if (req.method === 'GET' && pathname === '/api/audit') {
        sendJson(res, 200, store.state.auditLog.slice(-200).reverse());
        return;
      }

      // —— 写操作 ——
      const body = await readJson(req);

      if (req.method === 'POST' && pathname === '/api/intents') {
        sendJson(res, 201, service.registerIntent(body));
        return;
      }
      if (req.method === 'POST' && pathname === '/api/materials') {
        sendJson(res, 201, service.submitMaterial(body));
        return;
      }
      if (req.method === 'POST' && pathname === '/api/milestones') {
        sendJson(res, 201, service.addMilestone(body));
        return;
      }

      const msMatch = pathname.match(/^\/api\/milestones\/([^/]+)\/(evidence|verify)$/);
      if (req.method === 'POST' && msMatch) {
        if (msMatch[2] === 'evidence') {
          sendJson(res, 201, service.attachEvidence(msMatch[1], body));
        } else {
          sendJson(res, 200, service.verifyMilestone(msMatch[1], body.partyId));
        }
        return;
      }

      if (req.method === 'POST' && intentMatch && intentMatch[2]) {
        const [, id, action] = intentMatch;
        if (action === 'confirm') {
          sendJson(res, 200, service.confirmIntent(id, body.partyId, body.contentHash || null));
        } else if (action === 'withdraw') {
          sendJson(res, 200, service.withdraw(id, body.partyId, body.reason || ''));
        } else {
          sendJson(res, 201, service.registerNewVersion(id, body));
        }
        return;
      }

      sendJson(res, 404, { error: { code: 'not_found', message: `未知接口：${req.method} ${pathname}` } });
    } catch (err) {
      if (err instanceof DomainError) {
        const status = err.code === 'intent_not_found' || err.code === 'milestone_not_found' || err.code === 'material_not_found' || err.code === 'party_not_found' ? 404 : 409;
        sendJson(res, status, { error: { code: err.code, message: err.message } });
        return;
      }
      if (err instanceof SyntaxError) {
        sendJson(res, 400, { error: { code: 'bad_json', message: '请求体不是合法 JSON' } });
        return;
      }
      sendJson(res, 500, { error: { code: 'internal', message: err.message } });
    }
  });
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

export async function start(port = process.env.PORT || 8080) {
  const { buildSeedState } = await import('./seed.js');
  const store = (await import('./store.js')).CommitmentStore;
  const server = createServer(new store(buildSeedState()));
  return new Promise((resolve) => {
    server.listen(port, () => {
      console.log(`承诺管理后台已启动：http://localhost:${port}`);
      resolve(server);
    });
  });
}

if (process.argv[1] && process.argv[1].endsWith('server.js')) {
  start();
}
