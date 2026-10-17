import { Badge, makeStyles, tokens } from '@fluentui/react-components'
import { WarningRegular } from '@fluentui/react-icons'
import { useT } from './i18n'
import { COLUMNS, type Column, type ColumnKey, type Row } from './listRows'
import { statusColor } from './status'
import { LockMark } from './LockMark'
import type { Product } from './models/products'
import type { HeroImage } from './models/heroImages'
import { CANCELLED_STYLE, isCancelled } from './cancel'
import { DataTable, DeliveryThumb, type DataColumn } from './DataTable'

const useStyles = makeStyles({
  name: { fontWeight: tokens.fontWeightSemibold },
  status: { display: 'inline-flex', alignItems: 'center', columnGap: tokens.spacingHorizontalXS, whiteSpace: 'nowrap' },
  dot: { width: '8px', height: '8px', borderRadius: tokens.borderRadiusCircular, flexShrink: 0 },
  steps: { display: 'inline-flex', alignItems: 'center', columnGap: tokens.spacingHorizontalS, whiteSpace: 'nowrap' },
})

interface Props {
  rows: Row[]
  columns: ColumnKey[]
  onSelect: (id: string) => void
  /** 画像の列: 配信カードごとの掲載商品と、商品・メイン画像 */
  cardProducts: Map<string, string[]>
  products: Product[]
  heroes: HeroImage[]
}

/** 配信の一覧(表)。列見出しを押すと並べ替える。行を押すと、配信カードを開く。表の見た目は、結果の一覧と共通(DataTable) */
export function ListView({ rows, columns, onSelect, cardProducts, products, heroes }: Props) {
  const styles = useStyles()
  const t = useT()

  const cell = (c: Column, r: Row) => {
    switch (c.key) {
      case 'image':
        return <DeliveryThumb card={r.card} productIds={cardProducts.get(r.card.id) ?? []} products={products} heroes={heroes} />
      case 'name':
        return <span className={styles.name}>{isCancelled(r.card) ? `${t('取りやめ', 'Cancelled')}・${c.text(r)}` : c.text(r)}</span>
      case 'status':
        return (
          <span className={styles.status}>
            <span className={styles.dot} style={{ backgroundColor: statusColor(r.card.status) }} />
            {c.text(r)}
            <LockMark status={r.card.status} />
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

  const shown: DataColumn<Row>[] = COLUMNS.filter((c) => columns.includes(c.key)).map((c) => ({
    key: c.key,
    label: c.label(),
    cell: (r) => cell(c, r),
    sort: c.sort ?? c.text,
    wide: c.key === 'theme',
  }))

  return (
    <DataTable
      rows={rows}
      columns={shown}
      rowKey={(r) => r.card.id}
      ariaLabel={t('配信の一覧', 'Deliveries')}
      empty={t('この月の配信はありません', 'No deliveries this month')}
      onRowClick={(r) => onSelect(r.card.id)}
      rowStyle={(r) => (isCancelled(r.card) ? CANCELLED_STYLE : undefined)}
      defaultSort={{ key: 'date', dir: 'ascending' }}
      // 同じ値なら、配信日時の順
      tieBreak={(a, b) => (a.card.scheduled_at ?? '').localeCompare(b.card.scheduled_at ?? '')}
    />
  )
}
