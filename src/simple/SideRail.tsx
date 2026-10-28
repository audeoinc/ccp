// 左のバー(縦の帯)。シンプルな配信カード(SU1)と、制作のシンプルな画面(X86)で同じものを使う。
// アイコンの下に短い名前、数は数の丸、気づいてほしいことは点。押すと、その欄を 1 つだけ開く(もう一度押すとしまう。開け閉めは使う側が持つ)
import type { DragEvent, ReactElement, ReactNode } from 'react'
import { CounterBadge, Tooltip, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'

const useStyles = makeStyles({
  rail: { display: 'flex', flexDirection: 'column', alignItems: 'center', rowGap: '4px', paddingTop: '8px', borderRight: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: tokens.colorNeutralBackground2, overflowY: 'auto' },
  gap: { width: '32px', height: '1px', margin: '4px 0', backgroundColor: tokens.colorNeutralStroke2, flexShrink: 0 },
  btn: { display: 'grid', justifyItems: 'center', rowGap: '2px', width: '48px', padding: '6px 0', border: 'none', borderRadius: tokens.borderRadiusMedium, backgroundColor: 'transparent', fontFamily: 'inherit', color: tokens.colorNeutralForeground2, cursor: 'pointer', ':hover': { backgroundColor: tokens.colorNeutralBackground2Hover, color: tokens.colorNeutralForeground1 } },
  on: { backgroundColor: tokens.colorBrandBackground2, color: tokens.colorBrandForeground1, ':hover': { backgroundColor: tokens.colorBrandBackground2Hover } },
  icon: { position: 'relative', fontSize: '20px', lineHeight: 1 },
  badge: { position: 'absolute', top: '-7px', right: '-13px' },
  dot: { position: 'absolute', top: '-3px', left: '-6px', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: tokens.colorPaletteRedBackground3 },
  // 名前はボタンの幅(48px)に収まる短い言葉にする(English で切れていた。2026-10-26 利用者)。長い名前は tip と題に書き、ここは収まらなければ … にする
  label: { fontSize: '11px', lineHeight: 1.2, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  // 画像・URL を落とせる所(ドラッグ中)
  drop: { outline: `2px dashed ${tokens.colorBrandStroke1}`, outlineOffset: '-2px', backgroundColor: tokens.colorBrandBackground2 },
})

export interface RailItem<V extends string> {
  v: V
  icon: ReactElement
  label: string
  tip: string
  count: number
  color?: 'danger' | 'informative' | 'brand'
  dot?: 'red' | 'amber'
  /** この上に線 */
  gap?: boolean
  /** 画像・URL を落とせる(落とし方は drop で渡す) */
  drop?: boolean
}

interface Props<V extends string> {
  items: RailItem<V>[]
  /** いま開いている欄 */
  selected: V | null
  onPick: (v: V) => void
  ariaLabel: string
  /** 落とせる欄の受け取り(ドラッグの上・離れた・落とした)と、いまその欄の上か */
  drop?: { over: V | null; onOver: (v: V, ev: DragEvent) => void; onLeave: (v: V) => void; onDrop: (v: V, ev: DragEvent) => void }
  /** バーの下に添えるもの(落としたものを入れた・入れられなかったの知らせなど) */
  children?: ReactNode
}

export function SideRail<V extends string>({ items, selected, onPick, ariaLabel, drop, children }: Props<V>) {
  const s = useStyles()
  return (
    <nav className={s.rail} aria-label={ariaLabel}>
      {items.map((r) => (
        <span key={r.v} style={{ display: 'contents' }}>
          {r.gap && <span className={s.gap} />}
          <Tooltip content={r.tip} relationship="description" positioning="after">
            <button
              type="button"
              className={mergeClasses(s.btn, selected === r.v && s.on, r.drop && drop?.over === r.v && s.drop)}
              aria-pressed={selected === r.v}
              onClick={() => onPick(r.v)}
              onDragOver={r.drop && drop ? (ev) => drop.onOver(r.v, ev) : undefined}
              onDragLeave={r.drop && drop ? () => drop.onLeave(r.v) : undefined}
              onDrop={r.drop && drop ? (ev) => drop.onDrop(r.v, ev) : undefined}
            >
              <span className={s.icon}>
                {r.icon}
                {r.count > 0 && <CounterBadge className={s.badge} count={r.count} size="small" color={r.color ?? 'brand'} />}
                {r.dot && <span className={s.dot} style={r.dot === 'amber' ? { backgroundColor: tokens.colorPaletteMarigoldBackground3 } : undefined} />}
              </span>
              <span className={s.label}>{r.label}</span>
            </button>
          </Tooltip>
        </span>
      ))}
      {children}
    </nav>
  )
}
