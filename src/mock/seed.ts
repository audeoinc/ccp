// 撮影・デモ用の、サンプルデータ(docs/*.csv から作る)。本番のビルドには含めない(src/mock は、撮影用の設定だけが読み込む)。
import {
  DeliveryCardChannel,
  DeliveryCardCountry,
  DeliveryCardDepartment,
  DeliveryCardStatus,
} from '../models/deliveryCards'
import {
  ProductCategory,
  ProductSalesTrend,
  ProductSeason,
  ProductWeather,
} from '../models/products'
import { HeroImagePurpose, HeroImageSeason } from '../models/heroImages'
import { parseCsv } from './csv'

export type Row = Record<string, unknown>

const raw = import.meta.glob('../../docs/*.csv', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const csv = (name: string) => parseCsv(raw[`../../docs/${name}`] ?? '')

/** 文字(キー)から、同じ文字なら、同じ ID になる GUID 形式の ID を作る */
export function guid(key: string): string {
  const parts: string[] = []
  for (let seed = 0; seed < 4; seed++) {
    let h = 2166136261 ^ (seed * 16777619)
    for (let i = 0; i < key.length; i++) {
      h ^= key.charCodeAt(i)
      h = Math.imul(h, 16777619)
    }
    parts.push((h >>> 0).toString(16).padStart(8, '0'))
  }
  const hex = parts.join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

const inverse = (map: Record<string, string>) => Object.fromEntries(Object.entries(map).map(([v, l]) => [l, v])) as Record<string, string>
const CATEGORY = inverse(ProductCategory)
const TREND = inverse(ProductSalesTrend)
const SEASON = inverse(ProductSeason)
const WEATHER = inverse(ProductWeather)
const PURPOSE = inverse(HeroImagePurpose)
const HERO_SEASON = inverse(HeroImageSeason)
const COUNTRY = inverse(DeliveryCardCountry)
const CHANNEL = inverse(DeliveryCardChannel)
const DEPARTMENT = inverse(DeliveryCardDepartment)
const STATUS = inverse(DeliveryCardStatus)

const US_MARKET = 'US'
const JP_MARKET = 'JP'

// ---- 商品・メイン画像
export const products: Row[] = [...csv('products.csv'), ...csv('products_us.csv')].map((r) => ({
  id: guid(`product:${r['商品コード']}`),
  product_code: r['商品コード'],
  name: r['商品名'],
  category: CATEGORY[r['カテゴリ']],
  price: Number(r['価格']),
  stock: Number(r['在庫数']),
  season: SEASON[r['季節']],
  sales_trend: TREND[r['売上トレンド']],
  rating: Number(r['レビュー評価']),
  weather: WEATHER[r['天候適性']],
  description: r['商品説明'],
  image_url: r['画像URL'],
  market: r['market'] === 'US' ? US_MARKET : JP_MARKET,
}))

export const heroes: Row[] = [...csv('hero_images.csv'), ...csv('hero_images_us.csv')].map((r) => ({
  id: guid(`hero:${r['画像コード']}`),
  image_code: r['画像コード'],
  name: r['画像名'],
  purpose: PURPOSE[r['用途']],
  season: HERO_SEASON[r['季節']],
  tags: r['タグ'],
  description: r['説明'],
  image_url: r['画像URL'],
  market: r['market'] === 'US' ? US_MARKET : JP_MARKET,
}))

const productId = (code: string) => guid(`product:${code}`)
const heroId = (code: string) => guid(`hero:${code}`)

// ---- 配信カード
const iso = (s: string) => new Date(`${s.replace(' ', 'T')}:00+09:00`).toISOString()

// 担当者と制作の締め切りは、元のデータにないので、それらしい値を作る(担当者は 3 人で順に。締め切りは配信日の 4 日前)
const OWNERS = ['Mika Tanaka', 'Jordan Lee', 'Ken Sato']
const PRODUCTION = ['Alex Kim', 'Sam Ito']
const dueOf = (s: string, extraDays = 0) => {
  const d = new Date(`${s.slice(0, 10)}T00:00:00+09:00`)
  d.setUTCDate(d.getUTCDate() - 4 - extraDays)
  return new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10)
}

export const cards: Row[] = [...csv('delivery_cards.csv'), ...csv('delivery_cards_jp.csv')].map((r, i) => ({
  id: guid(`card:${r['配信名']}:${r['配信日']}`),
  name: r['配信名'],
  scheduled_at: iso(r['配信日']),
  country: COUNTRY[r['国']],
  channel: CHANNEL[r['チャネル']],
  department: DEPARTMENT[r['部署']],
  status: STATUS[r['ステータス']],
  theme: r['テーマ'],
  copy: r['コピー'],
  instructions: r['制作指示'],
  owner: OWNERS[i % OWNERS.length],
  production_due: dueOf(r['配信日']),
  // 制作の担当は、承認済み・確定の配信だけに入れる。確定の配信は、締め切りの前日に引き継いだことにする
  ...(['承認済み', '確定'].includes(r['ステータス']) ? { production_owner: PRODUCTION[i % PRODUCTION.length] } : {}),
  ...(r['ステータス'] === '確定' ? { handed_off_at: `${dueOf(r['配信日'], 1)}T06:00:00.000Z` } : {}),
}))

export const deliveryProducts: Row[] = []

type Pick = { code: string; reason: string }
/** 中身を入れた、見せ用の配信カード(テンプレートの選択、メイン画像、商品の選定まで) */
function fill(
  name: string,
  fields: Row,
  items: { section: number; picks: Pick[]; candidates?: Pick[] },
  hero: { code: string; reason: string },
) {
  const card = cards.find((c) => c.name === name)
  if (!card) return
  const id = card.id as string
  Object.assign(card, fields, { hero_image_id: heroId(hero.code), hero_reason: hero.reason })
  let order = 0
  const add = (p: Pick, state: string, section: number) => {
    deliveryProducts.push({
      id: guid(`dp:${id}:${p.code}:${state}`),
      name: p.code,
      delivery_card_id: id,
      product_id: productId(p.code),
      sort_order: order++,
      reason: p.reason,
      source: 'ai',
      state: state,
      section: section,
    })
  }
  void items
  return { add }
}

// US: Fall Arrivals(カテゴリ見出し 2 セクション)
{
  const f = fill(
    'Fall Arrivals',
    {
      theme: 'Layered Comfort for Crisp Days',
      theme_reason: 'Early October brings cooler mornings and evenings; light jackets and knits are well stocked and trending up.',
      headline: 'Embrace the Autumn Layers',
      copy: 'Discover cozy blends and structured essentials that redefine effortless warmth.',
      copy_angle: 'Seasonal feel',
      instructions:
        'Lead with a full-width autumn outfit visual in warm brown and terracotta tones. Present outerwear first (Light Jacket, Trench Coat), then knits (Crewneck, Cable Knit) in a clean two-by-two rhythm. Keep generous white space and a calm, premium mood; make the call-to-action buttons quiet and dark.',
      instructions_angle: 'Classic layout',
      layout_key: 'cat2',
      email_template: 'cat2',
      section_titles: 'Outerwear for Crisp Days\nKnits That Layer Well',
      section_copies: JSON.stringify(['Light layers that move with the weather.', 'Soft textures for cooler mornings.']),
    },
    { section: 0, picks: [] },
    { code: 'UH01', reason: 'Matches the fall outerwear and knits story; warm tones suit the early-October timing.' },
  )
  const sel = 'selected'
  const cand = 'candidate'
  f?.add({ code: 'U05', reason: 'Stock 150 and a light, breathable layer for shifting temperatures.' }, sel, 0)
  f?.add({ code: 'U03', reason: 'Rising interest in rain-ready outerwear; stock 200.' }, sel, 0)
  f?.add({ code: 'U07', reason: 'Top-rated crewneck (4.7) with strong stock and rising sales.' }, sel, 1)
  f?.add({ code: 'U09', reason: 'Textured cable knit that pairs with the outerwear above.' }, sel, 1)
  f?.add({ code: 'U01', reason: 'Premium alternative with strong rating; stock 120.' }, cand, 0)
  f?.add({ code: 'U04', reason: 'Packable parka for rainy days.' }, cand, 0)
  f?.add({ code: 'U06', reason: 'Soft cardigan that layers over anything.' }, cand, 1)
}

// JP: 秋の新作ニット(標準 4 点)
{
  const f = fill(
    '秋の新作ニット',
    {
      theme: 'ニットで重ねる、秋の新作',
      theme_reason: '10月初旬で肌寒くなる時期。売上上昇中のニット類が主役になる、季節感重視のテーマ。',
      headline: 'ぬくもりを纏う、秋のニット',
      copy: '重ねるほどに表情が変わる、やさしい手ざわりの新作ニットが届きました。',
      copy_angle: '商品の魅力',
      instructions:
        'メインビジュアルはニットの質感が伝わる近接のカットを全幅で配置し、温かみのあるベージュ〜ブラウン系で統一する。商品は上から順に、クルーネック、ケーブル、カーディガン、タートルの4点を2×2のグリッドで表示。余白を多めに取り、ボタンは落ち着いた濃色にして、素材の魅力を前面に出す。',
      instructions_angle: '商品を主役に',
      layout_key: 'standard4',
      email_template: 'standard4',
      section_copies: JSON.stringify(['やわらかな素材で、秋の始まりを心地よく。']),
    },
    { section: 0, picks: [] },
    { code: 'H05', reason: 'ニットの編み目と質感を近接で見せる画像。テーマと商品の世界観に合う。' },
  )
  const sel = 'selected'
  const cand = 'candidate'
  f?.add({ code: 'P07', reason: '在庫220、売上上昇中。評価も高い定番のクルーネック。' }, sel, 0)
  f?.add({ code: 'P09', reason: '編み柄で表情が出る、秋らしい一枚。' }, sel, 0)
  f?.add({ code: 'P06', reason: '重ね着の羽織りとして、ニットと相性がよい。' }, sel, 0)
  f?.add({ code: 'P08', reason: '首元まで暖かく、秋冬のはじめに需要が伸びる。' }, sel, 0)
  f?.add({ code: 'P13', reason: 'ウールスラックスで、きれいめのコーディネートに。' }, cand, 0)
}

// ---- 週次実績・販売方針
export const weekly: Row[] = csv('product_weekly.csv').map((r) => ({
  id: guid(`weekly:${r.name}`),
  name: r.name,
  product_code: r.productcode,
  week_start: r.weekstart,
  units: Number(r.units),
  revenue: Number(r.revenue),
  stock: Number(r.stock),
}))

export const policies: Row[] = csv('product_policy.csv').map((r) => ({
  id: guid(`policy:${r.productcode}`),
  name: r.name,
  product_code: r.productcode,
  policy: r.policy,
  promo_plan: r.promoplan,
  promo_period: r.promoperiod,
  stage: r.stage,
}))

// ---- ユーザーが作ったテンプレート(1 件)
export const layoutTemplates: Row[] = [
  {
    id: guid('layout:feature-grid3'),
    name: 'Feature + 3-column grid',
    description: 'One featured product, then a three-across row. Good for a focused story with a quick shop-the-look.',
    hero_kind: 'collab',
    sections: JSON.stringify([
      { kind: 'feature', slots: 1 },
      { kind: 'grid', slots: 3, columns: 3 },
    ]),
  },
]

// ---- 週の計画(週のレビューの状態)
export const weeks: Row[] = [
  { id: guid('week:2026-09-27'), week_start: '2026-09-27', status: 'confirmed', submitted_at: '2026-09-22T06:00:00.000Z', confirmed_at: '2026-09-24T08:00:00.000Z' },
  { id: guid('week:2026-10-04'), week_start: '2026-10-04', status: 'confirmed', submitted_at: '2026-09-29T06:00:00.000Z', confirmed_at: '2026-10-01T08:00:00.000Z' },
  { id: guid('week:2026-10-11'), week_start: '2026-10-11', status: 'review', submitted_at: '2026-10-07T06:00:00.000Z' },
]

// ---- 承認の履歴。週の行(weeks)の日時に合わせた、見本の記録
export const events: Row[] = [
  { id: guid('event:1004:submit'), action: 'submit', week_start: '2026-10-04', actor: 'Ken Sato', created_on: '2026-09-29T06:00:00.000Z' },
  { id: guid('event:1004:confirm'), action: 'confirm', week_start: '2026-10-04', actor: 'Mika Tanaka', created_on: '2026-10-01T08:00:00.000Z' },
  { id: guid('event:1011:submit'), action: 'submit', week_start: '2026-10-11', actor: 'Ken Sato', created_on: '2026-10-07T06:00:00.000Z' },
]

// ---- 配信カードのメモ(質問と返信。誰からでも、誰にでも。宛先は assignee)
const cardIdOf = (name: string) => cards.find((c) => c.name === name)?.id
const note = (card: string, author: string, to: string, body: string, at: string, reply?: { by: string; text: string; at: string }, resolved = false): Row => ({
  id: guid(`note:${card}:${body}`),
  delivery_card_id: cardIdOf(card),
  kind: 'question',
  author: author,
  assignee: to,
  body: body,
  created_on: at,
  ...(reply ? { reply: reply.text, replied_by: reply.by, replied_at: reply.at } : {}),
  resolved: resolved ? 1 : 0,
})

export const cardNotes: Row[] = [
  note('Fall Arrivals', 'Alex Kim', 'Mika Tanaka', 'Can we use the close-up of the cable knit for the hero instead of the full look?', '2026-09-25T02:10:00.000Z', {
    by: 'Mika Tanaka',
    text: 'Yes, but keep the warm tone. The full look can go in Section 1.',
    at: '2026-09-25T04:30:00.000Z',
  }, true),
  note('Fall Arrivals', 'Mika Tanaka', 'Alex Kim', 'Can you share a draft of the hero by Wednesday?', '2026-09-26T00:30:00.000Z'),
  note('Fall Arrivals', 'Sam Ito', 'Mika Tanaka', 'Is the price in the email the sale price or the regular price?', '2026-09-26T01:00:00.000Z'),
  note('Weekend Sale', 'Sam Ito', 'Jordan Lee', 'Should the countdown banner show hours or just "Ends Sunday"?', '2026-09-27T06:00:00.000Z', {
    by: 'Jordan Lee',
    text: 'Just "Ends Sunday" — the banner is too small for a timer.',
    at: '2026-09-27T07:15:00.000Z',
  }, true),
].filter((n) => n.delivery_card_id)

// 質問のやり取りから採用したタスク(1 件は完了、1 件は未完了)
const taskFrom = (q: Row, text: string, assignee: string, due: string, done: boolean): Row => ({
  id: guid(`task:${q.id}:${text}`),
  delivery_card_id: q.delivery_card_id,
  kind: 'task',
  body: text,
  assignee: assignee,
  due: due,
  source_note: q.id,
  resolved: done ? 1 : 0,
  created_on: q.replied_at ?? q.created_on,
})
const heroQuestion = cardNotes.find((n) => String(n.body).startsWith('Can we use the close-up'))
if (heroQuestion) {
  cardNotes.push(
    taskFrom(heroQuestion, 'Swap the hero to the cable knit close-up (keep the warm tone)', 'Alex Kim', '2026-09-27', true),
    taskFrom(heroQuestion, 'Move the full-look photo into Section 1', 'Alex Kim', '2026-09-27', false),
  )
}

// レビューのコメント(配信全体への指摘。1 件は未対応、1 件は対応済み)
const comment = (card: string, author: string, body: string, at: string, fix?: { by: string; text: string; at: string }): Row => ({
  ...note(card, author, '', body, at, fix, !!fix),
  assignee: undefined,
  id: guid(`comment:${card}:${body}`),
  kind: 'comment',
})
cardNotes.push(
  ...[
    comment('Outerwear Guide', 'Mika Tanaka', 'The theme overlaps with the outerwear email two days earlier. Shift the angle to layering?', '2026-10-02T03:00:00.000Z'),
    comment('アウター特集', 'Mika Tanaka', 'メイン画像が前週と同じなので、別のカットにしてください。', '2026-10-01T02:00:00.000Z', {
      by: 'Jordan Lee',
      text: 'メイン画像を、屋外のカットに差し替えました。',
      at: '2026-10-01T05:00:00.000Z',
    }),
  ].filter((n) => n.delivery_card_id),
)
// 指摘への返信(スレッドのやり取り)
const guideComment = cardNotes.find((n) => n.kind === 'comment' && String(n.body).startsWith('The theme overlaps'))
const reply = (to: Row, author: string, body: string, at: string): Row => ({
  id: guid(`reply:${to.id}:${body}`),
  delivery_card_id: to.delivery_card_id,
  kind: 'reply',
  source_note: to.id,
  author: author,
  body: body,
  created_on: at,
})
if (guideComment) {
  cardNotes.push(
    reply(guideComment, 'Ken Sato', 'Good point. Would "how to layer for chilly mornings" work as the angle?', '2026-10-02T05:00:00.000Z'),
    reply(guideComment, 'Mika Tanaka', 'Yes, that works. Please also move the coat to the second section.', '2026-10-02T06:30:00.000Z'),
  )
}

// ---- これから送る US の配信に載せる商品(アラートの見本)
// 在庫の少ないダウンジャケット(U02・在庫 60)とケーブルニット(U09・在庫 70)を、何本もの配信に載せる
// (配信を重ねると在庫が持たない、という見本。ほかは在庫に余裕のある商品)
const UPCOMING_PICKS: [string, string[]][] = [
  ['Weekend Sale', ['U02', 'U07', 'U09', 'U12']],
  ['Holiday Preview', ['U01', 'U02', 'U06', 'U11']],
  ['Halloween', ['U02', 'U09', 'U10', 'U03']],
  ['Cozy Home', ['U09', 'U06', 'U11', 'U12']],
  ['Early Black Friday', ['U02', 'U05', 'U07', 'U03']],
]
for (const [name, codes] of UPCOMING_PICKS) {
  const card = cards.find((c) => c.name === name && c.country === COUNTRY['US'] && String(c.scheduled_at ?? '') >= '2026-10-15')
  if (!card) continue
  const id = card.id as string
  codes.forEach((code, i) => {
    deliveryProducts.push({
      id: guid(`dp:upcoming:${id}:${code}`),
      name: code,
      delivery_card_id: id,
      product_id: productId(code),
      sort_order: i,
      reason: '',
      source: 'ai',
      state: 'selected',
      section: i < 2 ? 0 : 1,
    })
  })
}

// ---- 過去の配信(結果を、同じテンプレートの過去の配信と比べるため)
// 2026-10-14 より前に送った US の配信を、1〜5 週前にも送ったことにする。テンプレート・テーマは同じで、商品とメイン画像を入れ替える
// (同じ型の配信を、毎週くり返している、という想定)。その週は、確定済みにする
function rand(key: string) {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    h ^= h >>> 16
    return (h >>> 0) / 4294967296
  }
}
const PAST_WEEKS = 5
const pastOf = cards.filter((c) => c.country === COUNTRY['US'] && String(c.scheduled_at ?? '') < '2026-10-14')
for (const orig of pastOf) {
  const oid = orig.id as string
  const picked = deliveryProducts.filter((d) => d.delivery_card_id === oid && d.state === 'selected')
  for (let k = 1; k <= PAST_WEEKS; k++) {
    const r = rand(`past:${oid}:${k}`)
    const id = guid(`card:past:${oid}:${k}`)
    const at = new Date(String(orig.scheduled_at))
    at.setUTCDate(at.getUTCDate() - 7 * k)
    const iso = at.toISOString()
    const usHeroes = heroes.filter((h) => h.market === US_MARKET)
    const pool = products.filter((p) => p.market === US_MARKET)
    cards.push({
      ...orig,
      id: id,
      scheduled_at: iso,
      status: 'confirmed',
      production_due: iso.slice(0, 10),
      handed_off_at: iso,
      ...(orig.hero_image_id && usHeroes.length > 0 ? { hero_image_id: usHeroes[Math.floor(r() * usHeroes.length)].id } : {}),
    })
    picked.forEach((d, i) => {
      deliveryProducts.push({
        ...d,
        id: guid(`dp:past:${id}:${i}`),
        delivery_card_id: id,
        product_id: pool[Math.floor(r() * pool.length)]?.id ?? d.product_id,
      })
    })
    // 週の計画: その週(日曜日から)を確定にする
    const sun = new Date(at.getTime() + 9 * 3600_000)
    sun.setUTCDate(sun.getUTCDate() - sun.getUTCDay())
    const ws = sun.toISOString().slice(0, 10)
    if (!weeks.some((w) => w.week_start === ws)) {
      weeks.push({ id: guid(`week:${ws}`), week_start: ws, status: 'confirmed', submitted_at: `${ws}T00:00:00.000Z`, confirmed_at: `${ws}T00:00:00.000Z` })
    }
  }
}

// ---- 配信結果(配信のあとに取り込む結果)
// 2026-10-14 より前に送った配信に、それっぽい数字を入れる。同じ配信なら、同じ数字になる(乱数は、配信 ID から作る)
const RESULTS_BEFORE = '2026-10-14'
export const deliveryResults: Row[] = cards
  .filter((c) => String(c.scheduled_at ?? '') < RESULTS_BEFORE)
  .map((c) => {
    const id = c.id as string
    const r = rand(`result:${id}`)
    const push = c.channel === 'app'
    const us = c.country === COUNTRY['US']
    const recipients = Math.round((push ? 60000 : 120000) * (0.8 + r() * 0.4))
    const opens = Math.round(recipients * (push ? 0.06 + r() * 0.06 : 0.18 + r() * 0.14))
    const clicks = Math.round(opens * (push ? 0.35 + r() * 0.2 : 0.1 + r() * 0.12))
    const orders = Math.round(clicks * (0.03 + r() * 0.04))
    // 商品: 選んだ商品があればそれ、なければ同じ市場の商品から 3 点
    const picked = deliveryProducts
      .filter((d) => d.delivery_card_id === id && d.state === 'selected')
      .map((d) => d.product_id as string)
    const pool = products.filter((p) => p.market === (us ? US_MARKET : JP_MARKET))
    const ids = picked.length > 0 ? picked : [0, 1, 2].map(() => pool[Math.floor(r() * pool.length)]?.id as string).filter((v, i, a) => v && a.indexOf(v) === i)
    let left = orders
    const items = ids.map((pid, i) => {
      const p = products.find((x) => x.id === pid)
      const share = i === ids.length - 1 ? 1 : 0.3 + r() * 0.3
      const units = i === ids.length - 1 ? left : Math.round(left * share)
      left -= units
      // 上の枠ほど押されやすい(位置で比べたときに、傾向が見えるように)
      return { productId: pid, clicks: Math.round((clicks / ids.length) * (1.3 / (1 + 0.2 * i)) * (0.6 + r() * 0.8)), units, revenue: Math.round(units * Number(p?.price ?? 0)) }
    })
    const revenue = items.reduce((s, x) => s + x.revenue, 0) || Math.round(orders * (us ? 80 : 9000))
    return {
      id: guid(`result:${id}`),
      delivery_card_id: id,
      sent_at: c.scheduled_at,
      recipients: recipients,
      opens: opens,
      clicks: clicks,
      orders: orders,
      revenue: revenue,
      last_year_revenue: Math.round(revenue * (0.75 + r() * 0.5)),
      products: JSON.stringify(items),
      // リンクごとのクリック(延べ回数。1 人が何度も押すので、クリックした人の数より多い)
      links: JSON.stringify({
        hero: Math.round(clicks * (0.3 + r() * 0.25)),
        buttons: [Math.round(clicks * (0.08 + r() * 0.12)), Math.round(clicks * (0.02 + r() * 0.06)), Math.round(clicks * (0.01 + r() * 0.03))],
        other: Math.round(clicks * (0.02 + r() * 0.04)),
      }),
    }
  })

// 過去の配信の、次に生かすメモ(配信カードの「これまでの学び」の見本)
const NOTES: [string, string, string][] = [
  ['Fall Arrivals', '2026-09-24', 'Worked: the warm-tone hero drew 31% of clicks.\nTry next: put the best-selling knit in slot 1; slot 4 was weak.'],
  ['Fall Arrivals', '2026-09-10', 'Did not work: two similar jackets side by side split the clicks.'],
  ['Weekend Sale', '2026-09-26', 'Worked: "Ends Sunday" in the headline lifted the click rate by 0.8pt.\nTry next: show the discount on the product tiles.'],
  ['Member Week', '2026-09-26', 'Did not work: the hero without a model photo got fewer clicks than usual.'],
]
for (const [name, date, notes] of NOTES) {
  const c = cards.find((x) => x.name === name && String(x.scheduled_at ?? '').slice(0, 10) === date)
  const r = c && deliveryResults.find((x) => x.delivery_card_id === c.id)
  if (r) r.notes = notes
}

// ---- 変更の記録(アラートの「MD 方針の変更」「日程の変更」の見本)
// 本番では、サーバーが、配信日時・商品の方針の書き換えを記録する。撮影用は、ここで見本を作る(src/mock/db.ts も、書き換えを記録する)
export const changeLogs: Row[] = []
{
  // Crewneck Sweater(U07)の位置づけが、主力から在庫調整に変わった
  const pol = policies.find((p) => p.product_code === 'U07')
  if (pol) {
    changeLogs.push({
      id: guid('change:policy:U07'),
      kind: 'policy',
      field: 'stage',
      before_value: String(pol.stage),
      after_value: 'Clearance',
      product_code: 'U07',
      actor: 'MD: Aya Mori',
      created_on: '2026-10-14T02:30:00.000Z',
    })
    pol.stage = 'Clearance'
    pol.policy = 'Clearance: prioritize selling through stock; stress value and bundle offers.'
  }
  // Holiday Preview を、10/21 から今の日時(10/19)に前倒しした
  const hp = cards.find((c) => c.name === 'Holiday Preview' && c.country === COUNTRY['US'])
  if (hp) {
    const before = new Date(String(hp.scheduled_at))
    before.setUTCDate(before.getUTCDate() + 2)
    changeLogs.push({
      id: guid('change:date:holiday-preview'),
      kind: 'date',
      field: 'scheduled_at',
      before_value: before.toISOString().replace('.000Z', 'Z'),
      after_value: String(hp.scheduled_at).replace('.000Z', 'Z'),
      delivery_card_id: hp.id,
      card_name: hp.name,
      actor: 'Jordan Lee',
      created_on: '2026-10-14T05:10:00.000Z',
    })
  }
}

// ---- ユーザーと承認グループ(バックログ U1。docs/APPROVAL.md)
// 名前は、ほかのサンプルデータ(担当・履歴・コメント)に出てくる人にそろえる。メールアドレスは、架空の example.com だけ(公開リポジトリのため)
const PEOPLE: [string, string, 'member' | 'admin'][] = [
  ['Mika Tanaka', 'mika.tanaka', 'admin'],
  ['Jordan Lee', 'jordan.lee', 'member'],
  ['Ken Sato', 'ken.sato', 'member'],
  ['Alex Kim', 'alex.kim', 'member'],
  ['Sam Ito', 'sam.ito', 'member'],
  ['Aya Mori', 'aya.mori', 'member'],
  ['Rina Ueda', 'rina.ueda', 'member'],
]
export const users: Row[] = PEOPLE.map(([name, mail, role]) => ({
  id: guid(`user:${mail}`),
  name,
  email: `${mail}@example.com`,
  role,
  status: 'active',
  created_on: '2026-10-01T00:00:00.000Z',
}))
const userId = (mail: string) => guid(`user:${mail}`)

// Ken Sato は 2 つのグループに入っている(1 回の承認は 1 グループ分と数える、の見本)
const GROUPS: [string, string, string[]][] = [
  ['MD', 'Checks products, stock and promo periods', ['aya.mori', 'ken.sato']],
  ['Brand', 'Checks tone, copy and visuals', ['mika.tanaka', 'rina.ueda']],
  ['Marketing leads', 'Checks the weekly plan and themes', ['jordan.lee', 'ken.sato']],
]
export const approvalGroups: Row[] = GROUPS.map(([name, description]) => ({
  id: guid(`group:${name}`),
  name,
  description,
  status: 'active',
  created_on: '2026-10-01T00:00:00.000Z',
}))
export const approvalGroupMembers: Row[] = GROUPS.flatMap(([name, , mails]) =>
  mails.map((mail) => ({ id: guid(`member:${name}:${mail}`), approval_group_id: guid(`group:${name}`), user_id: userId(mail), created_on: '2026-10-01T00:00:00.000Z' })),
)

// ---- 承認の決まり・依頼(バックログ U3・U4)
// 種別ごとの既定: 販促は MD と Brand の両方(全員)、CRM は Marketing leads のだれか、EC は MD のだれか
const groupId = (name: string) => guid(`group:${name}`)
export const approvalRules: Row[] = [
  { id: guid('rule:promotion'), department: 'promotion', rule: 'all', group_ids: JSON.stringify([groupId('MD'), groupId('Brand')]), user_ids: '[]' },
  { id: guid('rule:crm'), department: 'crm', rule: 'any', group_ids: JSON.stringify([groupId('Marketing leads')]), user_ids: '[]' },
  { id: guid('rule:ec'), department: 'ec', rule: 'any', group_ids: JSON.stringify([groupId('MD')]), user_ids: '[]' },
]
// Boots Edit(今週の検討中の配信)に、依頼が 1 つ出ている見本。MD は Aya Mori が承認済み、Brand はまだ
const bootsEdit = guid('card:Boots Edit:2026-10-15 10:00')
const bootsRequest = guid('request:boots-edit:1')
export const approvalRequests: Row[] = [
  {
    id: bootsRequest,
    delivery_card_id: bootsEdit,
    card_name: 'Boots Edit',
    requested_by: userId('ken.sato'),
    requested_by_name: 'Ken Sato',
    rule: 'all',
    status: 'open',
    requested_at: '2026-10-13T02:00:00.000Z',
    created_on: '2026-10-13T02:00:00.000Z',
  },
]
export const approvalReviewers: Row[] = [
  { id: guid('reviewer:boots-edit:MD'), approval_request_id: bootsRequest, approval_group_id: groupId('MD'), reviewer_name: 'MD', decision: 'approved', decided_by: userId('aya.mori'), decided_by_name: 'Aya Mori', decided_at: '2026-10-13T06:30:00.000Z', created_on: '2026-10-13T02:00:00.000Z' },
  { id: guid('reviewer:boots-edit:Brand'), approval_request_id: bootsRequest, approval_group_id: groupId('Brand'), reviewer_name: 'Brand', decision: 'pending', created_on: '2026-10-13T02:00:00.000Z' },
]
