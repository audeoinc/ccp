import { useState } from 'react'
import { Button, Popover, PopoverSurface, PopoverTrigger, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { CalendarRegular, ChevronDoubleLeftRegular, ChevronDoubleRightRegular, ChevronLeftRegular, ChevronRightRegular } from '@fluentui/react-icons'
import { locale, useLang, useT } from './i18n'
import { dayKeyOf } from './weekLock'

const useStyles = makeStyles({
  trigger: { minWidth: 0, width: '100%', fontSize: tokens.fontSizeBase400, fontWeight: tokens.fontWeightSemibold, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' },
  surface: { display: 'grid', rowGap: '6px', padding: '10px 12px' },
  head: { display: 'flex', alignItems: 'center', columnGap: '2px' },
  // 見出しの月名は押せる(その月の月表示へ)
  monthName: { flexGrow: 1, minWidth: '120px', fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase300 },
  grid: { display: 'grid', gridTemplateColumns: '28px repeat(7, 30px)', rowGap: '2px', alignItems: 'center', justifyItems: 'center' },
  dow: { fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3, paddingBottom: '2px' },
  // 週の行の左端(押すと、その週の週表示へ)
  weekBtn: {
    width: '26px',
    height: '26px',
    padding: 0,
    border: 'none',
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: 'transparent',
    color: tokens.colorNeutralForeground3,
    fontFamily: 'inherit',
    fontSize: tokens.fontSizeBase100,
    cursor: 'pointer',
    ':hover': { backgroundColor: tokens.colorBrandBackground2, color: tokens.colorBrandForeground1 },
  },
  day: {
    position: 'relative',
    width: '30px',
    height: '28px',
    padding: 0,
    border: 'none',
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: 'transparent',
    color: tokens.colorNeutralForeground1,
    fontFamily: 'inherit',
    fontSize: tokens.fontSizeBase200,
    fontVariantNumeric: 'tabular-nums',
    cursor: 'pointer',
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  outside: { color: tokens.colorNeutralForeground4 },
  // いま見ている期間(月表示ならその月の日、週表示ならその週の日)
  current: { backgroundColor: tokens.colorBrandBackground2 },
  today: { outline: `1px solid ${tokens.colorBrandStroke1}`, outlineOffset: '-1px', fontWeight: tokens.fontWeightSemibold },
  // 配信がある日の印
  dot: { position: 'absolute', left: '50%', bottom: '2px', width: '4px', height: '4px', marginLeft: '-2px', borderRadius: tokens.borderRadiusCircular, backgroundColor: tokens.colorBrandForeground1 },
  foot: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', columnGap: '8px', paddingTop: '4px', borderTop: `1px solid ${tokens.colorNeutralStroke2}` },
  hint: { fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3 },
})

const dayKey = dayKeyOf
const sunday = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay())

interface Props {
  /** ボタンに出す、いまの期間の文字(例: 2026年10月) */
  label: string
  /** いまの見せ方。週表示なら、日を押すとその週へ。それ以外は、その月へ */
  view: 'month' | 'week' | 'list'
  /** いま見ている月(1 日) */
  month: Date
  /** いま見ている週の初め(日曜日) */
  weekStart: Date
  /** 日ごとの配信の数(キーは YYYY-MM-DD)。点を付けるだけ */
  dayCounts: Map<string, number>
  /** その月の、月表示へ */
  onPickMonth: (firstDay: Date) => void
  /** その週の、週表示へ */
  onPickWeek: (sunday: Date) => void
  /** その日を含む期間へ(見せ方は変えない) */
  onPickDay: (day: Date) => void
}

/**
 * 期間の移動(バックログ W11)。期間の文字を押すと、ミニカレンダーを開き、月・週・日を選んで、すぐ移れるようにする。
 * 「‹ ›」で 1 つずつ送るだけだと、離れた月・週へ行くのに、何度も押すことになるため
 */
export function MiniCalendar({ label, view, month, weekStart, dayCounts, onPickMonth, onPickWeek, onPickDay }: Props) {
  const s = useStyles()
  const t = useT()
  const lang = useLang()
  const [open, setOpen] = useState(false)
  // ミニカレンダーで表示している月(開くたびに、いま見ている期間の月に合わせる)
  const [shown, setShown] = useState(month)
  const today = dayKey(new Date())

  const first = new Date(shown.getFullYear(), shown.getMonth(), 1)
  const start = sunday(first)
  // 6 週分(どの月も収まる)。月をまたぐ日は、薄く出す
  const weeks = Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, d) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d)))
  const dows = Array.from({ length: 7 }, (_, i) => new Date(2026, 0, 4 + i).toLocaleDateString(locale(), { weekday: 'narrow' }))
  const monthName = lang === 'ja' ? `${shown.getFullYear()}年${shown.getMonth() + 1}月` : shown.toLocaleDateString(locale(), { month: 'long', year: 'numeric' })
  const inCurrent = (d: Date) =>
    view === 'week' ? sunday(d).getTime() === weekStart.getTime() : d.getFullYear() === month.getFullYear() && d.getMonth() === month.getMonth()
  const move = (months: number) => setShown(new Date(shown.getFullYear(), shown.getMonth() + months, 1))
  const pick = (f: () => void) => {
    f()
    setOpen(false)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(_, d) => {
        if (d.open) setShown(view === 'week' ? new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 3) : month)
        setOpen(d.open)
      }}
      positioning="below"
      withArrow
      trapFocus
    >
      <PopoverTrigger disableButtonEnhancement>
        <Button appearance="subtle" size="small" className={s.trigger} aria-label={t(`${label}(押すと、月・週・日を選んで移動)`, `${label} (click to jump to a month, week or day)`)}>
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverSurface className={s.surface}>
        <div className={s.head}>
          <Button size="small" appearance="subtle" icon={<ChevronDoubleLeftRegular />} aria-label={t('前の年', 'Previous year')} onClick={() => move(-12)} />
          <Button size="small" appearance="subtle" icon={<ChevronLeftRegular />} aria-label={t('前の月', 'Previous month')} onClick={() => move(-1)} />
          <Button size="small" appearance="subtle" className={s.monthName} title={t('この月を、月の表示で開く', 'Open this month in month view')} onClick={() => pick(() => onPickMonth(first))}>
            {monthName}
          </Button>
          <Button size="small" appearance="subtle" icon={<ChevronRightRegular />} aria-label={t('次の月', 'Next month')} onClick={() => move(1)} />
          <Button size="small" appearance="subtle" icon={<ChevronDoubleRightRegular />} aria-label={t('次の年', 'Next year')} onClick={() => move(12)} />
        </div>
        <div className={s.grid} role="grid">
          <span className={s.dow}>{t('週', 'Wk')}</span>
          {dows.map((d, i) => (
            <span key={i} className={s.dow}>{d}</span>
          ))}
          {weeks.map((days) => (
            <div key={dayKey(days[0])} style={{ display: 'contents' }} role="row">
              <button type="button" className={s.weekBtn} title={t('この週を、週の表示で開く', 'Open this week in week view')} onClick={() => pick(() => onPickWeek(days[0]))}>
                <CalendarRegular />
              </button>
              {days.map((d) => {
                const k = dayKey(d)
                const n = dayCounts.get(k) ?? 0
                return (
                  <button
                    key={k}
                    type="button"
                    role="gridcell"
                    className={mergeClasses(s.day, d.getMonth() !== shown.getMonth() && s.outside, inCurrent(d) && s.current, k === today && s.today)}
                    title={n ? t(`${d.toLocaleDateString(locale())}・配信 ${n} 本`, `${d.toLocaleDateString(locale())} · ${n} deliver${n === 1 ? 'y' : 'ies'}`) : d.toLocaleDateString(locale())}
                    onClick={() => pick(() => onPickDay(d))}
                  >
                    {d.getDate()}
                    {n > 0 && <span className={s.dot} />}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
        <div className={s.foot}>
          <span className={s.hint}>{t('月名で月、左の印で週、日付でその日へ', 'Month name: month · left icon: week · date: that day')}</span>
          <Button size="small" onClick={() => pick(() => onPickDay(new Date()))}>{t('今日', 'Today')}</Button>
        </div>
      </PopoverSurface>
    </Popover>
  )
}
