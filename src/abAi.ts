// AB テストの「この案を AI で作る」(X55 段階 3)。A 案と違う切り口のメイン画像・商品を、いつもの選定の AI に選ばせる。
// 新しい AI の窓口は作らず、proposeHero・proposeSectionProducts に「A 案との違い」を指示として足し、A 案(とほかの案)で使ったものを除いて渡す
import { proposeHero, proposeSectionProducts, type AiCard, type CopyLanguage, type ProposedHero, type ProposedRow } from './aiSelect'
import { ownsHero, ownsProducts, targetLabel, type AbTest, type VariantKey } from './abTest'
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
}

export interface VariantDraft {
  hero?: ProposedHero | null
  /** セクションごとの選定(並び順のまま、つなげれば商品の並びになる) */
  sections?: ProposedRow[][]
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

  if (ownsProducts(ab)) {
    const sections = sectionsOf(template)
    // A 案とほかの案の商品は除く(同じ商品では比べにならないため)。選んだ商品は、次のセクションでも除く
    const excluded = new Set([...input.aProductIds, ...input.otherProductIds])
    const hero = out.hero ? heroes.find((h) => h.id === out.hero?.heroId) : aHero
    const picked: ProposedRow[][] = []
    for (const sec of sections) {
      const [from, to] = sectionRange(sections, sec, input.aProductIds.length)
      const aSlots = Math.max(0, to - from)
      const slots = Number.isFinite(sec.slots) ? sec.slots : aSlots || FREE_DEFAULT_SLOTS
      const res = await proposeSectionProducts({
        card: withNote,
        section: { slots, wantTitle: sec.wantTitle, kind: sec.kind },
        others: [],
        current: { title: input.sectionTitles[sec.index] || undefined, copy: input.sectionCopies[sec.index] || undefined },
        hero,
        language: input.language,
        excludedProductIds: excluded,
        products,
      })
      res.selected.forEach((r) => excluded.add(r.productId))
      picked.push(res.selected)
    }
    out.sections = picked
  }
  return out
}
