// 意向正文内容指纹：多方确认的必须是同一内容。
import crypto from 'node:crypto';

export function intentContentHash(intent) {
  const payload = {
    projectKey: intent.projectKey,
    category: intent.category,
    title: intent.title,
    version: intent.version,
    participantPartyIds: [...intent.participantPartyIds].sort(),
    commitments: (intent.commitments || [])
      .map((c) => ({ partyId: c.partyId, text: c.text }))
      .sort((a, b) => a.partyId.localeCompare(b.partyId) || a.text.localeCompare(b.text)),
    ddRequired: (intent.ddRequired || [])
      .map((d) => ({ title: d.title, ownerPartyId: d.ownerPartyId }))
      .sort((a, b) => a.title.localeCompare(b.title)),
    scope: intent.scope || null
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}
