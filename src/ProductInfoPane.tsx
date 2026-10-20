import { Avatar, Badge, Text, makeStyles, tokens } from '@fluentui/react-components'
import type { Product } from './models/products'
import { productImage } from './images'
import { yen, type Candidate, type Item } from './items'
import { optionLabel, useT } from './i18n'
import { productMarket } from './market'
import { ProductFloat, type SwapOption } from './ProductFloat'
import { AlertChip, LowStockBadge } from './ProductMarks'
import { sectionRange, sectionsOf, type EmailTemplateId } from './templates'
import { AlertMark } from './AlertMark'
import { productGenderLabel } from './target'
import type { CardAlertKind } from './cardAlerts'

interface Props {
  template: EmailTemplateId
  sectionTitles: string[]
  items: Item[]
  products: Product[]
  /** 行にマウスが乗ったとき(プレビューの該当商品を光らせるため)。外れたら null */
  onHover: (key: string | null) => void
  /** アラートのある商品(商品 ID → いちばん強い種類)。商品名の前に印を付ける */
  alertKinds?: Map<string, CardAlertKind>
  /** 商品のアラートの印を押したとき(その商品のアラートへの対応を開く) */
  onAlert?: (productId: string) => void
  /** 残りの候補(中ペインと同じ)。渡したときだけ、フロートに「ほかの候補から選ぶ」を出す */
  candidates?: Candidate[]
  /** 選定済みの商品を、残りの候補と入れ替える(配信カードの中で。保存で確定) */
  onSwap?: (itemKey: string, candKey: string, reason: string) => void
}

const useStyles = makeStyles({
  alertChip: { marginTop: '2px' },
  root: { display: 'grid', rowGap: '10px', minWidth: 0 },
  head: { display: 'flex', alignItems: 'center', columnGap: '8px', minWidth: 0 },
  caption: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  sectionHead: {
    display: 'flex',
    alignItems: 'center',
    columnGap: '6px',
    paddingBottom: '4px',
    borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
    minWidth: 0,
  },
  list: { display: 'grid', minWidth: 0 },
  // 一覧の1行: 一覧性を高めるため、画像・名前・コード・価格・在庫・トレンドだけを、2行で見せる
  item: {
    display: 'flex',
    alignItems: 'center',
    columnGap: '8px',
    padding: '6px 4px',
    minWidth: 0,
    cursor: 'pointer',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    ':hover': { backgroundColor: tokens.colorNeutralBackground2 },
  },
  itemOpen: { backgroundColor: tokens.colorBrandBackground2 },
  avatar: { flexShrink: 0, width: '32px', height: '32px', borderRadius: tokens.borderRadiusMedium },
  main: { minWidth: 0, flexGrow: 1, display: 'grid' },
  name: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  sub: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200, fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  trend: { flexShrink: 0, fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold, width: '16px', textAlign: 'center' },
})

/** 売上トレンドの矢印と色 */
function trendMark(name?: string): { mark: string; color: string } {
  if (name === '上昇') return { mark: '↑', color: tokens.colorPaletteGreenForeground1 }
  if (name === '下降') return { mark: '↓', color: tokens.colorPaletteRedForeground1 }
  return { mark: '→', color: tokens.colorNeutralForeground3 }
}

/**
 * 商品情報: プレビューに載っている商品を、メールの並び順に、コンパクトな一覧で見るための参照用のペイン。
 * 行を押すと、商品のフロート(ProductFloat。中ペインの選定済みの行と同じもの)が開き、そこから残りの候補と差し替えられる。
 * 一覧そのものには、操作する部品を置かない(並べ替え・外すは中ペインだけ。X47)。
 */
export function ProductInfoPane({ template, sectionTitles, items, products, onHover, alertKinds, onAlert, candidates, onSwap }: Props) {
  const t = useT()
  const s = useStyles()
  const productById = new Map(products.map((p) => [p.id, p]))
  const sections = sectionsOf(template)

  return (
    <div className={s.root}>
      <div className={s.head}>
        <Text weight="semibold" size={300}>{t('商品情報', 'Product info')}</Text>
        <Badge size="small" appearance="tint" color="informative">{items.length}</Badge>
      </div>
      <span className={s.caption}>{t('メールに載せる商品の一覧です。行を押すと詳細が開きます。', 'Products in the email. Click a row for details.')}</span>

      {items.length === 0 && <span className={s.caption}>{t('まだ商品が選定されていません。', 'No products selected yet.')}</span>}

      {sections.map((sec) => {
        const [from, to] = sectionRange(sections, sec, items.length)
        const list = items.slice(from, to)
        if (list.length === 0) return null
        const label = sec.wantTitle ? sectionTitles[sec.index] || sec.label : sec.label
        const options: SwapOption[] = (candidates ?? []).filter((c) => c.section === sec.index).flatMap((c) => {
          const p = productById.get(c.productId)
          return p ? [{ key: c.key, product: p, reason: c.reason, source: c.source }] : []
        })
        return (
          <section key={sec.index}>
            <div className={s.sectionHead}>
              <Text weight="semibold" size={200}>{label}</Text>
              <Badge size="small" appearance="outline" color="informative">{list.length}</Badge>
            </div>
            <div className={s.list}>
              {list.map((it) => {
                const p = productById.get(it.productId)
                return p ? (
                  <ProductFloat key={it.key} product={p} position="before" swap={onSwap && { options, onSwap: (candKey, reason) => onSwap(it.key, candKey, reason) }}>
                    <ProductItem product={p} itemKey={it.key} onHover={onHover} alert={alertKinds?.get(it.productId)} onAlert={onAlert} />
                  </ProductFloat>
                ) : null
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function ProductItem({ product: p, itemKey, onHover, alert, onAlert }: { product: Product; itemKey: string; onHover: (key: string | null) => void; alert?: CardAlertKind; onAlert?: (productId: string) => void }) {
  const t = useT()
  const s = useStyles()
  const market = productMarket(p)
  const trend = trendMark(p.sales_trend_name)
  return (
    <div className={s.item} onMouseEnter={() => onHover(itemKey)} onMouseLeave={() => onHover(null)} role="button" tabIndex={0}>
      <Avatar shape="square" image={{ src: productImage(p), alt: p.name }} name={p.name} className={s.avatar} />
      <div className={s.main}>
        <Text size={200} weight="semibold" className={s.name}>
          {!onAlert && <AlertMark kind={alert} />}
          {p.name}
        </Text>
        {/* アラートのある商品は、種類のラベル(押すと、そのアラートへの対応を開く。行のクリック = 商品のフロート とは分ける) */}
        {alert && onAlert && <AlertChip kind={alert} onClick={() => onAlert(p.id)} className={s.alertChip} />}
        <span className={s.sub}>
          {p.product_code} ・ {yen(p.price, market)} ・ {t('在庫', 'Stock ')}{p.stock ?? '-'}
          {p.gender && ` ・ ${productGenderLabel(p.gender)}`}
        </span>
      </div>
      <LowStockBadge product={p} />
      <span className={s.trend} style={{ color: trend.color }} title={optionLabel(p.sales_trend_name)}>{trend.mark}</span>
    </div>
  )
}
