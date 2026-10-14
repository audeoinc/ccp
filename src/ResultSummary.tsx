import { useState } from 'react'
import { Button, Spinner, Textarea, Tooltip, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { OpenRegular } from '@fluentui/react-icons'
import type { Cr854_weeklyperformances } from './generated/models/Cr854_weeklyperformancesModel'
import { Cr854_deliveryresultsService } from './gcpdata/Cr854_deliveryresultsService'
import { locale, useT } from './i18n'
import { isPush, parseProductResults, pct, templateName, type ResultRow } from './results'

const useStyles = makeStyles({
  side: {
    display: 'grid',
    rowGap: '14px',
    alignContent: 'start',
    padding: '12px',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  sticky: { position: 'sticky', top: '12px' },
  sideTitle: { fontSize: tokens.fontSizeBase400, fontWeight: tokens.fontWeightSemibold, display: 'flex', alignItems: 'center', columnGap: '6px' },
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', columnGap: '6px', rowGap: '6px' },
  kpi: { border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, padding: '6px 8px' },
  kpiLabel: { fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3 },
  kpiValue: { fontSize: tokens.fontSizeBase400, fontWeight: tokens.fontWeightSemibold, fontVariantNumeric: 'tabular-nums' },
  h3: { margin: '0 0 4px', fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold },
  list: { display: 'grid', rowGap: '4px', fontSize: tokens.fontSizeBase200 },
  prodRow: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', columnGap: '8px' },
  prodName: { fontWeight: tokens.fontWeightSemibold, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  prodSub: { gridColumn: '1 / -1', color: tokens.colorNeutralForeground3 },
  aiItem: { overflowWrap: 'anywhere' },
  aiReason: { color: tokens.colorNeutralForeground3 },
  noteActions: { display: 'flex', justifyContent: 'flex-end', alignItems: 'center', columnGap: '8px', marginTop: '6px' },
  muted: { color: tokens.colorNeutralForeground3 },
  sub: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  titleActions: { marginLeft: 'auto', display: 'flex', columnGap: '4px' },
})

/** 配信 1 本の結果のまとめ: 主な数字・商品の売れ方・採用した AI の提案・次に生かすメモ。一覧の右の欄と、詳しい結果のページの左で使う */
export function ResultSummary({
  row,
  weekly,
  productName,
  productCode,
  money,
  onOpenCard,
  onOpenDetail,
  sticky = true,
  onSaved,
}: {
  row: ResultRow
  weekly: Cr854_weeklyperformances[]
  productName: (id: string) => string
  /** 商品 ID → 商品コード(週ごとの実績は、商品コードで持っている) */
  productCode: (id: string) => string | undefined
  money: (v?: number) => string
  onOpenCard: (id: string) => void
  /** 詳しい結果のページを開く(詳しい結果のページの中では渡さない) */
  onOpenDetail?: () => void
  /** 画面のスクロールについてくる(一覧の右の欄) */
  sticky?: boolean
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

  const sentText = Number.isNaN(sent.getTime()) ? '' : sent.toLocaleDateString(locale(), { month: '2-digit', day: '2-digit' })
  return (
    <aside className={mergeClasses(styles.side, sticky && styles.sticky)} aria-label={t('選んだ配信', 'Selected delivery')}>
      <div className={styles.sideTitle}>
        <span>{`${card.cr854_name} · ${sentText} ${push ? t('アプリ', 'App') : t('メール', 'Email')}`}</span>
        <span className={styles.titleActions}>
          {onOpenDetail && (
            <Button size="small" appearance="primary" onClick={onOpenDetail}>
              {t('詳しい結果', 'Details')}
            </Button>
          )}
          <Tooltip content={t('配信カードを開く', 'Open the delivery card')} relationship="label">
            <Button size="small" appearance="subtle" icon={<OpenRegular />} onClick={() => onOpenCard(card.cr854_deliverycardid)} />
          </Tooltip>
        </span>
      </div>
      <div className={styles.kpis}>
        <div className={styles.kpi}>
          <div className={styles.kpiLabel}>{push ? t('タップ率', 'Tap') : t('開封率', 'Open')}</div>
          <div className={styles.kpiValue}>{pct(push ? row.clickRate : row.openRate)}</div>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kpiLabel}>{push ? t('注文', 'Orders') : t('クリック率', 'Click')}</div>
          <div className={styles.kpiValue}>{push ? (result.cr854_orders ?? 0).toLocaleString(locale()) : pct(row.clickRate)}</div>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kpiLabel}>{t('売上', 'Revenue')}</div>
          <div className={styles.kpiValue}>{money(row.revenue)}</div>
        </div>
      </div>
      <div className={styles.sub}>
        {t(
          `送った数 ${(result.cr854_recipients ?? 0).toLocaleString(locale())}・注文 ${(result.cr854_orders ?? 0).toLocaleString(locale())}・前年 ${money(Number(result.cr854_lastyearrevenue ?? 0))}`,
          `Sent ${(result.cr854_recipients ?? 0).toLocaleString(locale())} · orders ${(result.cr854_orders ?? 0).toLocaleString(locale())} · last year ${money(Number(result.cr854_lastyearrevenue ?? 0))}`,
        )}
      </div>
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
      <section>
        <h3 className={styles.h3}>{t('次に生かすメモ', 'Notes for next time')}</h3>
        <Textarea value={notes} onChange={(_, d) => setNotes(d.value)} resize="vertical" rows={4} style={{ width: '100%' }} placeholder={t('うまくいったこと・次に試すこと', 'What worked, and what to try next')} />
        <div className={styles.noteActions}>
          {saving && <Spinner size="extra-tiny" />}
          {savedAt && !saving && <span className={styles.muted}>{t(`${savedAt} に保存しました`, `Saved at ${savedAt}`)}</span>}
          <Button size="small" onClick={() => void save()} disabled={saving || notes === (result.cr854_notes ?? '')}>
            {t('保存', 'Save')}
          </Button>
        </div>
      </section>
    </aside>
  )
}
