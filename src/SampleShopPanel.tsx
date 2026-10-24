// 設定の画面の「開発・管理」→「見本の商品ページ」(X76)。見本の EC サイトに出している商品と、そのページに載っている画像の一覧。
// 見本の写真(B12)を取り込んだあと、どの商品のページに・どの写真が・どんな説明で載っているかを、ページを 1 つずつ開かずに見渡すため。
// 開発用の画面(/dev/ の「画像の一覧」)は本番では無効なので、設定の画面の中に、表 product_images をそのまま読んで出す(読むだけ)
import { useEffect, useMemo, useState } from 'react'
import { Badge, Button, Link, MessageBar, MessageBarBody, SearchBox, Spinner, Switch, Tooltip, makeStyles, tokens } from '@fluentui/react-components'
import { ArrowClockwiseRegular, OpenRegular } from '@fluentui/react-icons'
import { ProductImagesService } from './data/productImages'
import type { ProductImage } from './models/productImages'
import type { Product } from './models/products'
import { appPath } from './appRoot'
import { useT } from './i18n'

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalS, minHeight: 0, flexGrow: 1 },
  bar: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS, flexWrap: 'wrap' },
  search: { width: '260px' },
  counts: { marginLeft: 'auto', fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  list: { display: 'flex', flexDirection: 'column', overflowY: 'auto', minHeight: 0, flexGrow: 1 },
  item: { display: 'grid', gridTemplateColumns: 'minmax(160px, 220px) 1fr', columnGap: tokens.spacingHorizontalL, padding: `${tokens.spacingVerticalM} 0`, borderBottom: `1px solid ${tokens.colorNeutralStroke3}` },
  info: { display: 'flex', flexDirection: 'column', rowGap: '4px', minWidth: 0 },
  // 見出し 13px 中太 / ラベル 12px 薄いグレー(文字の階層)
  name: { fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold, overflowWrap: 'anywhere' },
  label: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  tags: { display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' },
  photos: { display: 'flex', gap: tokens.spacingHorizontalM, flexWrap: 'wrap', minWidth: 0 },
  photo: { display: 'flex', flexDirection: 'column', rowGap: '4px', width: '132px' },
  // 写真は切らずに全体を見せる(contain)。大きく見るときは、マウスを載せる
  thumb: { width: '132px', height: '176px', objectFit: 'contain', backgroundColor: tokens.colorNeutralBackground3, borderRadius: tokens.borderRadiusSmall, display: 'block' },
  big: { display: 'block', maxWidth: '360px', maxHeight: '480px', objectFit: 'contain' },
  caption: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground2, lineHeight: tokens.lineHeightBase200, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' },
  none: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, alignSelf: 'center' },
})

interface Props {
  products: Product[]
}

/** 見本の商品ページの URL(サーバーがその場で作る。ccp/product_pages.py) */
const pageOf = (code: string) => appPath(`/sample-shop/p/${encodeURIComponent(code)}`)

export function SampleShopPanel({ products }: Props) {
  const s = useStyles()
  const t = useT()
  const [images, setImages] = useState<ProductImage[] | null>(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  // 写真のない商品のページは、色を入れた絵だけなので、ふだんは出さない
  const [all, setAll] = useState(false)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let alive = true
    void (async () => {
      const r = await ProductImagesService.getAll({ orderBy: ['sort_order'] })
      if (!alive) return
      if (r.success) {
        setImages(r.data ?? [])
        setError('')
      } else {
        setImages([])
        setError(r.error?.message ?? String(r.error ?? ''))
      }
    })()
    return () => {
      alive = false
    }
  }, [reload])

  // master = 見本で置き換える前のメイン画像の控え(ページには載らない)。見本の写真(sample)があれば、ページはそれだけを出す
  const byProduct = useMemo(() => {
    const m = new Map<string, ProductImage[]>()
    for (const x of images ?? []) {
      if (!x.product_id || !x.image_url || x.source === 'master') continue
      m.set(x.product_id, [...(m.get(x.product_id) ?? []), x])
    }
    for (const [id, list] of m) {
      const sample = list.filter((x) => x.source === 'sample')
      const shown = sample.length ? sample : list
      // メインを先に(ページの大きい写真)
      m.set(id, [...shown].sort((a, b) => (b.is_main ?? 0) - (a.is_main ?? 0) || (a.sort_order ?? 0) - (b.sort_order ?? 0)))
    }
    return m
  }, [images])

  const q = query.trim().toLowerCase()
  const rows = products
    .filter((p) => p.product_code && (all || byProduct.has(p.id)))
    .filter((p) => !q || `${p.name} ${p.product_code}`.toLowerCase().includes(q))
    .sort((a, b) => (a.market ?? '').localeCompare(b.market ?? '') || (a.product_code ?? '').localeCompare(b.product_code ?? ''))
  const withPhotos = products.filter((p) => byProduct.has(p.id)).length
  const photoCount = [...byProduct.values()].reduce((n, l) => n + l.length, 0)

  const kindName = (x: ProductImage) =>
    x.is_main
      ? t('メイン', 'Main')
      : ({
          front: t('正面', 'Front'),
          back: t('後ろ', 'Back'),
          worn: t('着用', 'Worn'),
          detail: t('ディテール', 'Detail'),
          texture: t('素材', 'Material'),
          scene: t('場面', 'Scene'),
        })[x.angle ?? ''] ??
        x.angle ??
        t('その他', 'Other')

  return (
    <div className={s.root}>
      <div className={s.bar}>
        <SearchBox className={s.search} size="small" value={query} onChange={(_, d) => setQuery(d.value)} placeholder={t('商品名・コードで探す', 'Search by name or code')} />
        <Switch checked={all} onChange={(_, d) => setAll(d.checked)} label={t('写真のない商品も出す', 'Include products without photos')} />
        <Button size="small" appearance="subtle" icon={<ArrowClockwiseRegular />} onClick={() => setReload((n) => n + 1)}>
          {t('読み直す', 'Reload')}
        </Button>
        <span className={s.counts}>{t(`写真のある商品 ${withPhotos} 件・写真 ${photoCount} 枚`, `${withPhotos} products with photos, ${photoCount} photos`)}</span>
      </div>
      {error && (
        <MessageBar intent="error" layout="multiline">
          <MessageBarBody>{t(`商品の画像を読めませんでした: ${error}`, `Could not load product images: ${error}`)}</MessageBarBody>
        </MessageBar>
      )}
      {images === null ? (
        <Spinner size="small" label={t('読み込んでいます…', 'Loading…')} />
      ) : rows.length === 0 ? (
        <span className={s.none}>
          {withPhotos === 0
            ? t('見本の写真がまだありません(⚙ →「見本のデータ」→ 商品の写真の ZIP を取り込む)。', 'No sample photos yet (⚙ → Sample data → import the product photo ZIP).')
            : t('当てはまる商品がありません。', 'No matching products.')}
        </span>
      ) : (
        <div className={s.list}>
          {rows.map((p) => {
            const photos = byProduct.get(p.id) ?? []
            const code = p.product_code as string
            return (
              <div key={p.id} className={s.item}>
                <div className={s.info}>
                  <Link className={s.name} href={pageOf(code)} target="_blank" rel="noreferrer">
                    {p.name}
                  </Link>
                  <span className={s.tags}>
                    <span className={s.label}>{code}</span>
                    <Badge size="small" appearance="outline">
                      {p.market || 'JP'}
                    </Badge>
                    {photos.some((x) => x.source === 'sample') && (
                      <Badge size="small" appearance="tint" color="informative">
                        {t('見本の写真', 'Sample photos')}
                      </Badge>
                    )}
                  </span>
                  <span>
                    <Button size="small" icon={<OpenRegular />} onClick={() => window.open(pageOf(code), '_blank', 'noreferrer')}>
                      {t('ページを開く', 'Open page')}
                    </Button>
                  </span>
                </div>
                <div className={s.photos}>
                  {photos.length === 0 && <span className={s.none}>{t('写真はありません(ページは色を入れた絵)。', 'No photos (the page shows drawings).')}</span>}
                  {photos.map((x) => (
                    <div key={x.id} className={s.photo}>
                      <Tooltip relationship="description" withArrow positioning="after" content={<img className={s.big} src={appPath(x.image_url as string)} alt="" />}>
                        <img className={s.thumb} src={appPath(x.image_url as string)} alt={x.alt || x.caption || p.name} loading="lazy" />
                      </Tooltip>
                      <span className={s.tags}>
                        <Badge size="small" appearance={x.is_main ? 'filled' : 'tint'}>
                          {kindName(x)}
                        </Badge>
                        {x.model_usable_until && (
                          <Badge size="small" appearance="tint" color="warning">
                            {t(`モデルの期限 ${x.model_usable_until.slice(0, 10)}`, `Model rights ${x.model_usable_until.slice(0, 10)}`)}
                          </Badge>
                        )}
                      </span>
                      {x.alt && <span className={s.label}>{x.alt}</span>}
                      {x.caption && (
                        <span className={s.caption} title={x.caption}>
                          {x.caption}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
