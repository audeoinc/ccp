import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { DeliveryPeek } from './DeliveryPeek'
import { heroImage, productImage } from './images'
import { locale } from './i18n'
import type { DeliveryCard } from './models/deliveryCards'
import type { Product } from './models/products'
import type { HeroImage } from './models/heroImages'

const useStyles = makeStyles({
  root: {
    overflowX: 'auto',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusXLarge,
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow2,
  },
  // 列の幅は中身に合わせる(Fluent の表は、既定で列の幅を均等にする)
  // 文字は 12px、数字は等幅(日付・時刻・数の桁がそろい、縦に読みやすい)
  table: {
    tableLayout: 'auto',
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
    fontVariantNumeric: 'tabular-nums',
  },
  head: {
    backgroundColor: tokens.colorNeutralBackground2,
    '& th': { fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground3 },
  },
  row: { cursor: 'pointer' },
  rowOn: { backgroundColor: tokens.colorBrandBackground2, ':hover': { backgroundColor: tokens.colorBrandBackground2Hover } },
  nowrap: { whiteSpace: 'nowrap' },
  wide: { minWidth: '220px' },
  // 数の列は右にそろえる(見出しも)
  num: { textAlign: 'right', whiteSpace: 'nowrap', '& > div': { justifyContent: 'flex-end' } },
  thumb: { display: 'block', width: '56px', height: '40px', objectFit: 'contain', borderRadius: tokens.borderRadiusSmall, backgroundColor: tokens.colorNeutralBackground3, cursor: 'zoom-in' },
  noThumb: { display: 'block', width: '56px', height: '40px', borderRadius: tokens.borderRadiusSmall, backgroundColor: tokens.colorNeutralBackground2 },
  empty: { padding: tokens.spacingVerticalXXL, textAlign: 'center', color: tokens.colorNeutralForeground3 },
})

/** 表の列。sort がなければ、並べ替えない */
export interface DataColumn<T> {
  key: string
  label: ReactNode
  cell: (row: T) => ReactNode
  sort?: (row: T) => string | number | undefined
  /** 数の列(右にそろえる) */
  numeric?: boolean
  /** 長い文の列(折り返す。最低の幅を取る) */
  wide?: boolean
}

interface Props<T> {
  rows: T[]
  columns: DataColumn<T>[]
  rowKey: (row: T) => string
  ariaLabel: string
  empty: ReactNode
  onRowClick?: (row: T) => void
  /** 選んでいる行(色を付ける) */
  selectedKey?: string
  rowStyle?: (row: T) => CSSProperties | undefined
  defaultSort?: { key: string; dir: 'ascending' | 'descending' }
  /** 同じ値のときの順(例: 配信日時) */
  tieBreak?: (a: T, b: T) => number
}

/**
 * 一覧の表(計画の一覧・結果の一覧で共通)。列見出しを押すと並べ替える。
 * 計画と結果は同じ配信の表と裏なので、一覧の見た目(外枠・見出し・行・サムネイル)をそろえる
 */
export function DataTable<T>({ rows, columns, rowKey, ariaLabel, empty, onRowClick, selectedKey, rowStyle, defaultSort, tieBreak }: Props<T>) {
  const styles = useStyles()
  const [sort, setSort] = useState(defaultSort)

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sort?.key)
    if (!col?.sort || !sort) return rows
    const val = col.sort
    const sign = sort.dir === 'ascending' ? 1 : -1
    return [...rows].sort((a, b) => {
      const x = val(a)
      const y = val(b)
      // 値がないものは、どちらの向きでも後ろ
      if (x === undefined || y === undefined) return x === y ? (tieBreak?.(a, b) ?? 0) : x === undefined ? 1 : -1
      const d = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), locale())
      return d !== 0 ? d * sign : (tieBreak?.(a, b) ?? 0)
    })
  }, [rows, columns, sort, tieBreak])

  const toggle = (key: string) =>
    setSort((s) => (s?.key === key ? { key, dir: s.dir === 'ascending' ? 'descending' : 'ascending' } : { key, dir: 'ascending' }))

  const cellClass = (c: DataColumn<T>) => (c.numeric ? styles.num : c.wide ? undefined : styles.nowrap)

  if (rows.length === 0) return <div className={styles.root}><div className={styles.empty}>{empty}</div></div>

  return (
    <div className={styles.root}>
      <Table size="small" className={styles.table} aria-label={ariaLabel}>
        <TableHeader className={styles.head}>
          <TableRow>
            {columns.map((c) => (
              <TableHeaderCell
                key={c.key}
                sortable={!!c.sort}
                sortDirection={sort?.key === c.key ? sort.dir : undefined}
                onClick={c.sort ? () => toggle(c.key) : undefined}
                className={c.wide ? styles.wide : cellClass(c)}
              >
                {c.label}
              </TableHeaderCell>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((r) => {
            const key = rowKey(r)
            return (
              <TableRow
                key={key}
                className={mergeClasses(onRowClick && styles.row, selectedKey === key && styles.rowOn)}
                style={rowStyle?.(r)}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
                aria-selected={selectedKey === undefined ? undefined : selectedKey === key}
              >
                {columns.map((c) => (
                  <TableCell key={c.key} className={cellClass(c)}>
                    {c.cell(r)}
                  </TableCell>
                ))}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

/** 配信のサムネイル(メイン画像、なければ先頭の商品)。マウスを重ねると、配信の全体を、スクロールなしで見せる */
export function DeliveryThumb({ card, productIds, products, heroes }: { card: DeliveryCard; productIds: string[]; products: Product[]; heroes: HeroImage[] }) {
  const styles = useStyles()
  const src = heroImage(heroes.find((h) => h.id === card.hero_image_id)) ?? productImage(products.find((p) => p.id === productIds[0]))
  if (!src) return <span className={styles.noThumb} />
  return (
    <DeliveryPeek card={card} productIds={productIds} products={products} heroes={heroes}>
      <img className={styles.thumb} src={src} alt="" draggable={false} onClick={(e) => e.stopPropagation()} />
    </DeliveryPeek>
  )
}
