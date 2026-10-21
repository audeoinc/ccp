// 配信ごとのアラート: アラートの画面と同じ結果(アラートの条件も反映したもの)を、配信ごとに分ける。
// 配信カードの帯(どこに問題があるか)と、カレンダーの印に使う
import type { ChangeAlert, StockAlert } from './alerts'
import { locale, tr } from './i18n'
import { limitText, weeklyLimitFor } from './weeklyLimit'
import { weekKeyOf } from './weekLock'

export type CardAlertKind = 'outOfStock' | 'lowStock' | 'policyChanged' | 'dateChanged' | 'overLimit'

export interface CardAlert {
  kind: CardAlertKind
  /** 問題の商品(在庫・方針)。押すと、配信カードでその商品を選ぶ */
  productId?: string
  /** 何が問題か(画面に出す文) */
  label: string
  detail: string
}

/** 強い順(カレンダーの印の色に使う) */
export const CARD_ALERT_ORDER: CardAlertKind[] = ['outOfStock', 'policyChanged', 'lowStock', 'overLimit', 'dateChanged']

const dateText = (iso?: string) => (iso ? new Date(iso).toLocaleString(locale(), { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')

export function buildCardAlerts(stock: StockAlert[], changes: ChangeAlert[]): Map<string, CardAlert[]> {
  const out = new Map<string, CardAlert[]>()
  const add = (cardId: string, a: CardAlert) => out.set(cardId, [...(out.get(cardId) ?? []), a])
  for (const a of stock) {
    for (const d of a.deliveries) {
      if (d.problem === 'none') continue
      add(d.card.id, {
        kind: d.problem === 'soldOut' ? 'outOfStock' : 'lowStock',
        productId: a.product.id,
        label: a.product.name ?? '',
        detail:
          d.problem === 'soldOut'
            ? tr('配信日に在庫がない見込み', 'None left by the delivery day (est.)')
            : d.after < 0
              ? tr(`この配信で売り切れる見込み(配信日に ${Math.max(0, d.projected)} 点)`, `May sell out with this one (${Math.max(0, d.projected)} left on the day)`)
              : tr(`配信日に ${(d.weeksLeft ?? 0).toFixed(1)} 週分の在庫`, `${(d.weeksLeft ?? 0).toFixed(1)} weeks of stock on the day`),
      })
    }
  }
  for (const a of changes) {
    if (a.kind === 'policyChanged' && a.product) {
      const stage = a.changes.find((c) => c.field === 'stage')
      for (const d of a.deliveries) {
        add(d.card.id, {
          kind: 'policyChanged',
          productId: a.product.id,
          label: a.product.name ?? '',
          detail: stage ? tr(`位置づけが ${stage.before} → ${stage.after} に変わった`, `Role changed: ${stage.before} → ${stage.after}`) : tr('MD の方針が変わった', 'MD policy changed'),
        })
      }
    }
    if (a.kind === 'dateChanged' && a.card) {
      const when = a.changes.find((c) => c.field === 'scheduled_at')
      const others = a.deliveries.filter((d) => d.note === 'sameDay').map((d) => d.card.name)
      add(a.card.id, {
        kind: 'dateChanged',
        label: tr('配信日時', 'Date'),
        detail:
          tr(`${dateText(when?.before)} → ${dateText(when?.after)} に変わった`, `Changed ${dateText(when?.before)} → ${dateText(when?.after)}`) +
          (others.length > 0 ? tr(`。同じ日・同じチャネルに ${others.join('、')}`, `. Same day and channel: ${others.join(', ')}`) : ''),
      })
      for (const d of a.deliveries.filter((x) => x.note === 'sameDay')) {
        add(d.card.id, {
          kind: 'dateChanged',
          label: tr('同じ日の配信', 'Same-day delivery'),
          detail: tr(`${a.card.name} が、同じ日・同じチャネルに移ってきた`, `${a.card.name} was moved to the same day and channel`),
        })
      }
    }
  }
  return out
}

/** いちばん強いアラートの種類(カレンダーの印) */
export const topKind = (list?: CardAlert[]): CardAlertKind | undefined => CARD_ALERT_ORDER.find((k) => list?.some((a) => a.kind === k))

/**
 * 週ごとの、商品を載せる配信の数(週の確認の一覧 W4 の「週の上限を超えた商品」と同じ数え方。同じ配信に 2 回載せても 1 と数える)。
 * 週のキーは weekKeyOf
 */
export function weeklyUse(cards: { id: string; scheduled_at?: string }[], cardProducts: Map<string, string[]>): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>()
  for (const c of cards) {
    if (!c.scheduled_at) continue
    const key = weekKeyOf(new Date(c.scheduled_at))
    const m = out.get(key) ?? new Map<string, number>()
    for (const pid of new Set(cardProducts.get(c.id) ?? [])) m.set(pid, (m.get(pid) ?? 0) + 1)
    out.set(key, m)
  }
  return out
}

/**
 * 週の上限を超えた商品のアラート(配信ごと)。在庫のアラートと同じく、配信カードの帯・プレビューの枠・商品情報の行に出し、
 * 「このアラートへの対応」から差し替えられるようにする(直す場所を配信カードにそろえる。2026-10-19 利用者と決めた)
 */
export function overLimitAlerts(cards: { id: string; scheduled_at?: string; country?: string; channel?: string }[], cardProducts: Map<string, string[]>, productName: (id: string) => string): Map<string, CardAlert[]> {
  const use = weeklyUse(cards, cardProducts)
  const out = new Map<string, CardAlert[]>()
  for (const c of cards) {
    if (!c.scheduled_at) continue
    const m = use.get(weekKeyOf(new Date(c.scheduled_at)))
    const lim = weeklyLimitFor(c)
    const list = [...new Set(cardProducts.get(c.id) ?? [])]
      .filter((pid) => (m?.get(pid) ?? 0) > lim.n)
      .map((pid) => ({
        kind: 'overLimit' as const,
        productId: pid,
        label: productName(pid),
        detail: tr(`この週に ${m?.get(pid) ?? 0} 本の配信に載っている(${limitText(lim)})`, `In ${m?.get(pid) ?? 0} deliveries this week (${limitText(lim)})`),
      }))
    if (list.length > 0) out.set(c.id, list)
  }
  return out
}

/** 2 つの、配信ごとのアラートをまとめる */
export function mergeCardAlerts(a: Map<string, CardAlert[]>, b: Map<string, CardAlert[]>): Map<string, CardAlert[]> {
  const out = new Map(a)
  for (const [id, list] of b) out.set(id, [...(out.get(id) ?? []), ...list])
  return out
}
