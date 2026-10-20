import { useState, type ReactNode } from 'react'
import { Badge, Button, Spinner, Textarea, Tooltip, makeStyles, tokens } from '@fluentui/react-components'
import type { WeeklyPerformance } from './models/weeklyPerformances'
import { DeliveryResultsService } from './data/deliveryResults'
import { locale, useT } from './i18n'
import { isPush, parseProductResults, pct, templateName, type ResultRow } from './results'
import type { DeliveryImpactInfo } from './useDeliveryImpact'

const useStyles = makeStyles({
  // 主な数字: 横一列に並べる
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', columnGap: '8px', rowGap: '8px' },
  kpi: { border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, padding: '8px 12px', backgroundColor: tokens.colorNeutralBackground1 },
  kpiLabel: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  kpiValue: { fontSize: tokens.fontSizeBase500, fontWeight: tokens.fontWeightSemibold, fontVariantNumeric: 'tabular-nums' },
  up: { color: tokens.colorPaletteGreenForeground1 },
  down: { color: tokens.colorPaletteRedForeground1 },
  // 商品・AI の案・メモ
  col: { display: 'grid', rowGap: '18px', alignContent: 'start', minWidth: 0 },
  h3: { margin: '0 0 6px', fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold },
  list: { display: 'grid', rowGap: '6px', fontSize: tokens.fontSizeBase300 },
  prodRow: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', columnGap: '8px' },
  prodName: { fontWeight: tokens.fontWeightSemibold, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  prodSub: { gridColumn: '1 / -1', color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  aiItem: { overflowWrap: 'anywhere' },
  aiReason: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  noteActions: { display: 'flex', justifyContent: 'flex-end', alignItems: 'center', columnGap: '8px', marginTop: '6px' },
  muted: { color: tokens.colorNeutralForeground3 },
  // 「この配信に渡した学び」の見出しの行(右に「効果で見る」)
  h3Row: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', columnGap: '8px' },
  linkBtn: { minWidth: 'auto', height: 'auto', padding: 0 },
  learnLine: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'default' },
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
          [t('増えた売上', 'Incremental revenue'), money(Math.round(lift.incremental))],
          [t('リフト率', 'Lift'), lift.liftRate == null ? '—' : `${(lift.liftRate * 100).toFixed(1)}%`],
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

/** 配信 1 本の、商品の売れ方・採用した AI の提案・次に生かすメモ */
export function ResultInsights({
  row,
  weekly,
  productName,
  productCode,
  money,
  onSaved,
  impact,
  onOpenImpact,
}: {
  row: ResultRow
  weekly: WeeklyPerformance[]
  productName: (id: string) => string
  /** 商品 ID → 商品コード(週ごとの実績は、商品コードで持っている) */
  productCode: (id: string) => string | undefined
  money: (v?: number) => string
  onSaved: () => Promise<void>
  /** この配信の効果(AI に渡した学び。X56)。読み込み中・読めないときは null */
  impact?: DeliveryImpactInfo | null
  /** 結果の面の見せ方「効果」の、学びの評価を開く */
  onOpenImpact?: () => void
}) {
  const styles = useStyles()
  const t = useT()
  const { card, result } = row
  const [notes, setNotes] = useState(result.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const push = isPush(card)
  const items = parseProductResults(result.products)

  // 配信の週と、その前の週の、商品の売れた数(週ごとの実績があれば)
  const sent = new Date(result.sent_at ?? card.scheduled_at ?? '')
  const weekOf = (code?: string) => {
    if (!code || Number.isNaN(sent.getTime())) return undefined
    const rowsOf = weekly.filter((w) => w.product_code === code).sort((a, b) => (a.week_start ?? '').localeCompare(b.week_start ?? ''))
    const i = rowsOf.findIndex((w) => {
      const s = new Date(`${w.week_start}T00:00:00`)
      return s.getTime() <= sent.getTime() && sent.getTime() < s.getTime() + 7 * 24 * 3600_000
    })
    if (i <= 0) return undefined
    const now = rowsOf[i]
    const before = rowsOf[i - 1]
    return {
      change: before.units ? (now.units ?? 0) / before.units - 1 : undefined,
      stockWeeks: now.units ? (now.stock ?? 0) / now.units : undefined,
    }
  }

  const save = async () => {
    setSaving(true)
    try {
      const res = await DeliveryResultsService.update(result.id, { notes: notes })
      if (res.success) {
        setSavedAt(new Date().toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }))
        await onSaved()
      }
    } finally {
      setSaving(false)
    }
  }

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

  return (
    <div className={styles.col} data-print-cols>
      <section>
        <h3 className={styles.h3}>{t('次に生かすメモ', 'Notes for next time')}</h3>
        {/* 印刷では、入力欄ではなく、文章として出す */}
        <div data-print-only style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          {notes.trim() || t('(メモはありません)', '(No notes)')}
        </div>
        <Textarea data-noprint value={notes} onChange={(_, d) => setNotes(d.value)} resize="vertical" rows={4} style={{ width: '100%' }} placeholder={t('うまくいったこと・次に試すこと', 'What worked, and what to try next')} />
        <div className={styles.noteActions} data-noprint>
          {saving && <Spinner size="extra-tiny" />}
          {savedAt && !saving && <span className={styles.muted}>{t(`${savedAt} に保存しました`, `Saved at ${savedAt}`)}</span>}
          <Button size="small" onClick={() => void save()} disabled={saving || notes === (result.notes ?? '')}>
            {t('保存', 'Save')}
          </Button>
        </div>
      </section>
      <section>
        <h3 className={styles.h3}>{t('商品: 配信のあとの売れ方', 'Products: sales after the delivery')}</h3>
        {items.length === 0 ? (
          <div className={styles.muted}>{t('商品ごとの結果はありません', 'No product results')}</div>
        ) : (
          <div className={styles.list}>
            {items.map((p) => {
              const w = weekOf(productCode(p.productId))
              return (
                <div key={p.productId} className={styles.prodRow}>
                  <span className={styles.prodName}>{productName(p.productId)}</span>
                  <span>{money(p.revenue)}</span>
                  <span className={styles.prodSub}>
                    {t(`クリック ${p.clicks.toLocaleString(locale())}・${p.units} 点`, `${p.clicks.toLocaleString(locale())} clicks · ${p.units} units`)}
                    {w?.change !== undefined && t(`・その週の販売 ${w.change >= 0 ? '+' : ''}${Math.round(w.change * 100)}%`, ` · week sales ${w.change >= 0 ? '+' : ''}${Math.round(w.change * 100)}%`)}
                    {w?.stockWeeks !== undefined && t(`・在庫 ${w.stockWeeks.toFixed(1)} 週分`, ` · stock ${w.stockWeeks.toFixed(1)} wks`)}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </section>
      <section>
        <h3 className={styles.h3}>{t('採用した AI の提案', 'Adopted AI suggestions')}</h3>
        {ai.length === 0 ? (
          <div className={styles.muted}>{t('記録がありません', 'Nothing recorded')}</div>
        ) : (
          <div className={styles.list}>
            {ai.map((x) => (
              <div key={x.label} className={styles.aiItem}>
                {`${x.label}: ${x.value}`}
                {x.reason && <div className={styles.aiReason}>{x.reason}</div>}
              </div>
            ))}
          </div>
        )}
      </section>
      {impact && (
        <section>
          <div className={styles.h3Row}>
            <h3 className={styles.h3}>{t(`この配信に渡した学び(${impact.learnings.length} 件)`, `Learnings passed to this delivery (${impact.learnings.length})`)}</h3>
            {onOpenImpact && (
              <span data-noprint>
                <Button appearance="transparent" size="small" className={styles.linkBtn} onClick={onOpenImpact}>
                  {t('効果で見る', 'See in Impact')}
                </Button>
              </span>
            )}
          </div>
          {impact.learnings.length === 0 ? (
            <div className={styles.muted}>
              {impact.recorded
                ? t('AI の案を頼んだとき、学びは渡していません(学びの効き目を比べる相手になる配信です)', 'No learnings were passed when asking AI (this delivery is part of the comparison group)')
                : t('AI の依頼の記録がありません', 'No AI request records')}
            </div>
          ) : (
            <div className={styles.list}>
              {impact.learnings.map((l) => (
                <div key={l.id} className={styles.aiItem}>
                  {/* 1 行目だけを出し、全文は吹き出しで(フロートの中なので、重ねて開かない) */}
                  <Tooltip content={<span style={{ whiteSpace: 'pre-wrap' }}>{l.notes}</span>} relationship="description">
                    <div className={styles.learnLine} tabIndex={0}>
                      {l.notes.split('\n')[0]}
                    </div>
                  </Tooltip>
                  <div className={styles.aiReason}>
                    {t('出どころ: ', 'From: ')}
                    {l.sourceName}
                    {l.sourceAt ? ` · ${new Date(l.sourceAt).toLocaleDateString(locale(), { month: 'numeric', day: 'numeric' })}` : ''}
                    {l.retired && (
                      <>
                        {' '}
                        <Badge appearance="tint" color="subtle" size="small">
                          {t('いまは外した学び', 'Retired since')}
                        </Badge>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
