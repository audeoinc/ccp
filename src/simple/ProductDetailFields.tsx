// 商品の枠の見せ方「詳しく見せる」(X80)。部品のペインのいちばん上(商品の箱より上)に、スイッチ 1 つで置く
// (2026-10-30 利用者: 横長のボタン・2 つのタブは、ほかの欄の設定に見えて分かりにくかった。オン / オフなら 2 択とすぐ分かる。
// 商品を決める前に決める枠の設定なので、商品より上に)。
// オンにすると、その枠だけ横いっぱいの行(写真 + 見出し + 長い説明)になり、すぐ下に見出し・説明文の欄が出る。ふつうに戻すと、見出し・説明文も消える。
// 商品を入れ替えても「詳しく」のまま(見出し・説明文は前の商品のものなので空にする)。
// 枠の数・順番は変えない。
// 見出し・説明文は「AI で変える」で、商品ページの本文(productPageText。段 ②)から AI に書いてもらえる(段 ③)。ほかの文の部品と同じ、試す → 確定。
// 書く人の画面だけ、説明文のうちページの文と重なる所に薄く印を付ける(表示のたびに計算し、保存しない)
import { useEffect, useState } from 'react'
import { Field, InfoLabel, Input, Switch, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { AutoTextarea } from '../AutoTextarea'
import { useT } from '../i18n'
import { typo } from '../typo'
import type { Item } from '../items'
import type { Product } from '../models/products'
import { ProductImagesService } from '../data/productImages'
import { productPageText, type ProductPageText } from '../productPageText'
import { useFeature } from '../featureFlags'
import { FeatureBadge } from '../FeatureBadge'
import { TextAiPanel } from './TextAiPanel'
import { askProductDetail, joinDetail, splitDetail } from './partAi'
import { pageOverlaps } from './pageOverlap'
import type { SimpleEditor } from './editor'

const useStyles = makeStyles({
  toggle: { display: 'flex', alignItems: 'center', columnGap: '2px' },
  // 補足は、スイッチの名前の書き出しにそろえる(スイッチの印のぶん字下げ)。上の行に詰める
  sub: { ...typo.label, marginTop: '-8px', paddingLeft: '60px' },
  fields: { display: 'grid', rowGap: '8px', padding: '10px 12px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground2 },
  note: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  count: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, justifySelf: 'end' },
  // ⓘ の中身(何に使うか・どう見えるか・書き方の目安)
  // 札の横の小さく薄い字の決まりを引き継がないように、折り返し・字の大きさを決め直す
  info: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', rowGap: '8px', width: '256px', whiteSpace: 'normal', color: tokens.colorNeutralForeground1, fontSize: tokens.fontSizeBase200, lineHeight: tokens.lineHeightBase200 },
  infoHead: { fontWeight: tokens.fontWeightSemibold },
  infoList: { margin: 0, paddingLeft: '16px', display: 'grid', rowGap: '2px' },
  // 見取り図の色(メールの中身ではなく画面の図なので、tokens の色)
  pic: { width: '100%', height: 'auto', display: 'block', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground2 },
  picBox: { fill: tokens.colorNeutralBackground1, stroke: tokens.colorNeutralStroke2 },
  picDetail: { fill: tokens.colorNeutralBackground1, stroke: tokens.colorBrandStroke1, strokeWidth: 1.5 },
  picPhoto: { fill: tokens.colorNeutralStroke1 },
  picLine: { fill: tokens.colorNeutralStroke2 },
  picHead: { fill: tokens.colorNeutralForeground3 },
  picText: { fill: tokens.colorNeutralForeground3, fontSize: '9px' },
  picTextOn: { fill: tokens.colorBrandForeground1, fontSize: '9px', fontWeight: 600 },
  aiRow: { display: 'flex', alignItems: 'center', columnGap: '6px', flexWrap: 'wrap' },
  // AI の案の見せ方(見出しを太く、説明文はそのまま)
  ideaTitle: { fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase300 },
  ideaBody: { fontSize: tokens.fontSizeBase200, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
  // ページと重なる所の見比べ(説明文をもう一度、印つきで)
  overlap: { display: 'grid', rowGap: '4px' },
  overlapText: { ...typo.label, color: tokens.colorNeutralForeground2, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: '160px', overflowY: 'auto' },
  on: { backgroundColor: tokens.colorBrandBackground2, borderRadius: '2px' },
})

// 商品ごとに 1 回だけ読む(枠を選び直すたびにページを読みに行かないように)
const pageCache = new Map<string, Promise<ProductPageText | null>>()
const pageOf = (product: Product) => {
  let p = pageCache.get(product.id)
  if (!p) {
    p = productPageText(product)
    pageCache.set(product.id, p)
  }
  return p
}

/** 枠に使う写真の説明(alt・caption)。この配信で選んだ画像、なければメインの画像 */
async function imageNoteOf(product: Product, imageUrl?: string): Promise<{ alt?: string; caption?: string } | undefined> {
  const r = await ProductImagesService.getAll({ filter: `product_id eq '${product.id}'`, orderBy: ['sort_order'] })
  const rows = r.success ? (r.data ?? []) : []
  const hit = (imageUrl && rows.find((x) => x.image_url && imageUrl.endsWith(x.image_url))) || rows.find((x) => x.is_main === 1)
  return hit ? { alt: hit.alt, caption: hit.caption } : undefined
}

/** ⓘ の見取り図: ふつうの枠(写真・名前・価格)が 2 つ並ぶ間に、「詳しく」の枠だけが横いっぱいの行(左に写真、右に見出し + 説明文) */
function DetailPicture() {
  const s = useStyles()
  const t = useT()
  const normal = (x: number, y: number) => (
    <g key={`${x}-${y}`}>
      <rect className={s.picBox} x={x} y={y} width={118} height={44} rx={3} />
      <rect className={s.picPhoto} x={x + 6} y={y + 6} width={32} height={32} rx={2} />
      <rect className={s.picLine} x={x + 44} y={y + 12} width={52} height={5} rx={2} />
      <rect className={s.picLine} x={x + 44} y={y + 23} width={30} height={5} rx={2} />
    </g>
  )
  return (
    <svg className={s.pic} viewBox="0 0 260 176" role="img" aria-label={t('見取り図: ふつうの枠の間に、詳しくの枠が横いっぱいの行で入る', 'Sketch: a detail slot spans the full row between normal slots')}>
      <text className={s.picText} x={8} y={13}>{t('ふつう', 'Normal')}</text>
      {normal(8, 18)}
      {normal(134, 18)}
      <text className={s.picTextOn} x={8} y={77}>{t('詳しく', 'Detail')}</text>
      <rect className={s.picDetail} x={8} y={82} width={244} height={66} rx={3} />
      <rect className={s.picPhoto} x={14} y={88} width={54} height={54} rx={2} />
      <rect className={s.picHead} x={76} y={92} width={110} height={7} rx={2} />
      {[106, 115, 124, 133].map((y, i) => (
        <rect key={y} className={s.picLine} x={76} y={y} width={i === 3 ? 100 : 168} height={5} rx={2} />
      ))}
      <text className={s.picText} x={8} y={166}>{t('ふつうの枠は、そのまま続く', 'Normal slots continue as before')}</text>
    </svg>
  )
}

/** 説明文の目安の長さ(見出し 1 行 + 本文 200〜400 字くらい。利用者と決めた) */
const BODY_MIN = 200
const BODY_MAX = 400

export function ProductDetailFields({ item, product, e, onChange, detailCount }: { item: Item; product?: Product; e: SimpleEditor; onChange: (detail: Item['detail'] | null) => void; detailCount: number }) {
  const s = useStyles()
  const t = useT()
  const aiOn = useFeature('ai.text')
  const len = item.detail?.body.length ?? 0
  // 商品ページの本文(AI の材料と、重なる所の印)。「詳しく」のときだけ読む
  const [page, setPage] = useState<{ productId: string; page: ProductPageText | null } | null>(null)
  const on = !!item.detail
  useEffect(() => {
    if (!on || !product) return
    let alive = true
    void pageOf(product).then((x) => alive && setPage({ productId: product.id, page: x }))
    return () => {
      alive = false
    }
  }, [on, product])
  const pageText = page && page.productId === product?.id ? page.page : null
  const body = item.detail?.body ?? ''
  const overlaps = pageText && body.trim() ? pageOverlaps(body, pageText.text) : []
  return (
    <>
      <div className={s.toggle}>
        <Switch
          checked={!!item.detail}
          label={t('素材・機能を詳しく見せる', 'Show materials and features in detail')}
          onChange={(_, d) => onChange(d.checked ? { title: item.detail?.title ?? '', body: item.detail?.body ?? '' } : null)}
        />
        {/* 何に使うか・どう見えるかを ⓘ に(2026-10-30 利用者: 素材や機能をアピールする枠なので、そういう内容と、見た目のイメージを) */}
        <InfoLabel
          size="small"
          info={
            <div className={s.info}>
              <span>
                {t(
                  '素材や機能の強み(撥水・保温・肌ざわり など)を、写真と長めの説明でしっかり伝えたい商品に使う枠です。ふつうの枠は、写真・名前・価格だけです。',
                  'Use this for a product whose material or function (water-repellent, warmth, feel, etc.) you want to sell with a photo and a longer description. A normal slot shows only the photo, name and price.',
                )}
              </span>
              <DetailPicture />
              <span className={s.infoHead}>{t('書き方の目安', 'Writing tips')}</span>
              <ul className={s.infoList}>
                <li>{t(`見出し 1 行 + 説明文 ${BODY_MIN}〜${BODY_MAX} 字くらい`, `A one-line heading + about ${BODY_MIN}–${BODY_MAX} characters`)}</li>
                <li>{t('商品ページに書いてあることだけを書く', 'Write only what the product page says')}</li>
                <li>{t('「詳しく」が 3 つ以上あると、メールが長くなります', 'Three or more detail slots make the email long')}</li>
              </ul>
              <span>{t('枠の数・順番は変わりません。この枠だけが横いっぱいの行になります。', 'The number and order of slots stay the same; only this slot becomes a full-width row.')}</span>
            </div>
          }
        />
      </div>
      {/* 名前だけでは分かりにくいので、名前の下に小さく薄く補足(2026-10-30 利用者) */}
      <span className={s.sub}>{t('この枠だけ横いっぱいに、写真と説明文で', 'Just this slot, full width, with a photo and description')}</span>
      {item.detail && (
        <div className={s.fields}>
          <Field label={t('見出し', 'Heading')} size="small">
            <Input size="small" value={item.detail.title} placeholder={t('例: 軽くて暖かい、ふっくらした中わた', 'e.g. Light, warm, and lofty fill')} onChange={(_, d) => onChange({ title: d.value, body: item.detail?.body ?? '' })} />
          </Field>
          <Field label={t('説明文', 'Description')} hint={t(`${BODY_MIN}〜${BODY_MAX} 字くらい。箇条書きも使えます`, `About ${BODY_MIN}–${BODY_MAX} characters. Bullet points are fine`)} size="small">
            <AutoTextarea heightKey="ProductDetailFields.body" size="small" rows={5} value={item.detail.body} onChange={(_, d) => onChange({ title: item.detail?.title ?? '', body: d.value })} />
          </Field>
          <span className={s.count}>{t(`${len} 字`, `${len} chars`)}</span>
          {aiOn && product && (
            <span className={s.aiRow}>
              <TextAiPanel
                key={`${item.key}:${product.id}`}
                kind="productDetail"
                label={t('詳しくの見出し・説明文', 'Detail heading and description')}
                value={joinDetail(item.detail)}
                ask={async (request, count, history) =>
                  askProductDetail({
                    card: e.aiCard(),
                    angle: e.form.copyAngle,
                    product,
                    page: await pageOf(product),
                    image: await imageNoteOf(product, item.imageUrl).catch(() => undefined),
                    current: item.detail ?? { title: '', body: '' },
                    request,
                    history,
                    count,
                  })
                }
                ideasRequest={t('商品ページの内容から、見出しと説明文を書いて', 'Write a heading and description from the product page')}
                ideasCount={2}
                placeholder={t('自分で書く(例: 撥水の話を中心に)', 'Write your own (e.g. Focus on water repellency)')}
                short={(v) => splitDetail(v).title || splitDetail(v).body.slice(0, 20)}
                renderIdea={(idea) => {
                  const d = splitDetail(idea.value)
                  return (
                    <span style={{ display: 'grid', rowGap: 2 }}>
                      <span className={s.ideaTitle}>{d.title}</span>
                      <span className={s.ideaBody}>{d.body}</span>
                    </span>
                  )
                }}
                onPreview={(v) => e.setAiPreview(v === null ? null : { detail: { key: item.key, ...splitDetail(v) } })}
                onAdopt={(idea) => {
                  e.setAiPreview(null)
                  onChange(splitDetail(idea.value))
                }}
              />
              <FeatureBadge id="ai.text" />
              {page && !pageText && <span className={s.note}>{t('商品ページの文が見つかりません。AI は商品の説明だけから書きます', 'No product page text found. AI will write from the product description only')}</span>}
            </span>
          )}
          {overlaps.some((x) => x.on) && (
            <div className={s.overlap}>
              <span className={s.note}>{t('色の付いた所は、商品ページにもある言葉です。ほかの所は、ページに書いてあるかを確認してください', 'Shaded text also appears on the product page. Check the rest against the page')}</span>
              <span className={s.overlapText}>
                {overlaps.map((x, n) => (
                  <span key={n} className={mergeClasses(x.on && s.on)}>
                    {x.text}
                  </span>
                ))}
              </span>
            </div>
          )}
          {/* 止めずに知らせる(2026-10-26 利用者: 上限は付けず、3 つ以上で注意) */}
          {detailCount >= 3 && <span className={s.note}>{t(`「詳しく」の枠が ${detailCount} つあります。長いメールになります`, `${detailCount} slots are in detail. The email will be long`)}</span>}
        </div>
      )}
    </>
  )
}
