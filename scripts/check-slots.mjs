// 商品の並びとセクションの枠(src/slots.ts)が、例どおりに動くことを確かめる。
//   node scripts/check-slots.mjs   ← npm run verify に含まれる
// 保存済みの配信の位置をずらさないことが条件(2026-10-27 利用者と決めた案 A)。読み込み・保存・外す・入れるが崩れると、商品が別のセクションへずれるので、例で固める。
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createServer } from 'vite'
import { report, viteForChecks } from './check-approvals.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// セクション 2 つ(枠 2・枠 3)のテンプレートの形
const SECS = [
  { index: 0, start: 0, slots: 2, kind: 'grid', wantTitle: false, label: 'A' },
  { index: 1, start: 2, slots: 3, kind: 'grid', wantTitle: false, label: 'B' },
]
const it = (p) => ({ key: p, productId: p, reason: '', source: 'manual' })
/** 並びを、商品 ID と空いた枠(_)の文字にする */
const show = (list) => list.map((i) => (i.gap ? '_' : i.productId)).join(',')
/** 配信カードの保存と同じ形の行(sort_order = 枠の位置 + 1、空いた枠は保存しない) */
const saved = (sectionAt, list) => list.flatMap((i, idx) => (i.gap ? [] : [{ id: i.productId, product_id: i.productId, sort_order: idx + 1, section: sectionAt(idx) }]))

export async function checkSlots(server) {
  const problems = []
  const m = await server.ssrLoadModule('/src/slots.ts')
  const t = await server.ssrLoadModule('/src/templates.ts')
  const sectionAt = (idx) => t.sectionIndexAt(SECS, idx)
  const toItem = (r) => it(r.product_id)
  const eq = (name, got, want) => {
    if (got !== want) problems.push(`${name}: ${got}(期待: ${want})`)
  }

  // ---- 読み込み(保存済みの配信をずらさない)
  eq('いままでの保存(1 から続く番号)はそのまま', show(m.slotsFromRows([1, 2, 3, 4].map((n) => ({ product_id: `p${n}`, sort_order: n })), toItem)), 'p1,p2,p3,p4')
  eq('0 から始まる番号(初期データの見本)は、順に詰める', show(m.slotsFromRows([0, 1, 2, 3].map((n) => ({ product_id: `p${n}`, sort_order: n })), toItem)), 'p0,p1,p2,p3')
  eq('番号が飛んだ保存は、その位置に置く', show(m.slotsFromRows([{ product_id: 'x', sort_order: 3 }, { product_id: 'y', sort_order: 4 }], toItem)), '_,_,x,y')
  eq('番号のない行が混ざると、順に詰める', show(m.slotsFromRows([{ product_id: 'x', sort_order: 3 }, { product_id: 'y' }], toItem)), 'x,y')

  // ---- 入れる・外す・移す(ほかのセクションは動かさない)
  eq('前のセクションが空のまま、後ろのセクションの空いた枠に入れる', show(m.insertAt([], SECS, 2, it('x'))), '_,_,x')
  eq('そのセクションの中では前から埋まる', show(m.insertAt([it('a'), it('b')], SECS, 4, it('x'))), 'a,b,x')
  eq('外すと、そのセクションの中だけ詰める', show(m.removeKey(['a', 'b', 'c', 'd'].map(it), SECS, 'a')), 'b,_,c,d')
  eq('後ろのセクションの商品を外して空になれば、要らない空いた枠も消える', show(m.removeKey([m.insertAt([], SECS, 2, it('x'))].flat(), SECS, 'x')), '')
  eq('いっぱいのセクションに入れると、余りは次のセクションの先頭へ', show(m.insertAt(['a', 'b', 'c'].map(it), SECS, 0, it('x'))), 'x,a,b,c')
  eq('後ろのセクションから前のセクションの空いた枠へ移す', show(m.moveTo(m.insertAt([it('a')], SECS, 2, it('x')), SECS, 'x', 1)), 'a,x')
  eq('セクションを置き換える(ほかは動かさない)', show(m.replaceSection(['a', 'b', 'c'].map(it), SECS, 0, [it('x')])), 'x,_,c')

  // ---- 保存して読み直すと同じ並び
  const withGap = m.insertAt([], SECS, 2, it('x'))
  eq('空いた枠のある並びを保存して読み直す', show(m.slotsFromRows(saved(sectionAt, withGap), toItem)), show(withGap))
  return { problems, ok: 'slots OK', title: '商品の並びとセクションの枠が、例と合いません' }
}

// 単独で流したとき
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = await createServer(viteForChecks(root))
  try {
    report(await checkSlots(server))
  } finally {
    await server.close()
  }
}
