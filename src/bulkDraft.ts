// 複数の配信カードを、まとめて AI で作る(バックログ W14)。下書きモード(useBulkDrafts)から使う、React を使わない部分。
// 下書きの中身は、配信カードの「すべてAIで下書き」(runAutoDraft)と同じ手順で作り、保存も配信カードの保存と同じ形にする
// (あとで配信カードを開いて直したとき、AI で 1 本ずつ作ったものと、見分けがつかないように)
import type { DeliveryCard, DeliveryCardFields } from './models/deliveryCards'
import type { Product } from './models/products'
import type { HeroImage } from './models/heroImages'
import type { WeekRow } from './data/weeks'
import type { AiCard } from './aiSelect'
import { DeliveryCardsService } from './data/deliveryCards'
import { DeliveryProductsService } from './data/deliveryProducts'
import { runAutoDraft, type AutoDraftProgress, type AutoDraftResult } from './autoDraft'
import { cardMarket, heroMarket, productMarket } from './market'
import { channelOptions, countryOptions, departmentOptions, CHANNEL_EMAIL, CHANNEL_PUSH } from './status'
import { DEFAULT_PUSH_TEMPLATE, DEFAULT_TEMPLATE, TEMPLATE_VALUES, channelOf, sectionIndexAt, sectionsOf } from './templates'
import { SOURCE_AI, STATE_CANDIDATE, STATE_SELECTED } from './items'
import { WEEKLY_PRODUCT_LIMIT } from './reviewChecks'
import { confirmedWeekOf, dayKeyOf, sundayOf, weekKeyOf } from './weekLock'
import { logEvent } from './history'
import { loadPref, savePref } from './settings'
import { locale, tr } from './i18n'

/** 1 回に作れる本数(AI の呼び出しが多くなりすぎず、見比べて選べる数) */
export const BULK_MAX = 10
/** 同時に作る本数(AI の呼び出しを詰まらせず、待ち時間も長くしない) */
export const BULK_PARALLEL = 3
/** まとめて作るときの、配信の時刻の既定(カレンダーで日付を押したときと同じ) */
export const BULK_TIME = '10:00'

export type DraftState = 'idle' | 'running' | 'done' | 'failed' | 'saved'

/** 作る配信 1 本(行)と、その下書き */
export interface Draft {
  key: string
  /** 配信日時(datetime-local の値) */
  scheduledAt: string
  country: string
  channel: string
  department: string
  /** テーマのヒント(空なら、AI に任せる) */
  hint?: string
  state: DraftState
  /** 作っている工程(running のときだけ) */
  step?: string
  done?: number
  total?: number
  result?: AutoDraftResult
  error?: string
  /** 保存の対象に選んでいるか */
  checked?: boolean
  /** 保存した配信カードの id */
  savedId?: string
}

export const newDraft = (row: Pick<Draft, 'scheduledAt' | 'country' | 'channel' | 'department' | 'hint'>): Draft => ({ key: crypto.randomUUID(), state: 'idle', ...row })

const label = (opts: { value: string; label: string }[], v: string) => opts.find((o) => String(o.value) === v)?.label ?? ''
const iso = (local: string) => (local ? new Date(local).toISOString() : '')
const isPush = (d: Pick<Draft, 'channel'>) => d.channel === CHANNEL_PUSH

/** 下書きの、配信の名前。テーマを名前にする(あとで配信カードで直せる)。テーマがないときは、日付とチャネル */
export function draftName(d: Draft): string {
  const theme = d.result?.theme?.trim()
  if (theme) return theme
  const when = d.scheduledAt ? new Date(d.scheduledAt).toLocaleDateString(locale(), { month: 'numeric', day: 'numeric' }) : ''
  return `${when} ${isPush(d) ? tr('アプリ', 'App') : tr('メール', 'Email')}`.trim()
}

/** 下書きのテンプレート(AI が決めていなければ、チャネルの既定) */
const templateOf = (d: Draft) => {
  const tpl = d.result?.template
  const fallback = isPush(d) ? DEFAULT_PUSH_TEMPLATE : DEFAULT_TEMPLATE
  return tpl && channelOf(tpl) === (isPush(d) ? 'push' : 'email') ? tpl : fallback
}

/** 載せる商品(選定済み。メールの並び順) */
export const draftProductIds = (d: Draft): string[] => (d.result?.sections ?? []).flatMap((s) => s.selected.map((r) => r.productId))

/** 保存する列(配信カードの buildContent と同じ形。ステータスは「未起案」) */
export function draftFields(d: Draft, products: Product[]): DeliveryCardFields {
  const r = d.result
  const template = templateOf(d)
  const name = (id: string) => products.find((p) => p.id === id)?.name ?? ''
  const titles = (r?.sections ?? []).map((s) => s.title)
  const copies = (r?.sections ?? []).map((s) => s.copy)
  return {
    name: draftName(d),
    scheduled_at: iso(d.scheduledAt) || undefined,
    country: (d.country || undefined) as DeliveryCardFields['country'],
    channel: (d.channel || undefined) as DeliveryCardFields['channel'],
    department: (d.department || undefined) as DeliveryCardFields['department'],
    status: 'not_started',
    theme: r?.theme ?? '',
    theme_reason: r?.theme ? (r.themeIdeas[0]?.reason ?? '') : '',
    headline: r?.headline ?? '',
    copy: r?.copy ?? '',
    copy_angle: r?.headline ? (r.copyIdeas[0]?.angle ?? '') : '',
    instructions: r?.instructions ?? '',
    instructions_angle: r?.instructions ? (r.instructionIdeas[0]?.angle ?? '') : '',
    push_title: r?.pushTitle ?? '',
    push_body: r?.pushBody ?? '',
    products: draftProductIds(d).map(name).filter(Boolean).join(' / '),
    hero_reason: r?.hero?.hero?.reason ?? '',
    email_template: TEMPLATE_VALUES[template],
    layout_key: template,
    section_titles: titles.join('\n').replace(/\n+$/, ''),
    section_copies: copies.some(Boolean) ? JSON.stringify(copies) : '',
    hero_image_id: r?.hero?.hero?.heroId,
  }
}

/** 画面で、保存済みの配信と同じ部品(プレビュー・確認の一覧)に渡すための、仮の配信カード */
export const draftCard = (d: Draft, products: Product[]): DeliveryCard => ({ ...draftFields(d, products), id: draftId(d) })
export const draftId = (d: Pick<Draft, 'key'>) => `draft:${d.key}`
export const isDraftId = (id: string) => id.startsWith('draft:')

export interface DraftContext {
  products: Product[]
  heroes: HeroImage[]
  /** 他の配信(保存済みと、先に作った下書き)のテーマ。同じテーマを避ける */
  otherThemes: string[]
  /** 同じ週に、もう上限まで載せた商品(選ばない) */
  avoidProductIds: string[]
  onTheme?: (theme: string) => void
}

/** 下書きを 1 本作る(配信の国に合う市場の商品・メイン画像だけを使う) */
export async function generateDraft(d: Draft, ctx: DraftContext, onStep: AutoDraftProgress, isCancelled: () => boolean): Promise<AutoDraftResult> {
  const market = cardMarket(d.country)
  const products = market ? ctx.products.filter((p) => productMarket(p) === market) : ctx.products
  const heroes = market ? ctx.heroes.filter((h) => heroMarket(h) === market) : ctx.heroes
  const card: AiCard = {
    name: '',
    scheduledAt: iso(d.scheduledAt),
    country: label(countryOptions, d.country),
    channel: label(channelOptions, d.channel),
    department: label(departmentOptions, d.department),
    theme: '',
    headline: '',
    copy: '',
    instructions: '',
  }
  return runAutoDraft(
    { card, language: 'auto', otherThemes: ctx.otherThemes, products, heroes, channel: isPush(d) ? 'push' : 'email', avoidProductIds: ctx.avoidProductIds, onTheme: ctx.onTheme, themeHint: d.hint },
    onStep,
    isCancelled,
  )
}

/** その週に、上限(WEEKLY_PRODUCT_LIMIT)まで載せた商品。確認の一覧(W4)の「載せすぎ」を、作る前に避ける */
export function overusedInWeek(when: string, cards: { id: string; scheduled_at?: string }[], cardProducts: Map<string, string[]>): string[] {
  if (!when) return []
  const key = weekKeyOf(new Date(when))
  const count = new Map<string, number>()
  for (const c of cards) {
    if (!c.scheduled_at || weekKeyOf(new Date(c.scheduled_at)) !== key) continue
    for (const pid of new Set(cardProducts.get(c.id) ?? [])) count.set(pid, (count.get(pid) ?? 0) + 1)
  }
  return [...count].filter(([, n]) => n >= WEEKLY_PRODUCT_LIMIT).map(([pid]) => pid)
}

/**
 * 下書きを保存する(配信カードと、載せる商品・候補)。保存した配信は「未起案」から始め、履歴に「AI でまとめて作成」を残す。
 * 商品の行は、配信カードの syncItems と同じ形(選定は並び順、候補は 1000 番から)
 */
export async function saveDraft(d: Draft, products: Product[]): Promise<string> {
  const fields = draftFields(d, products)
  const res = await DeliveryCardsService.create({ ...fields, state_code: 0 })
  if (!res.success) throw new Error(res.error?.message ?? tr('保存に失敗しました', 'Failed to save'))
  const id = res.data?.id
  if (!id) throw new Error(tr('配信カードのIDを取得できませんでした', 'Could not get the delivery card ID'))
  const sections = sectionsOf(templateOf(d))
  const name = (pid: string) => products.find((p) => p.id === pid)?.name ?? ''
  const secs = d.result?.sections ?? []
  const rows = [
    ...secs.flatMap((s) => s.selected).map((r, idx) => ({ r, state: STATE_SELECTED as typeof STATE_SELECTED | typeof STATE_CANDIDATE, section: sectionIndexAt(sections, idx), order: idx + 1 })),
    ...secs.flatMap((s, i) => s.candidates.map((r) => ({ r, section: i }))).map((x, i) => ({ ...x, state: STATE_CANDIDATE as typeof STATE_SELECTED | typeof STATE_CANDIDATE, order: 1000 + i })),
  ]
  for (const row of rows) {
    const p = await DeliveryProductsService.create({
      sort_order: row.order,
      reason: row.r.reason,
      source: SOURCE_AI,
      state: row.state,
      section: row.section,
      name: `${fields.name} / ${name(row.r.productId)}`,
      delivery_card_id: id,
      product_id: row.r.productId,
      state_code: 0,
    })
    if (!p.success) throw new Error(p.error?.message ?? tr('掲載商品の保存に失敗しました', 'Failed to save the products in this delivery'))
  }
  await logEvent({ action: 'bulk_create', card: { id, name: fields.name, scheduledAt: fields.scheduled_at }, to: 'not_started' })
  return id
}

/** 確定した週に入る行か(作れない。確定した週を変えるときは、配信カードで理由を残す流れのため) */
export const lockedWeekOf = (weeks: WeekRow[], d: Pick<Draft, 'scheduledAt'>) => confirmedWeekOf(weeks, d.scheduledAt)

/**
 * 週の、選んだ国・チャネルの配信がない日(今日より前の日と、確定した週は除く)。最初の行と「空いている日で埋める」に使う。
 * 国・チャネルで見るのは、「今週の US 向けメール」のように、国とチャネルを決めてから、まとめて作るため
 */
export function emptyDays(weekStart: Date, cards: { scheduled_at?: string; channel?: string; country?: string }[], weeks: WeekRow[], channel: string, country: string): string[] {
  const today = dayKeyOf(new Date())
  const start = sundayOf(weekStart)
  if (confirmedWeekOf(weeks, start.toISOString())) return []
  const same = (c: { channel?: string; country?: string }) => (c.channel ?? CHANNEL_EMAIL) === channel && (!country || !c.country || c.country === country)
  const used = new Set(cards.filter((c) => same(c) && c.scheduled_at).map((c) => dayKeyOf(new Date(c.scheduled_at!))))
  const out: string[] = []
  for (let i = 0; i < 7; i++) {
    const key = dayKeyOf(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
    if (key >= today && !used.has(key)) out.push(key)
  }
  return out
}

// 作った下書きは、ブラウザに控えておく(画面が落ちたときに、AI の結果を失わないため。保存の代わりにはしない)
const BACKUP_KEY = 'bulkCreate.backup'
export const loadBackup = (): Draft[] => {
  const v = loadPref<Draft[] | null>(BACKUP_KEY, null)
  return Array.isArray(v) ? v.filter((d) => d.state === 'done' && d.result).map((d) => ({ ...d, checked: true })) : []
}
export const saveBackup = (drafts: Draft[]) => {
  const keep = drafts.filter((d) => d.state === 'done' && d.result)
  savePref(BACKUP_KEY, keep.length > 0 ? keep : null)
}
