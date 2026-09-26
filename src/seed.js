import { readFileSync } from 'node:fs';

// 回放 fixtures/seed.json 中的操作序列。
// 操作可带 "as" 保存返回对象，后续参数用 "$名称" 引用其 id，
// 或用 "$名称.字段.下标" 深入引用（如 "$i1.commitmentIds.0"），保证样例数据可复现。
export function seed(service, ops) {
  const refs = new Map();
  const resolveRef = (path) => {
    const [name, ...rest] = path.split('.');
    if (!refs.has(name)) throw new Error(`种子数据引用了未知名称: $${name}`);
    let value = refs.get(name);
    if (rest.length === 0) return value?.project?.id ?? value?.id ?? value;
    for (const key of rest) value = value?.[key];
    if (value === undefined) throw new Error(`种子数据引用路径无效: $${path}`);
    return value;
  };
  const resolve = (value) => {
    if (typeof value === 'string' && /^\$[A-Za-z][\w.-]*$/.test(value)) return resolveRef(value.slice(1));
    if (Array.isArray(value)) return value.map(resolve);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolve(v)]));
    }
    return value;
  };
  for (const op of ops) {
    const { op: method, as, ...args } = op;
    if (typeof service[method] !== 'function') throw new Error(`未知种子操作: ${method}`);
    const result = service[method](resolve(args));
    if (as) refs.set(as, result);
  }
  return service;
}

export function seedFromFile(service, fileUrl) {
  const ops = JSON.parse(readFileSync(fileUrl, 'utf8'));
  return seed(service, ops);
}
