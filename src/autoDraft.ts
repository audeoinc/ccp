import type { Product } from './models/products'
import type { HeroImage } from './models/heroImages'
import {
  proposeHero,
  proposeSection,
  type AiCard,
  type CopyLanguage,
  type HeroProposal,
  type OtherSection,
  type SectionProposal,
} from './aiSelect'
import {
  suggestCopies,
  suggestPushNotifications,
  suggestInstructions,
  suggestTemplate,
  suggestThemes,
  type CopyIdea,
  type InstructionIdea,
  type ThemeSuggestion,
} from './aiDraft'
import { tr } from './i18n'
import { DEFAULT_PUSH_TEMPLATE, FREE_DEFAULT_SLOTS, baseTemplateId, getTemplate, hasTemplate, sectionsOf, type EmailTemplateId, type TemplateChannel } from './templates'

/** 「すべてAIで下書き」の入力。内容(テーマなど)は空から作るので、配信の基本情報だけを渡す */
export interface AutoDraftInput {
  card: AiCard
  language: CopyLanguage
  otherThemes: string[]
  products: Product[]
  heroes: HeroImage[]
  /** 配信カードのチャネル(アプリのときは、アプリのテンプレートから選び、制作指示は作らない) */
  channel?: TemplateChannel
  /** 選ばない商品(まとめて作るとき、同じ週に、もう上限まで載せた商品。W14) */
  avoidProductIds?: string[]
  /** 配信の国のコード(テンプレートを、その国で使うものから選ぶ。ST1) */
  country?: string
  /** 決まったテンプレート(国ごとの配信の型 ST9 で決めたもの)。あれば AI には選ばせない(id だけ。作るときの最新の版を使う) */
  template?: EmailTemplateId
  /** テーマのヒント(まとめて作るとき、担当者が行ごとに書く。W14) */
  themeHint?: string
  /** 決まったテーマ(キャンペーンのテーマで作り直すとき。X79)。あればテーマの工程を飛ばし、これで以降を作る */
  fixedTheme?: ThemeSuggestion
  /** テーマが決まったとき(失敗したときは空)に知らせる。まとめて作るとき、次の下書きが、このテーマを避けられるように */
  onTheme?: (theme: string) => void
}

export interface AutoDraftResult {
  theme?: string
  themeIdeas: ThemeSuggestion[]
  template?: EmailTemplateId
  templateReason?: string
  hero?: HeroProposal
  headline?: string
  copy?: string
  copyIdeas: CopyIdea[]
  /** テンプレートのセクション順 */
  sections: SectionProposal[]
  instructions?: string
  instructionIdeas: InstructionIdea[]
  /** アプリ: 通知のタイトル・本文の案と、採用したもの */
  pushIdeas?: CopyIdea[]
  pushTitle?: string
  pushBody?: string
  /** 途中で失敗した工程のメッセージ(成功した工程の結果は残る) */
  errors: string[]
  cancelled: boolean
}

export type AutoDraftProgress = (label: string, done: number, total: number) => void

/**
 * テーマ → テンプレートとメイン画像 → ヘッドライン・コピー → 各セクション → 制作指示 の順に、
 * AI の第 1 候補で下書きを作る。React の状態は使わず、結果をまとめて返す(反映は呼び出し側)。
 * 一部の工程が失敗しても、できたところまでの結果を返す。
 */
export async function runAutoDraft(input: AutoDraftInput, onStep: AutoDraftProgress, isCancelled: () => boolean): Promise<AutoDraftResult> {
  const result: AutoDraftResult = { themeIdeas: [], copyIdeas: [], sections: [], instructionIdeas: [], errors: [], cancelled: false }
  const { products, heroes, language } = input
  const base: AiCard = { ...input.card, theme: '', headline: '', copy: '', instructions: '' }
  let total = 7 // テンプレートが決まったら、セクションの数に合わせて数え直す
  let done = 0

  const step = async <T>(label: string, fn: () => Promise<T>): Promise<T | undefined> => {
    if (isCancelled()) return undefined
    onStep(label, done, total)
    try {
      return await fn()
    } catch (e) {
      result.errors.push(`${label}: ${e instanceof Error ? e.message : String(e)}`)
      return undefined
    } finally {
      done += 1
    }
  }
  const finish = () => {
    result.cancelled = isCancelled()
    return result
  }

  // ① テーマ(決まったテーマがあれば、AI に考えさせない)
  const themes = input.fixedTheme?.theme.trim()
    ? [input.fixedTheme]
    : await step(tr('テーマを考えています', 'Thinking up themes'), () => suggestThemes({ card: base, otherThemes: input.otherThemes, products, themeHint: input.themeHint }))
  if (isCancelled()) return finish()
  if (themes?.length) {
    result.themeIdeas = themes
    result.theme = themes[0].theme
  }
  input.onTheme?.(result.theme ?? '')
  if (!result.theme) return finish() // テーマがないと、以降の工程は進められない
  const withTheme: AiCard = { ...base, theme: result.theme }
  // 型で決めたテンプレート(あって、このチャネルのものなら、それを使う)
  const fixedTemplate = input.template && hasTemplate(baseTemplateId(input.template)) && (getTemplate(input.template).channel ?? 'email') === (input.channel === 'push' ? 'push' : 'email') ? input.template : undefined

  // ② テンプレートとメイン画像(互いに独立なので、並行して実行する)
  const [tpl, hero] = await Promise.all([
    fixedTemplate
      ? Promise.resolve({ template: fixedTemplate, reason: tr('配信の型で決めたテンプレート', 'Template set by the delivery pattern') })
      : step(tr('テンプレートとメイン画像を選んでいます', 'Choosing a template and hero image'), () => suggestTemplate({ card: withTheme, channel: input.channel, country: input.country })),
    (async () => {
      try {
        return await proposeHero({ card: withTheme, heroes, productNames: [] })
      } catch (e) {
        result.errors.push(`${tr('メイン画像', 'Hero image')}: ${e instanceof Error ? e.message : String(e)}`)
        return undefined
      }
    })(),
  ])
  if (isCancelled()) return finish()
  const isPush = input.channel === 'push'
  result.template = tpl?.template ?? (isPush ? DEFAULT_PUSH_TEMPLATE : 'standard4')
  result.templateReason = tpl?.reason
  // アプリで、画像を使わないテンプレートなら、メイン画像は付けない
  result.hero = isPush && !getTemplate(result.template).push?.image ? undefined : hero
  const heroRow = hero?.hero ? heroes.find((h) => h.id === hero.hero!.heroId) : undefined
  const heroReason = hero?.hero?.reason

  const sections = sectionsOf(result.template)
  total = 4 + sections.length

  // ③ ヘッドラインとコピー(組)
  const copies = await step(tr('ヘッドラインとコピーを考えています', 'Writing headline and copy'), () =>
    suggestCopies({ card: withTheme, language, items: [], hero: heroRow }),
  )
  if (isCancelled()) return finish()
  if (copies?.length) {
    result.copyIdeas = copies
    result.headline = copies[0].headline
    result.copy = copies[0].lead
  }
  const withCopy: AiCard = { ...withTheme, headline: result.headline ?? '', copy: result.copy ?? '' }

  // ④ 各セクション(見出し・コピー・商品)。前のセクションで使った商品は、あとのセクションで使わない
  const others: OtherSection[] = []
  const excluded = new Set<string>(input.avoidProductIds ?? [])
  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? ''
  for (const sec of sections) {
    const proposal = await step(tr(`セクション ${sec.index + 1} / ${sections.length} を選んでいます`, `Choosing section ${sec.index + 1} / ${sections.length}`), () =>
      proposeSection({
        card: withCopy,
        section: { slots: Number.isFinite(sec.slots) ? sec.slots : FREE_DEFAULT_SLOTS, wantTitle: sec.wantTitle, kind: sec.kind },
        others: [...others],
        hero: heroRow,
        heroReason,
        language,
        excludedProductIds: new Set(excluded),
        products,
      }),
    )
    if (isCancelled()) return finish()
    // 失敗したセクションも、空のまま位置を保つ(セクション番号がずれないように)
    const filled: SectionProposal = proposal ?? { titles: [], title: '', copies: [], copy: '', selected: [], candidates: [] }
    result.sections.push(filled)
    for (const r of [...filled.selected, ...filled.candidates]) excluded.add(r.productId)
    others.push({
      index: sec.index,
      title: filled.title,
      copy: filled.copy,
      productNames: filled.selected.map((r) => productName(r.productId)).filter(Boolean),
    })
  }

  // ⑤ アプリは、制作指示の代わりに、通知のタイトル・本文(メッセージの中身を踏まえる)
  if (isPush) {
    const notes = await step(tr('通知の文面を考えています', 'Writing the notification'), () =>
      suggestPushNotifications({
        card: withCopy,
        language,
        items: result.sections.flatMap((s) => s.selected).map((r) => ({ product: products.find((p) => p.id === r.productId), reason: r.reason })),
        hero: heroRow,
      }),
    )
    if (notes?.length) {
      result.pushIdeas = notes
      result.pushTitle = notes[0].headline
      result.pushBody = notes[0].lead
    }
    onStep(tr('完了', 'Done'), total, total)
    return finish()
  }
  const instructions = await step(tr('制作指示を考えています', 'Writing production instructions'), () =>
    suggestInstructions({
      card: withCopy,
      language,
      items: result.sections.flatMap((s) => s.selected).map((r) => ({ product: products.find((p) => p.id === r.productId), reason: r.reason })),
      hero: heroRow,
    }),
  )
  if (instructions?.length) {
    result.instructionIdeas = instructions
    result.instructions = instructions[0].text
  }
  onStep(tr('完了', 'Done'), total, total)
  return finish()
}
