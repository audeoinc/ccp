import type { ReactNode } from 'react'
import { SearchBox, ToggleButton, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { FilterRegular } from '@fluentui/react-icons'
import { useT } from './i18n'

/*
 * 検索の欄と絞り込みのチップ(X71)。
 * 場所ごとに Input に虫眼鏡を付けていたら、検索の欄だと気づかれなかった(虫眼鏡が小さく薄い・下のチップと区別しにくい)。
 * 検索は Fluent の SearchBox(虫眼鏡と、入力を消す × が付く)にそろえ、結果の件数を横に出す。
 * チップは「絞り込み」の見出しを付けて、検索の欄とは別のものだと分かるようにする。
 */

const useStyles = makeStyles({
  search: { display: 'flex', alignItems: 'center', columnGap: '8px', minWidth: 0 },
  box: { flexGrow: 1, minWidth: '160px', maxWidth: 'none' },
  count: { flexShrink: 0, color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200, whiteSpace: 'nowrap' },
  chips: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: '4px', rowGap: '4px', minWidth: 0 },
  chipsLabel: {
    display: 'inline-flex',
    alignItems: 'center',
    columnGap: '2px',
    marginRight: '2px',
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
  },
})

interface SearchFieldProps {
  value: string
  onChange: (value: string) => void
  placeholder: string
  /** 当たった件数。渡したときだけ、欄の右に出す */
  count?: number
  /** 件数の単位(既定は「件」) */
  unit?: (n: number) => string
  autoFocus?: boolean
  className?: string
}

export function SearchField({ value, onChange, placeholder, count, unit, autoFocus, className }: SearchFieldProps) {
  const s = useStyles()
  const t = useT()
  return (
    <div className={mergeClasses(s.search, className)}>
      <SearchBox
        className={s.box}
        size="small"
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        autoFocus={autoFocus}
        onChange={(_, d) => onChange(d.value)}
      />
      {count !== undefined && <span className={s.count} aria-live="polite">{unit ? unit(count) : t(`${count} 件`, `${count} found`)}</span>}
    </div>
  )
}

interface FilterChipsProps<V extends string> {
  /** 選べる値。'' は「すべて」として先頭に出す */
  options: { value: V; label: ReactNode }[]
  value: V | ''
  onChange: (value: V | '') => void
  /** 「すべて」のチップの文言(渡さなければ、すべてのチップを出さない) */
  allLabel?: ReactNode
  /** 見出し(既定は「絞り込み」)。1 つの行に複数の組を並べるときは、何で絞るかを書く */
  label?: ReactNode
  /** 選んでいるチップをもう一度押すと、すべてに戻す */
  toggle?: boolean
  className?: string
}

export function FilterChips<V extends string>({ options, value, onChange, allLabel, label, toggle, className }: FilterChipsProps<V>) {
  const s = useStyles()
  const t = useT()
  const heading = label ?? t('絞り込み', 'Filter')
  return (
    <div className={mergeClasses(s.chips, className)} role="group" aria-label={typeof heading === 'string' ? heading : undefined}>
      <span className={s.chipsLabel}>
        <FilterRegular />
        {heading}
      </span>
      {allLabel !== undefined && (
        <ToggleButton size="small" shape="circular" checked={value === ''} onClick={() => onChange('')}>
          {allLabel}
        </ToggleButton>
      )}
      {options.map((o) => (
        <ToggleButton key={o.value} size="small" shape="circular" checked={value === o.value} onClick={() => onChange(toggle && value === o.value ? '' : o.value)}>
          {o.label}
        </ToggleButton>
      ))}
    </div>
  )
}
