import { priceText, tr } from './i18n'
import type { DeliveryProductSource as Source } from './models/deliveryProducts'

export const SOURCE_AI: Source = 'ai'
export const SOURCE_MANUAL: Source = 'manual'

/** 1カードに掲載する商品1件(配信商品テーブルの1行に対応) */
export interface Item {
  key: string
  /** 保存済みの行ID(未保存なら undefined) */
  rowId?: string
  productId: string
  reason: string
  source: Source
  /** この配信で使う画像(空 = 商品のマスタの画像。X64) */
  imageUrl?: string
  /** その画像を選んだ元(商品ページの URL など) */
  imageSource?: string
  /** 空いた枠(商品のない行。前のセクションが埋まっていないのに後ろのセクションへ置いたときの、枠の場所取り。保存しない。src/slots.ts) */
  gap?: boolean
}

// ドラッグ&ドロップ用の MIME タイプ
export const DND_PRODUCT = 'application/x-product' // 候補 → プレビュー(値は商品ID)
export const DND_ITEM = 'application/x-item' // プレビュー内の並べ替え(値は Item.key)

// カード類(商品候補・配信カード・プレビュー)の中身の縮尺。枠の大きさは変えず、中身だけを縮める。
// zoom だけを指定する(幅は auto のままで、枠いっぱいに広がる)。以前は width を 100/縮尺 % にしていたが、
// 現在のブラウザの zoom では、その分だけ枠より広がってしまうため、指定しない。
export const CARD_SCALE = 0.8
export const scaled = { zoom: CARD_SCALE } as const

export const yen = (v?: number, market: 'JP' | 'US' = 'JP') => priceText(v, market)
export const DND_HERO = 'application/x-hero' // 候補 → プレビューのメインビジュアル枠(値はメイン画像ID)

/** 選定候補(配信商品テーブルの「候補」の行)。どのセクションの候補かを持つ */
export interface Candidate extends Item {
  section: number
}

// 配信商品テーブルの「state」列(選択肢)の値
export const STATE_SELECTED = 'selected'
export const STATE_CANDIDATE = 'candidate'
export const DND_CAND = 'application/x-candidate' // 中ペインの候補の行(値は Candidate.key)

/**
 * 商品を差し替えたときの、配信のメモの文(差し替えのどの道 — アラートへの対応・残りの候補と入れ替え・ほかの商品に置き換え — でも同じ形。2026-10-24 の整理)。
 * detail はアラートの中身(在庫が持たない見込み など)、why は人が書いた理由(任意)
 */
export function swapNote(from: string, to: string, opts: { detail?: string; why?: string } = {}): string {
  const why = opts.why?.trim()
  return tr(
    `${from} を ${to} に差し替えた${opts.detail ? `(${opts.detail})` : ''}${why ? `。理由: ${why}` : ''}`,
    `Replaced ${from} with ${to}${opts.detail ? ` (${opts.detail})` : ''}.${why ? ` Reason: ${why}` : ''}`,
  )
}
