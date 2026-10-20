import { useEffect, useRef, useState, type ReactNode } from 'react'
import { makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import type { DeliveryCard } from './models/deliveryCards'
import type { CardAlertKind } from './cardAlerts'
import { LockClosedRegular } from '@fluentui/react-icons'
import { ChannelBadge } from './ChannelBadge'
import { AlertMark } from './AlertMark'
import { locale, useT } from './i18n'
import { statusColor } from './status'
import { isCancelled } from './cancel'

// 週の表示の「時刻」の見方(X46)。Outlook の予定表のように、横 = 曜日・縦 = 時刻の格子に、配信を配信時刻の位置で置く。
// 配信は瞬間なので、カードの高さは一定(上の端が配信時刻)。違う日の同じ時刻の配信は、同じ高さに並ぶ(横に目で追える)。
// カードをつかんで、別の日・時刻へ動かせる(15 分きざみ)。動かせない配信(承認済み・確定した週・取りやめ)は、onMove が断る

const HOUR = 56 // 1 時間の高さ(px)
const CARD = 40 // カードの高さ(px)
const SNAP = 15 // 動かすときの、時刻のきざみ(分)
const pad = (n: number) => String(n).padStart(2, '0')
const minutesOf = (iso?: string) => {
  if (!iso) return 0
  const d = new Date(iso)
  return d.getHours() * 60 + d.getMinutes()
}
const dayIndexOf = (start: Date, iso?: string) => {
  if (!iso) return -1
  const d = new Date(iso)
  return Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - start.getTime()) / 86400000)
}

const useStyles = makeStyles({
  root: { display: 'grid', gridTemplateColumns: '56px repeat(7, minmax(0, 1fr))', border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground1, overflow: 'hidden', userSelect: 'none' },
  head: { padding: '6px 8px', fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground2, borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, borderLeft: `1px solid ${tokens.colorNeutralStroke3}`, fontVariantNumeric: 'tabular-nums' },
  headToday: { color: tokens.colorBrandForeground1, fontWeight: tokens.fontWeightSemibold },
  corner: { borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  axis: { position: 'relative' },
  hourLabel: { position: 'absolute', right: '6px', transform: 'translateY(-50%)', fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3, fontVariantNumeric: 'tabular-nums' },
  col: { position: 'relative', borderLeft: `1px solid ${tokens.colorNeutralStroke3}` },
  colToday: { backgroundColor: tokens.colorBrandBackground2 },
  // 違う日で同じ時刻に配信がある時刻の、横の線(その時刻に何日あるかを左に出す)
  sameLine: { position: 'absolute', left: 0, right: 0, height: 0, borderTop: `1px dashed ${tokens.colorBrandStroke1}`, pointerEvents: 'none' },
  sameLabel: { position: 'absolute', left: '2px', transform: 'translateY(-50%)', padding: '0 4px', borderRadius: tokens.borderRadiusSmall, backgroundColor: tokens.colorBrandBackground, color: tokens.colorNeutralForegroundOnBrand, fontSize: tokens.fontSizeBase100, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' },
  now: { position: 'absolute', left: 0, right: 0, height: 0, borderTop: `2px solid ${tokens.colorPaletteRedBorderActive}`, pointerEvents: 'none', zIndex: 2 },
  card: {
    position: 'absolute',
    boxSizing: 'border-box',
    height: `${CARD}px`,
    display: 'grid',
    gridTemplateRows: 'auto auto',
    alignContent: 'center',
    padding: '2px 6px 2px 8px',
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderLeftWidth: '4px',
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow2,
    cursor: 'grab',
    overflow: 'hidden',
    touchAction: 'none',
    ':hover': { boxShadow: tokens.shadow8, zIndex: 3 },
  },
  cardFixed: { cursor: 'pointer' },
  cardCancelled: { opacity: 0.5, textDecorationLine: 'line-through' },
  cardDragging: { opacity: 0.35 },
  line1: { display: 'flex', alignItems: 'center', columnGap: '4px', minWidth: 0, fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3, fontVariantNumeric: 'tabular-nums' },
  name: { fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  ghost: { position: 'absolute', boxSizing: 'border-box', height: `${CARD}px`, borderRadius: tokens.borderRadiusMedium, border: `2px dashed ${tokens.colorBrandStroke1}`, backgroundColor: tokens.colorBrandBackground2, pointerEvents: 'none', zIndex: 4, padding: '2px 6px', fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, color: tokens.colorBrandForeground1, fontVariantNumeric: 'tabular-nums' },
})

interface Props {
  /** 週の初め(日曜日) */
  start: Date
  cards: DeliveryCard[]
  alertKinds?: Map<string, CardAlertKind>
  /** 状態の色を差し替える(制作の面) */
  stateOf?: (c: DeliveryCard) => { color: string; label: string }
  /** 動かせない配信なら、その理由(カードに出す。押すと開く) */
  fixedReason?: (c: DeliveryCard) => string | null
  onSelect: (id: string) => void
  /** 配信日時を変える(新しい日時は ISO)。動かせないときは呼ばれない */
  onMove: (c: DeliveryCard, iso: string) => void
  /** カードの 2 行目の右に添えるもの */
  renderMeta?: (c: DeliveryCard) => ReactNode
}

/** 週の表示の「時刻」の見方(X46) */
export function WeekTimeGrid({ start, cards, alertKinds, stateOf, fixedReason, onSelect, onMove, renderMeta }: Props) {
  const s = useStyles()
  const t = useT()
  const days = Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
  const dated = cards.filter((c) => c.scheduled_at && dayIndexOf(start, c.scheduled_at) >= 0 && dayIndexOf(start, c.scheduled_at) < 7)

  // 縦の範囲: 配信のある時刻の 1 時間前〜1 時間あと(配信がなければ 8〜20 時)。少なくとも 8 時間は見せる
  const mins = dated.map((c) => minutesOf(c.scheduled_at))
  let from = mins.length ? Math.max(0, Math.floor(Math.min(...mins) / 60) - 1) : 8
  let to = mins.length ? Math.min(24, Math.ceil((Math.max(...mins) + 45) / 60) + 1) : 20
  if (to - from < 8) {
    const extra = 8 - (to - from)
    from = Math.max(0, from - Math.floor(extra / 2))
    to = Math.min(24, from + 8)
  }
  const height = (to - from) * HOUR
  const yOf = (m: number) => ((m - from * 60) / 60) * HOUR

  // 同じ日の中で時刻が近い配信は、横に並べる(カードの高さぶん重なるものを、同じ組にして列を分ける)
  const layout = (() => {
    const out = new Map<string, { lane: number; lanes: number }>()
    for (let d = 0; d < 7; d++) {
      const list = dated.filter((c) => dayIndexOf(start, c.scheduled_at) === d).sort((a, b) => minutesOf(a.scheduled_at) - minutesOf(b.scheduled_at))
      let group: DeliveryCard[] = []
      let groupEnd = -1
      const flush = () => {
        const laneEnds: number[] = []
        const lanes = new Map<string, number>()
        for (const c of group) {
          const top = yOf(minutesOf(c.scheduled_at))
          let lane = laneEnds.findIndex((end) => end <= top)
          if (lane < 0) lane = laneEnds.length
          laneEnds[lane] = top + CARD
          lanes.set(c.id, lane)
        }
        for (const c of group) out.set(c.id, { lane: lanes.get(c.id)!, lanes: laneEnds.length })
        group = []
        groupEnd = -1
      }
      for (const c of list) {
        const top = yOf(minutesOf(c.scheduled_at))
        if (group.length && top >= groupEnd) flush()
        group.push(c)
        groupEnd = Math.max(groupEnd, top + CARD)
      }
      if (group.length) flush()
    }
    return out
  })()

  // 違う日で同じ時刻(時:分)に配信がある時刻(2 日以上)
  const sameTimes = (() => {
    const byTime = new Map<number, Set<number>>()
    for (const c of dated) {
      const m = minutesOf(c.scheduled_at)
      byTime.set(m, (byTime.get(m) ?? new Set()).add(dayIndexOf(start, c.scheduled_at)))
    }
    return [...byTime].filter(([, set]) => set.size >= 2).map(([m, set]) => ({ m, n: set.size }))
  })()

  // いまの時刻の線(この週に今日があるとき)。1 分ごとに描き直す
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60000)
    return () => window.clearInterval(timer)
  }, [])
  const todayIndex = dayIndexOf(start, now.toISOString())

  // ---- つかんで動かす
  const bodyRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<{ id: string; day: number; m: number; moved: boolean } | null>(null)
  const dragStart = useRef<{ x: number; y: number; offsetY: number } | null>(null)
  const pointToSlot = (clientX: number, clientY: number, offsetY: number) => {
    const body = bodyRef.current
    if (!body) return null
    const r = body.getBoundingClientRect()
    const colW = r.width / 7
    const day = Math.min(6, Math.max(0, Math.floor((clientX - r.left) / colW)))
    const raw = from * 60 + ((clientY - r.top - offsetY) / HOUR) * 60
    const m = Math.min(to * 60 - SNAP, Math.max(from * 60, Math.round(raw / SNAP) * SNAP))
    return { day, m }
  }
  const timeText = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`

  return (
    <div className={s.root}>
      <div className={s.corner} />
      {days.map((d, i) => (
        <div key={i} className={mergeClasses(s.head, i === todayIndex && s.headToday)}>
          {d.toLocaleDateString(locale(), { month: 'numeric', day: 'numeric', weekday: 'short' })}
        </div>
      ))}
      <div className={s.axis} style={{ height }}>
        {Array.from({ length: to - from + 1 }, (_, i) => (
          <span key={i} className={s.hourLabel} style={{ top: i * HOUR }}>
            {i === 0 ? '' : `${from + i}:00`}
          </span>
        ))}
      </div>
      <div
        ref={bodyRef}
        style={{ gridColumn: '2 / span 7', position: 'relative', height, display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', marginLeft: 0 }}
        onPointerMove={(e) => {
          const st = dragStart.current
          if (!drag || !st) return
          const moved = drag.moved || Math.abs(e.clientX - st.x) + Math.abs(e.clientY - st.y) > 4
          const slot = pointToSlot(e.clientX, e.clientY, st.offsetY)
          if (slot) setDrag({ ...drag, ...slot, moved })
        }}
        onPointerUp={() => {
          const d = drag
          setDrag(null)
          dragStart.current = null
          if (!d) return
          const c = dated.find((x) => x.id === d.id)
          if (!c) return
          if (!d.moved) {
            onSelect(c.id)
            return
          }
          const day = days[d.day]
          const next = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(d.m / 60), d.m % 60)
          if (next.getTime() !== new Date(c.scheduled_at!).getTime()) onMove(c, next.toISOString())
        }}
        onPointerLeave={() => {
          if (drag && !drag.moved) {
            setDrag(null)
            dragStart.current = null
          }
        }}
      >
        {days.map((_, i) => (
          <div
            key={i}
            className={mergeClasses(s.col, i === todayIndex && s.colToday)}
            style={{ backgroundImage: `repeating-linear-gradient(to bottom, ${tokens.colorNeutralStroke3} 0, ${tokens.colorNeutralStroke3} 1px, transparent 1px, transparent ${HOUR}px)` }}
          />
        ))}
        {sameTimes.map(({ m, n }) => (
          <div key={m} className={s.sameLine} style={{ top: yOf(m) }} title={t(`${timeText(m)} の配信が ${n} 日あります`, `${n} days have a delivery at ${timeText(m)}`)}>
            <span className={s.sameLabel}>{t(`${timeText(m)} ×${n} 日`, `${timeText(m)} ×${n}`)}</span>
          </div>
        ))}
        {todayIndex >= 0 && todayIndex < 7 && yOf(now.getHours() * 60 + now.getMinutes()) >= 0 && yOf(now.getHours() * 60 + now.getMinutes()) <= height && (
          <div className={s.now} style={{ top: yOf(now.getHours() * 60 + now.getMinutes()), left: `${(todayIndex / 7) * 100}%`, width: `${100 / 7}%` }} />
        )}
        {dated.map((c) => {
          const day = dayIndexOf(start, c.scheduled_at)
          const m = minutesOf(c.scheduled_at)
          const pos = layout.get(c.id) ?? { lane: 0, lanes: 1 }
          const reason = isCancelled(c) ? t('取りやめた配信は動かせません', 'Cancelled deliveries cannot be moved') : (fixedReason?.(c) ?? null)
          const state = stateOf?.(c)
          const color = state?.color ?? statusColor(c.status)
          const colW = 100 / 7
          return (
            <div
              key={c.id}
              role="button"
              tabIndex={0}
              className={mergeClasses(s.card, !!reason && s.cardFixed, isCancelled(c) && s.cardCancelled, drag?.id === c.id && drag.moved && s.cardDragging)}
              style={{
                top: yOf(m),
                left: `calc(${day * colW}% + 3px + (${colW}% - 6px) * ${pos.lane / pos.lanes})`,
                width: `calc((${colW}% - 6px) / ${pos.lanes})`,
                borderLeftColor: color,
              }}
              title={[c.name, state?.label, reason ?? t('つかんで、別の日・時刻へ動かせます', 'Drag to another day or time')].filter(Boolean).join('\n')}
              onPointerDown={(e) => {
                if (reason) return
                const r = e.currentTarget.getBoundingClientRect()
                dragStart.current = { x: e.clientX, y: e.clientY, offsetY: e.clientY - r.top }
                e.currentTarget.parentElement?.setPointerCapture(e.pointerId)
                setDrag({ id: c.id, day, m, moved: false })
              }}
              onClick={() => reason && onSelect(c.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') onSelect(c.id)
              }}
            >
              <span className={s.line1}>
                <ChannelBadge channel={c.channel} size="icon" />
                {timeText(m)}
                {/* 動かせない配信(承認済み・確定した週・取りやめ)は、鍵の印 */}
                {reason && <LockClosedRegular fontSize={11} aria-label={reason} />}
                <AlertMark kind={alertKinds?.get(c.id)} />
                {renderMeta?.(c)}
              </span>
              <span className={s.name}>{c.name || t('(配信名のない枠)', '(untitled frame)')}</span>
            </div>
          )
        })}
        {drag?.moved && (
          <div className={s.ghost} style={{ top: yOf(drag.m), left: `calc(${drag.day * (100 / 7)}% + 3px)`, width: `calc(${100 / 7}% - 6px)` }}>
            {`${days[drag.day].toLocaleDateString(locale(), { month: 'numeric', day: 'numeric', weekday: 'short' })} ${timeText(drag.m)}`}
          </div>
        )}
      </div>
    </div>
  )
}
