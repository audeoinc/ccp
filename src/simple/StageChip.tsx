// 上の帯の状態の札(計画 = 承認、制作 = 制作の状態、結果 = 結果のあるなし)。3 つの面で同じ形・大きさにする(optimize-survey の 2 章の順 3。2026-11-03)。
// 計画の承認の札(ApprovalChip)は押せるボタンで色の並びも違うので、形(chipBase)だけを分け合う
import type { CSSProperties, ReactNode } from 'react'
import { InfoLabel, makeStyles, tokens } from '@fluentui/react-components'
import { chipBase } from './chipBase'

const useStyles = makeStyles({
  // 線は状態の色、地はその色をうすく混ぜたもの(制作の札の形に合わせた)
  chip: {
    ...chipBase,
    border: '1px solid var(--chip-line)',
    backgroundColor: 'color-mix(in srgb, var(--chip-line) 14%, var(--colorNeutralBackground1))',
    color: tokens.colorNeutralForeground1,
  },
  dot: { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0 },
  label: { display: 'inline-flex', alignItems: 'center', flexShrink: 0 },
})

/** 色の点と短い言葉の札。info があれば、横の ⓘ に長い説明を出す */
export function StageChip({ color, info, children }: { color: string; info?: ReactNode; children: ReactNode }) {
  const s = useStyles()
  const chip = (
    <span className={s.chip} style={{ '--chip-line': color } as CSSProperties}>
      <span className={s.dot} style={{ backgroundColor: color }} aria-hidden />
      {children}
    </span>
  )
  return info ? (
    <InfoLabel size="small" info={info} className={s.label}>
      {chip}
    </InfoLabel>
  ) : (
    chip
  )
}
