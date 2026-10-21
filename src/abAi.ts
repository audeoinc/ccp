// AB テストの「この案を AI で作る」(X55 段階 3)。A 案と違う切り口のメイン画像・商品・文言を、いつもの AI の窓口で作る。
// 新しい AI の窓口は作らず、proposeHero・proposeSection(Products)・suggestCopies などに「A 案との違い」を指示として足し、A 案(とほかの案)で使ったものを除いて渡す
// 文言(X57)は、選び直した画像・商品に合わせて作る(先に画像・商品、あとで文言)
import { proposeHero, proposeSection, proposeSectionProducts, type AiCard, type CopyLanguage, type ProposedHero, type ProposedRow } from './aiSelect'
import { suggestCopies, suggestPushNotifications, suggestSubjects } from './aiDraft'
import { ownsHero, ownsProducts, ownsSubject, ownsText, targetLabel, type AbTest, type VariantKey, type VariantText } from './abTest'
import { tr } from './i18n'
import type { HeroImage } from './models/heroImages'
import type { Product } from './models/products'
import { FREE_DEFAULT_SLOTS, sectionRange, sectionsOf, type EmailTemplateId } from './templates'

export interface VariantDraftInput {
  ab: AbTest
  key: VariantKey
  card: AiCard
  template: EmailTemplateId
  /** A 案の商品(メールの並び順)とメイン画像 */
  aProductIds: string[]
  aHeroId?: string
  /** ほかの案(A・この案を除く)で使っている商品・メイン画像(重ならないように除く) */
  otherProductIds: string[]
  otherHeroIds: string[]
  products: Product[]
  heroes: HeroImage[]
  sectionTitles: string[]
  sectionCopies: string[]
  language: CopyLanguage
  /** A 案の文言(文言を案ごとに持つとき、A 案と違う切り口にするため) */
  aTexts: VariantText
  /** アプリの通知(push)の配信か。メールなら件名、アプリなら通知の文を作る */
  push: boolean
}

export interface VariantDraft {
  hero?: ProposedHero | null
  /** セクションごとの選定(並び順のまま、つなげれば商品の並びになる) */
  sections?: ProposedRow[][]
  /** 作った文言(作ったものだけ。ないものは、いまの案の文言のまま) */
  texts?: Partial<VariantText>
}

export async function draftVariant(input: VariantDraftInput): Promise<VariantDraft> {
  const { ab, key, card, template, products, heroes } = input
  const name = (id: string) => products.find((p) => p.id === id)?.name ?? ''
  const aHero = heroes.find((h) => h.id === input.aHeroId)
  // A 案との違いを、指示として渡す(仮説があれば、それを確かめられる案にする)
  const note = [
    tr(`これは AB テストの ${key} 案です。A 案と比べるのは${targetLabel(ab.target)}です。A 案とは違う切り口のものを選んでください。`, `This is variant ${key} of an A/B test comparing the ${targetLabel(ab.target).toLowerCase()} with variant A. Pick something with a different angle from A.`),
    ab.hypothesis.trim() ? tr(`仮説: ${ab.hypothesis.trim()}(この仮説を確かめられる案に)`, `Hypothesis: ${ab.hypothesis.trim()} (make a variant that tests it)`) : '',
    ownsHero(ab) && aHero ? tr(`A 案のメイン画像: ${aHero.name}`, `Variant A hero: ${aHero.name}`) : '',
    ownsProducts(ab) ? tr(`A 案の商品: ${input.aProductIds.map(name).filter(Boolean).join(' / ')}`, `Variant A products: ${input.aProductIds.map(name).filter(Boolean).join(' / ')}`) : '',
    ownsText(ab) && input.aTexts.headline.trim() ? tr(`A 案のヘッドライン: ${input.aTexts.headline.trim()}`, `Variant A headline: ${input.aTexts.headline.trim()}`) : '',
    ownsText(ab) && input.aTexts.copy.trim() ? tr(`A 案のコピー: ${input.aTexts.copy.trim()}`, `Variant A copy: ${input.aTexts.copy.trim()}`) : '',
    ownsText(ab) && input.aTexts.sectionTitles.some((x) => x.trim())
      ? tr(`A 案のセクションの見出し: ${input.aTexts.sectionTitles.filter((x) => x.trim()).join(' / ')}`, `Variant A section headings: ${input.aTexts.sectionTitles.filter((x) => x.trim()).join(' / ')}`)
      : '',
  ]
    .filter(Boolean)
    .join('\n')
  const withNote: AiCard = { ...card, instructions: [card.instructions, note].filter(Boolean).join('\n\n') }
  const out: VariantDraft = {}

  if (ownsHero(ab)) {
    const used = new Set([input.aHeroId, ...input.otherHeroIds].filter(Boolean))
    const pool = heroes.filter((h) => !used.has(h.id))
    const res = await proposeHero({ card: withNote, heroes: pool.length ? pool : heroes, productNames: input.aProductIds.map(name).filter(Boolean) })
    out.hero = res.hero ?? res.candidates[0] ?? null
  }

  const texts: Partial<VariantText> = {}
  if (ownsProducts(ab)) {
    const sections = sectionsOf(template)
    // 文言も案ごとに持つときは、セクションの見出し・コピーも一緒に作る(1 回の呼び出しで、選んだ商品に合う文にする)
    const withText = ownsText(ab)
    const titles: string[] = []
    const copies: string[] = []
    // A 案とほかの案の商品は除く(同じ商品では比べにならないため)。選んだ商品は、次のセクションでも除く
    const excluded = new Set([...input.aProductIds, ...input.otherProductIds])
    const hero = out.hero ? heroes.find((h) => h.id === out.hero?.heroId) : aHero
    const picked: ProposedRow[][] = []
    for (const sec of sections) {
      const [from, to] = sectionRange(sections, sec, input.aProductIds.length)
      const aSlots = Math.max(0, to - from)
      const slots = Number.isFinite(sec.slots) ? sec.slots : aSlots || FREE_DEFAULT_SLOTS
      const args = {
        card: withNote,
        section: { slots, wantTitle: sec.wantTitle, kind: sec.kind },
        others: [],
        // 文言を作り直すときは、いまの文(A 案の写しのことが多い)を渡さない(引きずられて同じ文になるため)
        current: withText ? undefined : { title: input.sectionTitles[sec.index] || undefined, copy: input.sectionCopies[sec.index] || undefined },
        hero,
        language: input.language,
        excludedProductIds: excluded,
        products,
      }
      if (withText) {
        const res = await proposeSection(args)
        res.selected.forEach((r) => excluded.add(r.productId))
        picked.push(res.selected)
        titles[sec.index] = res.title
        copies[sec.index] = res.copy
      } else {
        const res = await proposeSectionProducts(args)
        res.selected.forEach((r) => excluded.add(r.productId))
        picked.push(res.selected)
      }
    }
    out.sections = picked
    if (withText) {
      texts.sectionTitles = Array.from({ length: Math.max(titles.length, input.sectionTitles.length) }, (_, i) => titles[i] ?? '')
      texts.sectionCopies = Array.from({ length: Math.max(copies.length, input.sectionCopies.length) }, (_, i) => copies[i] ?? '')
    }
  }

  // ヘッドライン・コピー(と、アプリなら通知の文)。選び直した画像・商品を材料にする
  if (ownsText(ab)) {
    const ids = out.sections ? out.sections.flat().map((r) => r.productId) : input.aProductIds
    const items = ids.map((id) => ({ product: products.find((p) => p.id === id), reason: '' }))
    const hero = out.hero ? heroes.find((h) => h.id === out.hero?.heroId) : aHero
    const ctx = { card: withNote, language: input.language, items, hero }
    const [c] = await suggestCopies(ctx)
    texts.headline = c.headline
    texts.copy = c.lead
    if (input.push) {
      const [n] = await suggestPushNotifications({ ...ctx, card: { ...withNote, headline: c.headline, copy: c.lead } })
      texts.pushTitle = n.headline
      texts.pushBody = n.lead
    }
  }

  // 件名・プリヘッダー(メールだけ)。件名の AI 案と同じく、A 案と違う切り口にする
  if (ownsSubject(ab) && !input.push) {
    const ids = out.sections ? out.sections.flat().map((r) => r.productId) : input.aProductIds
    const items = ids.map((id) => ({ product: products.find((p) => p.id === id), reason: '' }))
    const hero = out.hero ? heroes.find((h) => h.id === out.hero?.heroId) : aHero
    const [x] = await suggestSubjects({
      card: { ...withNote, ...(texts.headline ? { headline: texts.headline, copy: texts.copy ?? '' } : {}) },
      language: input.language,
      items,
      hero,
      subject: '',
      abTest: { key, compareWith: { subject: input.aTexts.subject || card.name, preheader: input.aTexts.preheader ?? '' }, hypothesis: ab.hypothesis.trim() },
    })
    texts.subject = x.headline
    texts.preheader = x.lead
  }
  if (Object.keys(texts).length) out.texts = texts
  return out
}
