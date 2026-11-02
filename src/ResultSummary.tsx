import type { ReactNode } from 'react'
import { makeStyles, tokens } from '@fluentui/react-components'
import { typo } from './typo'
import { locale, useT } from './i18n'
import { isPush, pct, templateName, type ResultRow } from './results'
import type { DeliveryCard } from './models/deliveryCards'
import { LabeledValue } from './LabeledValue'
import type { DeliveryImpactInfo } from './useDeliveryImpact'

const useStyles = makeStyles({
  // 主な数字: 横一列に並べる
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', columnGap: '8px', rowGap: '8px' },
  kpi: { border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, padding: '8px 12px', backgroundColor: tokens.colorNeutralBackground1 },
  kpiLabel: typo.pairLabel,
  kpiValue: { fontSize: tokens.fontSizeBase500, fontWeight: tokens.fontWeightSemibold, fontVariantNumeric: 'tabular-nums' },
  up: { color: tokens.colorPaletteGreenForeground1 },
  down: { color: tokens.colorPaletteRedForeground1 },
  // 採用した AI の提案
  list: { display: 'grid', rowGap: '8px' },
  muted: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
})

/**
 * 配信 1 本の主な数字(開封率・クリック率 / タップ率・配信経由の売上・注文・送った数・前年比)。
 * lift(ホールドアウトとの比べ。X56)があるときだけ、売上の右に「増えた売上」「リフト率」を足す
 */
export function ResultKpis({ row, money, lift }: { row: ResultRow; money: (v?: number) => string; lift?: DeliveryImpactInfo['lift'] }) {
  const styles = useStyles()
  const t = useT()
  const { card, result } = row
  const push = isPush(card)
  const n = (v?: number) => (v ?? 0).toLocaleString(locale())
  const items: [string, ReactNode][] = [
    ...(push ? [] : ([[t('開封率', 'Open rate'), pct(row.openRate)]] as [string, ReactNode][])),
    [push ? t('タップ率', 'Tap rate') : t('クリック率', 'Click rate'), pct(row.clickRate)],
    // 配信のリンクを通った売上(配信がなくても買った人の分を含む)。増分と取り違えないように、呼び方で分ける
    [t('配信経由の売上', 'Revenue via delivery'), money(row.revenue)],
    ...(lift
      ? ([
          // 測定の条件(購買を数えた日数・送らなかった割合)も、ラベルに添える(何と比べた数字かが分かるように)
          [
            lift.windowDays
              ? t(`増えた売上(${lift.windowDays} 日間)`, `Incremental (${lift.windowDays} days)`)
              : t('増えた売上', 'Incremental revenue'),
            money(Math.round(lift.incremental)),
          ],
          [
            lift.holdoutRate ? t(`リフト率(送らず ${Math.round(lift.holdoutRate * 100)}%)`, `Lift (${Math.round(lift.holdoutRate * 100)}% holdout)`) : t('リフト率', 'Lift'),
            lift.liftRate == null ? '—' : `${(lift.liftRate * 100).toFixed(1)}%`,
          ],
        ] as [string, ReactNode][])
      : []),
    [t('注文', 'Orders'), n(result.orders)],
    [t('送った数', 'Sent'), n(result.recipients)],
    [
      t('前年比', 'vs last year'),
      row.vsLastYear === undefined ? '—' : <span className={row.vsLastYear >= 0 ? styles.up : styles.down}>{`${row.vsLastYear >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(row.vsLastYear * 100))}%`}</span>,
    ],
  ]
  return (
    <div className={styles.kpis}>
      {items.map(([label, value]) => (
        <div key={label} className={styles.kpi}>
          <div className={styles.kpiLabel}>{label}</div>
          <div className={styles.kpiValue}>{value}</div>
        </div>
      ))}
    </div>
  )
}

/**
 * 採用した AI の提案(テーマ・見出し・テンプレート・メイン画像と、その理由・切り口)。
 * 案そのものは保存しないので、配信カードに残った「採用した内容と補足」から組み立てる
 */
export function AdoptedAi({ card }: { card: DeliveryCard }) {
  const styles = useStyles()
  const t = useT()
  const push = isPush(card)
  const ai: { label: string; value?: string; reason?: string }[] = [
    { label: t('テーマ', 'Theme'), value: card.theme, reason: card.theme_reason },
    ...(push
      ? [{ label: t('通知のタイトル', 'Notification title'), value: card.push_title }]
      : [
          { label: t('見出し', 'Headline'), value: card.headline, reason: card.copy_angle ? t(`切り口: ${card.copy_angle}`, `Angle: ${card.copy_angle}`) : undefined },
          { label: t('テンプレート', 'Template'), value: templateName(card), reason: card.instructions_angle ? t(`制作指示: ${card.instructions_angle}`, `Brief: ${card.instructions_angle}`) : undefined },
          { label: t('メイン画像', 'Hero'), value: card.hero_reason ? t('AI の提案から選択', 'Picked from AI suggestions') : undefined, reason: card.hero_reason },
        ]),
  ].filter((x) => x.value)
  if (ai.length === 0) return <span className={styles.muted}>{t('記録がありません', 'Nothing recorded')}</span>
  return (
    <div className={styles.list}>
      {ai.map((x) => (
        <LabeledValue key={x.label} label={x.label} layout="stacked">
          {x.value}
          {x.reason && <div className={styles.muted}>{x.reason}</div>}
        </LabeledValue>
      ))}
    </div>
  )
}
