// 配信ごとのアラート: アラートの画面と同じ結果(アラートの条件も反映したもの)を、配信ごとに分ける。
// 配信カードの帯(どこに問題があるか)と、カレンダーの印に使う
import type { ChangeAlert, StockAlert } from './alerts'
import { locale, tr } from './i18n'

export type CardAlertKind = 'outOfStock' | 'lowStock' | 'policyChanged' | 'dateChanged'

export interface CardAlert {
  kind: CardAlertKind
  /** 問題の商品(在庫・方針)。押すと、配信カードでその商品を選ぶ */
  productId?: string
  /** 何が問題か(画面に出す文) */
  label: string
  detail: string
}

/** 強い順(カレンダーの印の色に使う) */
export const CARD_ALERT_ORDER: CardAlertKind[] = ['outOfStock', 'policyChanged', 'lowStock', 'dateChanged']

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
