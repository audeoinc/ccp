import { useMemo, useState, type ReactNode } from 'react'
import { Badge, Button, Caption1, Text, makeStyles, mergeClasses, shorthands, tokens } from '@fluentui/react-components'
import { AddRegular } from '@fluentui/react-icons'
import type { Product } from './models/products'
import { DND_PRODUCT, yen } from './items'
import { productMarket } from './market'
import { optionLabel, useT } from './i18n'
import { ProductThumbButton } from './ProductThumbButton'
import { ImageThumb } from './ImageThumb'
import { productImage } from './images'
import { FilterChips, SearchField } from './SearchField'

interface Props {
  products: Product[]
  usedIds: Set<string>
  onAdd: (productId: string) => void
  /** 選ぶ使い方(X54。商品の対応のフロートの「ほかの商品を探す」): 行を押すと onPick。ドラッグ・追加のボタンは出さない */
  onPick?: (productId: string) => void
  /** 選ぶ使い方で、選んでいる商品 */
  pickedId?: string
  /** 選ぶ使い方で、件数の横に出す説明(既定は「押すと、右に詳しい情報が出ます」) */
  pickHint?: string
  /** 行に添える印(残少・週の上限 など) */
  marks?: (p: Product) => ReactNode
  /** 選ぶ使い方で、行の写真を押したとき(入れ替えの候補の詳しい情報を開く) */
  onDetail?: (productId: string) => void
}

const useStyles = makeStyles({
  root: { display: 'grid', rowGap: '8px', minWidth: 0 },
  caption: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightRegular },
  item: {
    display: 'flex',
    columnGap: '10px',
    alignItems: 'center',
    padding: '8px',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground1,
    cursor: 'grab',
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover, ...shorthands.borderColor(tokens.colorNeutralStroke1) },
  },
  itemUsed: {
    opacity: 0.45,
    cursor: 'default',
    ':hover': { backgroundColor: tokens.colorNeutralBackground1, ...shorthands.borderColor(tokens.colorNeutralStroke2) },
  },
  body: { flexGrow: 1, minWidth: 0 },
  line: {
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
  },
})

/** 一度に表示する件数(商品が大量でも、重くならないように)。続きは「さらに表示」で出す */
const PAGE = 20

const trendMark = (label?: string) => (label === '上昇' ? '▲ ' : label === '下降' ? '▼ ' : '— ') + optionLabel(label === '上昇' || label === '下降' ? label : '横ばい')

export function Candidates({ products, usedIds, onAdd, onPick, pickedId, pickHint, marks, onDetail }: Props) {
  const t = useT()
  const styles = useStyles()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [limit, setLimit] = useState(PAGE)

  const categories = useMemo(() => [...new Set(products.map((p) => p.category_name).filter(Boolean))] as string[], [products])
  // 商品が大量にあるので、検索語かカテゴリを指定するまでは、一覧を出さない
  const searching = query.trim() !== '' || category !== ''
  const matched = useMemo(() => {
    if (!searching) return []
    const q = query.trim().toLowerCase()
    return products.filter((p) => {
      if (category && p.category_name !== category) return false
      return !q || `${p.name} ${p.product_code} ${p.description ?? ''}`.toLowerCase().includes(q)
    })
  }, [products, query, category, searching])
  const shown = matched.slice(0, limit)

  return (
    <div className={styles.root}>
      <SearchField
        placeholder={t('商品名・コード・説明で検索', 'Search by name, code or description')}
        value={query}
        count={searching ? matched.length : undefined}
        onChange={(v) => {
          setQuery(v)
          setLimit(PAGE)
        }}
      />
      <FilterChips
        allLabel={t('すべて', 'All')}
        toggle
        options={categories.map((c) => ({ value: c, label: optionLabel(c) }))}
        value={category}
        onChange={(c) => {
          setCategory(c)
          setLimit(PAGE)
        }}
      />
      {!searching ? (
        <Caption1 className={styles.caption}>
          {t(`商品名・コードで検索するか、カテゴリを選ぶと、商品が表示されます(対象 ${products.length}件)。`, `Search by name or code, or pick a category, to see products (${products.length} available).`)}
        </Caption1>
      ) : (
        <Caption1 className={styles.caption}>
          {onPick ? (pickHint ?? t('押すと、右に詳しい情報が出ます', 'Click to see details on the right')) : t('右のプレビューへドラッグして掲載', 'Drag to the preview on the right to include')}
        </Caption1>
      )}
      {searching && matched.length === 0 && <Caption1 className={styles.caption}>{t('該当する商品がありません。', 'No matching products.')}</Caption1>}
      {shown.map((p) => {
        const used = usedIds.has(p.id)
        return (
          <div
            key={p.id}
            draggable={!used && !onPick}
            role={onPick ? 'button' : undefined}
            tabIndex={onPick ? 0 : undefined}
            onClick={onPick && !used ? () => onPick(p.id) : undefined}
            style={onPick ? { cursor: used ? 'default' : 'pointer', outline: pickedId === p.id ? `2px solid ${tokens.colorBrandStroke1}` : undefined } : undefined}
            onDragStart={(e) => {
              e.dataTransfer.setData(DND_PRODUCT, p.id)
              e.dataTransfer.effectAllowed = 'copy'
            }}
            className={mergeClasses(styles.item, used && styles.itemUsed)}
          >
            {onPick && onDetail && !used ? (
              <ProductThumbButton src={productImage(p)} name={p.name} width={48} height={64} onClick={() => onDetail(p.id)} />
            ) : (
              <ImageThumb src={productImage(p)} alt={p.name} width={48} height={64} />
            )}
            <div className={styles.body}>
              <Text weight="semibold" size={300} truncate wrap={false} block>{p.name}</Text>
              <Caption1 className={styles.line}>
                {p.product_code} ・ {yen(p.price, productMarket(p))} ・ {t('在庫', 'Stock ')}{p.stock ?? '—'}
              </Caption1>
              <Caption1 className={styles.line}>
                {trendMark(p.sales_trend_name)} ・ ★{p.rating ?? '—'} ・ {optionLabel(p.weather_name)}
              </Caption1>
              {marks?.(p)}
            </div>
            {used ? (
              <Badge appearance="tint" color="informative">{t('掲載中', 'Included')}</Badge>
            ) : onPick ? null : (
              <Button size="small" appearance="subtle" icon={<AddRegular />} onClick={() => onAdd(p.id)} aria-label={t('足す', 'Add')} />
            )}
          </div>
        )
      })}
      {matched.length > shown.length && (
        <Button size="small" appearance="outline" onClick={() => setLimit(limit + PAGE)}>
          {t(`さらに表示(残り ${matched.length - shown.length}件)`, `Show more (${matched.length - shown.length} left)`)}
        </Button>
      )}
    </div>
  )
}
