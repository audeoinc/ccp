// 店の URL の形(settings.shopurl)の欄。{ } の書き方は見せず、「実際のページの URL を 1 つ貼る」を入口にする(2026-11-02 利用者:
// 「{shop} がわからない」「{product_code} は DB の列を指定する感じで難しい」)。貼った URL の中から、選んだ商品のコード(カテゴリの値・配信の ID)を
// 見つけて形を作り(links.ts の learnUrlPattern)、形は日本語の札で見せる。保存するのは、これまでどおり { } の形の文字列。
// 手で直したい人のために、形を直接書く欄は畳んだ中に残す
import { useState } from 'react'
import { Accordion, AccordionHeader, AccordionItem, AccordionPanel, Field, Input, Select, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { LabeledValue } from './LabeledValue'
import { useT } from './i18n'
import { URL_VALUES, campaignId, categoryUrlByPattern, fillUrl, learnUrlPattern, productUrlByPattern, unfilledValues, urlPatternParts, type UrlValue } from './links'
import { ProductCategory } from './models/products'
import type { Product } from './models/products'
import { typo } from './typo'

const useStyles = makeStyles({
  root: { display: 'grid', rowGap: '16px' },
  block: { display: 'grid', rowGap: '8px', padding: '10px 12px', borderRadius: tokens.borderRadiusMedium, border: `1px solid ${tokens.colorNeutralStroke2}` },
  title: typo.heading,
  pickRow: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 2fr)', columnGap: '8px', alignItems: 'start' },
  // 形の札の並び(URL の決まった部分は等幅の文字、値の入る所は札)
  shape: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', rowGap: '4px', fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase200, overflowWrap: 'anywhere' },
  chip: { display: 'inline-flex', alignItems: 'center', padding: '0 6px', margin: '0 1px', borderRadius: tokens.borderRadiusSmall, fontFamily: tokens.fontFamilyBase, fontSize: tokens.fontSizeBase200, lineHeight: '20px', whiteSpace: 'nowrap' },
  // 店の URL: どの商品でも同じ
  chipFixed: { backgroundColor: tokens.colorNeutralBackground3, color: tokens.colorNeutralForeground2 },
  // 商品・カテゴリ・配信ごとに変わる所
  chipVaries: { backgroundColor: tokens.colorBrandBackground2, color: tokens.colorBrandForeground1, fontWeight: tokens.fontWeightSemibold },
  samples: { margin: 0, paddingLeft: '18px', display: 'grid', rowGap: '2px', fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground2, overflowWrap: 'anywhere' },
  note: typo.caption,
  ok: { fontSize: tokens.fontSizeBase200, color: tokens.colorPaletteGreenForeground1 },
  raw: { display: 'grid', rowGap: '8px' },
})

export type PatternKey = 'productUrlPattern' | 'categoryUrlPattern' | 'campaignUrlPattern'

interface Props {
  /** いま使われる形(空の欄は代わりの値) */
  patterns: Record<PatternKey, string>
  /** 変えている途中の値(直接書く欄に出す) */
  draft: Partial<Record<PatternKey, string>>
  /** 空の欄で使われる形(直接書く欄の薄い字) */
  fallback: Record<PatternKey, string>
  /** 店の URL(上の欄の値。空なら代わりの値) */
  shop: string
  /** 選べる商品(その国の市場の商品。全社なら、すべての商品) */
  products: Product[]
  /** 見本の URL に入れる国のコード */
  country: string
  onChange: (key: PatternKey, pattern: string) => void
}

export function UrlPatternFields({ patterns, draft, fallback, shop, products, country, onChange }: Props) {
  const s = useStyles()
  const t = useT()
  const valueName = (v: UrlValue | string) =>
    v === 'shop'
      ? t('店の URL', 'Shop URL')
      : v === 'product_code'
        ? t('商品コード', 'Product code')
        : v === 'category'
          ? t('カテゴリ', 'Category')
          : v === 'campaign'
            ? t('配信の ID', 'Delivery ID')
            : v === 'country'
              ? t('国のコード', 'Country code')
              : v
  /** 形を札で出す({ } は見せない) */
  const Shape = ({ pattern }: { pattern: string }) => (
    <span className={s.shape}>
      {urlPatternParts(pattern).map((part, i) =>
        'text' in part ? (
          <span key={i}>{part.text}</span>
        ) : (
          <span key={i} className={mergeClasses(s.chip, part.value === 'shop' ? s.chipFixed : s.chipVaries)}>
            {valueName(part.value)}
          </span>
        ),
      )}
    </span>
  )

  const cats = Object.keys(ProductCategory) as (keyof typeof ProductCategory)[]
  const today = new Date().toISOString()
  const campaigns = [campaignId('1a2b3c4d', today), campaignId('5e6f7a8b', today), campaignId('9c0d1e2f', today)]
  const [productId, setProductId] = useState('')
  const [category, setCategory] = useState<string>(cats[0])
  const picked = products.find((p) => p.id === productId && p.product_code) ?? products.find((p) => p.product_code)
  const others = products.filter((p) => p.product_code && p.id !== picked?.id).slice(0, 2)

  const blocks: {
    key: PatternKey
    token: UrlValue
    title: string
    /** 探す値と、その名前(見つからないときの文に出す) */
    value: string
    picker: React.ReactNode
    pasteLabel: string
    samples: { label: string; url: string }[]
    notFound: string
  }[] = [
    {
      key: 'productUrlPattern',
      token: 'product_code',
      title: t('商品ページ', 'Product page'),
      value: picked?.product_code ?? '',
      picker: (
        <Field label={t('商品を 1 つ選ぶ', 'Pick a product')} size="small">
          <Select size="small" value={picked?.id ?? ''} onChange={(_, d) => setProductId(d.value)}>
            {products
              .filter((p) => p.product_code)
              .slice(0, 200)
              .map((p) => (
                <option key={p.id} value={p.id}>{`${p.product_code} ${p.name}`}</option>
              ))}
          </Select>
        </Field>
      ),
      pasteLabel: t('その商品の、自社のサイトでのページの URL を貼る', 'Paste that product’s page URL on your site'),
      samples: others.map((p) => ({ label: p.product_code ?? '', url: productUrlByPattern(patterns.productUrlPattern, shop, p.product_code ?? '', country) })),
      notFound: t(
        `この URL の中に、選んだ商品のコード(${picked?.product_code ?? ''})が見つかりません。サイトの URL が商品コード以外の番号を使っている場合は、商品ごとの URL(page_url)を取り込んでください。`,
        `The selected product’s code (${picked?.product_code ?? ''}) is not in this URL. If your site uses a number other than the product code, import a URL per product (page_url).`,
      ),
    },
    {
      key: 'categoryUrlPattern',
      token: 'category',
      title: t('カテゴリのページ', 'Category page'),
      value: category,
      picker: (
        <Field label={t('カテゴリを 1 つ選ぶ', 'Pick a category')} size="small">
          <Select size="small" value={category} onChange={(_, d) => setCategory(d.value)}>
            {cats.map((c) => (
              <option key={c} value={c}>
                {t(`${c}(${ProductCategory[c]})`, c)}
              </option>
            ))}
          </Select>
        </Field>
      ),
      pasteLabel: t(`そのカテゴリのページの URL を貼る(URL の中に「${category}」が入っているもの)`, `Paste that category’s page URL (it should contain “${category}”)`),
      samples: cats
        .filter((c) => c !== category)
        .slice(0, 2)
        .map((c) => ({ label: c, url: categoryUrlByPattern(patterns.categoryUrlPattern, shop, c, country) })),
      notFound: t(
        `この URL の中に、カテゴリの値「${category}」が見つかりません。サイトのカテゴリの URL が別の名前を使っている場合は、開発に伝えてください(カテゴリの対応表を足します)。`,
        `The category value “${category}” is not in this URL. If your site names categories differently, tell the developers (a category mapping will be added).`,
      ),
    },
    {
      key: 'campaignUrlPattern',
      token: 'campaign',
      title: t('配信(キャンペーン)のページ', 'Campaign page'),
      value: campaigns[0],
      picker: (
        <LabeledValue label={t('見本の配信の ID', 'Sample delivery ID')} layout="stacked" copy>
          {campaigns[0]}
        </LabeledValue>
      ),
      pasteLabel: t('この配信の ID を入れた、配信のページの URL を貼る', 'Paste a campaign page URL that contains this delivery ID'),
      samples: campaigns.slice(1).map((c) => ({ label: c, url: fillUrl(patterns.campaignUrlPattern, { shop, campaign: c, country }) })),
      notFound: t(`この URL の中に、配信の ID(${campaigns[0]})が見つかりません。`, `The delivery ID (${campaigns[0]}) is not in this URL.`),
    },
  ]

  return (
    <div className={s.root}>
      {blocks.map((b) => (
        <PatternBlock key={b.key} block={b} pattern={patterns[b.key]} shop={shop} Shape={Shape} onLearn={(p) => onChange(b.key, p)} />
      ))}
      {/* 形を直接書く(手で直したい人のため)。札の名前と { } の対応を、ここでだけ見せる */}
      <Accordion collapsible>
        <AccordionItem value="raw">
          <AccordionHeader size="small">{t('形を直接書く', 'Write the pattern directly')}</AccordionHeader>
          <AccordionPanel>
            <div className={s.raw}>
              <span className={s.note}>
                {t(
                  `札は、書くときは次の名前にします: 店の URL = {shop}・商品コード = {product_code}・カテゴリ = {category}・配信の ID = {campaign}・国のコード = {country}`,
                  `When writing, use these names: Shop URL = {shop}, Product code = {product_code}, Category = {category}, Delivery ID = {campaign}, Country code = {country}`,
                )}
              </span>
              {blocks.map((b) => {
                const bad = unfilledValues(patterns[b.key], URL_VALUES[b.key === 'productUrlPattern' ? 'product' : b.key === 'categoryUrlPattern' ? 'category' : 'campaign'])
                return (
                  <Field
                    key={b.key}
                    label={b.title}
                    size="small"
                    validationState={bad.length ? 'warning' : 'none'}
                    validationMessage={bad.length ? t(`この形では使えない値があります: ${bad.map((k) => `{${k}}`).join('・')}`, `Values that cannot be used here: ${bad.map((k) => `{${k}}`).join(', ')}`) : undefined}
                  >
                    <Input value={draft[b.key] ?? ''} placeholder={fallback[b.key]} onChange={(_, d) => onChange(b.key, d.value)} />
                  </Field>
                )
              })}
            </div>
          </AccordionPanel>
        </AccordionItem>
      </Accordion>
    </div>
  )
}

/** 1 つの形(商品・カテゴリ・配信): 選ぶ → URL を貼る → 形(札)と見本 */
function PatternBlock({
  block,
  pattern,
  shop,
  Shape,
  onLearn,
}: {
  block: { key: PatternKey; token: UrlValue; title: string; value: string; picker: React.ReactNode; pasteLabel: string; samples: { label: string; url: string }[]; notFound: string }
  pattern: string
  shop: string
  Shape: (p: { pattern: string }) => React.ReactNode
  onLearn: (pattern: string) => void
}) {
  const s = useStyles()
  const t = useT()
  const [url, setUrl] = useState('')
  const learned = url.trim() ? learnUrlPattern(url, block.value, block.token, shop) : null
  const failed = !!url.trim() && !learned
  const notUrl = !!url.trim() && !/^https?:\/\//i.test(url.trim())
  const paste = (v: string) => {
    setUrl(v)
    const got = v.trim() && /^https?:\/\//i.test(v.trim()) ? learnUrlPattern(v, block.value, block.token, shop) : null
    if (got) onLearn(got.pattern)
  }
  return (
    <div className={s.block}>
      <span className={s.title}>{block.title}</span>
      <div className={s.pickRow}>
        {block.picker}
        <Field
          label={block.pasteLabel}
          size="small"
          validationState={notUrl || failed ? 'warning' : 'none'}
          validationMessage={notUrl ? t('https:// から始まる URL を貼ってください', 'Paste a URL starting with https://') : failed ? block.notFound : undefined}
        >
          <Input value={url} placeholder="https://" onChange={(_, d) => paste(d.value)} />
        </Field>
      </div>
      {learned && !notUrl && (
        <span className={s.ok}>
          {t('URL の中の値を見つけて、形を作りました(保存するまで、ほかの人には効きません)。', 'Found the value in the URL and made the pattern (it takes effect for others after you save).')}
          {learned.caseDiffers && t(' サイトの URL では大文字・小文字が違います。組み立てる URL は、CCP の値のままになります。', ' The site uses different letter case; built URLs use CCP’s value as-is.')}
          {!learned.shopMatched && t(' 先頭が上の「店の URL」と違うので、そのまま使います。', ' The start differs from the shop URL above, so it is kept as is.')}
        </span>
      )}
      <LabeledValue label={t('いまの形(色の札は、商品ごとに変わる所)', 'Current pattern (colored tags change per item)')} layout="stacked">
        <Shape pattern={pattern} />
      </LabeledValue>
      <LabeledValue label={t('この形で組み立てた URL の見本', 'Sample URLs built with this pattern')} layout="stacked">
        <ul className={s.samples}>
          {block.samples.map((x) => (
            <li key={x.label}>{x.url}</li>
          ))}
        </ul>
      </LabeledValue>
    </div>
  )
}
