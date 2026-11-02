// ラベルと値の組(2026-10-27 利用者と決めた。ラベルと値が同じ大きさ・濃さ・太さだと読み取りにくいため)。
// ラベル = 10px・薄い色(目印。colorNeutralForeground4)、値 = 14px・semibold・濃い色(主役)、いちばん大事な値はさらに太く、空の値は薄く・ふつうの太さ。
// 横並び(帯・1 行の一覧)と縦並び(ペインの中の項目)の両方を、この 1 つで出す。
// 縦に積む案と見比べて、横のまま差を強くする形に決めた(2026-10-27 利用者)。ラベルと値のあいだに余白。
// Fluent v9 には、表示だけのラベルと値の組の部品がない(Label は入力欄に付けるもの)ので、ここに 1 つにする
import type { ReactNode } from 'react'
import { makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { useT } from './i18n'
import { emptyValueText } from './emptyValue'
import { typo } from './typo'
import { CopyButton } from './CopyButton'

const useStyles = makeStyles({
  inline: { display: 'inline-flex', alignItems: 'baseline', columnGap: '10px', minWidth: 0 },
  stacked: { display: 'flex', flexDirection: 'column', rowGap: '2px', minWidth: 0 },
  // ラベルは 10px・薄い色(2026-10-27 利用者。値を読めば分かるので、ラベルは目印で足りる。Disabled の色は薄すぎたので 1 段濃く)
  label: { ...typo.pairLabel, whiteSpace: 'nowrap', flexShrink: 0 },
  value: { ...typo.pairValue, minWidth: 0, overflowWrap: 'anywhere' },
  strong: { fontWeight: tokens.fontWeightBold },
  // 空の値は太くせず、ラベルと同じ薄さ
  empty: { ...typo.empty, fontWeight: tokens.fontWeightRegular },
  // 帯の中など、1 行に収めたいとき
  truncate: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', overflowWrap: 'normal' },
  // コピーのボタンつき: 値とボタンを 1 行に。ボタンは値の行の高さに収め、ラベルとの並び(baseline)を崩さない
  withCopy: { display: 'inline-flex', alignItems: 'center', columnGap: '2px', minWidth: 0 },
  copy: { minWidth: 'auto', height: '20px', padding: '0 2px', flexShrink: 0, alignSelf: 'center' },
})


const isEmpty = (v: ReactNode) => v === null || v === undefined || v === false || (typeof v === 'string' && v.trim() === '')

interface Props {
  label: ReactNode
  /** 値。空(null・undefined・空の文字)のときは emptyText を、ラベルと同じ薄さで出す */
  children?: ReactNode
  /** 空のときの文言(省くと empty の決まった文言) */
  emptyText?: string
  /** 空のときの決まった文言の種類(省くと「未設定」。値がないのが正しいものは 'none' で「—」) */
  empty?: 'unset' | 'none'
  /**
   * 値の横にコピーのボタンを出す。文字を渡すとそれを、true なら値(文字のとき)をコピーする。
   * 空の値には出さない(制作が写すもの・URL など、写す値に使う)
   */
  copy?: string | boolean
  /** コピーのボタンの説明(省くと「ラベル をコピー」。ラベルが文字でないときは「コピー」) */
  copyLabel?: string
  /** 横並び(既定)か、縦並び */
  layout?: 'inline' | 'stacked'
  /** いちばん大事な値(名前など)だけ太く */
  strong?: boolean
  /** 値を 1 行に収め、はみ出しは … にする(値が文字なら、マウスを載せると全文が出る) */
  truncate?: boolean
  /** ラベルの幅(横並びで、いくつかの組のラベルの幅をそろえたいとき) */
  labelWidth?: string
  className?: string
  valueClassName?: string
}

export function LabeledValue({ label, children, emptyText, empty: emptyKind, copy, copyLabel, layout = 'inline', strong, truncate, labelWidth, className, valueClassName }: Props) {
  const s = useStyles()
  const t = useT()
  const empty = isEmpty(children)
  const copyValue = empty ? '' : typeof copy === 'string' ? copy : copy && typeof children === 'string' ? children : ''
  // … にする値は、マウスを載せると全文が出るように(切れたままでは読めないため。2026-10-27 利用者)
  const value = (
    <span className={mergeClasses(s.value, strong && !empty && s.strong, empty && s.empty, truncate && s.truncate, valueClassName)} title={truncate && !empty && typeof children === 'string' ? children : undefined}>
      {empty ? (emptyText ?? emptyValueText(emptyKind)) : children}
    </span>
  )
  return (
    <span className={mergeClasses(layout === 'stacked' ? s.stacked : s.inline, className)}>
      <span className={s.label} style={labelWidth ? { width: labelWidth } : undefined}>
        {label}
      </span>
      {copyValue ? (
        <span className={s.withCopy}>
          {value}
          <CopyButton className={s.copy} text={copyValue} label={copyLabel ?? (typeof label === 'string' ? t(`${label} をコピー`, `Copy ${label}`) : undefined)} />
        </span>
      ) : (
        value
      )}
    </span>
  )
}
