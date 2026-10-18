// 週の枠と、まとめて AI で中身を作る(バックログ W14)。画面(useWeekFrames・FrameCard・FrameBar)から使う、React を使わない部分。
// 枠は、中身の空いた「未起案」の配信カードとして保存する(計画の骨組みとして、チームにも見え、途中でやめても残るように)。
// 中身は、配信カードの「すべてAIで下書き」(runAutoDraft)と同じ手順で作り、保存も配信カードの保存と同じ形にする
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
import { channelOptions, countryOptions, departmentOptions, CHANNEL_EMAIL, CHANNEL_PUSH, statusRank } from './status'
import { DEFAULT_PUSH_TEMPLATE, DEFAULT_TEMPLATE, TEMPLATE_VALUES, channelOf, sectionIndexAt, sectionsOf } from './templates'
import { SOURCE_AI, STATE_CANDIDATE, STATE_SELECTED } from './items'
import { WEEKLY_PRODUCT_LIMIT } from './reviewChecks'
import { themeTypeLabel, type ThemeType } from './themeTypes'
import { isCancelled } from './cancel'
import { confirmedWeekOf, dayKeyOf, sundayOf, weekKeyOf } from './weekLock'
import { logEvent } from './history'
import { tr } from './i18n'

/** 同時に作る本数(AI の呼び出しを詰まらせず、待ち時間も長くしない) */
export const BULK_PARALLEL = 3
/** 枠の配信の時刻の既定(カレンダーで日付を押したときと同じ) */
export const BULK_TIME = '10:00'

const label = (opts: { value: string; label: string }[], v?: string | null) => opts.find((o) => String(o.value) === String(v ?? ''))?.label ?? ''
const isPush = (c: { channel?: string | null }) => c.channel === CHANNEL_PUSH

/**
 * 中身のない配信(週の枠)か。未起案で、テーマ・見出し・通知・メイン画像・商品がどれもないもの。
 * 枠は、週の表示で、その場で配信名・種類を入れられる形で出し、中身ができたら、ふつうの配信として出す
 */
export function isFrame(c: DeliveryCard, productCount: number): boolean {
  if (isCancelled(c) || statusRank(c.status) > statusRank('not_started')) return false
  return !c.theme?.trim() && !c.headline?.trim() && !c.push_title?.trim() && !c.hero_image_id && productCount === 0
}

/** 中身を作れる枠か(配信名と種類を、人が決めたもの。決めてから作ると、方向が合わずに作り直すことが減る) */
export const frameReady = (c: DeliveryCard) => !!c.name?.trim() && !!c.theme_type

/** 週の、空いている日に、枠(中身のない「未起案」の配信カード)を作る */
export async function createFrames(days: string[], setup: { country: string; channel: string; department: string }): Promise<number> {
  let n = 0
  for (const day of days) {
    const res = await DeliveryCardsService.create({
      // 配信名は、あとで人が入れる(AI の案も出せる)。列は空を許さないので、空の文字にする
      name: '',
      scheduled_at: new Date(`${day}T${BULK_TIME}`).toISOString(),
      country: (setup.country || undefined) as DeliveryCardFields['country'],
      channel: (setup.channel || undefined) as DeliveryCardFields['channel'],
      department: (setup.department || undefined) as DeliveryCardFields['department'],
      status: 'not_started',
      state_code: 0,
    })
    if (!res.success) throw new Error(res.error?.message ?? tr('枠を作れませんでした', 'Could not create the slot'))
    n += 1
  }
  return n
}

/** 中身を作るときに、AI に渡す配信の基本情報(配信名・種類は、人が決めたもの) */
function aiCardOf(c: DeliveryCard): AiCard {
  return {
    name: c.name ?? '',
    scheduledAt: c.scheduled_at ?? '',
    country: label(countryOptions, c.country),
    channel: label(channelOptions, c.channel),
    department: label(departmentOptions, c.department),
    themeType: c.theme_type ? themeTypeLabel(c.theme_type as ThemeType) : undefined,
    theme: '',
    headline: '',
    copy: '',
    instructions: '',
  }
}

export interface DraftContext {
  products: Product[]
  heroes: HeroImage[]
  /** 他の配信(保存済みと、先に作った枠)のテーマ。同じテーマを避ける */
  otherThemes: string[]
  /** 同じ週に、もう上限まで載せた商品(選ばない) */
  avoidProductIds: string[]
  onTheme?: (theme: string) => void
}

/** 枠の中身を作る(配信の国に合う市場の商品・メイン画像だけを使う) */
export async function generateFor(c: DeliveryCard, ctx: DraftContext, onStep: AutoDraftProgress, isStopped: () => boolean): Promise<AutoDraftResult> {
  const market = cardMarket(String(c.country ?? ''))
  const products = market ? ctx.products.filter((p) => productMarket(p) === market) : ctx.products
  const heroes = market ? ctx.heroes.filter((h) => heroMarket(h) === market) : ctx.heroes
  return runAutoDraft(
    { card: aiCardOf(c), language: 'auto', otherThemes: ctx.otherThemes, products, heroes, channel: isPush(c) ? 'push' : 'email', avoidProductIds: ctx.avoidProductIds, onTheme: ctx.onTheme },
    onStep,
    isStopped,
  )
}

/** 作った中身のテンプレート(AI が決めていなければ、チャネルの既定) */
const templateOf = (c: DeliveryCard, r: AutoDraftResult) => {
  const fallback = isPush(c) ? DEFAULT_PUSH_TEMPLATE : DEFAULT_TEMPLATE
  return r.template && channelOf(r.template) === (isPush(c) ? 'push' : 'email') ? r.template : fallback
}

/** 載せる商品(選定済み。メールの並び順) */
const productIdsOf = (r: AutoDraftResult): string[] => r.sections.flatMap((s) => s.selected.map((x) => x.productId))

/**
 * 作った中身を、枠の配信カードに書き込む(配信カードの buildContent・syncItems と同じ形)。
 * 配信名・日時・国・チャネル・種類は、人が決めたものなので変えない。
 * 「AI 下書き・未確認」の印(ai_unchecked_at)を付ける(人が配信カードで保存するか、「確認した」を押すと外れる)
 */
export async function applyResult(c: DeliveryCard, r: AutoDraftResult, products: Product[]): Promise<void> {
  const template = templateOf(c, r)
  const pname = (id: string) => products.find((p) => p.id === id)?.name ?? ''
  const copies = r.sections.map((s) => s.copy)
  const res = await DeliveryCardsService.update(c.id, {
    theme: r.theme ?? '',
    theme_reason: r.theme ? (r.themeIdeas[0]?.reason ?? '') : '',
    headline: r.headline ?? '',
    copy: r.copy ?? '',
    copy_angle: r.headline ? (r.copyIdeas[0]?.angle ?? '') : '',
    instructions: r.instructions ?? '',
    instructions_angle: r.instructions ? (r.instructionIdeas[0]?.angle ?? '') : '',
    push_title: r.pushTitle ?? '',
    push_body: r.pushBody ?? '',
    products: productIdsOf(r).map(pname).filter(Boolean).join(' / '),
    hero_reason: r.hero?.hero?.reason ?? '',
    email_template: TEMPLATE_VALUES[template],
    layout_key: template,
    section_titles: r.sections.map((s) => s.title).join('\n').replace(/\n+$/, ''),
    section_copies: copies.some(Boolean) ? JSON.stringify(copies) : '',
    ...(r.hero?.hero?.heroId ? { hero_image_id: r.hero.hero.heroId } : {}),
    ai_unchecked_at: new Date().toISOString(),
  })
  if (!res.success) throw new Error(res.error?.message ?? tr('保存に失敗しました', 'Failed to save'))
  // 商品の行は、配信カードの syncItems と同じ形(選定は並び順、候補は 1000 番から)
  const sections = sectionsOf(template)
  const rows = [
    ...r.sections.flatMap((s) => s.selected).map((x, idx) => ({ x, state: STATE_SELECTED as typeof STATE_SELECTED | typeof STATE_CANDIDATE, section: sectionIndexAt(sections, idx), order: idx + 1 })),
    ...r.sections.flatMap((s, i) => s.candidates.map((x) => ({ x, section: i }))).map((y, i) => ({ ...y, state: STATE_CANDIDATE as typeof STATE_SELECTED | typeof STATE_CANDIDATE, order: 1000 + i })),
  ]
  for (const row of rows) {
    const p = await DeliveryProductsService.create({
      sort_order: row.order,
      reason: row.x.reason,
      source: SOURCE_AI,
      state: row.state,
      section: row.section,
      name: `${c.name} / ${pname(row.x.productId)}`,
      delivery_card_id: c.id,
      product_id: row.x.productId,
      state_code: 0,
    })
    if (!p.success) throw new Error(p.error?.message ?? tr('掲載商品の保存に失敗しました', 'Failed to save the products in this delivery'))
  }
  await logEvent({ action: 'bulk_create', card: { id: c.id, name: c.name, scheduledAt: c.scheduled_at }, to: 'not_started' })
}

/** 「確認した」: AI 下書き・未確認の印を外す */
export async function markChecked(id: string): Promise<void> {
  const res = await DeliveryCardsService.update(id, { ai_unchecked_at: null as never })
  if (!res.success) throw new Error(res.error?.message ?? tr('保存に失敗しました', 'Failed to save'))
}

/** その週に、上限(WEEKLY_PRODUCT_LIMIT)まで載せた商品。確認の一覧(W4)の「載せすぎ」を、作る前に避ける */
export function overusedInWeek(when: string | undefined, cards: { id: string; scheduled_at?: string }[], cardProducts: Map<string, string[]>): string[] {
  if (!when) return []
  const key = weekKeyOf(new Date(when))
  const count = new Map<string, number>()
  for (const c of cards) {
    if (!c.scheduled_at || weekKeyOf(new Date(c.scheduled_at)) !== key) continue
    for (const pid of new Set(cardProducts.get(c.id) ?? [])) count.set(pid, (count.get(pid) ?? 0) + 1)
  }
  return [...count].filter(([, n]) => n >= WEEKLY_PRODUCT_LIMIT).map(([pid]) => pid)
}

/** 確定した週に入る配信か(枠を作れず、中身も作らない。確定した週を変えるときは、配信カードで理由を残す流れのため) */
export const lockedWeekOf = (weeks: WeekRow[], when?: string) => confirmedWeekOf(weeks, when)

/**
 * 週の、選んだ国・チャネルの配信がない日(今日より前の日と、確定した週は除く)。枠を作る日に使う。
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
