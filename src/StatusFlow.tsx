import { makeStyles, tokens } from '@fluentui/react-components'
import { ChevronRightRegular } from '@fluentui/react-icons'

const useStyles = makeStyles({
  counts: { display: 'inline-flex', alignItems: 'center', columnGap: '6px', fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground2, whiteSpace: 'nowrap' },
  count: { display: 'inline-flex', alignItems: 'center', columnGap: '4px' },
  countDot: { width: '8px', height: '8px', borderRadius: tokens.borderRadiusCircular },
  // 件数を「›」でつないで、未起案 → 承認待ち → 承認済み の流れに見せる
  arrow: { color: tokens.colorNeutralForeground4, fontSize: '12px' },
  total: { color: tokens.colorNeutralForeground3 },
})

interface Props {
  /** 状態ごとの件数(未起案 / 承認待ち / 承認済み の順) */
  counts: { label: string; color: string; n: number }[]
  /** 全体の数(承認済みの横に「/ 全体」で出す) */
  total: number
}

/**
 * 状態ごとの件数の流れ(未起案 › 承認待ち › 承認済み n / 全体)。週の帯(承認のバー)と、月の要約の帯で同じ見た目にするための部品
 */
export function StatusFlow({ counts, total }: Props) {
  const s = useStyles()
  if (counts.length === 0) return null
  return (
    <span className={s.counts}>
      {counts.map((c, i) => (
        <span key={c.label} className={s.count}>
          {i > 0 && <ChevronRightRegular className={s.arrow} aria-hidden />}
          <span className={s.countDot} style={{ backgroundColor: c.color }} />
          {c.label}
          {/* 承認済み(最後)は、全体に対する数(あといくつで確定できるか) */}
          {i === counts.length - 1 ? (
            <span>
              {` ${c.n}`}
              <span className={s.total}>{` / ${total}`}</span>
            </span>
          ) : (
            ` ${c.n}`
          )}
        </span>
      ))}
    </span>
  )
}
