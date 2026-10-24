import { Avatar, Badge, InfoLabel, Text, makeStyles, tokens } from '@fluentui/react-components'
import type { Product } from './models/products'
import { productImage } from './images'
import { yen, type Item } from './items'
import { tr, useT } from './i18n'
import { productMarket } from './market'
import { ProductFloat } from './ProductFloat'
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
  /** 行を押したとき(商品の対応のフロートを開く。X54) */
  onOpenProduct?: (itemKey: string) => void
  /** 一覧の使い方(見出しの横の ⓘ に出す。シンプルな配信カードでは、枠を選んでからの見比べも書く) */
  hint?: string
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
  legend: { display: 'grid', rowGap: '6px', maxWidth: '280px', fontSize: tokens.fontSizeBase200 },
  legendHead: { fontWeight: tokens.fontWeightSemibold, marginTop: '2px' },
  legendSub: { color: tokens.colorNeutralForeground3 },
  trend: { flexShrink: 0, fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold, width: '16px', textAlign: 'center' },
})

// 売れ行きの比べ方(docs/BIGQUERY_EXPORT.md の sales_trend の ※2: 直近 4 週の販売数を、その前の 4 週と比べる)
const trendBasis = () => tr('直近 4 週の販売数を、その前の 4 週と比べて', 'units sold in the last 4 weeks vs the 4 weeks before')

/** 売れ行きの矢印と色。説明は「売れ行き: 上がっている(…と比べて)」のように、何の矢印かが分かる文にする(X72。「上昇」だけでは分からなかった) */
function trendMark(name?: string): { mark: string; color: string; text: string } {
  if (name === '上昇') return { mark: '↑', color: tokens.colorPaletteGreenForeground1, text: tr(`売れ行き: 上がっている(${trendBasis()})`, `Sales: rising (${trendBasis()})`) }
  if (name === '下降') return { mark: '↓', color: tokens.colorPaletteRedForeground1, text: tr(`売れ行き: 下がっている(${trendBasis()})`, `Sales: falling (${trendBasis()})`) }
  return { mark: '→', color: tokens.colorNeutralForeground3, text: tr(`売れ行き: 横ばい(${trendBasis()})`, `Sales: flat (${trendBasis()})`) }
}

/**
 * 商品情報: プレビューに載っている商品を、メールの並び順に、コンパクトな一覧で見るための参照用のペイン。
 * 行を押すと、商品のフロート(ProductFloat。中ペインの選定済みの行と同じもの)が開き、そこから残りの候補と差し替えられる。
 * 一覧そのものには、操作する部品を置かない(並べ替え・外すは中ペインだけ。X47)。
 */
export function ProductInfoPane({ template, sectionTitles, items, products, onHover, alertKinds, onAlert, onOpenProduct, hint }: Props) {
  const t = useT()
  const s = useStyles()
  const productById = new Map(products.map((p) => [p.id, p]))
  const sections = sectionsOf(template)

  return (
    <div className={s.root}>
      <div className={s.head}>
        {/* 一覧の使い方と印の意味は、見出しの横の ⓘ に(X72。見出しの下に説明の文を並べない。各行に「売れ行き」とは書かない) */}
        <InfoLabel
          size="medium"
          weight="semibold"
          info={
            <div className={s.legend}>
              <span>{hint ?? t('メールに載せる商品の一覧です。行を押すと詳細が開きます。', 'Products in the email. Click a row for details.')}</span>
              <span className={s.legendHead}>{t('右端の印', 'Marks on the right')}</span>
              <span>
                <b style={{ color: tokens.colorPaletteGreenForeground1 }}>↑</b> {t('売れ行きが上がっている', 'Sales rising')} · <b style={{ color: tokens.colorPaletteRedForeground1 }}>↓</b> {t('下がっている', 'falling')} · <b>→</b> {t('横ばい', 'flat')}
              </span>
              <span className={s.legendSub}>{t(`売れ行きは、${trendBasis()}`, `Sales trend: ${trendBasis()}`)}</span>
              <span>{t('「残少」= 在庫が少ない。商品名の前の印 = この配信のアラート(在庫切れの見込みなど)', '“Low” = low stock. The mark before a name = an alert for this delivery (e.g. likely out of stock)')}</span>
            </div>
          }
        >
          {t('商品情報', 'Product info')}
        </InfoLabel>
        <Badge size="small" appearance="tint" color="informative">{items.length}</Badge>
      </div>

      {items.length === 0 && <span className={s.caption}>{t('まだ商品が選定されていません。', 'No products selected yet.')}</span>}

      {sections.map((sec) => {
        const [from, to] = sectionRange(sections, sec, items.length)
        const list = items.slice(from, to)
        if (list.length === 0) return null
        const label = sec.wantTitle ? sectionTitles[sec.index] || sec.label : sec.label
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
                  <ProductFloat key={it.key} onOpen={onOpenProduct && (() => onOpenProduct(it.key))}>
                    <ProductItem product={p} image={it.imageUrl} itemKey={it.key} onHover={onHover} alert={alertKinds?.get(it.productId)} onAlert={onAlert} />
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

function ProductItem({ product: p, image, itemKey, onHover, alert, onAlert }: { product: Product; image?: string; itemKey: string; onHover: (key: string | null) => void; alert?: CardAlertKind; onAlert?: (productId: string) => void }) {
  const t = useT()
  const s = useStyles()
  const market = productMarket(p)
  const trend = trendMark(p.sales_trend_name)
  return (
    <div className={s.item} onMouseEnter={() => onHover(itemKey)} onMouseLeave={() => onHover(null)} role="button" tabIndex={0}>
      <Avatar shape="square" image={{ src: productImage(p, image), alt: p.name }} name={p.name} className={s.avatar} />
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
      <span className={s.trend} style={{ color: trend.color }} title={trend.text} aria-label={trend.text}>{trend.mark}</span>
    </div>
  )
}
