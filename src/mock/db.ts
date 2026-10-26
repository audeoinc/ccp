// 撮影・デモ用の、データベースの身代わり(メモリ上のデータ)。表ごとのサービス(src/data)と、同じ形で呼べる。
// vite.mock.config.ts が、サービスの読み込みを、ここに差し替える。ページを読み込み直すと、データは、最初に戻る。

import { dropSharedReads, shareRead } from '../gcp/readShare'
import { mockAgent } from './agent'
import { approvalGroupMembers, approvalGroups, approvalRequests, approvalReviewers, approvalRules, campaigns, cardNotes, notifications, noteReactions, productionRequests, productRankings, cards, categoryMetrics, changeLogs, deliveryResults, events, weeks, deliveryProducts, guid, heroes, layoutTemplates, policies, productMetrics, products, users, weekly, type Row } from './seed'
import { sampleAds } from './ads'
import { buildSampleSkus } from '../skuSampleData'
import { sampleImpact } from '../impact'
import type { DeliveryCard } from '../models/deliveryCards'
import type { DeliveryResult } from '../data/deliveryResults'

function impactTables(): Record<string, Row[]> {
  const { runs, lifts } = sampleImpact(cards as unknown as DeliveryCard[], deliveryResults as unknown as DeliveryResult[])
  return {
    AiRunsService: runs.map((r, i) => ({ id: guid(`ai_run:${i}`), created_on: new Date().toISOString(), ...r })),
    DeliveryLiftsService: lifts.map((r, i) => ({ id: guid(`lift:${i}`), ...r })),
  }
}

// 部品の画像の見本(X59 ③): ボタン・ロゴ・バナー
const svg = (body: string, w: number, h: number) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`)}`
// SKU の見本(X63): 商品ごとに色 × サイズ。在庫の合計は商品の在庫と同じ(src/skuSampleData.ts)
function skuTables(): Record<string, Row[]> {
  const asOf = new Date().toISOString()
  const built = (products as Row[]).flatMap((p) => buildSampleSkus(p as Parameters<typeof buildSampleSkus>[0], asOf))
  return {
    SkuService: built.map((r, i) => ({ id: guid(`sku:${i}`), ...r.sku })),
    SkuStockService: built.map((r, i) => ({ id: guid(`sku_stock:${i}`), ...r.stock })),
  }
}

const sampleParts = (): Row[] =>
  [
    { name: '黒の「今すぐ見る」ボタン', kind: 'button', market: 'JP', alt_text: '今すぐ見る', tags: '黒, 角丸, 行動の呼びかけ', w: 480, h: 112, body: '<rect x="4" y="4" width="472" height="104" rx="52" fill="#1b1f2a"/><text x="240" y="70" font-family="sans-serif" font-size="40" fill="#fff" text-anchor="middle">今すぐ見る</text>' },
    { name: 'Black "Shop now" button', kind: 'button', market: 'US', alt_text: 'Shop now', tags: 'black, rounded, call to action', w: 480, h: 112, body: '<rect x="4" y="4" width="472" height="104" rx="52" fill="#1b1f2a"/><text x="240" y="70" font-family="sans-serif" font-size="40" fill="#fff" text-anchor="middle">Shop now</text>' },
    { name: 'SHOP ロゴ(白抜き)', kind: 'logo', market: 'JP', alt_text: 'SHOP', tags: 'ロゴ, 白, ヘッダー', w: 360, h: 96, body: '<text x="180" y="66" font-family="sans-serif" font-size="56" font-weight="700" letter-spacing="12" fill="#1b1f2a" text-anchor="middle">SHOP</text>' },
    { name: '送料無料バナー', kind: 'banner', market: 'JP', alt_text: '5,000円以上で送料無料', tags: '送料無料, 帯, 黄', w: 1200, h: 160, body: '<rect width="1200" height="160" fill="#f3c845"/><text x="600" y="98" font-family="sans-serif" font-size="56" font-weight="700" fill="#1b1f2a" text-anchor="middle">5,000円以上で送料無料</text>' },
  ].map(({ w, h, body, ...p }, i) => ({ id: guid(`part:${i}`), ...p, width: w, height: h, image_url: svg(body, w, h), created_on: new Date(Date.now() - i * 86400000).toISOString() }))

export const tables: Record<string, Row[]> = {
  DeliveryCardsService: structuredClone(cards),
  DeliveryProductsService: structuredClone(deliveryProducts),
  ProductsService: structuredClone(products),
  HeroImagesService: structuredClone(heroes),
  PartImagesService: sampleParts(),
  WeeklyPerformancesService: structuredClone(weekly),
  ProductRankingsService: structuredClone(productRankings),
  ProductPoliciesService: structuredClone(policies),
  // 商品ページから取り込んだ画像(B11)。見本では、モデルの使用期限のアラートを見せる 1 枚だけ(U05 のメイン。10/1 の Fall Arrivals に載っている)。
  // 画像を選ぶ窓は、見本の EC サイトのページを読む
  ProductImagesService: products
    .filter((p) => p.product_code === 'U05')
    .map((p) => ({ id: guid('pimg:U05'), name: `${p.name}`, product_id: p.id, product_code: p.product_code, market: p.market, image_url: p.image_url, is_main: 1, source: 'sample', alt: `${p.name}`, caption: 'Sample photo for trying the sample shop page (X76).', model_usable_until: '2026-09-30' })),
  // 国ごとの設定(ST2)。見本では空(既定の値)
  CountrySettingsService: [],
  // 国ごとの適用(ST7)。見本では空(すべての国で、すべてのテンプレートを使う)
  CountryApplicationsService: [],
  // 国ごとの配信の型(ST9)の見本: JP は月・水・金のメールと土曜のアプリ、US は火・木のメール
  DeliveryPatternsService: [
    { id: guid('pattern:jp-mon'), name: '週はじめの新作', country: 'JP', weekday: 1, time: '10:00', channel: 'email', theme_type: 'new', layout_key: 'standard4', sort_order: 0 },
    { id: guid('pattern:jp-wed'), name: '', country: 'JP', weekday: 3, time: '12:00', channel: 'email', theme_type: 'season', layout_key: 'story', sort_order: 0 },
    { id: guid('pattern:jp-fri'), name: '週末のセール', country: 'JP', weekday: 5, time: '18:00', channel: 'email', theme_type: 'sale', layout_key: 'sale', sort_order: 0 },
    { id: guid('pattern:jp-sat'), name: '', country: 'JP', weekday: 6, time: '11:00', channel: 'app', theme_type: 'limited', layout_key: '', sort_order: 0 },
    // US は見本のボタン(src/samplePatterns.ts)と同じ中身
    { id: guid('pattern:us-mon'), name: 'Monday New Arrivals', country: 'US', weekday: 1, time: '09:00', channel: 'email', theme_type: 'new', layout_key: 'standard4', sort_order: 0 },
    { id: guid('pattern:us-wed'), name: 'Midweek Edit', country: 'US', weekday: 3, time: '11:00', channel: 'email', theme_type: 'season', layout_key: 'story', sort_order: 0 },
    { id: guid('pattern:us-thu'), name: 'Thursday Flash Deal', country: 'US', weekday: 4, time: '18:00', channel: 'app', theme_type: 'limited', layout_key: 'push-sale', sort_order: 0 },
    { id: guid('pattern:us-fri'), name: 'Weekend Sale Preview', country: 'US', weekday: 5, time: '09:00', channel: 'email', theme_type: 'sale', layout_key: 'sale', sort_order: 0 },
    { id: guid('pattern:us-sat'), name: 'Back in Stock', country: 'US', weekday: 6, time: '10:00', channel: 'app', theme_type: 'restock', layout_key: 'push-product', sort_order: 0 },
    { id: guid('pattern:us-sun'), name: "Sunday Members' Picks", country: 'US', weekday: 0, time: '17:00', channel: 'email', theme_type: 'member', layout_key: 'spotlight', sort_order: 0 },
  ],
  LayoutTemplatesService: structuredClone(layoutTemplates),
  LayoutTemplateVersionsService: [],
  AiRequestsService: [],
  CardNotesService: structuredClone(cardNotes),
  CardAssetsService: [],
  // 開発へのリクエスト(画面のどこでも右クリックで打つピン)。見本では空から
  DevRequestsService: [],
  DevRequestVotesService: [],
  WeeksService: structuredClone(weeks),
  // 月の振り返り(表 months)の見本: 前月の計画の面に「前月の振り返り」が出るように、9 月分を 1 つ
  MonthsService: [{ id: guid('month:2026-09'), month_start: '2026-09-01', retro: 'Weather-led emails beat last year in most weeks — keep one per week in October. Push taps fell on evening sends; move flash deals to noon.' }],
  DeliveryResultsService: structuredClone(deliveryResults),
  EventsService: structuredClone(events),
  ChangeLogsService: structuredClone(changeLogs),
  UsersService: structuredClone(users),
  ApprovalGroupsService: structuredClone(approvalGroups),
  ApprovalGroupMembersService: structuredClone(approvalGroupMembers),
  ApprovalRulesService: structuredClone(approvalRules),
  ApprovalRequestsService: structuredClone(approvalRequests),
  ApprovalReviewersService: structuredClone(approvalReviewers),
  NotificationsService: structuredClone(notifications),
  ProductionRequestsService: structuredClone(productionRequests),
  NoteReactionsService: structuredClone(noteReactions),
  // 外部広告の出稿の見本(X49)
  AdSpendsService: sampleAds(products),
  ProductMetricsService: structuredClone(productMetrics),
  CategoryMetricsService: structuredClone(categoryMetrics),
  ...skuTables(),
  // 配信の効果(AI の依頼の記録・ホールドアウトとの比べ)の見本。学びの判定は、人が画面で決めるので空から
  ...impactTables(),
  LearningReviewsService: [],
  // キャンペーン(X79)。同じ国・同じ配信日のメールとアプリを 3 組と、1 枚だけのもの 1 つ(seed.ts)
  CampaignsService: structuredClone(campaigns),
  // 配信ごとの学びの付け外し(X78)。人が配信カードで決めるので空から
  CardLearningsService: [],
  // マーケティングポリシー(M3・M4)。撮影用には入れない(取り込みは本物のサーバーだけ)
  PolicyRulesService: [],
  PolicyRuleEditsService: [],
  SalesPoliciesService: [],
}


// 変更の記録(本番は、サーバーが行う。server/ccp/data_api.py の WATCHED と同じ項目)
const WATCHED: Record<string, { kind: 'date' | 'policy'; fields: Record<string, string> }> = {
  DeliveryCardsService: { kind: 'date', fields: { scheduled_at: 'scheduled_at' } },
  ProductPoliciesService: { kind: 'policy', fields: { stage: 'stage', promo_period: 'promo_period', policy: 'policy' } },
}
function logChange(name: string, before: Row, fields: Row) {
  const w = WATCHED[name]
  if (!w) return
  for (const [dv, col] of Object.entries(w.fields)) {
    if (!(dv in fields) || String(before[dv] ?? '') === String(fields[dv] ?? '')) continue
    const card = name === 'DeliveryCardsService'
    tables.ChangeLogsService.push({
      id: guid(`change:${Date.now()}:${Math.random()}`),
      kind: w.kind,
      field: col,
      before_value: String(before[dv] ?? ''),
      after_value: String(fields[dv] ?? ''),
      ...(card ? { delivery_card_id: before.id, card_name: before.name } : { product_code: before.product_code }),
      created_on: new Date().toISOString(),
    })
  }
}

interface Options {
  filter?: string
  orderBy?: string[]
  top?: number
}

/** `項目 eq 値`(値は、'文字' か、そのままの文字)と `項目 ne null` だけを読む簡単な絞り込み */
function matches(row: Row, filter?: string): boolean {
  if (!filter) return true
  const nn = filter.match(/^\s*(\S+)\s+ne\s+null\s*$/i)
  if (nn) return row[nn[1]] !== undefined && row[nn[1]] !== null && row[nn[1]] !== ''
  const m = filter.match(/^\s*(\S+)\s+eq\s+(.+?)\s*$/)
  if (!m) return true
  const value = m[2].replace(/^'(.*)'$/, '$1').replace(/''/g, "'")
  return String(row[m[1]]) === value
}

const clone = <T,>(v: T): T => structuredClone(v)

/** 書き込む項目を、行に入れる(参照は、相手の id をそのまま持つ) */
function applyBinds(row: Row, fields: Row) {
  Object.assign(row, fields)
}

const DELAY_MS = 1200
const waiting = new Map<string, number>()

export function makeService(name: string) {
  const rows = tables[name]
  const key = 'id'
  const find = (id: string) => rows.find((r) => r[key] === id)
  return {
    // 本物と同じく、同じ条件の読み込みが重なったら分け合う(src/gcp/readShare.ts。デモでも同じ動きを確かめられるように)
    getAll: (options?: Options) => shareRead(`${name}?${JSON.stringify(options ?? {})}`, async () => {
      let list = rows.filter((r) => matches(r, options?.filter)).map(clone)
      const ob = options?.orderBy?.[0]?.split(' ')
      if (ob?.[0]) {
        const dir = ob[1] === 'desc' ? -1 : 1
        list = list.sort((a, b) => (String(a[ob[0]] ?? '') < String(b[ob[0]] ?? '') ? -dir : String(a[ob[0]] ?? '') > String(b[ob[0]] ?? '') ? dir : 0))
      }
      if (options?.top) list = list.slice(0, options.top)
      return { success: true, data: list }
    }),
    async get(id: string) {
      const r = find(id)
      if (!r) return { success: false, error: { message: 'not found' } }
      // AI 要求: 少し待ってから、エージェントの返答を返す(実際の待ち時間の代わり)
      if (name === 'AiRequestsService') {
        const readyAt = waiting.get(id) ?? 0
        if (Date.now() >= readyAt && r.status !== 'done') {
          r.response = mockAgent(String(r.prompt ?? ''))
          r.status = 'done'
        }
      }
      return { success: true, data: clone(r) }
    },
    async create(record: Row) {
      dropSharedReads()
      const row: Row = { [key]: guid(`${name}:${Math.random()}:${Date.now()}`), created_on: new Date().toISOString() }
      applyBinds(row, record)
      rows.push(row)
      if (name === 'AiRequestsService') waiting.set(row[key] as string, Date.now() + DELAY_MS)
      return { success: true, data: clone(row) }
    },
    async update(id: string, fields: Row) {
      const r = find(id)
      if (!r) return { success: false, error: { message: 'not found' } }
      dropSharedReads()
      logChange(name, r, fields)
      applyBinds(r, fields)
      return { success: true, data: clone(r) }
    },
    async delete(id: string) {
      dropSharedReads()
      const i = rows.findIndex((r) => r[key] === id)
      if (i >= 0) rows.splice(i, 1)
    },
  }
}
