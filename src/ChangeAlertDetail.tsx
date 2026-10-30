import { useState } from 'react'
import { Button, Field, MessageBar, MessageBarBody, Spinner, Textarea, Tooltip, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { typo } from './typo'
import { ArrowSwapRegular, CalendarArrowRightRegular, CheckmarkCircleRegular, OpenRegular, ProhibitedRegular } from '@fluentui/react-icons'
import type { Product } from './models/products'
import type { HeroImage } from './models/heroImages'
import { DeliveryThumb } from './DataTable'
import { productImage } from './images'
import type { WeekRow } from './data/weeks'
import { AlertActionPanel } from './AlertActionPanel'
import { isLeadStage, type ChangeAlert, type Placement, type StockModel } from './alerts'
import { myName } from './history'
import { locale, useT } from './i18n'
import { statusColor, statusLabel } from './status'
import { ChannelBadge } from './ChannelBadge'
import { cardSectionLabel } from './templates'

const useStyles = makeStyles({
  detail: { display: 'grid', rowGap: '12px', minWidth: 0 },
  title: { margin: 0, fontSize: tokens.fontSizeBase500, fontWeight: tokens.fontWeightSemibold },
  sub: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  changes: { display: 'grid', rowGap: '6px', padding: '10px 14px', borderRadius: tokens.borderRadiusMedium, border: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: tokens.colorNeutralBackground1 },
  change: { display: 'grid', gridTemplateColumns: '120px auto auto minmax(0, 1fr)', justifyContent: 'start', columnGap: '10px', alignItems: 'baseline', fontSize: tokens.fontSizeBase300 },
  label: typo.pairLabel,
  before: { color: tokens.colorNeutralForeground3, textDecoration: 'line-through', overflowWrap: 'anywhere' },
  after: { fontWeight: tokens.fontWeightSemibold, overflowWrap: 'anywhere' },
  arrow: { color: tokens.colorNeutralForeground3 },
  tableWrap: { overflowX: 'auto', border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground1 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: tokens.fontSizeBase300, fontVariantNumeric: 'tabular-nums' },
  th: { textAlign: 'left', padding: '6px 10px', borderBottom: `1px solid ${tokens.colorNeutralStroke1}`, backgroundColor: tokens.colorNeutralBackground2, fontWeight: tokens.fontWeightSemibold, whiteSpace: 'nowrap' },
  td: { padding: '6px 10px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, whiteSpace: 'nowrap' },
  name: { fontWeight: tokens.fontWeightSemibold },
  // 見出し: 商品の画像と名前 / 表の配信の列: サムネイル(マウスを重ねるとプレビュー)と名前
  headRow: { display: 'flex', alignItems: 'center', columnGap: '14px' },
  headImg: { width: '72px', height: '72px', flexShrink: 0, objectFit: 'contain', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground3, border: `1px solid ${tokens.colorNeutralStroke2}` },
  delivery: { display: 'inline-flex', alignItems: 'center', columnGap: '10px' },
  dot: { display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', marginRight: '6px' },
  warn: { color: tokens.colorPaletteDarkOrangeForeground1, fontWeight: tokens.fontWeightSemibold },
  actions: { display: 'inline-flex', columnGap: '4px' },
  resolve: { display: 'grid', rowGap: '8px', padding: '10px 14px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground2 },
  resolveRow: { display: 'flex', alignItems: 'center', columnGap: '8px' },
  empty: { padding: '16px', color: tokens.colorNeutralForeground3 },
})

interface Props {
  alert: ChangeAlert
  products: Product[]
  heroes: HeroImage[]
  cardProducts: Map<string, string[]>
  placements: Map<string, Placement[]>
  model: StockModel
  weeks: WeekRow[]
  onOpenCard: (id: string) => void
  onChanged: () => Promise<void>
  /** 対応済みにする */
  onResolve: (alert: ChangeAlert, note: string) => Promise<void>
}

/**
 * 変更のアラート(MD 方針の変更・日程の変更)の詳しい中身。変更前と変更後、影響を受ける配信と、配信ごとの対応、対応済みにする。
 * 在庫のアラートは、在庫が持つようになれば消えるが、変更のアラートは、確かめたことを人が記録する(対応済み)
 */
export function ChangeAlertDetail({ alert, products, heroes, cardProducts, placements, model, weeks, onOpenCard, onChanged, onResolve }: Props) {
  const styles = useStyles()
  const t = useT()
  const [action, setAction] = useState<{ mode: 'replace' | 'postpone' | 'cancel'; cardId: string } | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const policy = alert.kind === 'policyChanged'
  const actionCard = alert.deliveries.find((d) => d.card.id === action?.cardId)?.card

  const dateTime = (iso?: string) => (iso ? new Date(iso).toLocaleString(locale(), { month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '—')
  const fieldLabel = (f: string) =>
    ({ stage: t('位置づけ', 'Role'), promo_period: t('販促の期間', 'Promotion period'), policy: t('方針', 'Policy'), scheduled_at: t('配信日時', 'Date and time') })[f] ?? f
  const valueText = (f: string, v: string) => (f === 'scheduled_at' ? dateTime(v) : v || '—')
  const stage = alert.changes.find((c) => c.field === 'stage')
  // 変更の説明(理由の最初の文・一覧に使う)
  const why = policy
    ? stage
      ? t(`位置づけが ${stage.before} → ${stage.after} に変わった`, `Role changed: ${stage.before} → ${stage.after}`)
      : t('MD の方針が変わった', 'MD policy changed')
    : t(`配信日時が ${dateTime(alert.changes[0]?.before)} → ${dateTime(alert.changes[0]?.after)} に変わった`, `Date changed: ${dateTime(alert.changes[0]?.before)} → ${dateTime(alert.changes[0]?.after)}`)

  const resolve = async () => {
    setBusy(true)
    setError(null)
    try {
      await onResolve(alert, note.trim())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.detail}>
      <div className={styles.headRow}>
        {alert.product && productImage(alert.product) && <img className={styles.headImg} src={productImage(alert.product)} alt="" draggable={false} />}
      <div>
        <h2 className={styles.title}>
          {policy ? t(`MD 方針の変更: ${alert.product?.name}`, `MD policy change: ${alert.product?.name}`) : t(`日程の変更: ${alert.card?.name}`, `Date change: ${alert.card?.name}`)}
        </h2>
        <div className={styles.sub}>
          {t(`${dateTime(alert.changedAt)} に変更`, `Changed ${dateTime(alert.changedAt)}`)}
          {alert.actor ? t(`(${alert.actor})`, ` by ${alert.actor}`) : ''}
        </div>
      </div>
      </div>

      <div className={styles.changes}>
        {alert.changes.map((c) => (
          <div key={c.field} className={styles.change}>
            <span className={styles.label}>{fieldLabel(c.field)}</span>
            <span className={styles.before}>{valueText(c.field, c.before)}</span>
            <span className={styles.arrow}>→</span>
            <span className={styles.after}>{valueText(c.field, c.after)}</span>
          </div>
        ))}
      </div>

      <div className={styles.sub}>
        {policy
          ? alert.deliveries.length > 0
            ? t('この商品を載せている、まだ送っていない配信。新しい位置づけ・方針に合っているかを確認し、合わなければ入れ替えます', 'Upcoming deliveries that include this product. Check that they still fit the new role; replace the product if not.')
            : isLeadStage(stage?.after)
              ? t('主力になりましたが、まだ送っていない配信には、どれにも載っていません。販促の期間の配信に載せることを検討してください', 'It is now a core product but is not in any upcoming delivery. Consider adding it during its promotion period.')
              : ''
          : t('移した配信と、移した先の日の、同じ国・チャネルの配信(重なっていないかを確認する)', 'The moved delivery, and same-day deliveries in the same country and channel (check for overlap).')}
      </div>

      {alert.deliveries.length > 0 && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>{t('日時', 'Date')}</th>
                <th className={styles.th}>{t('配信', 'Delivery')}</th>
                <th className={styles.th}>{t('チャネル', 'Ch.')}</th>
                <th className={styles.th}>{t('状態', 'Status')}</th>
                <th className={styles.th}>{policy ? t('載っている場所', 'Where') : t('関係', 'Relation')}</th>
                <th className={styles.th}>{t('対応', 'Action')}</th>
              </tr>
            </thead>
            <tbody>
              {alert.deliveries.map((d) => (
                <tr key={d.card.id}>
                  <td className={styles.td}>{dateTime(d.card.scheduled_at)}</td>
                  <td className={mergeClasses(styles.td, styles.name)}>
                    <span className={styles.delivery}>
                      <DeliveryThumb card={d.card} productIds={cardProducts.get(d.card.id) ?? []} products={products} heroes={heroes} />
                      {d.card.name}
                    </span>
                  </td>
                  <td className={styles.td}><ChannelBadge channel={d.card.channel} size="small" /></td>
                  <td className={styles.td}>
                    <span className={styles.dot} style={{ backgroundColor: statusColor(d.card.status ?? 'not_started') }} />
                    {statusLabel(d.card.status ?? 'not_started')}
                  </td>
                  <td className={styles.td}>
                    {policy
                      ? d.sections.map((s) => cardSectionLabel(d.card, s)).join('・')
                      : d.note === 'moved'
                        ? t('移した配信', 'Moved')
                        : <span className={styles.warn}>{t('同じ日・同じチャネル', 'Same day, same channel')}</span>}
                  </td>
                  <td className={styles.td}>
                    <span className={styles.actions}>
                      {policy && (
                        <Button size="small" appearance="secondary" icon={<ArrowSwapRegular />} onClick={() => setAction({ mode: 'replace', cardId: d.card.id })}>
                          {t('入れ替え', 'Replace')}
                        </Button>
                      )}
                      <Tooltip content={t('延期', 'Postpone')} relationship="label">
                        <Button size="small" appearance="subtle" icon={<CalendarArrowRightRegular />} onClick={() => setAction({ mode: 'postpone', cardId: d.card.id })} />
                      </Tooltip>
                      <Tooltip content={t('取りやめ', 'Cancel delivery')} relationship="label">
                        <Button size="small" appearance="subtle" icon={<ProhibitedRegular />} onClick={() => setAction({ mode: 'cancel', cardId: d.card.id })} />
                      </Tooltip>
                      <Tooltip content={t('配信カードを開く', 'Open the delivery card')} relationship="label">
                        <Button size="small" appearance="subtle" icon={<OpenRegular />} onClick={() => onOpenCard(d.card.id)} />
                      </Tooltip>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {done && (
        <MessageBar intent="success" layout="multiline">
          <MessageBarBody>{done}</MessageBarBody>
        </MessageBar>
      )}
      {action && actionCard && (
        <AlertActionPanel
          key={`${action.mode}:${action.cardId}`}
          mode={action.mode}
          card={actionCard}
          product={alert.product}
          why={why}
          products={products}
          placements={placements}
          model={model}
          weeks={weeks}
          onClose={() => setAction(null)}
          onDone={async (message) => {
            setAction(null)
            setDone(message)
            await onChanged()
          }}
        />
      )}

      <div className={styles.resolve}>
        <Field label={t('確認した結果(対応済みにするときのメモ。任意)', 'What you checked (note when marking as handled, optional)')} size="small">
          <Textarea value={note} onChange={(_, d) => setNote(d.value)} rows={2} placeholder={t('例: 2 本とも入れ替えた / このままでよいと判断した', 'e.g. Replaced in both / Decided to keep as is')} />
        </Field>
        <div className={styles.resolveRow}>
          <Button appearance="primary" size="small" icon={<CheckmarkCircleRegular />} disabled={busy} onClick={() => void resolve()}>
            {t('対応済みにする', 'Mark as handled')}
          </Button>
          {busy && <Spinner size="extra-tiny" />}
          <span className={styles.sub}>
            {t(`対応した人: ${myName() || '(名前が未設定)'}。対応済みにすると、一覧から消えます(記録は残ります)`, `Handled by: ${myName() || '(no name set)'}. It leaves the list (the record is kept).`)}
          </span>
        </div>
        {error && (
          <MessageBar intent="error" layout="multiline">
            <MessageBarBody>{error}</MessageBarBody>
          </MessageBar>
        )}
      </div>
    </div>
  )
}
