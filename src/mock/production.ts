// 撮影・デモ用の、制作の依頼の窓口(/api/production)の身代わり。src/data/production.ts と同じ形で呼べる(vite.mock.config.ts が差し替える)。
// 流れは本番のサーバー(server/ccp/production.py)と同じ。表はメモリ上(src/mock/db.ts の tables)
import type { Actor } from '../data/approvals'
import type { RequestInput } from '../data/production'
import type { ProductionRequest } from '../models/productionRequests'
import { tables } from './db'
import { guid, type Row } from './seed'

type Result<T> = { success: boolean; data?: T; error?: { message: string } }
const ng = <T,>(message: string): Result<T> => ({ success: false, error: { message } })
const now = () => new Date().toISOString()
const newId = (key: string) => guid(`${key}:${Math.random()}:${Date.now()}`)
const APPROVED = new Set(['approved', 'confirmed'])
const LIVE = new Set(['requested', 'in_progress', 'done'])

function event(action: string, actor: Actor, card: Row, weekStart: string | undefined, note?: string) {
  tables.EventsService.push({ id: newId('event'), action, week_start: weekStart, delivery_card_id: card.id, card_name: card.name, actor: actor.name, note, created_on: now() })
}

/** 生きている版を古い版にする(本番の stale_live と同じ) */
export function staleProduction(cardId: string) {
  for (const r of tables.ProductionRequestsService) if (r.delivery_card_id === cardId && LIVE.has(String(r.status))) Object.assign(r, { status: 'stale', modified_on: now() })
}

function create(input: RequestInput, status: 'requested' | 'sent'): Result<ProductionRequest> {
  if (!input.actor?.id) return ng('右上で、だれでログインするかを選んでください')
  if (!input.snapshot) return ng('写し(snapshot)が要ります')
  const card = tables.DeliveryCardsService.find((c) => c.id === input.delivery_card_id)
  if (!card) return ng('配信カードが見つかりません')
  if (!APPROVED.has(String(card.status))) return ng('承認されていない配信です(先に承認を受けてください)')
  staleProduction(String(card.id))
  const version = Math.max(0, ...tables.ProductionRequestsService.filter((r) => r.delivery_card_id === card.id).map((r) => Number(r.version ?? 0))) + 1
  const at = now()
  const row: Row = {
    id: newId('production'),
    delivery_card_id: card.id,
    version,
    status,
    snapshot: input.snapshot,
    instructions: input.instructions,
    production_owner: input.production_owner || undefined,
    production_due: input.production_due || undefined,
    html: input.html || undefined,
    requested_at: at,
    requested_by_name: input.actor.name,
    ...(status === 'sent' ? { sent_at: at, sent_by_name: input.actor.name } : {}),
    created_on: at,
  }
  tables.ProductionRequestsService.push(row)
  event(status === 'sent' ? 'production_send' : 'production_request', input.actor, card, input.week_start, status === 'sent' ? `版 ${version}(配信のしくみへの送信は、まだ仮)` : `版 ${version}${input.production_owner ? `・担当 ${input.production_owner}` : ''}`)
  return { success: true, data: structuredClone(row) as unknown as ProductionRequest }
}

function advance(id: string, actor: Actor, allowed: string[], fields: Row, action: string, weekStart: string | undefined, note: string | undefined, refuse: string): Result<ProductionRequest> {
  if (!actor?.id) return ng('右上で、だれでログインするかを選んでください')
  const r = tables.ProductionRequestsService.find((x) => x.id === id)
  if (!r) return ng('制作の依頼が見つかりません')
  if (!allowed.includes(String(r.status))) return ng(refuse)
  Object.assign(r, fields, { modified_on: now() })
  const card = tables.DeliveryCardsService.find((c) => c.id === r.delivery_card_id)
  if (card) event(action, actor, card, weekStart, note)
  return { success: true, data: structuredClone(r) as unknown as ProductionRequest }
}

export const ProductionService = {
  async request(input: RequestInput) {
    return create(input, 'requested')
  },
  async receive(id: string, input: { actor: Actor; week_start?: string }) {
    return advance(id, input.actor, ['requested'], { status: 'in_progress', received_at: now(), received_by_name: input.actor.name }, 'production_receive', input.week_start, undefined, 'この依頼は、もう受け取られているか、古い版です')
  },
  async done(id: string, input: { actor: Actor; note?: string; link?: string; week_start?: string }) {
    const note = input.note?.trim() || undefined
    const link = input.link?.trim() || undefined
    return advance(id, input.actor, ['requested', 'in_progress'], { status: 'done', done_at: now(), done_by_name: input.actor.name, done_note: note, done_link: link }, 'production_done', input.week_start, [note, link].filter(Boolean).join(' / ') || undefined, 'この依頼は、もう終わっているか、古い版です')
  },
  async saveHtml(id: string, input: { actor: Actor; html: string }) {
    if (!input.actor?.id) return ng<ProductionRequest>('右上で、だれでログインするかを選んでください')
    const r = tables.ProductionRequestsService.find((x) => x.id === id)
    if (!r) return ng<ProductionRequest>('制作の依頼が見つかりません')
    if (r.status === 'stale') return ng<ProductionRequest>('古い版には保存できません(企画が変わりました)')
    Object.assign(r, { html: input.html, html_saved_at: now(), html_saved_by_name: input.actor.name, modified_on: now() })
    return { success: true, data: structuredClone(r) as unknown as ProductionRequest }
  },
  async send(input: RequestInput) {
    const r = create(input, 'sent')
    return r.success ? { ...r, data: { ...r.data!, message: '送りました' } } : r
  },
}
