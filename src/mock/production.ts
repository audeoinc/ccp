// 撮影・デモ用の、制作の依頼の窓口(/api/production)の身代わり。src/data/production.ts と同じ形で呼べる(vite.mock.config.ts が差し替える)。
// 流れは本番のサーバー(server/ccp/production.py)と同じ。表はメモリ上(src/mock/db.ts の tables)
import type { Actor } from '../data/approvals'
import { parseVariantHtml } from '../productionSnapshot'
import type { RequestInput } from '../data/production'
import type { ProductionRequest } from '../models/productionRequests'
import { tables } from './db'
import { guid, type Row } from './seed'
import { canGoProduction } from '../productionGate'
import type { DeliveryCard } from '../models/deliveryCards'

type Result<T> = { success: boolean; data?: T; error?: { message: string } }
const ng = <T,>(message: string): Result<T> => ({ success: false, error: { message } })
const now = () => new Date().toISOString()
const newId = (key: string) => guid(`${key}:${Math.random()}:${Date.now()}`)
const LIVE = new Set(['requested', 'in_progress', 'done', 'checked'])

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
  if (!canGoProduction(card as Pick<DeliveryCard, 'status'>)) return ng('承認されていない配信です(先に承認を受けてください)')
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
    variant_html: input.variant_html || undefined,
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
  async saveHtml(id: string, input: { actor: Actor; html: string; variant?: string }) {
    if (!input.actor?.id) return ng<ProductionRequest>('右上で、だれでログインするかを選んでください')
    const r = tables.ProductionRequestsService.find((x) => x.id === id)
    if (!r) return ng<ProductionRequest>('制作の依頼が見つかりません')
    if (r.status === 'stale') return ng<ProductionRequest>('古い版には保存できません(企画が変わりました)')
    const v = (input.variant ?? 'A').toUpperCase()
    if (v === 'A') Object.assign(r, { html: input.html, html_saved_at: now(), html_saved_by_name: input.actor.name, modified_on: now() })
    else Object.assign(r, { variant_html: JSON.stringify({ ...parseVariantHtml(r.variant_html as string | undefined), [v]: { html: input.html, saved_at: now(), saved_by_name: input.actor.name } }), modified_on: now() })
    return { success: true, data: structuredClone(r) as unknown as ProductionRequest }
  },
  async saveEdits(id: string, input: { actor: Actor; edited_snapshot: string; week_start?: string }) {
    if (!input.actor?.id) return ng<ProductionRequest>('右上で、だれでログインするかを選んでください')
    const r = tables.ProductionRequestsService.find((x) => x.id === id)
    if (!r) return ng<ProductionRequest>('制作の依頼が見つかりません')
    if (r.status === 'stale') return ng<ProductionRequest>('古い版には保存できません(企画が変わりました)')
    Object.assign(r, { edited_snapshot: input.edited_snapshot || undefined, edited_at: now(), edited_by_name: input.actor.name, modified_on: now() })
    const card = tables.DeliveryCardsService.find((c) => c.id === r.delivery_card_id)
    if (card) event('production_edit', input.actor, card, input.week_start, `版 ${r.version}${input.edited_snapshot ? '' : '(承認された写しに戻した)'}`)
    return { success: true, data: structuredClone(r) as unknown as ProductionRequest }
  },
  async undo(id: string, input: { actor: Actor; week_start?: string }) {
    // 本番の undo と同じ: いまの状態 → 戻した先と、消す記録
    const map: Record<string, [string, string[]]> = {
      sent: ['checked', ['sent_at', 'sent_by_name']],
      checked: ['done', ['checked_at', 'checked_by_name']],
      done: ['in_progress', ['done_at', 'done_by_name', 'done_note', 'done_link']],
      in_progress: ['requested', ['received_at', 'received_by_name']],
      requested: ['withdrawn', []],
    }
    const r = tables.ProductionRequestsService.find((x) => x.id === id)
    const status = String(r?.status ?? '')
    let [to, clear] = map[status] ?? ['', []]
    if (status === 'sent' && !r?.checked_at) [to, clear] = r?.done_at ? ['done', ['sent_at', 'sent_by_name']] : ['withdrawn', []]
    return advance(id, input.actor, Object.keys(map), { status: to, ...Object.fromEntries(clear.map((k) => [k, undefined])) }, 'production_undo', input.week_start, `版 ${r?.version}: ${status} → ${to}`, 'この版は戻せません(古い版か、取り下げた版です)')
  },
  async check(id: string, input: { actor: Actor; week_start?: string }) {
    return advance(id, input.actor, ['done'], { status: 'checked', checked_at: now(), checked_by_name: input.actor.name }, 'production_check', input.week_start, undefined, '制作が終わった版だけを確認できます')
  },
  async revise(id: string, input: { actor: Actor; note: string; week_start?: string }) {
    if (!input.note?.trim()) return ng<ProductionRequest>('直してほしいことを書いてください')
    return advance(
      id,
      input.actor,
      ['done', 'checked'],
      { status: 'in_progress', done_at: undefined, done_by_name: undefined, checked_at: undefined, checked_by_name: undefined, revision_note: input.note.trim(), revision_at: now(), revision_by_name: input.actor.name },
      'production_revise',
      input.week_start,
      input.note.trim(),
      '制作が終わった版だけを、直してもらえます',
    )
  },
  async sendRequest(id: string, input: { actor: Actor; html?: string; variant_html?: string; week_start?: string }) {
    return advance(id, input.actor, ['checked'], { status: 'sent', sent_at: now(), sent_by_name: input.actor.name, ...(input.html ? { html: input.html } : {}), ...(input.variant_html ? { variant_html: input.variant_html } : {}) }, 'production_send', input.week_start, '配信のしくみへの送信は、まだ仮', '仕上がりを確認した版だけを送れます(まだ確認していないか、古い版です)')
  },
  async send(input: RequestInput) {
    const r = create(input, 'sent')
    return r.success ? { ...r, data: { ...r.data!, message: '送りました' } } : r
  },
}
