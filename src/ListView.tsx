import { useMemo, useState } from 'react'
import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  makeStyles,
  tokens,
} from '@fluentui/react-components'
import { WarningRegular } from '@fluentui/react-icons'
import { locale, useT } from './i18n'
import { COLUMNS, type Column, type ColumnKey, type Row } from './listRows'
import { statusColor } from './status'

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
  name: { fontWeight: tokens.fontWeightSemibold },
  nowrap: { whiteSpace: 'nowrap' },
  theme: { minWidth: '220px' },
  status: { display: 'inline-flex', alignItems: 'center', columnGap: tokens.spacingHorizontalXS, whiteSpace: 'nowrap' },
  dot: { width: '8px', height: '8px', borderRadius: tokens.borderRadiusCircular, flexShrink: 0 },
  steps: { display: 'inline-flex', alignItems: 'center', columnGap: tokens.spacingHorizontalS, whiteSpace: 'nowrap' },
  empty: { padding: tokens.spacingVerticalXXL, textAlign: 'center', color: tokens.colorNeutralForeground3 },
})

interface Props {
  rows: Row[]
  columns: ColumnKey[]
  onSelect: (id: string) => void
}

/** 配信の一覧(表)。列見出しを押すと並べ替える。行を押すと、配信カードを開く */
export function ListView({ rows, columns, onSelect }: Props) {
  const styles = useStyles()
  const t = useT()
  const [sort, setSort] = useState<{ key: ColumnKey; dir: 'ascending' | 'descending' }>({ key: 'date', dir: 'ascending' })
  const shown = COLUMNS.filter((c) => columns.includes(c.key))

  const sorted = useMemo(() => {
    const col = COLUMNS.find((c) => c.key === sort.key) ?? COLUMNS[0]
    const val = col.sort ?? col.text
    const sign = sort.dir === 'ascending' ? 1 : -1
    return [...rows].sort((a, b) => {
      const x = val(a)
      const y = val(b)
      const d = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), locale())
      // 同じ値なら、配信日時の順
      return d !== 0 ? d * sign : (a.card.cr854_scheduledat ?? '').localeCompare(b.card.cr854_scheduledat ?? '')
    })
  }, [rows, sort])

  const toggle = (key: ColumnKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'ascending' ? 'descending' : 'ascending' } : { key, dir: 'ascending' }))

  const cell = (c: Column, r: Row) => {
    switch (c.key) {
      case 'name':
        return <span className={styles.name}>{c.text(r)}</span>
      case 'status':
        return (
          <span className={styles.status}>
            <span className={styles.dot} style={{ backgroundColor: statusColor(r.card.cr854_status) }} />
            {c.text(r)}
          </span>
        )
      case 'steps':
        return (
          <span className={styles.steps}>
            {c.text(r)}
            {r.dueSoon && (
              <Badge appearance="tint" color="warning" size="small" icon={<WarningRegular />}>
                {t('配信が近いのに未着手', 'Due soon — not started')}
              </Badge>
            )}
          </span>
        )
      default:
        return c.text(r)
    }
  }

  if (rows.length === 0) return <div className={styles.root}><div className={styles.empty}>{t('この月の配信はありません', 'No deliveries this month')}</div></div>

  return (
    <div className={styles.root}>
      <Table size="small" className={styles.table} aria-label={t('配信の一覧', 'Deliveries')}>
        <TableHeader className={styles.head}>
          <TableRow>
            {shown.map((c) => (
              <TableHeaderCell
                key={c.key}
                sortable
                sortDirection={sort.key === c.key ? sort.dir : undefined}
                onClick={() => toggle(c.key)}
                className={c.key === 'theme' ? styles.theme : styles.nowrap}
              >
                {c.label()}
              </TableHeaderCell>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((r) => (
            <TableRow key={r.card.cr854_deliverycardid} className={styles.row} onClick={() => onSelect(r.card.cr854_deliverycardid)}>
              {shown.map((c) => (
                <TableCell key={c.key} className={c.key === 'theme' ? undefined : styles.nowrap}>
                  {cell(c, r)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
