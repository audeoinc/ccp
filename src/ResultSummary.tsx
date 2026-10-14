import { useState, type ReactNode } from 'react'
import { Button, Spinner, Textarea, makeStyles, tokens } from '@fluentui/react-components'
import type { Cr854_weeklyperformances } from './generated/models/Cr854_weeklyperformancesModel'
import { Cr854_deliveryresultsService } from './gcpdata/Cr854_deliveryresultsService'
import { locale, useT } from './i18n'
import { isPush, parseProductResults, pct, templateName, type ResultRow } from './results'

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
})

/** 配信 1 本の主な数字(開封率・クリック率 / タップ率・売上・注文・送った数・前年比) */
export function ResultKpis({ row, money }: { row: ResultRow; money: (v?: number) => string }) {
  const styles = useStyles()
  const t = useT()
  const { card, result } = row
  const push = isPush(card)
  const n = (v?: number) => (v ?? 0).toLocaleString(locale())
  const items: [string, ReactNode][] = [
    ...(push ? [] : ([[t('開封率', 'Open rate'), pct(row.openRate)]] as [string, ReactNode][])),
    [push ? t('タップ率', 'Tap rate') : t('クリック率', 'Click rate'), pct(row.clickRate)],
    [t('売上', 'Revenue'), money(row.revenue)],
    [t('注文', 'Orders'), n(result.cr854_orders)],
    [t('送った数', 'Sent'), n(result.cr854_recipients)],
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
}: {
  row: ResultRow
  weekly: Cr854_weeklyperformances[]
  productName: (id: string) => string
  /** 商品 ID → 商品コード(週ごとの実績は、商品コードで持っている) */
  productCode: (id: string) => string | undefined
  money: (v?: number) => string
  onSaved: () => Promise<void>
}) {
  const styles = useStyles()
  const t = useT()
  const { card, result } = row
  const [notes, setNotes] = useState(result.cr854_notes ?? '')
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const push = isPush(card)
  const items = parseProductResults(result.cr854_products)

  // 配信の週と、その前の週の、商品の売れた数(週ごとの実績があれば)
  const sent = new Date(result.cr854_sentat ?? card.cr854_scheduledat ?? '')
  const weekOf = (code?: string) => {
    if (!code || Number.isNaN(sent.getTime())) return undefined
    const rowsOf = weekly.filter((w) => w.cr854_productcode === code).sort((a, b) => (a.cr854_weekstart ?? '').localeCompare(b.cr854_weekstart ?? ''))
    const i = rowsOf.findIndex((w) => {
      const s = new Date(`${w.cr854_weekstart}T00:00:00`)
      return s.getTime() <= sent.getTime() && sent.getTime() < s.getTime() + 7 * 24 * 3600_000
    })
    if (i <= 0) return undefined
    const now = rowsOf[i]
    const before = rowsOf[i - 1]
    return {
      change: before.cr854_units ? (now.cr854_units ?? 0) / before.cr854_units - 1 : undefined,
      stockWeeks: now.cr854_units ? (now.cr854_stock ?? 0) / now.cr854_units : undefined,
    }
  }

  const save = async () => {
    setSaving(true)
    try {
      const res = await Cr854_deliveryresultsService.update(result.cr854_deliveryresultid, { cr854_notes: notes })
      if (res.success) {
        setSavedAt(new Date().toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }))
        await onSaved()
      }
    } finally {
      setSaving(false)
    }
  }

  const ai: { label: string; value?: string; reason?: string }[] = [
    { label: t('テーマ', 'Theme'), value: card.cr854_theme, reason: card.cr854_themereason },
    ...(push
      ? [{ label: t('通知のタイトル', 'Notification title'), value: card.cr854_pushtitle }]
      : [
          { label: t('見出し', 'Headline'), value: card.cr854_headline, reason: card.cr854_copyangle ? t(`切り口: ${card.cr854_copyangle}`, `Angle: ${card.cr854_copyangle}`) : undefined },
          { label: t('テンプレート', 'Template'), value: templateName(card), reason: card.cr854_instructionsangle ? t(`制作指示: ${card.cr854_instructionsangle}`, `Brief: ${card.cr854_instructionsangle}`) : undefined },
          { label: t('メイン画像', 'Hero'), value: card.cr854_heroreason ? t('AI の提案から選択', 'Picked from AI suggestions') : undefined, reason: card.cr854_heroreason },
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
          <Button size="small" onClick={() => void save()} disabled={saving || notes === (result.cr854_notes ?? '')}>
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
    </div>
  )
}
