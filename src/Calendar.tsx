import { makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { AddRegular, WarningFilled } from '@fluentui/react-icons'
import { ChannelBadge } from './ChannelBadge'
import { AbBadge } from './AbBadge'
import type { DeliveryCard } from './models/deliveryCards'
import { countryOptions, statusColor, statusLabel } from './status'
import { LockMark } from './LockMark'
import { locale, optionLabel, useT } from './i18n'
import { CANCELLED_STYLE, isCancelled } from './cancel'
import { AlertMark } from './AlertMark'
import type { CardAlertKind } from './cardAlerts'

interface Props {
  month: Date
  cards: DeliveryCard[]
  /** 配信日が近いのに未着手の配信(印を付ける) */
  dueSoon?: Set<string>
  /** アラートのある配信(いちばん強い種類。印を付ける) */
  alertKinds?: Map<string, CardAlertKind>
  onSelect: (id: string) => void
  /** 日付のマスの空いているところ(または「＋」)を押したとき。その日付で新規作成する(値は YYYY-MM-DD)。なければ、作れない(結果の面) */
  onCreate?: (day: string) => void
  /**
   * 配信の箱の 2 行目(既定: 時刻・国・チャネル)。結果の面では、売上・開封率・前年比。
   * 計画と結果は同じ配信の表と裏なので、箱の形・1 行目(アイコン + 名前)はそろえ、ここと色だけを変える
   */
  renderMeta?: (card: DeliveryCard) => React.ReactNode
  /** 配信の箱の色(左の線と、地の色)。既定は、状態の色 */
  chipTone?: (card: DeliveryCard) => { line: string; background: string }
  /** 週の行の「週 ›」を押したとき(その週の日曜日)。月から、その週の週表示へ直接移る(FLOWS の C-4) */
  onOpenWeek?: (sunday: Date) => void
}

// 選択肢の値から、画面の言葉を求める
const label = (options: { value: string; label: string }[], v?: string) => optionLabel(options.find((o) => o.value === v)?.label)
const pad = (n: number) => String(n).padStart(2, '0')
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
// 日曜始まり。表記は現在の言語に従う(2024-01-07 は日曜日)
const weekdays = () =>
  Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, 7 + i).toLocaleDateString(locale(), { weekday: locale() === 'ja-JP' ? 'narrow' : 'short' }),
  )

const useStyles = makeStyles({
  root: {
    overflow: 'hidden',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusXLarge,
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow2,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
  },
  weekday: {
    textAlign: 'center',
    paddingTop: tokens.spacingVerticalS,
    paddingBottom: tokens.spacingVerticalS,
    backgroundColor: tokens.colorNeutralBackground2,
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
  },
  sunday: { color: tokens.colorPaletteRedForeground1 },
  saturday: { color: tokens.colorBrandForeground1 },
  cell: {
    minHeight: '72px',
    padding: tokens.spacingHorizontalXS,
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    minWidth: 0,
    '@media (min-width: 900px)': { minHeight: '112px' },
  },
  // 新規作成できるとき(計画の面)だけ: マスにマウスを乗せたら「＋」を出して、押せば新規作成できることを示す
  cellCreate: {
    cursor: 'pointer',
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
    ':hover .cal-add': { opacity: 1 },
  },
  dayHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  dayLeft: { display: 'inline-flex', alignItems: 'center', columnGap: '4px', minWidth: 0 },
  // 週の行の先頭(日曜日)の「週 ›」。その週の週表示へ移る(押せると分かるよう、リンクの色で常に出す)
  weekLink: {
    padding: '0 4px',
    border: 'none',
    borderRadius: tokens.borderRadiusSmall,
    backgroundColor: 'transparent',
    color: tokens.colorBrandForegroundLink,
    fontFamily: 'inherit',
    fontSize: tokens.fontSizeBase100,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    ':hover': { backgroundColor: tokens.colorBrandBackground2, textDecoration: 'underline' },
  },
  add: {
    opacity: 0,
    width: '22px',
    height: '22px',
    display: 'grid',
    placeItems: 'center',
    border: 'none',
    borderRadius: tokens.borderRadiusCircular,
    backgroundColor: 'transparent',
    color: tokens.colorBrandForeground1,
    cursor: 'pointer',
    fontSize: '16px',
    ':hover': { backgroundColor: tokens.colorBrandBackground2 },
    // キーボードで移動してきたときも見えるようにする
    ':focus-visible': { opacity: 1 },
  },
  outside: { opacity: 0.4 },
  dayNum: {
    alignSelf: 'flex-start',
    width: '24px',
    height: '24px',
    lineHeight: '24px',
    textAlign: 'center',
    borderRadius: tokens.borderRadiusCircular,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground1,
  },
  today: {
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
    fontWeight: tokens.fontWeightBold,
  },
  // 状態の色は、左の線と薄い色味で示す(塗りつぶしの帯より、落ち着いて読みやすい)
  pill: {
    display: 'block',
    textAlign: 'left',
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'inherit',
    paddingLeft: tokens.spacingHorizontalSNudge,
    paddingRight: tokens.spacingHorizontalSNudge,
    paddingTop: '3px',
    paddingBottom: '3px',
    borderRadius: tokens.borderRadiusMedium,
    color: tokens.colorNeutralForeground1,
    minWidth: 0,
    width: '100%',
    transitionProperty: 'box-shadow',
    transitionDuration: tokens.durationFast,
    ':hover': { boxShadow: tokens.shadow4 },
  },
  pillMeta: {
    display: 'none',
    color: tokens.colorNeutralForeground3,
    lineHeight: 1.2,
    fontSize: tokens.fontSizeBase100,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    '@media (min-width: 900px)': { display: 'block' },
  },
  // 結果の数字は、狭い画面でも出す(結果を見るための面なので)
  pillMetaAlways: {
    display: 'flex',
    flexWrap: 'wrap',
    columnGap: '6px',
    color: tokens.colorNeutralForeground2,
    lineHeight: 1.2,
    fontSize: tokens.fontSizeBase100,
    fontVariantNumeric: 'tabular-nums',
  },
  warn: { color: tokens.colorPaletteDarkOrangeForeground1, verticalAlign: 'text-bottom', marginRight: '2px' },
  pillName: {
    display: 'block',
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    lineHeight: 1.3,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
})

export function Calendar({ month, cards, dueSoon, alertKinds, onSelect, onCreate, renderMeta, chipTone, onOpenWeek }: Props) {
  const styles = useStyles()
  const t = useT()
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const weeks = Math.ceil((first.getDay() + daysInMonth) / 7)
  const days = Array.from({ length: weeks * 7 }, (_, i) => new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay() + i))

  const byDay = new Map<string, DeliveryCard[]>()
  for (const c of cards) {
    if (!c.scheduled_at) continue
    const k = dayKey(new Date(c.scheduled_at))
    byDay.set(k, [...(byDay.get(k) ?? []), c])
  }
  for (const list of byDay.values()) {
    list.sort((a, b) => (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? ''))
  }

  const today = dayKey(new Date())

  return (
    <div className={styles.root}>
      <div className={styles.grid}>
        {weekdays().map((w, i) => (
          <div
            key={w}
            className={mergeClasses(styles.weekday, i === 0 && styles.sunday, i === 6 && styles.saturday)}
          >
            {w}
          </div>
        ))}
        {days.map((d) => {
          const k = dayKey(d)
          const isToday = k === today
          return (
            <div
              key={k}
              className={mergeClasses(styles.cell, onCreate && styles.cellCreate, d.getMonth() !== month.getMonth() && styles.outside)}
              onClick={onCreate ? () => onCreate(k) : undefined}
            >
              <div className={styles.dayHead}>
                <span className={styles.dayLeft}>
                  <span className={mergeClasses(styles.dayNum, isToday && styles.today)}>{d.getDate()}</span>
                  {onOpenWeek && d.getDay() === 0 && (
                    <button
                      type="button"
                      className={styles.weekLink}
                      // マスの「新規作成」まで届かないように止める
                      onClick={(e) => {
                        e.stopPropagation()
                        onOpenWeek(d)
                      }}
                      aria-label={t(`${d.getMonth() + 1}月${d.getDate()}日からの週を、週の表示で開く`, `Open the week of ${d.toLocaleDateString(locale(), { month: 'short', day: 'numeric' })} in the week view`)}
                      title={t('この週を、週の表示で開く', 'Open this week in the week view')}
                    >
                      {t('週 ›', 'Week ›')}
                    </button>
                  )}
                </span>
                {onCreate && <button
                  type="button"
                  className={mergeClasses('cal-add', styles.add)}
                  onClick={(e) => {
                    e.stopPropagation()
                    onCreate(k)
                  }}
                  aria-label={t(`${d.getMonth() + 1}月${d.getDate()}日に新規作成`, `New delivery on ${d.toLocaleDateString(locale(), { month: 'short', day: 'numeric' })}`)}
                  title={t('この日に新規作成', 'New delivery on this day')}
                >
                  <AddRegular />
                </button>}
              </div>
              {(byDay.get(k) ?? []).map((c) => {
                const tone = chipTone ? chipTone(c) : { line: statusColor(c.status), background: `color-mix(in srgb, ${statusColor(c.status)} 16%, var(--colorNeutralBackground1))` }
                return (
                  <button
                    key={c.id}
                    type="button"
                    data-card-id={c.id}
                    // マスの「新規作成」まで届かないように止める(既存のカードを開くだけ)
                    onClick={(e) => {
                      e.stopPropagation()
                      onSelect(c.id)
                    }}
                    title={`${c.name || t('(配信名のない枠)', '(unnamed slot)')}(${statusLabel(c.status)})${dueSoon?.has(c.id) ? t(' — 配信が近いのに未着手', ' — due soon, not started') : ''}`}
                    className={styles.pill}
                    style={{
                      backgroundColor: tone.background,
                      // ステータスの色は、メール・アプリとも左の線で出す(チャネルは、名前の前の塗りつぶしの印で見分ける)
                      borderLeft: `3px solid ${tone.line}`,
                      // 取りやめた配信は、消さずに薄く、取り消し線で出す
                      ...(isCancelled(c) ? CANCELLED_STYLE : {}),
                    }}
                  >
                    <span className={styles.pillName}>
                      {/* メールかアプリかを、2 行目が出ない狭い画面でも見分けられるよう、名前の前にアイコンを付ける */}
                      <ChannelBadge channel={c.channel} size="icon" />
                      <AbBadge abTest={c.ab_test} size="icon" />
                      <AlertMark kind={alertKinds?.get(c.id)} />
                      <LockMark status={c.status} />
                      {dueSoon?.has(c.id) && <WarningFilled className={styles.warn} aria-label={t('配信が近いのに未着手', 'Due soon — not started')} />}
                      {isCancelled(c) && `${t('取りやめ', 'Cancelled')}・`}
                      {/* 週の枠(W14)は、配信名を入れるまで空なので、空のときは、枠だと分かる文字にする */}
                      {c.name || t('(配信名のない枠)', '(unnamed slot)')}
                    </span>
                    {renderMeta ? (
                      <span className={styles.pillMetaAlways}>{renderMeta(c)}</span>
                    ) : (
                      <span className={styles.pillMeta}>
                        {new Date(c.scheduled_at!).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })}
                        {/* チャネルは名前の前の札で分かるので、文字では書かない(時刻と国だけ) */}
                        {' '}{label(countryOptions, c.country)}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
