// 企画から変えた所(P17。2026-11-02 Plan と Production のシンプル版を仕上げる)。
// 企画で承認された写し(original)と、制作が直した写し(current)を比べて、変えた所を 1 行ずつにする。
// 企画の担当が「どこを直されたか」を一度に見るため。プレビューの印・左のバーの一覧の両方が、この 1 つの比べ方を使う
// (productionSnapshot.ts は読むだけ。直す関数 setText などで、行ごとに企画の値へ戻した写しを作る)
import { getText, linkRows, setHero, setLink, setProducts, setText, textRows, type Snapshot, type TextField } from '../productionSnapshot'
import { heroImage, productImage } from '../images'
import { tr } from '../i18n'

export type ChangeKind = 'text' | 'hero' | 'product' | 'link'

export interface ChangeRow {
  /** 行を見分ける鍵(テキストは textRows の id、商品は product.並び、リンクは link.場所の鍵) */
  id: string
  kind: ChangeKind
  /** どこか(件名・メイン画像・商品の枠 3 など) */
  label: string
  /** 企画の値(空なら、企画にはなかった) */
  before: string
  /** いまの値(空なら、外した) */
  after: string
  /** 画像の行(メイン画像・商品)は、見比べられるように画像も */
  beforeImage?: string
  afterImage?: string
  /** 部品を選ぶための手がかり(プレビューの部品へ移る。呼ぶ側が使う) */
  field?: TextField
  productIndex?: number
  slotKey?: string
  /** この行だけ企画の値に戻した、新しい写し(元の写しは変えない) */
  revert: (s: Snapshot) => Snapshot
}

/** 企画から変えた所の一覧(テキスト → メイン画像 → 商品 → リンク先 の順。プレビューの上からの並びに近い) */
export function snapshotChanges(original: Snapshot, current: Snapshot): ChangeRow[] {
  const rows: ChangeRow[] = []

  // テキスト: 空の行も比べる(企画で空だった所に書いた・書いてあった所を消した、も変更)
  const before = new Map(textRows(original, true).map((r) => [r.id, r]))
  for (const r of textRows(current, true)) {
    const was = before.get(r.id)
    const b = was ? was.value : getText(original, r.field)
    if (b === r.value) continue
    rows.push({ id: r.id, kind: 'text', label: r.label, before: b, after: r.value, field: r.field, revert: (s) => setText(s, r.field, b) })
  }

  // メイン画像
  if ((original.hero?.id ?? '') !== (current.hero?.id ?? '')) {
    rows.push({
      id: 'hero',
      kind: 'hero',
      label: tr('メイン画像', 'Main image'),
      before: original.hero?.name ?? '',
      after: current.hero?.name ?? '',
      beforeImage: original.hero ? (heroImage(original.hero) ?? undefined) : undefined,
      afterImage: current.hero ? (heroImage(current.hero) ?? undefined) : undefined,
      revert: (s) => setHero(s, original.hero),
    })
  }

  // 商品: 枠ごと(並び順)に比べる。並べ替えも、入れ替えも、足す・外すも、枠ごとの違いとして出す
  const all = [...original.products, ...current.products]
  const nameOf = (id?: string) => (id ? (all.find((p) => p.id === id)?.name ?? '') : '')
  const imageOf = (id?: string) => {
    const p = id ? all.find((x) => x.id === id) : undefined
    return p ? (productImage(p) ?? undefined) : undefined
  }
  const n = Math.max(original.productIds.length, current.productIds.length)
  for (let i = 0; i < n; i++) {
    const was = original.productIds[i]
    const now = current.productIds[i]
    if ((was ?? '') === (now ?? '')) continue
    rows.push({
      id: `product.${i}`,
      kind: 'product',
      label: tr(`商品の枠 ${i + 1}`, `Product slot ${i + 1}`),
      before: nameOf(was),
      after: nameOf(now),
      beforeImage: imageOf(was),
      afterImage: imageOf(now),
      productIndex: i,
      revert: (s) => {
        const ids = [...s.productIds]
        if (was) ids[i] = was
        else ids.splice(i, 1)
        return setProducts(s, ids.filter(Boolean), all)
      },
    })
  }

  // リンク先: 直せる場所(メイン画像・ボタン)の、計測用のパラメーターを付ける前の URL で比べる
  const links = new Map(linkRows(original).map((r) => [r.slotKey ?? r.label, r.base ?? r.value]))
  for (const r of linkRows(current)) {
    if (!r.slotKey) continue
    const b = links.get(r.slotKey) ?? ''
    if ((r.base ?? '') === b) continue
    const slotKey = r.slotKey
    rows.push({ id: `link.${slotKey}`, kind: 'link', label: tr(`${r.label} のリンク先`, `${r.label} link`), before: b, after: r.base ?? '', slotKey, revert: (s) => setLink(s, slotKey, b) })
  }
  return rows
}
