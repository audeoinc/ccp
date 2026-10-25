import { useState } from 'react'
import { Button, Field, Input, MessageBar, MessageBarBody, Spinner, Switch, Textarea, makeStyles, tokens } from '@fluentui/react-components'
import { DismissRegular } from '@fluentui/react-icons'
import type { DeliveryCard } from './models/deliveryCards'
import type { Product } from './models/products'
import type { WeekRow } from './data/weeks'
import { postponeDelivery, replaceProduct, replacementCandidates, type ReplacementCandidate } from './alertActions'
import { ProductChooser } from './ProductChooser'
import { aiCardOfSaved } from './bulkDraft'
import { cancelDelivery } from './cancel'
import { LOW_STOCK_WEEKS, type Placement, type StockModel } from './alerts'
import { locale, useT } from './i18n'
import { productImage } from './images'
import { confirmedWeekOf, scopeOfCard } from './weekLock'
import { statusRank } from './status'

const useStyles = makeStyles({
  root: { display: 'grid', rowGap: '12px', padding: '14px 16px', borderRadius: tokens.borderRadiusMedium, border: `1px solid ${tokens.colorNeutralStroke1}`, backgroundColor: tokens.colorNeutralBackground1 },
  head: { display: 'flex', alignItems: 'center', columnGap: '8px' },
  title: { margin: 0, fontSize: tokens.fontSizeBase400, fontWeight: tokens.fontWeightSemibold },
  close: { marginLeft: 'auto' },
  sub: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  // 差し替えられる側の商品(画像・名前・いまの在庫)
  replacing: { display: 'inline-flex', alignItems: 'center', columnGap: '8px', fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold },
  replacingImg: { width: '32px', height: '32px', objectFit: 'contain', borderRadius: tokens.borderRadiusSmall, backgroundColor: tokens.colorNeutralBackground3 },
  row: { display: 'flex', alignItems: 'flex-end', flexWrap: 'wrap', columnGap: '16px', rowGap: '8px' },
  note: { fontSize: tokens.fontSizeBase200, color: tokens.colorPaletteDarkOrangeForeground1 },
})

interface Props {
  mode: 'replace' | 'postpone' | 'cancel'
  card: DeliveryCard
  /** アラートの商品(在庫・方針の変更)。日程の変更では、ない(差し替えは使えない) */
  product?: Product
  /** アラートの説明(変更の理由の、最初の文に使う) */
  why: string
  products: Product[]
  placements: Map<string, Placement[]>
  model: StockModel
  weeks: WeekRow[]
  onDone: (message: string) => Promise<void>
  onClose: () => void
}

const STATUS_APPROVED = 'approved'
/** 在庫の数の表記(なければ 0) */
const num = (v?: number) => Math.round(v ?? 0).toLocaleString()

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
  const approved = statusRank(card.status) >= statusRank(STATUS_APPROVED)
  const subject = product ? `${product.name}: ` : ''
  const locked = !!confirmedWeekOf(weeks, card.scheduled_at, scopeOfCard(card))
  const [reason, setReason] = useState(
    mode === 'replace'
      ? t(`${subject}${why}。入れ替えた`, `${subject}${why}. Replaced.`)
      : mode === 'postpone'
        ? t(`${subject}${why}。延期した`, `${subject}${why}. Postponed.`)
        : t(`${subject}${why}。取りやめた`, `${subject}${why}. Cancelled.`),
  )
  // 承認済み・確定の配信は、変えたらもう一度レビューを受けるのを、最初の値にする
  const [backToReview, setBackToReview] = useState(approved)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [to, setTo] = useState(() => {
    const d = new Date(card.scheduled_at ?? Date.now())
    d.setDate(d.getDate() + 7)
    return localInput(d)
  })
  const when = card.scheduled_at ?? new Date().toISOString()
  const rows = (placements.get(card.id) ?? []).filter((p) => p.productId === product?.id)

  // 差し替えの候補: 配信の国の市場の、同じカテゴリの商品で、配信日に在庫が持つもの(この配信に載っている商品は除く)。
  // 配信カードの中の差し替えと同じ決め方(replacementCandidates)。開いたときに 1 回だけ決める(在庫の見込みが読み直されても、候補は変えない)
  const inCardIds = new Set((placements.get(card.id) ?? []).map((p) => p.productId))
  const [candidates] = useState<ReplacementCandidate[]>(() => (mode === 'replace' && product ? replacementCandidates({ card, removed: product, products, model, inCard: inCardIds, when }) : []))

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
  const use = (to: Product) =>
    run(async () => {
      for (const r of rows) await replaceProduct({ card, rowId: r.rowId, to, reason, backToReview, weeks })
    }, t(`${card.name} の ${product?.name} を、${to.name} に入れ替えました`, `Replaced ${product?.name} with ${to.name} in ${card.name}`))
  const postpone = () =>
    run(() => postponeDelivery({ card, to, reason, backToReview, weeks }), t(`${card.name} を ${new Date(to).toLocaleDateString(locale())} に延期しました`, `Postponed ${card.name} to ${new Date(to).toLocaleDateString(locale())}`))

  return (
    <div className={styles.root}>
      <div className={styles.head}>
        <h3 className={styles.title}>
          {mode === 'replace'
            ? t(`商品の入れ替え — ${card.name}`, `Replace product — ${card.name}`)
            : mode === 'postpone'
              ? t(`延期 — ${card.name}`, `Postpone — ${card.name}`)
              : t(`取りやめ — ${card.name}`, `Cancel — ${card.name}`)}
        </h3>
        <span className={styles.sub}>{new Date(when).toLocaleString(locale(), { month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' })}</span>
        <Button className={styles.close} size="small" appearance="subtle" icon={<DismissRegular />} onClick={onClose} aria-label={t('閉じる', 'Close')} />
      </div>

      {mode === 'replace' && (
        <>
          {/* 差し替えられる側(いま載っている商品)の在庫。候補と比べられるように */}
          {product && (
            <span className={styles.replacing}>
              {productImage(product) && <img className={styles.replacingImg} src={productImage(product)} alt="" draggable={false} />}
              {t(`入れ替える商品: ${product.name} ・ いまの在庫 ${num(product.stock)}`, `Replacing: ${product.name} · Stock now ${num(product.stock)}`)}
            </span>
          )}
          {/* 選び直す枠は、配信カードの中の差し替えと同じ形(AI のおすすめ / AI に頼む / すべての商品)。AI は在庫の見込みを確かめた候補から選ぶ */}
          {candidates.length === 0 ? (
            <span className={styles.sub}>{t('条件に合う商品がありません。配信カードを開いて、ほかのカテゴリから選んでください', 'No matching products. Open the delivery card to choose from other categories.')}</span>
          ) : (
            <ProductChooser
              title={t(`入れ替える商品を選ぶ(在庫のある同じカテゴリ。配信日に ${LOW_STOCK_WEEKS} 週分以上)`, `Choose a replacement (same category, ${LOW_STOCK_WEEKS}+ weeks of stock on the day)`)}
              frame={{ kind: 'panel' }}
              card={aiCardOfSaved(card)}
              angle=""
              current={product}
              products={candidates.map((c) => c.product)}
              inCard={products.filter((p) => inCardIds.has(p.id))}
              why={why}
              candidates={candidates}
              disabled={busy || rows.length === 0}
              onPick={(id) => {
                const to = candidates.find((c) => c.product.id === id)?.product
                if (to) void use(to)
              }}
            />
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

      {mode === 'cancel' && (
        <div className={styles.row}>
          <span className={styles.sub}>
            {t('取りやめた配信は、消さずに残ります(カレンダーに薄く出て、アラート・週の確認・件数からは外れます)', 'The delivery is kept (shown faded in the calendar, and left out of alerts, week checks and counts).')}
          </span>
          <Button size="small" appearance="primary" disabled={busy} onClick={() => void run(() => cancelDelivery(card, reason, weeks), t(`${card.name} を取りやめにしました`, `Cancelled ${card.name}`))}>
            {t('取りやめにする', 'Cancel delivery')}
          </Button>
        </div>
      )}

      <Field label={t('変更の理由(配信の変更の履歴に残ります)', 'Reason for the change (kept in the delivery history)')} size="small">
        <Textarea value={reason} onChange={(_, d) => setReason(d.value)} rows={2} resize="vertical" />
      </Field>
      {mode !== 'cancel' && <Switch checked={backToReview || locked} disabled={locked} onChange={(_, d) => setBackToReview(d.checked)} label={t('変更のあと、承認をやり直す(承認済みの配信は「承認待ち」に)', 'Require approval again after the change (approved deliveries go back to awaiting approval)')} />}
      {locked && <span className={styles.note}>{t('この配信の週は確定済みなので、変えると、週の確定は解けます', 'This week is confirmed, so changing it makes the week no longer confirmed')}</span>}
      {busy && <Spinner size="extra-tiny" />}
      {error && (
        <MessageBar intent="error">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}
    </div>
  )
}
