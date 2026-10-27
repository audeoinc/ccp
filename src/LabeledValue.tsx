// ラベルと値の組(2026-10-27 利用者と決めた。ラベルと値が同じ大きさ・濃さ・太さだと読み取りにくいため)。
// ラベル = 11px・ふつうの太さ・薄いグレー、値 = 13px・濃い色、いちばん大事な値だけ太く、空の値はラベルと同じ薄さ(src/typo.ts)。
// 横並び(帯・1 行の一覧)と縦並び(ペインの中の項目)の両方を、この 1 つで出す。
// 案 B(2026-10-27 見比べ): 横のまま差を強く。ラベルはさらに薄く(colorNeutralForeground4)、値は 14px・少し太く、あいだに余白。
// Fluent v9 には、表示だけのラベルと値の組の部品がない(Label は入力欄に付けるもの)ので、ここに 1 つにする
import type { ReactNode } from 'react'
import { makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { useT } from './i18n'
import { typo } from './typo'

const useStyles = makeStyles({
  inline: { display: 'inline-flex', alignItems: 'baseline', columnGap: '10px', minWidth: 0 },
  stacked: { display: 'flex', flexDirection: 'column', rowGap: '2px', minWidth: 0 },
  // ラベルは 10px(2026-10-27 見比べ。利用者「もう少し小さく」。日本語の読める下限)
  label: { ...typo.label, fontSize: '10px', lineHeight: '14px', color: tokens.colorNeutralForeground4, whiteSpace: 'nowrap', flexShrink: 0 },
  value: { ...typo.value, fontSize: '14px', lineHeight: '20px', fontWeight: tokens.fontWeightSemibold, minWidth: 0, overflowWrap: 'anywhere' },
  strong: { fontWeight: tokens.fontWeightBold },
  // 空の値は太くせず、ラベルと同じ薄さ
  empty: { ...typo.empty, fontWeight: tokens.fontWeightRegular },
  // 帯の中など、1 行に収めたいとき
  truncate: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', overflowWrap: 'normal' },
})

const isEmpty = (v: ReactNode) => v === null || v === undefined || v === false || (typeof v === 'string' && v.trim() === '')

interface Props {
  label: ReactNode
  /** 値。空(null・undefined・空の文字)のときは emptyText を、ラベルと同じ薄さで出す */
  children?: ReactNode
  /** 空のときの文言(省くと「未設定」) */
  emptyText?: string
  /** 横並び(既定)か、縦並び */
  layout?: 'inline' | 'stacked'
  /** いちばん大事な値(名前など)だけ太く */
  strong?: boolean
  /** 値を 1 行に収め、はみ出しは … にする */
  truncate?: boolean
  /** ラベルの幅(横並びで、いくつかの組のラベルの幅をそろえたいとき) */
  labelWidth?: string
  className?: string
  valueClassName?: string
}

export function LabeledValue({ label, children, emptyText, layout = 'inline', strong, truncate, labelWidth, className, valueClassName }: Props) {
  const s = useStyles()
  const t = useT()
  const empty = isEmpty(children)
  return (
    <span className={mergeClasses(layout === 'stacked' ? s.stacked : s.inline, className)}>
      <span className={s.label} style={labelWidth ? { width: labelWidth } : undefined}>
        {label}
      </span>
      <span className={mergeClasses(s.value, strong && !empty && s.strong, empty && s.empty, truncate && s.truncate, valueClassName)}>
        {empty ? (emptyText ?? t('未設定', 'Not set')) : children}
      </span>
    </span>
  )
}
