/**
 * 送る前の確かめ(承認を依頼する・制作に渡す の前に見る一覧。2026-10-25 利用者と決めた。Klaviyo・Braze・Mailchimp の送る前のチェックリストの形)。
 * 入れ忘れ・文字数・空いた枠・在庫・画像の期限は、これまで別々の所に散らばっていたので、ここで 1 つの一覧にする。
 * 止める(block)のは、制作に渡すときの担当・締め切りが空のときだけ。ほかは警告(warn)にとどめる(人がいない・先に進めたいときがあるため)。
 * React を使わない(詳しい配信カードからも、同じ確かめを呼べるように)
 */
import type { CardAlert } from '../cardAlerts'
import { statusRank } from '../status'
import { PREHEADER_MAX, SUBJECT_MAX } from '../textLimits'
import { tr } from '../i18n'
import type { PartRef } from './parts'

export type ReadinessLevel = 'ok' | 'warn' | 'block'

/** 行を押したときに選ぶ所: 部品、制作の担当・締め切りの欄、左のバーのパネル */
export type ReadinessTarget = PartRef | { kind: 'handoffField'; field: 'productionOwner' | 'productionDue' } | { kind: 'panel'; panel: 'alerts' | 'approval' }

export interface ReadinessItem {
  /** 行の鍵(並びの中で一意) */
  key: string
  level: ReadinessLevel
  label: string
  /** いまの値・何が足りないか(短く) */
  detail: string
  target: ReadinessTarget | null
}

export interface ReadinessInput {
  channel: 'email' | 'push'
  /** 何の前の確かめか(制作に渡すときは、担当・締め切り・承認も見る) */
  purpose: 'approval' | 'handoff'
  subject: string
  /** 配信名(件名が空のとき、受信箱には配信名が出る) */
  name?: string
  preheader: string
  pushTitle: string
  pushBody: string
  /** アプリ: 通知を押したときに開く画面が決まっているか(pushLink.ts の tapComplete) */
  pushTapDone: boolean
  /** 送る相手が、そのチャネルで決まっているか(メールでもアプリでも。target.ts の audienceSet) */
  audienceSet: boolean
  headline: string
  copy: string
  hasHero: boolean
  /** 載せた商品(並びの順) */
  /** 選定の並び(空いた枠の行 gap を含んでよい。src/slots.ts) */
  items: { key: string; productId: string; gap?: boolean }[]
  /** テンプレートの商品の枠の数(枠の数が決まっていない並び(free)は 0) */
  slots: number
  alerts: CardAlert[]
  status: string
  productionOwner: string
  productionDue: string
}

const UNSET = () => tr('(未設定)', '(Not set)')

/** 文字の欄: 空なら警告、目安を超えたら警告(目安がなければ、空かどうかだけ) */
function textCheck(key: string, label: string, value: string, target: PartRef, max?: number): ReadinessItem {
  const v = value.trim()
  if (!v) return { key, level: 'warn', label, detail: UNSET(), target }
  const n = [...v].length
  if (max && n > max) return { key, level: 'warn', label, detail: tr(`${n} 文字(目安 ${max})`, `${n} characters (aim for ${max})`), target }
  return { key, level: 'ok', label, detail: max ? tr(`${n} 文字`, `${n} characters`) : '', target }
}

export function readinessOf(c: ReadinessInput): ReadinessItem[] {
  const out: ReadinessItem[] = []
  if (c.channel === 'email') {
    const subject = textCheck('subject', tr('件名', 'Subject'), c.subject, { kind: 'subject' }, SUBJECT_MAX)
    // 件名が空でも、受信箱には配信名が出る(プレビューと同じ)。入れ忘れとして知らせ、何が出るかも書く
    if (!c.subject.trim() && c.name?.trim()) subject.detail = tr(`(未設定)。配信名「${c.name.trim()}」が出ます`, `(Not set). Shows the delivery name "${c.name.trim()}"`)
    out.push(subject)
    out.push(textCheck('preheader', tr('プリヘッダー', 'Preheader'), c.preheader, { kind: 'preheader' }, PREHEADER_MAX))
    out.push({ key: 'hero', level: c.hasHero ? 'ok' : 'warn', label: tr('メイン画像', 'Main image'), detail: c.hasHero ? '' : UNSET(), target: { kind: 'hero' } })
    // 見出し・本文は 1 行にまとめる(どちらかが空なら、空の方を選ぶ)
    const noHead = !c.headline.trim()
    const noCopy = !c.copy.trim()
    out.push({
      key: 'texts',
      level: noHead || noCopy ? 'warn' : 'ok',
      label: tr('見出し・本文', 'Headline and body'),
      detail: noHead && noCopy ? UNSET() : noHead ? tr('見出しが(未設定)', 'Headline not set') : noCopy ? tr('本文が(未設定)', 'Body not set') : '',
      target: noHead || !noCopy ? { kind: 'headline' } : { kind: 'copy' },
    })
    // 商品の枠: 枠の数が決まっていれば空いた枠を数える。決まっていない並びは、1 つもないときだけ
    const count = c.items.filter((i) => !i.gap).length
    const empty = c.slots > 0 ? Math.max(0, c.slots - count) : count === 0 ? 1 : 0
    // 最初の空いた枠(前のセクションの空いた枠の行か、並びの後ろ)
    const firstGap = c.items.findIndex((i) => i.gap)
    out.push({
      key: 'slots',
      level: empty > 0 ? 'warn' : 'ok',
      label: tr('商品の枠', 'Product slots'),
      detail: empty === 0 ? tr(`${count} 件`, `${count}`) : c.slots > 0 ? tr(`空いた枠 ${empty}`, `${empty} empty`) : tr('商品がありません', 'No products'),
      target: empty > 0 ? { kind: 'slot', index: firstGap >= 0 ? firstGap : c.items.length } : null,
    })
  } else {
    out.push(textCheck('pushTitle', tr('通知のタイトル', 'Notification title'), c.pushTitle, { kind: 'pushTitle' }))
    out.push(textCheck('pushBody', tr('通知の本文', 'Notification body'), c.pushBody, { kind: 'pushBody' }))
    // 開く画面の欄は、通知の部品のペインにある(X81 の 2)
    out.push({ key: 'pushTap', level: c.pushTapDone ? 'ok' : 'warn', label: tr('通知を押したときに開く画面', 'Screen opened on tap'), detail: c.pushTapDone ? '' : UNSET(), target: { kind: 'pushTitle' } })
  }

  // 送る相手(メールでもアプリでも。2026-10-27 利用者の決め)。決まっていなければ警告(止めない)。押すと配信の情報の送る相手の欄へ
  out.push({ key: 'audience', level: c.audienceSet ? 'ok' : 'warn', label: tr('送る相手', 'Send to'), detail: c.audienceSet ? '' : UNSET(), target: { kind: 'meta', field: 'audience' } })

  // 在庫・画像の期限は、商品ごとに 1 行(押すと、その商品の枠を選ぶ)。ほかのアラートは、まとめて 1 行
  const keyOf = new Map(c.items.filter((it) => !it.gap).map((it) => [it.productId, it.key]))
  const productTarget = (a: CardAlert): ReadinessTarget => {
    const k = a.productId ? keyOf.get(a.productId) : undefined
    return k ? { kind: 'product', itemKey: k } : { kind: 'panel', panel: 'alerts' }
  }
  const stock = c.alerts.filter((a) => a.kind === 'outOfStock' || a.kind === 'lowStock')
  const expired = c.alerts.filter((a) => a.kind === 'imageExpired')
  const other = c.alerts.filter((a) => a.kind !== 'outOfStock' && a.kind !== 'lowStock' && a.kind !== 'imageExpired')
  if (stock.length === 0) out.push({ key: 'stock', level: 'ok', label: tr('在庫', 'Stock'), detail: '', target: null })
  for (const a of stock)
    out.push({ key: `stock:${a.productId ?? a.label}`, level: 'warn', label: a.kind === 'outOfStock' ? tr('在庫切れ', 'Out of stock') : tr('在庫が少ない', 'Low stock'), detail: a.label, target: productTarget(a) })
  if (expired.length === 0) out.push({ key: 'imageExpiry', level: 'ok', label: tr('画像の使用期限', 'Image usage rights'), detail: '', target: null })
  for (const a of expired) out.push({ key: `imageExpiry:${a.productId ?? a.label}`, level: 'warn', label: tr('画像の使用期限', 'Image usage rights'), detail: a.label, target: productTarget(a) })
  if (other.length > 0)
    out.push({
      key: 'otherAlerts',
      level: 'warn',
      label: tr('ほかのアラート', 'Other alerts'),
      detail: [...new Set(other.map((a) => a.detail || a.label))].join(' / '),
      target: { kind: 'panel', panel: 'alerts' },
    })

  if (c.purpose === 'handoff') {
    out.push({ key: 'productionOwner', level: c.productionOwner.trim() ? 'ok' : 'block', label: tr('制作の担当', 'Production assignee'), detail: c.productionOwner.trim() || UNSET(), target: { kind: 'handoffField', field: 'productionOwner' } })
    out.push({ key: 'productionDue', level: c.productionDue ? 'ok' : 'block', label: tr('締め切り', 'Due'), detail: c.productionDue || UNSET(), target: { kind: 'handoffField', field: 'productionDue' } })
    const approved = statusRank(c.status) >= statusRank('approved')
    out.push({ key: 'approval', level: approved ? 'ok' : 'warn', label: tr('承認', 'Approval'), detail: approved ? '' : tr('承認の前に渡します', 'Handing off before approval'), target: approved ? null : { kind: 'panel', panel: 'approval' } })
  }
  return out
}

/** 警告と、止めるものの数(青いボタンの印・畳むかどうか) */
export const readinessIssues = (list: ReadinessItem[]) => list.filter((i) => i.level !== 'ok').length
export const readinessBlocked = (list: ReadinessItem[]) => list.some((i) => i.level === 'block')
