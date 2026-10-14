import { useEffect, useState } from 'react'
import { Button, Field, Input, MessageBar, MessageBarBody, Spinner, Switch, Textarea, makeStyles, tokens } from '@fluentui/react-components'
import { DismissRegular } from '@fluentui/react-icons'
import type { Cr854_deliverycards } from './generated/models/Cr854_deliverycardsModel'
import type { Cr854_products } from './generated/models/Cr854_productsModel'
import type { Cr854_weeks } from './gcpdata/Cr854_weeksService'
import { AiIcon } from './AiMark'
import { postponeDelivery, replaceProduct, suggestReplacements, type ReplacementCandidate } from './alertActions'
import { LOW_STOCK_WEEKS, type Placement, type StockModel } from './alerts'
import { locale, priceText, useT } from './i18n'
import { productImage } from './images'
import { confirmedWeekOf } from './weekLock'

const useStyles = makeStyles({
  root: { display: 'grid', rowGap: '12px', padding: '14px 16px', borderRadius: tokens.borderRadiusMedium, border: `1px solid ${tokens.colorNeutralStroke1}`, backgroundColor: tokens.colorNeutralBackground1 },
  head: { display: 'flex', alignItems: 'center', columnGap: '8px' },
  title: { margin: 0, fontSize: tokens.fontSizeBase400, fontWeight: tokens.fontWeightSemibold },
  close: { marginLeft: 'auto' },
  sub: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  picks: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', columnGap: '12px', rowGap: '12px' },
  pick: { display: 'grid', gridTemplateColumns: '84px minmax(0, 1fr)', columnGap: '10px', padding: '8px', borderRadius: tokens.borderRadiusMedium, border: `1px solid ${tokens.colorNeutralStroke2}` },
  img: { width: '84px', height: '84px', objectFit: 'contain', borderRadius: tokens.borderRadiusSmall, backgroundColor: tokens.colorNeutralBackground3 },
  pickBody: { display: 'grid', rowGap: '2px', alignContent: 'start', fontSize: tokens.fontSizeBase200, minWidth: 0 },
  pickName: { fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  pickReason: { color: tokens.colorNeutralForeground2 },
  pickUse: { justifySelf: 'start', marginTop: '4px' },
  row: { display: 'flex', alignItems: 'flex-end', flexWrap: 'wrap', columnGap: '16px', rowGap: '8px' },
  note: { fontSize: tokens.fontSizeBase200, color: tokens.colorPaletteDarkOrangeForeground1 },
})

interface Props {
  mode: 'replace' | 'postpone'
  card: Cr854_deliverycards
  /** 在庫が持たない商品 */
  product: Cr854_products
  /** アラートの説明(変更の理由の、最初の文に使う) */
  why: string
  products: Cr854_products[]
  placements: Map<string, Placement[]>
  model: StockModel
  weeks: Cr854_weeks[]
  onDone: (message: string) => Promise<void>
  onClose: () => void
}

const STATUS_APPROVED = 588230002
const US = 588230000
const US_MARKET = 588230001
const JP_MARKET = 588230000

/** datetime-local の値(ブラウザの時刻) */
const localInput = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * アラートへの対応(ワイヤーフレーム 12 の 5〜7): 商品の差し替え(AI が、在庫のある同じカテゴリの商品から提案)と、延期。
 * どちらも、変更の理由を残し、必要ならレビューに戻す
 */
export function AlertActionPanel({ mode, card, product, why, products, placements, model, weeks, onDone, onClose }: Props) {
  const styles = useStyles()
  const t = useT()
  const approved = (card.cr854_status ?? 0) >= STATUS_APPROVED
  const locked = !!confirmedWeekOf(weeks, card.cr854_scheduledat)
  const [reason, setReason] = useState(mode === 'replace' ? t(`${product.cr854_name}: ${why}。差し替えた`, `${product.cr854_name}: ${why}. Replaced.`) : t(`${product.cr854_name}: ${why}。延期した`, `${product.cr854_name}: ${why}. Postponed.`))
  // 承認済み・確定の配信は、変えたらもう一度レビューを受けるのを、最初の値にする
  const [backToReview, setBackToReview] = useState(approved)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [picks, setPicks] = useState<{ c: ReplacementCandidate; reason: string }[] | null>(null)
  const [to, setTo] = useState(() => {
    const d = new Date(card.cr854_scheduledat ?? Date.now())
    d.setDate(d.getDate() + 7)
    return localInput(d)
  })
  const when = card.cr854_scheduledat ?? new Date().toISOString()
  const rows = (placements.get(card.cr854_deliverycardid) ?? []).filter((p) => p.productId === product.cr854_productid)

  // 差し替えの候補: 配信の国の市場の、同じカテゴリの商品で、配信日に在庫が持つもの(この配信に載っている商品は除く)
  useEffect(() => {
    if (mode !== 'replace') return
    const market = card.cr854_country === US ? US_MARKET : JP_MARKET
    const inCard = new Set((placements.get(card.cr854_deliverycardid) ?? []).map((p) => p.productId))
    const candidates: ReplacementCandidate[] = products
      .filter((p) => p.cr854_market === market && p.cr854_category === product.cr854_category && !inCard.has(p.cr854_productid))
      .map((p) => {
        const { projected, weeksLeft } = model.projectAt(p, when, card.cr854_deliverycardid)
        return { product: p, projected, weeksLeft, ...model.exposures(p.cr854_productid, when) }
      })
      .filter((c) => c.projected - model.upliftOf(c.product) > 0 && (c.weeksLeft === undefined || c.weeksLeft >= LOW_STOCK_WEEKS))
    let alive = true
    suggestReplacements({ card, removed: product, candidates })
      .then((r) => alive && setPicks(r))
      .catch((e: unknown) => {
        if (!alive) return
        setError(e instanceof Error ? e.message : String(e))
        setPicks([])
      })
    return () => {
      alive = false
    }
    // 開いたときに 1 回だけ選ぶ(在庫の見込みが読み直されても、提案は変えない)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, card.cr854_deliverycardid, product.cr854_productid])

  const run = async (fn: () => Promise<void>, message: string) => {
    if (!reason.trim()) {
      setError(t('変更の理由を入れてください', 'Enter a reason for the change'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      await fn()
      await onDone(message)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  const use = (to: Cr854_products) =>
    run(async () => {
      for (const r of rows) await replaceProduct({ card, rowId: r.rowId, to, reason, backToReview, weeks })
    }, t(`${card.cr854_name} の ${product.cr854_name} を、${to.cr854_name} に差し替えました`, `Replaced ${product.cr854_name} with ${to.cr854_name} in ${card.cr854_name}`))
  const postpone = () =>
    run(() => postponeDelivery({ card, to, reason, backToReview, weeks }), t(`${card.cr854_name} を ${new Date(to).toLocaleDateString(locale())} に延期しました`, `Postponed ${card.cr854_name} to ${new Date(to).toLocaleDateString(locale())}`))

  const market = card.cr854_country === US ? 'US' : 'JP'
  return (
    <div className={styles.root}>
      <div className={styles.head}>
        <h3 className={styles.title}>
          {mode === 'replace'
            ? t(`商品の差し替え — ${card.cr854_name}`, `Replace product — ${card.cr854_name}`)
            : t(`延期 — ${card.cr854_name}`, `Postpone — ${card.cr854_name}`)}
        </h3>
        <span className={styles.sub}>{new Date(when).toLocaleString(locale(), { month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' })}</span>
        <Button className={styles.close} size="small" appearance="subtle" icon={<DismissRegular />} onClick={onClose} aria-label={t('閉じる', 'Close')} />
      </div>

      {mode === 'replace' && (
        <>
          <span className={styles.sub}>
            <AiIcon size={14} /> {t(`AI の提案(在庫のある、同じカテゴリの商品。配信日に ${LOW_STOCK_WEEKS} 週分以上ある見込みのもの)`, `AI suggestions (in stock, same category, ${LOW_STOCK_WEEKS}+ weeks on the day)`)}
          </span>
          {picks === null ? (
            <Spinner size="small" label={t('AI が候補を選んでいます', 'AI is choosing candidates')} />
          ) : picks.length === 0 ? (
            <span className={styles.sub}>{t('条件に合う商品がありません。配信カードを開いて、ほかのカテゴリから選んでください', 'No matching products. Open the delivery card to choose from other categories.')}</span>
          ) : (
            <div className={styles.picks}>
              {picks.map(({ c, reason: why2 }) => (
                <div key={c.product.cr854_productid} className={styles.pick}>
                  <img className={styles.img} src={productImage(c.product)} alt={c.product.cr854_name} />
                  <div className={styles.pickBody}>
                    <span className={styles.pickName} title={c.product.cr854_name}>{c.product.cr854_name}</span>
                    <span>{priceText(c.product.cr854_price, market)}</span>
                    <span>
                      {c.weeksLeft !== undefined ? t(`配信日に在庫 ${c.weeksLeft.toFixed(1)} 週分`, `${c.weeksLeft.toFixed(1)} wks of stock on the day`) : t(`在庫 ${c.product.cr854_stock ?? 0}`, `Stock ${c.product.cr854_stock ?? 0}`)}
                    </span>
                    <span>{t(`今週 ${c.thisWeek} 回・前週 ${c.lastWeek} 回 載せている`, `Featured ${c.thisWeek} this week, ${c.lastWeek} last week`)}</span>
                    {why2 && <span className={styles.pickReason}>{why2}</span>}
                    <Button className={styles.pickUse} size="small" appearance="primary" disabled={busy || rows.length === 0} onClick={() => void use(c.product)}>
                      {t('使う', 'Use')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {mode === 'postpone' && (
        <div className={styles.row}>
          <Field label={t('新しい配信日時', 'New date and time')} size="small">
            <Input size="small" type="datetime-local" value={to} onChange={(_, d) => setTo(d.value)} />
          </Field>
          <Button size="small" appearance="primary" disabled={busy || !to} onClick={() => void postpone()}>
            {t('延期する', 'Postpone')}
          </Button>
        </div>
      )}

      <Field label={t('変更の理由(配信の変更の履歴に残ります)', 'Reason for the change (kept in the delivery history)')} size="small">
        <Textarea value={reason} onChange={(_, d) => setReason(d.value)} rows={2} resize="vertical" />
      </Field>
      <Switch checked={backToReview || locked} disabled={locked} onChange={(_, d) => setBackToReview(d.checked)} label={t('変更のあと、レビューに戻す(承認済み・確定の配信は「検討中」に)', 'Send back to review after the change (approved / confirmed deliveries go back to In review)')} />
      {locked && <span className={styles.note}>{t('この配信の週は確定済みなので、変えると、週はレビュー中に戻ります', 'This week is confirmed, so changing it puts the week back in review')}</span>}
      {busy && <Spinner size="extra-tiny" />}
      {error && (
        <MessageBar intent="error">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}
    </div>
  )
}
