import { useState } from 'react'
import { Badge, Button, MessageBar, MessageBarBody, Tooltip, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { ArrowSwapRegular, CalendarArrowRightRegular, FilterRegular, OpenRegular, ProhibitedRegular } from '@fluentui/react-icons'
import type { Cr854_products } from './generated/models/Cr854_productsModel'
import type { Cr854_weeks } from './gcpdata/Cr854_weeksService'
import { AlertActionPanel } from './AlertActionPanel'
import { LOW_STOCK_WEEKS, isLeadStage, type AffectedDelivery, type ChangeAlert, type Placement, type StockAlert, type StockModel } from './alerts'
import { ChangeAlertDetail } from './ChangeAlertDetail'
import { AlertSettingsDialog } from './AlertSettingsDialog'
import { isCustomized, type AlertSettings } from './alertSettings'
import type { Cr854_changelogs } from './gcpdata/Cr854_changelogsService'
import type { Cr854_deliverycards } from './generated/models/Cr854_deliverycardsModel'
import { locale, optionLabel, useT } from './i18n'
import { CHANNEL_PUSH, statusColor, statusOptions } from './status'

const useStyles = makeStyles({
  page: { display: 'grid', rowGap: '12px' },
  topBar: { display: 'flex', alignItems: 'center', columnGap: '12px' },
  tabs: { display: 'inline-flex', padding: '2px', columnGap: '2px', borderRadius: tokens.borderRadiusMedium, border: `1px solid ${tokens.colorNeutralStroke1}`, backgroundColor: tokens.colorNeutralBackground3 },
  tab: { border: 'none', borderRadius: tokens.borderRadiusSmall, padding: `3px ${tokens.spacingHorizontalM}`, backgroundColor: 'transparent', color: tokens.colorNeutralForeground2, font: 'inherit', fontSize: tokens.fontSizeBase300, cursor: 'pointer' },
  tabOn: { backgroundColor: tokens.colorNeutralBackground1, color: tokens.colorBrandForeground1, fontWeight: tokens.fontWeightSemibold, boxShadow: tokens.shadow2 },
  tdWrap: { padding: '6px 10px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, whiteSpace: 'normal', overflowWrap: 'anywhere', minWidth: '200px' },
  root: { display: 'grid', gridTemplateColumns: '300px minmax(0, 1fr)', columnGap: '20px', alignItems: 'start' },
  // 左: アラートの一覧
  list: { display: 'grid', rowGap: '8px', position: 'sticky', top: '72px' },
  listHead: { fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold, marginBottom: '2px' },
  item: {
    display: 'grid',
    rowGap: '2px',
    padding: '8px 10px',
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderLeftWidth: '4px',
    backgroundColor: tokens.colorNeutralBackground1,
    cursor: 'pointer',
    textAlign: 'left',
    font: 'inherit',
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  itemOn: { outline: `2px solid ${tokens.colorBrandStroke1}`, outlineOffset: '-1px' },
  itemKind: { display: 'flex', alignItems: 'center', columnGap: '6px', fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase300 },
  itemName: { fontSize: tokens.fontSizeBase200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  itemSub: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  // 右: 選んだアラート
  detail: { display: 'grid', rowGap: '12px', minWidth: 0 },
  title: { margin: 0, fontSize: tokens.fontSizeBase500, fontWeight: tokens.fontWeightSemibold },
  sub: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  facts: { display: 'flex', flexWrap: 'wrap', columnGap: '8px', rowGap: '8px' },
  fact: { padding: '6px 12px', borderRadius: tokens.borderRadiusMedium, border: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: tokens.colorNeutralBackground1 },
  factLabel: { fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3 },
  factValue: { fontSize: tokens.fontSizeBase400, fontWeight: tokens.fontWeightSemibold, fontVariantNumeric: 'tabular-nums' },
  tableWrap: { overflowX: 'auto', border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground1 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: tokens.fontSizeBase300, fontVariantNumeric: 'tabular-nums' },
  th: { textAlign: 'left', padding: '6px 10px', borderBottom: `1px solid ${tokens.colorNeutralStroke1}`, backgroundColor: tokens.colorNeutralBackground2, fontWeight: tokens.fontWeightSemibold, whiteSpace: 'nowrap' },
  td: { padding: '6px 10px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, whiteSpace: 'nowrap' },
  num: { textAlign: 'right' },
  name: { fontWeight: tokens.fontWeightSemibold },
  dot: { display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', marginRight: '6px' },
  bad: { color: tokens.colorPaletteRedForeground1, fontWeight: tokens.fontWeightSemibold },
  warn: { color: tokens.colorPaletteDarkOrangeForeground1, fontWeight: tokens.fontWeightSemibold },
  empty: { padding: '40px', textAlign: 'center', color: tokens.colorNeutralForeground3 },
  actions: { display: 'inline-flex', columnGap: '4px' },
  how: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, lineHeight: tokens.lineHeightBase300 },
})

interface Props {
  alerts: StockAlert[]
  /** 変更のアラート(MD 方針の変更・日程の変更) */
  changeAlerts: ChangeAlert[]
  /** 変更のアラートを対応済みにする */
  onResolve: (alert: ChangeAlert, note: string) => Promise<void>
  /** アラートの条件(A6)と、担当の候補 */
  settings: AlertSettings
  owners: string[]
  /** 変更の記録(対応の記録の一覧に、対応済みのものを出す) */
  logs: Cr854_changelogs[]
  /** すべての配信(対応の記録で、配信名を出すため) */
  cards: Cr854_deliverycards[]
  products: Cr854_products[]
  placements: Map<string, Placement[]>
  model: StockModel
  weeks: Cr854_weeks[]
  /** 配信カードを開く */
  onOpenCard: (id: string) => void
  /** 差し替え・延期のあと、配信カードを読み直す(アラートも計算し直す) */
  onChanged: () => Promise<void>
}

const KIND_COLOR = { outOfStock: tokens.colorPaletteRedBorderActive, lowStock: tokens.colorPaletteDarkOrangeBorderActive, policyChanged: tokens.colorPalettePurpleBorderActive, dateChanged: tokens.colorPaletteBlueBorderActive }

/**
 * アラートの画面(ワイヤーフレーム 12)。左に、配信に影響する変更(いまは在庫切れ・在庫僅少)の一覧。
 * 選ぶと、右に、影響を受ける、まだ送っていない配信と、商品が載っている場所、配信日の在庫の見込みを出す
 */
export function AlertsPage({ alerts, changeAlerts, onResolve, settings, owners, logs, cards, products, placements, model, weeks, onOpenCard, onChanged }: Props) {
  const styles = useStyles()
  const t = useT()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // 選んでいるアラート(在庫か、変更のどちらか)。選んでいなければ、一覧のいちばん上
  const selectedChangeById = changeAlerts.find((a) => a.id === selectedId)
  const selected = selectedChangeById ? undefined : (alerts.find((a) => a.id === selectedId) ?? alerts[0])
  const selectedChange = selectedChangeById ?? (selected ? undefined : changeAlerts[0])
  // 対応のパネル(差し替え・延期)を開いている配信
  const [action, setAction] = useState<{ mode: 'replace' | 'postpone' | 'cancel'; cardId: string } | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const actionCard = selected?.deliveries.find((d) => d.card.cr854_deliverycardid === action?.cardId)?.card

  const kindLabel = (a: StockAlert) => (a.kind === 'outOfStock' ? t('在庫切れの見込み', 'Out of stock (expected)') : t('在庫僅少', 'Low stock'))
  const dateText = (iso?: string) => (iso ? new Date(iso).toLocaleDateString(locale(), { month: 'numeric', day: 'numeric', weekday: 'short' }) : '')
  const n = (v: number) => Math.round(v).toLocaleString(locale())
  // 一覧の説明: 在庫切れは、在庫がなくなる配信。在庫僅少は、売り切れる配信か、残りの週数
  const summary = (a: StockAlert) => {
    if (a.stock <= 0) return t('いま在庫がありません', 'Out of stock now')
    const out = a.deliveries.find((d) => d.problem === 'soldOut')
    if (a.kind === 'outOfStock' && out) return t(`${dateText(out.card.cr854_scheduledat)} の配信の時点で在庫がない見込み`, `None left by ${dateText(out.card.cr854_scheduledat)}`)
    const d = a.deliveries.find((x) => x.problem !== 'none')
    if (!d) return ''
    return d.after < 0 || d.weeksLeft === undefined
      ? t(`${dateText(d.card.cr854_scheduledat)} の配信で売り切れる見込み`, `May sell out with ${dateText(d.card.cr854_scheduledat)}`)
      : t(`${dateText(d.card.cr854_scheduledat)} に ${d.weeksLeft.toFixed(1)} 週分`, `${d.weeksLeft.toFixed(1)} wks left on ${dateText(d.card.cr854_scheduledat)}`)
  }
  const problemText = (d: AffectedDelivery) =>
    d.problem === 'soldOut' ? (
      <span className={styles.bad}>{t('配信日に在庫なし', 'None left by then')}</span>
    ) : d.after < 0 ? (
      <span className={styles.warn}>{t('この配信で売り切れる', 'Sells out with this one')}</span>
    ) : d.problem === 'low' ? (
      <span className={styles.warn}>{t(`残り ${LOW_STOCK_WEEKS} 週分を切る`, `Under ${LOW_STOCK_WEEKS} wks left`)}</span>
    ) : (
      '—'
    )
  const statusLabel = (v?: number) => optionLabel(statusOptions.find((o) => o.value === v)?.label ?? '')

  // 対応中のアラート / 対応の記録(誰が・いつ・どう対応したか)
  const [tab, setTab] = useState<'open' | 'done'>('open')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const customized = isCustomized(settings)
  const top = (
    <div className={styles.topBar}>
      <div className={styles.tabs} role="tablist">
        {(
          [
            ['open', t(`対応中(${alerts.length + changeAlerts.length})`, `Open (${alerts.length + changeAlerts.length})`)],
            ['done', t('対応の記録', 'Handled')],
          ] as const
        ).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={mergeClasses(styles.tab, tab === k && styles.tabOn)} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>
      <Button size="small" appearance={customized ? 'primary' : 'subtle'} icon={<FilterRegular />} onClick={() => setSettingsOpen(true)}>
        {customized ? t('条件で絞り込み中', 'Filtered by conditions') : t('アラートの条件', 'Alert conditions')}
      </Button>
      {settingsOpen && <AlertSettingsDialog open settings={settings} owners={owners} onClose={() => setSettingsOpen(false)} />}
    </div>
  )

  if (tab === 'done') {
    const done = logs.filter((l) => l.cr854_resolvedat).sort((a, b) => (b.cr854_resolvedat ?? '').localeCompare(a.cr854_resolvedat ?? ''))
    const target = (l: Cr854_changelogs) =>
      l.cr854_kind === 'policy'
        ? (products.find((p) => p.cr854_productcode === l.cr854_productcode)?.cr854_name ?? l.cr854_productcode)
        : (cards.find((c) => c.cr854_deliverycardid === l._cr854_deliverycard_value)?.cr854_name ?? l.cr854_cardname)
    const value = (l: Cr854_changelogs, v?: string) => (l.cr854_field === 'scheduled_at' && v ? dateText(v) : v || '—')
    return (
      <div className={styles.page}>
        {top}
        {done.length === 0 ? (
          <div className={styles.empty}>{t('対応済みにした変更は、まだありません', 'Nothing has been marked as handled yet')}</div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th}>{t('対応した日時', 'Handled')}</th>
                  <th className={styles.th}>{t('対応した人', 'By')}</th>
                  <th className={styles.th}>{t('種類', 'Kind')}</th>
                  <th className={styles.th}>{t('対象', 'Target')}</th>
                  <th className={styles.th}>{t('変更', 'Change')}</th>
                  <th className={styles.th}>{t('確かめた結果', 'Note')}</th>
                </tr>
              </thead>
              <tbody>
                {done.map((l) => (
                  <tr key={l.cr854_changelogid}>
                    <td className={styles.td}>{new Date(l.cr854_resolvedat!).toLocaleString(locale(), { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                    <td className={styles.td}>{l.cr854_resolvedby || '—'}</td>
                    <td className={styles.td}>{l.cr854_kind === 'policy' ? t('MD 方針の変更', 'MD policy') : t('日程の変更', 'Date')}</td>
                    <td className={mergeClasses(styles.td, styles.name)}>{target(l)}</td>
                    <td className={styles.td}>{`${value(l, l.cr854_before)} → ${value(l, l.cr854_after)}`.slice(0, 60)}</td>
                    <td className={styles.tdWrap}>{l.cr854_resolvenote || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className={styles.how}>
          {t(
            '在庫のアラートへの対応(差し替え・延期・取りやめ)は、配信ごとの変更の理由として、配信カードのメモと承認の履歴に残っています',
            'Actions on stock alerts (replace / postpone / cancel) are kept as reasons in each delivery card and the approval history.',
          )}
        </div>
      </div>
    )
  }

  if (alerts.length === 0 && changeAlerts.length === 0) {
    return (
      <div className={styles.page}>
        {top}
        <div className={styles.empty}>
          {customized
            ? t('いまの条件に合う、配信に影響するアラートはありません(「アラートの条件」で変えられます)', 'No alerts match your conditions (change them in "Alert conditions")')
            : t('いま、配信に影響するアラートはありません', 'No alerts affect upcoming deliveries')}
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
    {top}
    <div className={styles.root}>
      <div className={styles.list}>
        <div className={styles.listHead}>{t(`配信に影響する変更(${alerts.length + changeAlerts.length})`, `Changes that affect deliveries (${alerts.length + changeAlerts.length})`)}</div>
        {alerts.map((a) => (
          <button key={a.id} type="button" className={mergeClasses(styles.item, a.id === selected?.id && styles.itemOn)} style={{ borderLeftColor: KIND_COLOR[a.kind] }} onClick={() => { setSelectedId(a.id); setAction(null); setDone(null) }}>
            <span className={styles.itemKind}>
              {kindLabel(a)}
              <Badge size="small" appearance="tint" color={a.kind === 'outOfStock' ? 'danger' : 'warning'}>
                {t(`${a.deliveries.length} 本`, `${a.deliveries.length}`)}
              </Badge>
            </span>
            <span className={styles.itemName} title={a.product.cr854_name}>{a.product.cr854_name}</span>
            <span className={styles.itemSub}>{summary(a)}</span>
          </button>
        ))}
        {changeAlerts.map((a) => {
          const stage = a.changes.find((c) => c.field === 'stage')
          const when = a.changes.find((c) => c.field === 'scheduled_at')
          return (
            <button key={a.id} type="button" className={mergeClasses(styles.item, a.id === selectedChange?.id && styles.itemOn)} style={{ borderLeftColor: KIND_COLOR[a.kind] }} onClick={() => { setSelectedId(a.id); setAction(null); setDone(null) }}>
              <span className={styles.itemKind}>
                {a.kind === 'policyChanged' ? t('MD 方針の変更', 'MD policy change') : t('日程の変更', 'Date change')}
                <Badge size="small" appearance="tint" color={a.kind === 'policyChanged' ? 'important' : 'informative'}>
                  {t(`${a.deliveries.length} 本`, `${a.deliveries.length}`)}
                </Badge>
              </span>
              <span className={styles.itemName} title={a.product?.cr854_name ?? a.card?.cr854_name}>{a.product?.cr854_name ?? a.card?.cr854_name}</span>
              <span className={styles.itemSub}>
                {stage
                  ? `${stage.before} → ${stage.after}${a.deliveries.length === 0 && isLeadStage(stage.after) ? t('(まだ載せていない)', ' (not featured yet)') : ''}`
                  : when
                    ? `${dateText(when.before)} → ${dateText(when.after)}`
                    : t('方針・期間の変更', 'Policy / period changed')}
              </span>
            </button>
          )
        })}
      </div>
      {selectedChange && (
        <ChangeAlertDetail
          key={selectedChange.id}
          alert={selectedChange}
          products={products}
          placements={placements}
          model={model}
          weeks={weeks}
          onOpenCard={onOpenCard}
          onChanged={onChanged}
          onResolve={onResolve}
        />
      )}

      {selected && (
        <div className={styles.detail}>
          <div>
            <h2 className={styles.title}>{`${kindLabel(selected)}: ${selected.product.cr854_name}`}</h2>
            <div className={styles.sub}>{t('この商品を載せている、まだ送っていない配信', 'Deliveries not yet sent that include this product')}</div>
          </div>
          <div className={styles.facts}>
            <div className={styles.fact}>
              <div className={styles.factLabel}>{t('いまの在庫', 'Stock now')}</div>
              <div className={styles.factValue}>{n(selected.stock)}</div>
            </div>
            <div className={styles.fact}>
              <div className={styles.factLabel}>{t('週の販売(直近 4 週の平均)', 'Weekly sales (last 4 wks)')}</div>
              <div className={styles.factValue}>{selected.weeklyRate > 0 ? n(selected.weeklyRate) : '—'}</div>
            </div>
            <div className={styles.fact}>
              <div className={styles.factLabel}>{t('配信 1 本で上乗せされる販売の見込み', 'Extra sales per delivery (est.)')}</div>
              <div className={styles.factValue}>{n(selected.uplift)}</div>
            </div>
            <div className={styles.fact}>
              <div className={styles.factLabel}>{t('いまの在庫は何週分', 'Weeks of stock now')}</div>
              <div className={styles.factValue}>{selected.weeklyRate > 0 ? (selected.stock / selected.weeklyRate).toFixed(1) : '—'}</div>
            </div>
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th}>{t('日付', 'Date')}</th>
                  <th className={styles.th}>{t('配信', 'Delivery')}</th>
                  <th className={styles.th}>{t('チャネル', 'Ch.')}</th>
                  <th className={styles.th}>{t('状態', 'Status')}</th>
                  <th className={styles.th}>{t('載っている場所', 'Where')}</th>
                  <th className={mergeClasses(styles.th, styles.num)}>{t('配信日の在庫の見込み', 'Stock on the day (est.)')}</th>
                  <th className={styles.th}>{t('見込み', 'Outlook')}</th>
                  <th className={styles.th}>{t('対応', 'Action')}</th>
                </tr>
              </thead>
              <tbody>
                {selected.deliveries.map((d) => (
                  <tr key={d.card.cr854_deliverycardid}>
                    <td className={styles.td}>{dateText(d.card.cr854_scheduledat)}</td>
                    <td className={mergeClasses(styles.td, styles.name)}>{d.card.cr854_name}</td>
                    <td className={styles.td}>{d.card.cr854_channel === CHANNEL_PUSH ? t('アプリ', 'App') : t('メール', 'Email')}</td>
                    <td className={styles.td}>
                      <span className={styles.dot} style={{ backgroundColor: statusColor(d.card.cr854_status ?? 588230000) }} />
                      {statusLabel(d.card.cr854_status ?? 588230000)}
                    </td>
                    <td className={styles.td}>{d.sections.map((s) => t(`セクション ${s + 1}`, `Section ${s + 1}`)).join('・')}</td>
                    <td className={mergeClasses(styles.td, styles.num)}>
                      {`${n(Math.max(0, d.projected))}${d.weeksLeft !== undefined ? t(`(${d.weeksLeft.toFixed(1)} 週分)`, ` (${d.weeksLeft.toFixed(1)} wks)`) : ''}`}
                    </td>
                    <td className={styles.td}>{problemText(d)}</td>
                    <td className={styles.td}>
                      <span className={styles.actions}>
                        <Button size="small" appearance="secondary" icon={<ArrowSwapRegular />} onClick={() => setAction({ mode: 'replace', cardId: d.card.cr854_deliverycardid })}>
                          {t('差し替え', 'Replace')}
                        </Button>
                        {/* 延期・開くは、表が横に長くならないよう、アイコンだけ(名前は、マウスを乗せると出る) */}
                        <Tooltip content={t('延期', 'Postpone')} relationship="label">
                          <Button size="small" appearance="subtle" icon={<CalendarArrowRightRegular />} onClick={() => setAction({ mode: 'postpone', cardId: d.card.cr854_deliverycardid })} />
                        </Tooltip>
                        <Tooltip content={t('取りやめ', 'Cancel delivery')} relationship="label">
                          <Button size="small" appearance="subtle" icon={<ProhibitedRegular />} onClick={() => setAction({ mode: 'cancel', cardId: d.card.cr854_deliverycardid })} />
                        </Tooltip>
                        <Tooltip content={t('配信カードを開く', 'Open the delivery card')} relationship="label">
                          <Button size="small" appearance="subtle" icon={<OpenRegular />} onClick={() => onOpenCard(d.card.cr854_deliverycardid)} />
                        </Tooltip>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {done && (
            <MessageBar intent="success">
              <MessageBarBody>{done}</MessageBarBody>
            </MessageBar>
          )}
          {action && actionCard && (
            <AlertActionPanel
              key={`${action.mode}:${action.cardId}`}
              mode={action.mode}
              card={actionCard}
              product={selected.product}
              why={summary(selected)}
              products={products}
              placements={placements}
              model={model}
              weeks={weeks}
              onClose={() => setAction(null)}
              onDone={async (message) => {
                // 対応したアラートを選んだままにする(計算し直すと、一覧の並びが変わるため)
                setSelectedId(selected.id)
                setAction(null)
                setDone(message)
                await onChanged()
              }}
            />
          )}
          <div className={styles.how}>
            {t(
              `配信日の在庫の見込み = いまの在庫 − 週の販売 × 配信日までの週数 − それより前の配信で上乗せされる販売。配信日に在庫がなければ「在庫切れの見込み」、その配信で売り切れるか、残りが ${LOW_STOCK_WEEKS} 週分を切れば「在庫僅少」`,
              `Stock on the day = stock now − weekly sales × weeks until then − extra sales from earlier deliveries. None left → "out of stock"; sells out with the delivery or under ${LOW_STOCK_WEEKS} weeks left → "low stock"`,
            )}
          </div>
        </div>
      )}
    </div>
    </div>
  )
}
