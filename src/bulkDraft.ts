// 週の枠と、まとめて AI で中身を作る(バックログ W14)。画面(useWeekFrames・FrameCard・FrameBar)から使う、React を使わない部分。
// 枠は、中身の空いた「未起案」の配信カードとして保存する(計画の骨組みとして、チームにも見え、途中でやめても残るように)。
// 中身は、配信カードの「すべてAIで下書き」(runAutoDraft)と同じ手順で作り、保存も配信カードの保存と同じ形にする
// (あとで配信カードを開いて直したとき、AI で 1 本ずつ作ったものと、見分けがつかないように)
import type { DeliveryCard, DeliveryCardFields } from './models/deliveryCards'
import type { Product } from './models/products'
import { fitsTarget, targetText } from './target'
import type { HeroImage } from './models/heroImages'
import type { WeekRow } from './data/weeks'
import type { AiCard } from './aiSelect'
import { DeliveryCardsService } from './data/deliveryCards'
import { DeliveryProductsService } from './data/deliveryProducts'
import { runAutoDraft, type AutoDraftProgress, type AutoDraftResult } from './autoDraft'
import { cardMarket, heroMarket, productMarket } from './market'
import { isUsableHero } from './heroRights'
import { channelOptions, countryOptions, departmentOptions, CHANNEL_EMAIL, CHANNEL_PUSH, statusRank } from './status'
import { DEFAULT_PUSH_TEMPLATE, DEFAULT_TEMPLATE, TEMPLATE_VALUES, baseTemplateId, channelOf, hasTemplate, sectionIndexAt, sectionsOf, currentVersion } from './templates'
import { SOURCE_AI, STATE_CANDIDATE, STATE_SELECTED } from './items'
import { weeklyLimit } from './weeklyLimit'
import { themeTypeLabel, type ThemeType } from './themeTypes'
import { isCancelled } from './cancel'
import { confirmedWeekOf, dayKeyOf, sundayOf, weekKeyOf, type WeekScope } from './weekLock'
import { logEvent } from './history'
import { tr } from './i18n'

/** 同時に作る本数(AI の呼び出しを詰まらせず、待ち時間も長くしない) */
export const BULK_PARALLEL = 3
/** 枠の配信の時刻の既定(カレンダーで日付を押したときと同じ) */
export const BULK_TIME = '10:00'

const label = (opts: { value: string; label: string }[], v?: string | null) => opts.find((o) => String(o.value) === String(v ?? ''))?.label ?? ''
const isPush = (c: { channel?: string | null }) => c.channel === CHANNEL_PUSH

/**
 * 中身のない配信(週の枠)か。「この週の枠を作る」で作ったもの(frame_at)で、未起案で、テーマ・見出し・通知・メイン画像・商品がどれもないもの。
 * 枠は、週の表示で、その場で配信名・種類を入れられる形で出し、中身ができたら、ふつうの配信として出す。
 * 1 本ずつ新規作成した配信や、作業画面で中身なしで保存した配信は、中身がなくても枠にしない(ふつうの下書きとして出す。2026-10-19 利用者の指摘)。
 * frame_at を足す前に作った枠は、配信名が空なら枠として出す(配信名は空を許さないので、枠からしか生まれない)
 */
export function isFrame(c: DeliveryCard, productCount: number): boolean {
  if (isCancelled(c) || statusRank(c.status) > statusRank('not_started')) return false
  if (!c.frame_at && c.name?.trim()) return false
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
      frame_at: new Date().toISOString(),
    })
    if (!res.success) throw new Error(res.error?.message ?? tr('枠を作れませんでした', 'Could not create the slot'))
    n += 1
  }
  return n
}

/** 中身を作るのに要る、配信の基本情報(保存した枠でも、作業画面の、まだ保存していない行でもよい) */
export type DraftBase = Pick<DeliveryCard, 'name' | 'scheduled_at' | 'country' | 'channel' | 'department' | 'theme_type' | 'target_gender' | 'target_ages' | 'audience'> & {
  /** 配信の型(ST9)で決めたテンプレート(あれば AI に選ばせない) */
  layout_key?: string
}

/** 中身を作るときに、AI に渡す配信の基本情報(配信名・種類は、人が決めたもの) */
function aiCardOf(c: DraftBase): AiCard {
  return {
    name: c.name ?? '',
    scheduledAt: c.scheduled_at ?? '',
    country: label(countryOptions, c.country),
    channel: label(channelOptions, c.channel),
    department: label(departmentOptions, c.department),
    themeType: c.theme_type ? themeTypeLabel(c.theme_type as ThemeType) : undefined,
    target: targetText({ gender: c.target_gender, ages: c.target_ages, audience: c.channel === 'app' ? c.audience : '' }),
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
export async function generateFor(c: DraftBase, ctx: DraftContext, onStep: AutoDraftProgress, isStopped: () => boolean): Promise<AutoDraftResult> {
  const market = cardMarket(String(c.country ?? ''))
  const products = ctx.products.filter((p) => (!market || productMarket(p) === market) && fitsTarget(p, c.target_gender))
  // 使える期限を過ぎた画像は、AI の候補から外す(X59)
  const heroes = ctx.heroes.filter((h) => (!market || heroMarket(h) === market) && isUsableHero(h))
  return runAutoDraft(
    { card: aiCardOf(c), language: 'auto', otherThemes: ctx.otherThemes, products, heroes, channel: isPush(c) ? 'push' : 'email', country: String(c.country ?? '') || undefined, avoidProductIds: ctx.avoidProductIds, onTheme: ctx.onTheme, template: c.layout_key || undefined },
    onStep,
    isStopped,
  )
}

/** 作った中身のテンプレート(AI が決めていなければ、チャネルの既定) */
const templateOf = (c: DraftBase, r: AutoDraftResult) => {
  const fallback = isPush(c) ? DEFAULT_PUSH_TEMPLATE : DEFAULT_TEMPLATE
  return r.template && channelOf(r.template) === (isPush(c) ? 'push' : 'email') ? r.template : fallback
}

/** 載せる商品(選定済み。メールの並び順) */
export const productIdsOf = (r: AutoDraftResult): string[] => r.sections.flatMap((s) => s.selected.map((x) => x.productId))

/**
 * 作った中身を、枠の配信カードに書き込む(配信カードの buildContent・syncItems と同じ形)。
 * 配信名・日時・国・チャネル・種類は、人が決めたものなので変えない。
 * 人の確認は、承認で担う(2026-10-24 SU7。以前の「AI 下書き・未確認」の印はやめた)
 */
export async function applyResult(c: DeliveryCard, r: AutoDraftResult, products: Product[]): Promise<void> {
  const res = await DeliveryCardsService.update(c.id, contentFields(c, r, products))
  if (!res.success) throw new Error(res.error?.message ?? tr('保存に失敗しました', 'Failed to save'))
  await saveProducts(c.id, c.name, r, templateOf(c, r), products)
  await logEvent({ action: 'bulk_create', card: { id: c.id, name: c.name, scheduledAt: c.scheduled_at }, to: 'not_started' })
}

/**
 * 作業画面(BulkWorkspace)で作った中身を、新しい配信カードとして保存する。
 * 中身のない枠は作らず、1 本ずつ新規作成した下書きと同じ「未起案」で保存する
 */
export async function createDraft(base: DraftBase, r: AutoDraftResult, products: Product[]): Promise<DeliveryCard> {
  const res = await DeliveryCardsService.create({
    name: base.name,
    scheduled_at: base.scheduled_at,
    country: base.country,
    channel: base.channel,
    department: base.department,
    theme_type: base.theme_type,
    status: 'not_started',
    state_code: 0,
    ...contentFields(base, r, products),
  })
  if (!res.success || !res.data?.id) throw new Error(res.error?.message ?? tr('保存に失敗しました', 'Failed to save'))
  const card = res.data
  await saveProducts(card.id, base.name, r, templateOf(base, r), products)
  await logEvent({ action: 'bulk_create', card: { id: card.id, name: card.name, scheduledAt: card.scheduled_at }, to: 'not_started' })
  return card
}

/** 作業画面で、中身を作らずに保存する(配信名・日時・国・チャネル・種類だけの「未起案」。1 本ずつ新規作成して、中身を入れずに保存したのと同じ) */
export async function createPlainDraft(base: DraftBase): Promise<DeliveryCard> {
  // 配信の型(ST9)でテンプレートが決まっていれば、それも入れる(作るときの最新の版)
  const tpl = base.layout_key && hasTemplate(baseTemplateId(base.layout_key)) && channelOf(base.layout_key) === (isPush(base) ? 'push' : 'email') ? base.layout_key : undefined
  const res = await DeliveryCardsService.create({
    name: base.name,
    scheduled_at: base.scheduled_at,
    country: base.country,
    channel: base.channel,
    department: base.department,
    theme_type: base.theme_type,
    status: 'not_started',
    state_code: 0,
    ...(tpl ? { email_template: TEMPLATE_VALUES[tpl], layout_key: tpl, layout_version: currentVersion(tpl) } : {}),
  })
  if (!res.success || !res.data?.id) throw new Error(res.error?.message ?? tr('保存に失敗しました', 'Failed to save'))
  return res.data
}

/**
 * まだ保存していない AI の結果を、配信カードの形にする(作業画面で、保存する前にプレビュー・比較するため)。
 * id は仮のもの(保存すると、本当の id の配信カードになる)
 */
export function previewCard(id: string, base: DraftBase, r: AutoDraftResult, products: Product[]): DeliveryCard {
  return { id, ...base, status: 'not_started', ...contentFields(base, r, products) } as DeliveryCard
}

/** 作った中身の列(配信カードの buildContent と同じ形) */
function contentFields(c: DraftBase, r: AutoDraftResult, products: Product[]): Partial<DeliveryCardFields> {
  const template = templateOf(c, r)
  const pname = (id: string) => products.find((p) => p.id === id)?.name ?? ''
  const copies = r.sections.map((s) => s.copy)
  return {
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
    layout_version: currentVersion(template),
    section_titles: r.sections.map((s) => s.title).join('\n').replace(/\n+$/, ''),
    section_copies: copies.some(Boolean) ? JSON.stringify(copies) : '',
    ...(r.hero?.hero?.heroId ? { hero_image_id: r.hero.hero.heroId } : {}),
  }
}

/** 載せる商品の行を保存する */
async function saveProducts(cardId: string, cardName: string, r: AutoDraftResult, template: string, products: Product[]): Promise<void> {
  const pname = (id: string) => products.find((p) => p.id === id)?.name ?? ''
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
      name: `${cardName} / ${pname(row.x.productId)}`,
      delivery_card_id: cardId,
      product_id: row.x.productId,
      state_code: 0,
    })
    if (!p.success) throw new Error(p.error?.message ?? tr('掲載商品の保存に失敗しました', 'Failed to save the products in this delivery'))
  }
}

/** その週に、上限まで載せた商品。確認の一覧(W4)の「載せすぎ」を、作る前に避ける。上限は、作る配信(target。国・チャネル)に効くもの */
export function overusedInWeek(when: string | undefined, cards: { id: string; scheduled_at?: string }[], cardProducts: Map<string, string[]>, target?: { country?: string; channel?: string }): string[] {
  if (!when) return []
  const key = weekKeyOf(new Date(when))
  const count = new Map<string, number>()
  for (const c of cards) {
    if (!c.scheduled_at || weekKeyOf(new Date(c.scheduled_at)) !== key) continue
    for (const pid of new Set(cardProducts.get(c.id) ?? [])) count.set(pid, (count.get(pid) ?? 0) + 1)
  }
  const lim = weeklyLimit({ ...target, scheduled_at: when })
  return [...count].filter(([, n]) => n >= lim).map(([pid]) => pid)
}

/** 確定した週に入る配信か(枠を作れず、中身も作らない。確定した週を変えるときは、配信カードで理由を残す流れのため) */
export const lockedWeekOf = (weeks: WeekRow[], when: string | undefined, scope: WeekScope) => confirmedWeekOf(weeks, when, scope)

/** 作業画面の、週の 1 日。作れない日も、理由と、その日にもうある配信を見せる(空いている日だけを出すと、なぜその日がないのか分からないため) */
export interface WeekDay {
  key: string
  date: Date
  /** free = 作れる、used = 同じ国・チャネルの配信がもうある、past = 今日より前、locked = 確定した週 */
  state: 'free' | 'used' | 'past' | 'locked'
  /** その日の、同じ国・チャネルの配信 */
  same: { id: string; name: string }[]
}

/** 週の 7 日と、選んだ国・チャネルで作れるか(作業画面の ① で使う。作れる日の決め方は emptyDays と同じ) */
export function weekDays(weekStart: Date, cards: { id: string; name: string; scheduled_at?: string; channel?: string; country?: string }[], weeks: WeekRow[], channel: string, country: string): WeekDay[] {
  const today = dayKeyOf(new Date())
  const start = sundayOf(weekStart)
  const locked = !!confirmedWeekOf(weeks, start.toISOString(), { country, channel })
  const same = (c: { channel?: string; country?: string }) => (c.channel ?? CHANNEL_EMAIL) === channel && (!country || !c.country || c.country === country)
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    const key = dayKeyOf(date)
    const onDay = cards.filter((c) => same(c) && c.scheduled_at && dayKeyOf(new Date(c.scheduled_at)) === key).map((c) => ({ id: c.id, name: c.name }))
    const state: WeekDay['state'] = locked ? 'locked' : key < today ? 'past' : onDay.length > 0 ? 'used' : 'free'
    return { key, date, state, same: onDay }
  })
}

/**
 * 週の、選んだ国・チャネルの配信がない日(今日より前の日と、確定した週は除く)。枠を作る日に使う。
 * 国・チャネルで見るのは、「今週の US 向けメール」のように、国とチャネルを決めてから、まとめて作るため
 */
export function emptyDays(weekStart: Date, cards: { scheduled_at?: string; channel?: string; country?: string }[], weeks: WeekRow[], channel: string, country: string): string[] {
  const today = dayKeyOf(new Date())
  const start = sundayOf(weekStart)
  if (confirmedWeekOf(weeks, start.toISOString(), { country, channel })) return []
  const same = (c: { channel?: string; country?: string }) => (c.channel ?? CHANNEL_EMAIL) === channel && (!country || !c.country || c.country === country)
  const used = new Set(cards.filter((c) => same(c) && c.scheduled_at).map((c) => dayKeyOf(new Date(c.scheduled_at!))))
  const out: string[] = []
  for (let i = 0; i < 7; i++) {
    const key = dayKeyOf(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
    if (key >= today && !used.has(key)) out.push(key)
  }
  return out
}
