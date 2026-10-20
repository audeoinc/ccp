// 撮影・デモ用の、データベースの身代わり(メモリ上のデータ)。表ごとのサービス(src/data)と、同じ形で呼べる。
// vite.mock.config.ts が、サービスの読み込みを、ここに差し替える。ページを読み込み直すと、データは、最初に戻る。

import { mockAgent } from './agent'
import { approvalGroupMembers, approvalGroups, approvalRequests, approvalReviewers, approvalRules, cardNotes, notifications, noteReactions, processChecks, processInterviews, productionRequests, productRankings, cards, categoryMetrics, changeLogs, deliveryResults, events, weeks, deliveryProducts, guid, heroes, layoutTemplates, policies, productMetrics, products, users, weekly, type Row } from './seed'
import { sampleAds } from './ads'

export const tables: Record<string, Row[]> = {
  DeliveryCardsService: structuredClone(cards),
  DeliveryProductsService: structuredClone(deliveryProducts),
  ProductsService: structuredClone(products),
  HeroImagesService: structuredClone(heroes),
  WeeklyPerformancesService: structuredClone(weekly),
  ProductRankingsService: structuredClone(productRankings),
  ProductPoliciesService: structuredClone(policies),
  LayoutTemplatesService: structuredClone(layoutTemplates),
  AiRequestsService: [],
  CardNotesService: structuredClone(cardNotes),
  WeeksService: structuredClone(weeks),
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
  // マーケティングポリシー(M3・M4)。撮影用には入れない(取り込みは本物のサーバーだけ)
  PolicyRulesService: [],
  SalesPoliciesService: [],
  // 前提運用の照らし合わせ(⚙ の画面)
  ProcessInterviewsService: structuredClone(processInterviews),
  ProcessChecksService: structuredClone(processChecks),
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

/** `項目 eq 値`(値は、'文字' か、そのままの文字)だけを読む簡単な絞り込み */
function matches(row: Row, filter?: string): boolean {
  if (!filter) return true
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
    async getAll(options?: Options) {
      let list = rows.filter((r) => matches(r, options?.filter)).map(clone)
      const ob = options?.orderBy?.[0]?.split(' ')
      if (ob?.[0]) {
        const dir = ob[1] === 'desc' ? -1 : 1
        list = list.sort((a, b) => (String(a[ob[0]] ?? '') < String(b[ob[0]] ?? '') ? -dir : String(a[ob[0]] ?? '') > String(b[ob[0]] ?? '') ? dir : 0))
      }
      if (options?.top) list = list.slice(0, options.top)
      return { success: true, data: list }
    },
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
      const row: Row = { [key]: guid(`${name}:${Math.random()}:${Date.now()}`), created_on: new Date().toISOString() }
      applyBinds(row, record)
      rows.push(row)
      if (name === 'AiRequestsService') waiting.set(row[key] as string, Date.now() + DELAY_MS)
      return { success: true, data: clone(row) }
    },
    async update(id: string, fields: Row) {
      const r = find(id)
      if (!r) return { success: false, error: { message: 'not found' } }
      logChange(name, r, fields)
      applyBinds(r, fields)
      return { success: true, data: clone(r) }
    },
    async delete(id: string) {
      const i = rows.findIndex((r) => r[key] === id)
      if (i >= 0) rows.splice(i, 1)
    },
  }
}
