// 撮影・デモ用の、サンプルデータ(docs/*.csv から作る)。本番のビルドには含めない(src/mock は、撮影用の設定だけが読み込む)。
import {
  Cr854_deliverycardscr854_channel,
  Cr854_deliverycardscr854_country,
  Cr854_deliverycardscr854_department,
  Cr854_deliverycardscr854_status,
} from '../generated/models/Cr854_deliverycardsModel'
import {
  Cr854_productscr854_category,
  Cr854_productscr854_salestrend,
  Cr854_productscr854_season,
  Cr854_productscr854_weather,
} from '../generated/models/Cr854_productsModel'
import { Cr854_heroimagescr854_purpose, Cr854_heroimagescr854_season } from '../generated/models/Cr854_heroimagesModel'
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

const inverse = (map: Record<number, string>) => Object.fromEntries(Object.entries(map).map(([v, l]) => [l, Number(v)])) as Record<string, number>
const CATEGORY = inverse(Cr854_productscr854_category)
const TREND = inverse(Cr854_productscr854_salestrend)
const SEASON = inverse(Cr854_productscr854_season)
const WEATHER = inverse(Cr854_productscr854_weather)
const PURPOSE = inverse(Cr854_heroimagescr854_purpose)
const HERO_SEASON = inverse(Cr854_heroimagescr854_season)
const COUNTRY = inverse(Cr854_deliverycardscr854_country)
const CHANNEL = inverse(Cr854_deliverycardscr854_channel)
const DEPARTMENT = inverse(Cr854_deliverycardscr854_department)
const STATUS = inverse(Cr854_deliverycardscr854_status)

const US_MARKET = 588230001
const JP_MARKET = 588230000

// ---- 商品・メイン画像
export const products: Row[] = [...csv('products.csv'), ...csv('products_us.csv')].map((r) => ({
  cr854_productid: guid(`product:${r['商品コード']}`),
  cr854_productcode: r['商品コード'],
  cr854_name: r['商品名'],
  cr854_category: CATEGORY[r['カテゴリ']],
  cr854_price: Number(r['価格']),
  cr854_stock: Number(r['在庫数']),
  cr854_season: SEASON[r['季節']],
  cr854_salestrend: TREND[r['売上トレンド']],
  cr854_rating: Number(r['レビュー評価']),
  cr854_weather: WEATHER[r['天候適性']],
  cr854_description: r['商品説明'],
  cr854_imageurl: r['画像URL'],
  cr854_market: r['market'] === 'US' ? US_MARKET : JP_MARKET,
}))

export const heroes: Row[] = [...csv('hero_images.csv'), ...csv('hero_images_us.csv')].map((r) => ({
  cr854_heroimageid: guid(`hero:${r['画像コード']}`),
  cr854_imagecode: r['画像コード'],
  cr854_name: r['画像名'],
  cr854_purpose: PURPOSE[r['用途']],
  cr854_season: HERO_SEASON[r['季節']],
  cr854_tags: r['タグ'],
  cr854_description: r['説明'],
  cr854_imageurl: r['画像URL'],
  cr854_market: r['market'] === 'US' ? US_MARKET : JP_MARKET,
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
  cr854_deliverycardid: guid(`card:${r['配信名']}:${r['配信日']}`),
  cr854_name: r['配信名'],
  cr854_scheduledat: iso(r['配信日']),
  cr854_country: COUNTRY[r['国']],
  cr854_channel: CHANNEL[r['チャネル']],
  cr854_department: DEPARTMENT[r['部署']],
  cr854_status: STATUS[r['ステータス']],
  cr854_theme: r['テーマ'],
  cr854_copy: r['コピー'],
  cr854_instructions: r['制作指示'],
  cr854_owner: OWNERS[i % OWNERS.length],
  cr854_productiondue: dueOf(r['配信日']),
  // 制作の担当は、承認済み・確定の配信だけに入れる。確定の配信は、締め切りの前日に引き継いだことにする
  ...(['承認済み', '確定'].includes(r['ステータス']) ? { cr854_productionowner: PRODUCTION[i % PRODUCTION.length] } : {}),
  ...(r['ステータス'] === '確定' ? { cr854_handedoffat: `${dueOf(r['配信日'], 1)}T06:00:00.000Z` } : {}),
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
  const card = cards.find((c) => c.cr854_name === name)
  if (!card) return
  const id = card.cr854_deliverycardid as string
  Object.assign(card, fields, { _cr854_heroimage_value: heroId(hero.code), cr854_heroreason: hero.reason })
  let order = 0
  const add = (p: Pick, state: number, section: number) => {
    deliveryProducts.push({
      cr854_deliveryproductid: guid(`dp:${id}:${p.code}:${state}`),
      cr854_name: p.code,
      _cr854_deliverycard_value: id,
      _cr854_product_value: productId(p.code),
      cr854_sortorder: order++,
      cr854_reason: p.reason,
      cr854_source: 588230000,
      cr854_state: state,
      cr854_section: section,
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
      cr854_theme: 'Layered Comfort for Crisp Days',
      cr854_themereason: 'Early October brings cooler mornings and evenings; light jackets and knits are well stocked and trending up.',
      cr854_headline: 'Embrace the Autumn Layers',
      cr854_copy: 'Discover cozy blends and structured essentials that redefine effortless warmth.',
      cr854_copyangle: 'Seasonal feel',
      cr854_instructions:
        'Lead with a full-width autumn outfit visual in warm brown and terracotta tones. Present outerwear first (Light Jacket, Trench Coat), then knits (Crewneck, Cable Knit) in a clean two-by-two rhythm. Keep generous white space and a calm, premium mood; make the call-to-action buttons quiet and dark.',
      cr854_instructionsangle: 'Classic layout',
      cr854_layoutkey: 'cat2',
      cr854_emailtemplate: 588230004,
      cr854_sectiontitles: 'Outerwear for Crisp Days\nKnits That Layer Well',
      cr854_sectioncopies: JSON.stringify(['Light layers that move with the weather.', 'Soft textures for cooler mornings.']),
    },
    { section: 0, picks: [] },
    { code: 'UH01', reason: 'Matches the fall outerwear and knits story; warm tones suit the early-October timing.' },
  )
  const sel = 588230000
  const cand = 588230001
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
      cr854_theme: 'ニットで重ねる、秋の新作',
      cr854_themereason: '10月初旬で肌寒くなる時期。売上上昇中のニット類が主役になる、季節感重視のテーマ。',
      cr854_headline: 'ぬくもりを纏う、秋のニット',
      cr854_copy: '重ねるほどに表情が変わる、やさしい手ざわりの新作ニットが届きました。',
      cr854_copyangle: '商品の魅力',
      cr854_instructions:
        'メインビジュアルはニットの質感が伝わる近接のカットを全幅で配置し、温かみのあるベージュ〜ブラウン系で統一する。商品は上から順に、クルーネック、ケーブル、カーディガン、タートルの4点を2×2のグリッドで表示。余白を多めに取り、ボタンは落ち着いた濃色にして、素材の魅力を前面に出す。',
      cr854_instructionsangle: '商品を主役に',
      cr854_layoutkey: 'standard4',
      cr854_emailtemplate: 588230001,
      cr854_sectioncopies: JSON.stringify(['やわらかな素材で、秋の始まりを心地よく。']),
    },
    { section: 0, picks: [] },
    { code: 'H05', reason: 'ニットの編み目と質感を近接で見せる画像。テーマと商品の世界観に合う。' },
  )
  const sel = 588230000
  const cand = 588230001
  f?.add({ code: 'P07', reason: '在庫220、売上上昇中。評価も高い定番のクルーネック。' }, sel, 0)
  f?.add({ code: 'P09', reason: '編み柄で表情が出る、秋らしい一枚。' }, sel, 0)
  f?.add({ code: 'P06', reason: '重ね着の羽織りとして、ニットと相性がよい。' }, sel, 0)
  f?.add({ code: 'P08', reason: '首元まで暖かく、秋冬のはじめに需要が伸びる。' }, sel, 0)
  f?.add({ code: 'P13', reason: 'ウールスラックスで、きれいめのコーディネートに。' }, cand, 0)
}

// ---- 週次実績・販売方針
export const weekly: Row[] = csv('product_weekly.csv').map((r) => ({
  cr854_weeklyperformanceid: guid(`weekly:${r.name}`),
  cr854_name: r.name,
  cr854_productcode: r.productcode,
  cr854_weekstart: r.weekstart,
  cr854_units: Number(r.units),
  cr854_revenue: Number(r.revenue),
  cr854_stock: Number(r.stock),
}))

export const policies: Row[] = csv('product_policy.csv').map((r) => ({
  cr854_productpolicyid: guid(`policy:${r.productcode}`),
  cr854_name: r.name,
  cr854_productcode: r.productcode,
  cr854_policy: r.policy,
  cr854_promoplan: r.promoplan,
  cr854_promoperiod: r.promoperiod,
  cr854_stage: r.stage,
}))

// ---- ユーザーが作ったテンプレート(1 件)
export const layoutTemplates: Row[] = [
  {
    cr854_layouttemplateid: guid('layout:feature-grid3'),
    cr854_name: 'Feature + 3-column grid',
    cr854_description: 'One featured product, then a three-across row. Good for a focused story with a quick shop-the-look.',
    cr854_herokind: 'collab',
    cr854_sections: JSON.stringify([
      { kind: 'feature', slots: 1 },
      { kind: 'grid', slots: 3, columns: 3 },
    ]),
  },
]

// ---- 週の計画(週のレビューの状態。GCP 版だけのテーブル)
export const weeks: Row[] = [
  { cr854_weekid: guid('week:2026-09-27'), cr854_weekstart: '2026-09-27', cr854_status: 'confirmed', cr854_submittedat: '2026-09-22T06:00:00.000Z', cr854_confirmedat: '2026-09-24T08:00:00.000Z' },
  { cr854_weekid: guid('week:2026-10-04'), cr854_weekstart: '2026-10-04', cr854_status: 'confirmed', cr854_submittedat: '2026-09-29T06:00:00.000Z', cr854_confirmedat: '2026-10-01T08:00:00.000Z' },
  { cr854_weekid: guid('week:2026-10-11'), cr854_weekstart: '2026-10-11', cr854_status: 'review', cr854_submittedat: '2026-10-07T06:00:00.000Z' },
]

// ---- 承認の履歴(GCP 版だけのテーブル)。週の行(weeks)の日時に合わせた、見本の記録
export const events: Row[] = [
  { cr854_eventid: guid('event:1004:submit'), cr854_action: 'submit', cr854_weekstart: '2026-10-04', cr854_actor: 'Ken Sato', createdon: '2026-09-29T06:00:00.000Z' },
  { cr854_eventid: guid('event:1004:confirm'), cr854_action: 'confirm', cr854_weekstart: '2026-10-04', cr854_actor: 'Mika Tanaka', createdon: '2026-10-01T08:00:00.000Z' },
  { cr854_eventid: guid('event:1011:submit'), cr854_action: 'submit', cr854_weekstart: '2026-10-11', cr854_actor: 'Ken Sato', createdon: '2026-10-07T06:00:00.000Z' },
]

// ---- 配信カードのメモ(制作からの質問と返信。GCP 版だけのテーブル)
const cardIdOf = (name: string) => cards.find((c) => c.cr854_name === name)?.cr854_deliverycardid
const note = (card: string, author: string, body: string, at: string, reply?: { by: string; text: string; at: string }, resolved = false): Row => ({
  cr854_cardnoteid: guid(`note:${card}:${body}`),
  _cr854_deliverycard_value: cardIdOf(card),
  cr854_kind: 'question',
  cr854_author: author,
  cr854_body: body,
  createdon: at,
  ...(reply ? { cr854_reply: reply.text, cr854_repliedby: reply.by, cr854_repliedat: reply.at } : {}),
  cr854_resolved: resolved ? 1 : 0,
})

export const cardNotes: Row[] = [
  note('Fall Arrivals', 'Alex Kim', 'Can we use the close-up of the cable knit for the hero instead of the full look?', '2026-09-25T02:10:00.000Z', {
    by: 'Mika Tanaka',
    text: 'Yes, but keep the warm tone. The full look can go in Section 1.',
    at: '2026-09-25T04:30:00.000Z',
  }, true),
  note('Fall Arrivals', 'Sam Ito', 'Is the price in the email the sale price or the regular price?', '2026-09-26T01:00:00.000Z'),
  note('Weekend Sale', 'Sam Ito', 'Should the countdown banner show hours or just "Ends Sunday"?', '2026-09-27T06:00:00.000Z', {
    by: 'Jordan Lee',
    text: 'Just "Ends Sunday" — the banner is too small for a timer.',
    at: '2026-09-27T07:15:00.000Z',
  }, true),
].filter((n) => n._cr854_deliverycard_value)

// 質問のやり取りから採用したタスク(1 件は完了、1 件は未完了)
const taskFrom = (q: Row, text: string, assignee: string, due: string, done: boolean): Row => ({
  cr854_cardnoteid: guid(`task:${q.cr854_cardnoteid}:${text}`),
  _cr854_deliverycard_value: q._cr854_deliverycard_value,
  cr854_kind: 'task',
  cr854_body: text,
  cr854_assignee: assignee,
  cr854_due: due,
  cr854_sourcenote: q.cr854_cardnoteid,
  cr854_resolved: done ? 1 : 0,
  createdon: q.cr854_repliedat ?? q.createdon,
})
const heroQuestion = cardNotes.find((n) => String(n.cr854_body).startsWith('Can we use the close-up'))
if (heroQuestion) {
  cardNotes.push(
    taskFrom(heroQuestion, 'Swap the hero to the cable knit close-up (keep the warm tone)', 'Alex Kim', '2026-09-27', true),
    taskFrom(heroQuestion, 'Move the full-look photo into Section 1', 'Alex Kim', '2026-09-27', false),
  )
}

// レビューのコメント(配信全体への指摘。1 件は未対応、1 件は対応済み)
const comment = (card: string, author: string, body: string, at: string, fix?: { by: string; text: string; at: string }): Row => ({
  ...note(card, author, body, at, fix, !!fix),
  cr854_cardnoteid: guid(`comment:${card}:${body}`),
  cr854_kind: 'comment',
})
cardNotes.push(
  ...[
    comment('Outerwear Guide', 'Mika Tanaka', 'The theme overlaps with the outerwear email two days earlier. Shift the angle to layering?', '2026-10-02T03:00:00.000Z'),
    comment('アウター特集', 'Mika Tanaka', 'メイン画像が前週と同じなので、別のカットにしてください。', '2026-10-01T02:00:00.000Z', {
      by: 'Jordan Lee',
      text: 'メイン画像を、屋外のカットに差し替えました。',
      at: '2026-10-01T05:00:00.000Z',
    }),
  ].filter((n) => n._cr854_deliverycard_value),
)
// 指摘への返信(スレッドのやり取り)
const guideComment = cardNotes.find((n) => n.cr854_kind === 'comment' && String(n.cr854_body).startsWith('The theme overlaps'))
const reply = (to: Row, author: string, body: string, at: string): Row => ({
  cr854_cardnoteid: guid(`reply:${to.cr854_cardnoteid}:${body}`),
  _cr854_deliverycard_value: to._cr854_deliverycard_value,
  cr854_kind: 'reply',
  cr854_sourcenote: to.cr854_cardnoteid,
  cr854_author: author,
  cr854_body: body,
  createdon: at,
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
  const card = cards.find((c) => c.cr854_name === name && c.cr854_country === COUNTRY['US'] && String(c.cr854_scheduledat ?? '') >= '2026-10-15')
  if (!card) continue
  const id = card.cr854_deliverycardid as string
  codes.forEach((code, i) => {
    deliveryProducts.push({
      cr854_deliveryproductid: guid(`dp:upcoming:${id}:${code}`),
      cr854_name: code,
      _cr854_deliverycard_value: id,
      _cr854_product_value: productId(code),
      cr854_sortorder: i,
      cr854_reason: '',
      cr854_source: 588230000,
      cr854_state: 588230000,
      cr854_section: i < 2 ? 0 : 1,
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
const pastOf = cards.filter((c) => c.cr854_country === COUNTRY['US'] && String(c.cr854_scheduledat ?? '') < '2026-10-14')
for (const orig of pastOf) {
  const oid = orig.cr854_deliverycardid as string
  const picked = deliveryProducts.filter((d) => d._cr854_deliverycard_value === oid && d.cr854_state === 588230000)
  for (let k = 1; k <= PAST_WEEKS; k++) {
    const r = rand(`past:${oid}:${k}`)
    const id = guid(`card:past:${oid}:${k}`)
    const at = new Date(String(orig.cr854_scheduledat))
    at.setUTCDate(at.getUTCDate() - 7 * k)
    const iso = at.toISOString()
    const usHeroes = heroes.filter((h) => h.cr854_market === US_MARKET)
    const pool = products.filter((p) => p.cr854_market === US_MARKET)
    cards.push({
      ...orig,
      cr854_deliverycardid: id,
      cr854_scheduledat: iso,
      cr854_status: 588230003,
      cr854_productiondue: iso.slice(0, 10),
      cr854_handedoffat: iso,
      ...(orig._cr854_heroimage_value && usHeroes.length > 0 ? { _cr854_heroimage_value: usHeroes[Math.floor(r() * usHeroes.length)].cr854_heroimageid } : {}),
    })
    picked.forEach((d, i) => {
      deliveryProducts.push({
        ...d,
        cr854_deliveryproductid: guid(`dp:past:${id}:${i}`),
        _cr854_deliverycard_value: id,
        _cr854_product_value: pool[Math.floor(r() * pool.length)]?.cr854_productid ?? d._cr854_product_value,
      })
    })
    // 週の計画: その週(日曜日から)を確定にする
    const sun = new Date(at.getTime() + 9 * 3600_000)
    sun.setUTCDate(sun.getUTCDate() - sun.getUTCDay())
    const ws = sun.toISOString().slice(0, 10)
    if (!weeks.some((w) => w.cr854_weekstart === ws)) {
      weeks.push({ cr854_weekid: guid(`week:${ws}`), cr854_weekstart: ws, cr854_status: 'confirmed', cr854_submittedat: `${ws}T00:00:00.000Z`, cr854_confirmedat: `${ws}T00:00:00.000Z` })
    }
  }
}

// ---- 配信結果(配信のあとに取り込む結果。GCP 版だけのテーブル)
// 2026-10-14 より前に送った配信に、それっぽい数字を入れる。同じ配信なら、同じ数字になる(乱数は、配信 ID から作る)
const RESULTS_BEFORE = '2026-10-14'
export const deliveryResults: Row[] = cards
  .filter((c) => String(c.cr854_scheduledat ?? '') < RESULTS_BEFORE)
  .map((c) => {
    const id = c.cr854_deliverycardid as string
    const r = rand(`result:${id}`)
    const push = c.cr854_channel === 588230001
    const us = c.cr854_country === COUNTRY['US']
    const recipients = Math.round((push ? 60000 : 120000) * (0.8 + r() * 0.4))
    const opens = Math.round(recipients * (push ? 0.06 + r() * 0.06 : 0.18 + r() * 0.14))
    const clicks = Math.round(opens * (push ? 0.35 + r() * 0.2 : 0.1 + r() * 0.12))
    const orders = Math.round(clicks * (0.03 + r() * 0.04))
    // 商品: 選んだ商品があればそれ、なければ同じ市場の商品から 3 点
    const picked = deliveryProducts
      .filter((d) => d._cr854_deliverycard_value === id && d.cr854_state === 588230000)
      .map((d) => d._cr854_product_value as string)
    const pool = products.filter((p) => p.cr854_market === (us ? US_MARKET : JP_MARKET))
    const ids = picked.length > 0 ? picked : [0, 1, 2].map(() => pool[Math.floor(r() * pool.length)]?.cr854_productid as string).filter((v, i, a) => v && a.indexOf(v) === i)
    let left = orders
    const items = ids.map((pid, i) => {
      const p = products.find((x) => x.cr854_productid === pid)
      const share = i === ids.length - 1 ? 1 : 0.3 + r() * 0.3
      const units = i === ids.length - 1 ? left : Math.round(left * share)
      left -= units
      // 上の枠ほど押されやすい(位置で比べたときに、傾向が見えるように)
      return { productId: pid, clicks: Math.round((clicks / ids.length) * (1.3 / (1 + 0.2 * i)) * (0.6 + r() * 0.8)), units, revenue: Math.round(units * Number(p?.cr854_price ?? 0)) }
    })
    const revenue = items.reduce((s, x) => s + x.revenue, 0) || Math.round(orders * (us ? 80 : 9000))
    return {
      cr854_deliveryresultid: guid(`result:${id}`),
      _cr854_deliverycard_value: id,
      cr854_sentat: c.cr854_scheduledat,
      cr854_recipients: recipients,
      cr854_opens: opens,
      cr854_clicks: clicks,
      cr854_orders: orders,
      cr854_revenue: revenue,
      cr854_lastyearrevenue: Math.round(revenue * (0.75 + r() * 0.5)),
      cr854_products: JSON.stringify(items),
      // リンクごとのクリック(延べ回数。1 人が何度も押すので、クリックした人の数より多い)
      cr854_links: JSON.stringify({
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
  const c = cards.find((x) => x.cr854_name === name && String(x.cr854_scheduledat ?? '').slice(0, 10) === date)
  const r = c && deliveryResults.find((x) => x._cr854_deliverycard_value === c.cr854_deliverycardid)
  if (r) r.cr854_notes = notes
}
