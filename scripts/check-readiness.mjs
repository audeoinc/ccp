// 送る前の確かめ(src/simple/readiness.ts)が、例どおりに ✓ / 警告 / 止める を決めることを確かめる。
//   node scripts/check-readiness.mjs   ← npm run verify に含まれる
// 止めるのは、制作に渡すときの担当・締め切りが空のときだけ(2026-10-25 利用者と決めた)。ここが崩れると、渡せない・止まらないになるので、例で固める。
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createServer } from 'vite'
import { report, viteForChecks } from './check-approvals.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const base = {
  channel: 'email',
  purpose: 'approval',
  subject: '秋の新作',
  preheader: '今週だけの特集です',
  pushTitle: '',
  pushBody: '',
  headline: '秋の装い',
  copy: '新作がそろいました',
  hasHero: true,
  items: [
    { key: 'i1', productId: 'p1' },
    { key: 'i2', productId: 'p2' },
  ],
  slots: 2,
  alerts: [],
  status: 'not_started',
  productionOwner: '',
  productionDue: '',
}

// levels = 行の鍵 → 決まる印(書いていない行は ok)。blocked = 止めるか
const cases = [
  { name: 'すべてそろったメール(承認を依頼する)', input: {}, levels: {}, blocked: false },
  { name: '件名が空・プリヘッダーが長い', input: { subject: ' ', preheader: 'あ'.repeat(91) }, levels: { subject: 'warn', preheader: 'warn' }, blocked: false },
  { name: '件名はちょうど目安', input: { subject: 'あ'.repeat(40) }, levels: {}, blocked: false },
  { name: '空いた枠がある・画像がない', input: { slots: 4, hasHero: false }, levels: { slots: 'warn', hero: 'warn' }, blocked: false },
  { name: '枠の決まっていない並びで、商品がない', input: { slots: 0, items: [] }, levels: { slots: 'warn' }, blocked: false },
  { name: '枠の決まっていない並びで、商品がある', input: { slots: 0 }, levels: {}, blocked: false },
  {
    name: '在庫切れ・画像の期限・ほかのアラート',
    input: {
      alerts: [
        { kind: 'outOfStock', productId: 'p1', label: 'A', detail: '' },
        { kind: 'imageExpired', productId: 'p2', label: 'B', detail: '' },
        { kind: 'dateChanged', label: '', detail: '日程が変わった' },
      ],
    },
    levels: { 'stock:p1': 'warn', 'imageExpiry:p2': 'warn', otherAlerts: 'warn' },
    absent: ['stock', 'imageExpiry'],
    blocked: false,
  },
  { name: '制作に渡す: 担当・締め切りが空(止める)', input: { purpose: 'handoff' }, levels: { productionOwner: 'block', productionDue: 'block', approval: 'warn' }, blocked: true },
  { name: '制作に渡す: 承認済みで、担当・締め切りあり', input: { purpose: 'handoff', status: 'approved', productionOwner: '山田', productionDue: '2026-11-01' }, levels: {}, blocked: false },
  { name: '制作に渡す: 確定(承認より後)', input: { purpose: 'handoff', status: 'confirmed', productionOwner: '山田', productionDue: '2026-11-01' }, levels: {}, blocked: false },
  { name: 'プッシュ: 本文が空(メールの行は出さない)', input: { channel: 'push', pushTitle: 'セール', pushBody: '' }, levels: { pushBody: 'warn' }, absent: ['subject', 'hero', 'slots'], blocked: false },
]

/** 確かめる(server は、src を読み込む Vite のサーバー) */
export async function checkReadiness(server) {
  const problems = []
  const m = await server.ssrLoadModule('/src/simple/readiness.ts')
  for (const c of cases) {
    const list = m.readinessOf({ ...base, ...c.input })
    const got = Object.fromEntries(list.map((i) => [i.key, i.level]))
    for (const [k, v] of Object.entries(got)) if (v !== (c.levels[k] ?? 'ok')) problems.push(`「${c.name}」の ${k}: ${v}(期待: ${c.levels[k] ?? 'ok'})`)
    for (const k of Object.keys(c.levels)) if (!(k in got)) problems.push(`「${c.name}」に ${k} の行がない`)
    for (const k of c.absent ?? []) if (k in got) problems.push(`「${c.name}」に ${k} の行があってはいけない`)
    if (m.readinessBlocked(list) !== c.blocked) problems.push(`「${c.name}」: ${c.blocked ? '止まらなかった' : '止まった'}`)
  }
  return { problems, ok: `readiness OK(${cases.length} 例)`, title: '送る前の確かめが、例と合いません' }
}

// 単独で流したとき
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = await createServer(viteForChecks(root))
  try {
    report(await checkReadiness(server))
  } finally {
    await server.close()
  }
}
