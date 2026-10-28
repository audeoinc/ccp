// 配信カードの AB テスト(X55)・案から選ぶ(X57)・シンプルな画面の AB テスト(SU2)の、案の中身と操作。
// 編集中の案の中身は、配信カードの state(items・heroId・heroReason・文言)にあり、ほかの案は stash に置く。
// 状態と保存は配信カード(CardDetail)の 1 か所のまま。ここは、その state を受け取って、案の出し入れをするだけ(整理 第3段 ①)
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { tr } from './i18n'
import type { DeliveryCard } from './models/deliveryCards'
import type { Product } from './models/products'
import type { HeroImage } from './models/heroImages'
import { getTemplate, pinnedTemplateKey, templateKeyOfCard, type EmailTemplateId, type TemplateChannel } from './templates'
import { SOURCE_AI, type Candidate, type Item } from './items'
import type { AiCard, CopyLanguage } from './aiSelect'
import { draftVariant } from './abAi'
import { confirmDialog } from './confirm'
import { myName } from './history'
import { allVariants, newAbTest, nextVariant, ownsHero, ownsAnyText, ownsImages, ownsProducts, ownsTemplate, ownsText, parseAbTest, pruneVariantImages, withVariantImages, parseDecision, type AbDecision, type AbPurpose, type AbTarget, type AbTest, type RejectedVariant, type VariantKey, type VariantText } from './abTest'
import type { PartRef } from './simple/parts'
import { findPart, prunePartContent, samePartContent, type PartContent } from './partContent'
import type { Form } from './cardForm'

/** AB テストの、いま編集していない案の中身(X55。編集中の案は items・heroId・heroReason にある) */
export interface VariantData {
  items: Item[]
  heroId?: string
  heroReason: string
  /** 文言(比べる要素が all のとき。X57) */
  texts?: VariantText
  /** テンプレートの鍵(比べる要素が all のとき。SU2 ⑤⑧) */
  template?: EmailTemplateId
}

export interface AbDeps {
  card?: DeliveryCard
  draft?: { card: DeliveryCard }
  form: Form
  setForm: Dispatch<SetStateAction<Form>>
  items: Item[]
  setItems: Dispatch<SetStateAction<Item[]>>
  heroId?: string
  setHeroId: Dispatch<SetStateAction<string | undefined>>
  heroReason: string
  setHeroReason: Dispatch<SetStateAction<string>>
  sectionTitles: string[]
  setSectionTitles: Dispatch<SetStateAction<string[]>>
  sectionCopies: string[]
  setSectionCopies: Dispatch<SetStateAction<string[]>>
  /** テンプレートの部品の、配信ごとの中身(T8 段階 6。見出し・コピーと同じく、案ごとに持つ) */
  partContent: PartContent
  setPartContent: Dispatch<SetStateAction<PartContent>>
  template: EmailTemplateId
  setTemplate: Dispatch<SetStateAction<EmailTemplateId>>
  setCandidates: Dispatch<SetStateAction<Candidate[]>>
  setSelectedKey: Dispatch<SetStateAction<string | null>>
  setError: Dispatch<SetStateAction<string | null>>
  setAlertNotes: Dispatch<SetStateAction<string[]>>
  poolProducts: Product[]
  poolHeroes: HeroImage[]
  language: CopyLanguage
  templateChannel: TemplateChannel
  /** 読み込み時点の配信商品(null = まだ読んでいない) */
  original: object | null
  buildAiCard: () => AiCard
}

/** 保存する案の文言(部品の中身を、その案のテンプレートの書き換えてよい部品の分に絞る) */
const withParts = (x: VariantText, template: EmailTemplateId): VariantText => (x.parts ? { ...x, parts: prunePartContent(x.parts, template) } : x)

export function useAbVariants({ card, draft, form, setForm, items, setItems, heroId, setHeroId, heroReason, setHeroReason, sectionTitles, setSectionTitles, sectionCopies, setSectionCopies, partContent, setPartContent, template, setTemplate, setCandidates, setSelectedKey, setError, setAlertNotes, poolProducts, poolHeroes, language, templateChannel, original, buildAiCard }: AbDeps) {
  // AB テスト(X55)。ab = 設定(null = しない)、active = いま編集している案、stash = 編集していない案の中身(A を含む)
  const [ab, setAb] = useState<AbTest | null>(() => parseAbTest(card?.ab_test ?? draft?.card.ab_test))
  const [active, setActive] = useState<VariantKey>('A')
  const [stash, setStash] = useState<Partial<Record<VariantKey, VariantData>>>(() => {
    const a = parseAbTest(card?.ab_test ?? draft?.card.ab_test)
    const out: Partial<Record<VariantKey, VariantData>> = {}
    const aTemplate = card ? templateKeyOfCard(card) : draft ? templateKeyOfCard(draft.card) : undefined
    for (const k of a?.variants ?? []) out[k] = { items: [], heroId: a?.heroes[k]?.heroId, heroReason: a?.heroes[k]?.heroReason ?? '', texts: a?.texts?.[k], template: a?.templates?.[k] ?? aTemplate }
    return out
  })

  // ---- AB テスト(X55)・案から選ぶ(X57): 案の中身の出し入れ。編集中の案は items・heroId・heroReason・文言の state、それ以外は stash
  // 案ごとに持たないもの(比べる要素でないもの)は、全案で共通 = いまの state そのもの
  const curText = (): VariantText => ({ headline: form.headline, copy: form.copy, pushTitle: form.pushTitle, pushBody: form.pushBody, sectionTitles, sectionCopies, subject: form.subject, preheader: form.preheader, parts: partContent })
  const itemsOf = (k: VariantKey): Item[] => (k === active || !ownsProducts(ab) ? items : (stash[k]?.items ?? []))
  const heroOf = (k: VariantKey): { heroId?: string; heroReason: string } =>
    k === active || !ownsHero(ab) ? { heroId, heroReason } : { heroId: stash[k]?.heroId, heroReason: stash[k]?.heroReason ?? '' }
  // 件名だけを比べるときも、文言を案ごとに持つ(読むのは件名・プリヘッダーだけ)
  const textsOf = (k: VariantKey): VariantText => (k === active || !ownsAnyText(ab) ? curText() : (stash[k]?.texts ?? curText()))
  /** 案のテンプレート(案ごとに持たないときは、全案で共通 = いまの state) */
  const templateOfV = (k: VariantKey): EmailTemplateId => (k === active || !ownsTemplate(ab) ? template : (stash[k]?.template ?? template))
  /** 保存する設定(B・C 案のメイン画像・文言を入れる) */
  const abForSave = (): AbTest | null => {
    if (!ab) return null
    // 案ごとに持つものは、保存する比べる要素で決める(シンプルな画面では、A と違う所から決めた要素。saveTarget)
    const owner = savedTargetAb() ?? ab
    const heroes = ownsHero(owner) ? Object.fromEntries(ab.variants.map((k) => [k, heroOf(k)])) : {}
    // 部品の中身は、A と同じく、その案のテンプレートにある書き換えてよい部品の分だけ(T8 段階 6)
    const texts = ownsAnyText(owner) ? Object.fromEntries(ab.variants.map((k) => [k, withParts(textsOf(k), templateOfV(k))])) : undefined
    // テンプレートは、A と違う案だけ、版まで決めて書く
    const aTpl = pinnedTemplateKey(templateOfV('A'))
    const tplEntries = ownsTemplate(owner) ? ab.variants.map((k) => [k, pinnedTemplateKey(templateOfV(k))] as const).filter(([, v]) => v !== aTpl) : []
    const { templates: _old, images: _oldImages, ...rest } = ab
    void _old
    void _oldImages
    // 商品の画像は、商品が全案で共通のときだけ、A と違う分を持つ(X64 の e)
    // 編集の間は商品を案ごとに持っている(シンプルな画面の target all)なら、その案の商品の並びの画像から作る
    const images = ownsImages(owner) ? pruneVariantImages(ab, itemsOf('A'), ownsProducts(ab) ? itemsOf : undefined) : undefined
    return { ...rest, target: owner.target, heroes, ...(texts ? { texts } : {}), ...(tplEntries.length ? { templates: Object.fromEntries(tplEntries) } : {}), ...(images ? { images } : {}) }
  }
  /** 文言を画面に出す(ヘッドライン・コピー・通知の文・セクションの見出しとコピー) */
  /** 文言を画面に出す。full でなければ(件名だけを比べるとき)件名・プリヘッダーだけ */
  const showText = (x: VariantText, full = true) => {
    setForm((f) => ({
      ...f,
      ...(full ? { headline: x.headline, copy: x.copy, pushTitle: x.pushTitle, pushBody: x.pushBody } : {}),
      subject: x.subject ?? f.subject,
      preheader: x.preheader ?? f.preheader,
    }))
    if (full) {
      setSectionTitles(x.sectionTitles)
      setSectionCopies(x.sectionCopies)
      // 部品の中身のない古い案は、いまの中身のまま(A と同じだったとみなす)
      if (x.parts) setPartContent(x.parts)
    }
  }

  /** いま編集している案を stash に置き、to の案の中身を出す(案ごとに持つものだけ。共通のものはそのまま) */
  const loadVariant = (to: VariantKey, data: VariantData, base: AbTest | null) => {
    setStash((prev) => ({ ...prev, [active]: { items, heroId, heroReason, texts: curText(), template } }))
    if (ownsProducts(base)) {
      setItems(data.items)
      setSelectedKey(null)
    }
    if (ownsHero(base)) {
      setHeroId(data.heroId)
      setHeroReason(data.heroReason)
    }
    if (ownsAnyText(base) && data.texts) showText(data.texts, ownsText(base))
    // テンプレートが案で違えば、その案のテンプレートで描く(セクションの候補は、テンプレートの形ごとなので捨てる)
    if (ownsTemplate(base) && data.template && data.template !== template) {
      setTemplate(data.template)
      setCandidates([])
    }
    setActive(to)
  }
  const switchVariant = (to: VariantKey) => {
    if (to === active) return
    loadVariant(to, stash[to] ?? { items: [], heroReason: '' }, ab)
  }
  /** A 案の写し(商品は新しい行として。行 ID は持たない) */
  const copyOfA = (): VariantData => {
    const h = heroOf('A')
    const x = textsOf('A')
    return {
      items: itemsOf('A').map((i) => ({ ...i, key: crypto.randomUUID(), rowId: undefined })),
      heroId: h.heroId,
      heroReason: h.heroReason,
      texts: { ...x, sectionTitles: [...x.sectionTitles], sectionCopies: [...x.sectionCopies] },
      template: templateOfV('A'),
    }
  }
  const startAbTest = (purpose: AbPurpose = 'test') => {
    setStash({ B: copyOfA() })
    setAb(newAbTest(purpose))
  }
  const addVariant = () => {
    if (!ab) return
    const k = nextVariant(ab)
    if (!k) return
    const nextAb = { ...ab, variants: [...ab.variants, k].sort() as VariantKey[] }
    setAb(nextAb)
    loadVariant(k, copyOfA(), nextAb)
  }
  /** A 案に戻す */
  const backToA = () => {
    if (active !== 'A') loadVariant('A', stash.A ?? { items: [], heroReason: '' }, ab)
  }
  const removeVariant = (k: VariantKey) => {
    if (!ab) return
    backToA()
    const rest = ab.variants.filter((x) => x !== k)
    setStash((prev) => {
      const next = { ...prev }
      delete next[k]
      return next
    })
    setAb(rest.length ? { ...ab, variants: rest } : null)
  }
  // 「この案を AI で作る」と「並べて比べる」(X55 段階 3)
  const [abAiBusy, setAbAiBusy] = useState(false)
  const [comparing, setComparing] = useState<'live' | 'decided' | null>(null)
  const draftActiveVariant = async () => {
    if (!ab || active === 'A') return
    if (!form.theme.trim()) {
      setError(tr('AI で案を作るには、先にテーマを決めてください', 'Set a theme before drafting a variant with AI'))
      return
    }
    const key = active
    const others = ab.variants.filter((k) => k !== key)
    setAbAiBusy(true)
    setError(null)
    try {
      const res = await draftVariant({
        ab,
        key,
        card: buildAiCard(),
        template,
        aProductIds: itemsOf('A').map((i) => i.productId),
        aHeroId: heroOf('A').heroId,
        otherProductIds: others.flatMap((k) => itemsOf(k).map((i) => i.productId)),
        otherHeroIds: others.map((k) => heroOf(k).heroId).filter((x): x is string => !!x),
        products: poolProducts,
        heroes: poolHeroes,
        sectionTitles,
        sectionCopies,
        language,
        aTexts: textsOf('A'),
        push: templateChannel === 'push',
      })
      if (res.hero) {
        setHeroId(res.hero.heroId)
        setHeroReason(res.hero.reason)
      }
      if (res.sections) {
        setItems(res.sections.flat().map((r) => ({ key: crypto.randomUUID(), productId: r.productId, reason: r.reason, source: SOURCE_AI })))
        setSelectedKey(null)
      }
      // 文言(X57): 作ったものだけを、いまの案の文言に重ねる
      if (res.texts) showText({ ...curText(), ...res.texts }, ownsText(ab))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setAbAiBusy(false)
    }
  }
  const stopAbTest = () => {
    backToA()
    setStash({})
    setAb(null)
  }
  /** 比べる要素を変える。A 案に戻してから変え、新しく案ごとに持つものは、A の写しで始める */
  const changeTarget = (target: AbTarget) => {
    if (!ab) return
    backToA()
    const next = { ...ab, target }
    const a = copyOfA()
    setStash((prev) => {
      const out = { ...prev }
      for (const k of ab.variants) {
        const cur = out[k] ?? { items: [], heroReason: '' }
        const addProducts = ownsProducts(next) && !ownsProducts(ab)
        const addHero = ownsHero(next) && !ownsHero(ab)
        const addText = ownsAnyText(next) && !ownsAnyText(ab)
        out[k] = {
          // 商品を案ごとに持ち始めるときは、A の写しに、その案の商品の画像(ab_test の images)を重ねる(X64 の e)
          items: addProducts ? withVariantImages(a.items, ab.images?.[k]).map((i) => ({ ...i, key: crypto.randomUUID() })) : cur.items,
          heroId: addHero ? a.heroId : cur.heroId,
          heroReason: addHero ? a.heroReason : cur.heroReason,
          texts: addText ? a.texts : cur.texts,
          // 全体でなくなるときは、テンプレートは全案で共通(A のもの)に戻す
          template: ownsTemplate(next) && ownsTemplate(ab) ? cur.template : a.template,
        }
      }
      return out
    })
    // 商品を案ごとに持たなくなるときは、その案の商品の画像だけを、A と違う分として残す
    setAb(ownsProducts(ab) && !ownsProducts(next) ? { ...next, images: pruneVariantImages(next, itemsOf('A'), itemsOf) } : next)
  }
  /**
   * 案から選ぶ(X57): この案に決める。決めた案が配信の中身(A)になり、ほかの案は「配信しなかった案」として中身ごと残す(保存で確定)。
   * 誰でも決められる(利用者 2026-10-20: とりあえず誰でも)
   */
  // 決めたときの比べる要素から、案ごとに持っていたものを判定する(ownsProducts などは設定の形で受け取るため)
  const asTarget = (target: AbTarget): AbTest => ({ ...newAbTest(), target })
  const [decision, setDecision] = useState<AbDecision | null>(() => parseDecision(card?.ab_test ?? draft?.card.ab_test))
  const decideVariant = async (k: VariantKey) => {
    if (!ab) return
    const others = allVariants(ab).filter((x) => x !== k)
    if (!(await confirmDialog(tr(`${k} 案に決めます。配信するのは ${k} 案だけになり、${others.join('・')} 案は「配信しなかった案」として残します(保存で確定)。よろしいですか?`, `Go with variant ${k}? Only ${k} will be sent; ${others.join(', ')} will be kept as variants not sent (on save).`)))) return
    const rejected: RejectedVariant[] = others.map((x) => ({
      key: x,
      ...(ownsHero(ab) ? heroOf(x) : {}),
      productIds: ownsProducts(ab) ? itemsOf(x).map((i) => i.productId) : [],
      ...(ownsAnyText(ab) ? { texts: textsOf(x) } : {}),
      ...(ownsTemplate(ab) ? { template: pinnedTemplateKey(templateOfV(x)) } : {}),
    }))
    const chosen: VariantData = { items: itemsOf(k), ...heroOf(k), texts: textsOf(k), template: templateOfV(k) }
    // 決めた案の中身を、配信そのもの(A)にする。B・C 案の行は、保存で A の行になる(行 ID はそのまま使い、variant を空に)
    if (ownsProducts(ab)) setItems(chosen.items)
    // 商品が共通で、決めた案が商品の画像を替えていたら、その画像を配信の画像にする(X64 の e)
    else if (ownsImages(ab) && k !== 'A' && ab?.images?.[k]) setItems((prev) => withVariantImages(prev, ab.images?.[k]))
    if (ownsHero(ab)) {
      setHeroId(chosen.heroId)
      setHeroReason(chosen.heroReason)
    }
    if (ownsAnyText(ab) && chosen.texts) showText(chosen.texts, ownsText(ab))
    if (ownsTemplate(ab) && chosen.template) setTemplate(chosen.template)
    setSelectedKey(null)
    setStash({})
    setActive('A')
    setDecision({ variant: k, at: new Date().toISOString(), by: myName() || form.owner || '', target: ab.target, rejected })
    setAb(null)
    setAlertNotes((prev) => [
      ...prev,
      tr(`案から選ぶ: ${k} 案に決めた。${others.join('・')} 案は配信しない(中身は配信カードの「配信しなかった案」に残す)`, `Chose variant ${k}. ${others.join(', ')} will not be sent (kept as variants not sent in the delivery card).`),
    ])
  }

  // ---- シンプルな配信カードの AB テスト(SU2)。比べる要素は、最初に選ばせず、A と違う所から自動で決める。
  // 編集の間は、どの部品も案ごとに持ち(target all)、保存するときに、違う所から比べる要素を決める(saveTarget)。今の画面で決めた比べる要素は、今の画面では、そのまま使う
  const [abAuto, setAbAuto] = useState(false)
  /** 案 k が A と違う部品(違いの目印と、比べる要素の決め方に使う) */
  const diffOf = (k: VariantKey) => {
    const a = textsOf('A')
    const x = textsOf(k)
    const parts: PartRef[] = []
    for (const f of ['headline', 'copy', 'pushTitle', 'pushBody'] as const) if ((x[f] ?? '') !== (a[f] ?? '')) parts.push({ kind: f })
    const subject = (x.subject ?? '') !== (a.subject ?? '') || (x.preheader ?? '') !== (a.preheader ?? '')
    if ((x.subject ?? '') !== (a.subject ?? '')) parts.push({ kind: 'subject' })
    if ((x.preheader ?? '') !== (a.preheader ?? '')) parts.push({ kind: 'preheader' })
    const n = Math.max(a.sectionTitles.length, x.sectionTitles.length, a.sectionCopies.length, x.sectionCopies.length)
    for (let i = 0; i < n; i++) {
      if ((x.sectionTitles[i] ?? '') !== (a.sectionTitles[i] ?? '')) parts.push({ kind: 'sectionTitle', index: i })
      if ((x.sectionCopies[i] ?? '') !== (a.sectionCopies[i] ?? '')) parts.push({ kind: 'sectionCopy', index: i })
    }
    // テンプレートの部品の中身(T8 段階 6): 文が違えばテキスト、画像が違えば画像の部品
    const ap = a.parts ?? {}
    const xp = x.parts ?? ap
    for (const id of new Set([...Object.keys(ap), ...Object.keys(xp)])) {
      // 文はテキストの部品かボタンの文言(ボタンなら、ボタンの部品に目印)
      if ((xp[id]?.text ?? '') !== (ap[id]?.text ?? '')) parts.push(findPart(getTemplate(templateOfV(k)), id)?.type === 'button' ? { kind: 'button', id } : { kind: 'text', id })
      if ((xp[id]?.src ?? '') !== (ap[id]?.src ?? '') || (xp[id]?.alt ?? '') !== (ap[id]?.alt ?? '')) parts.push({ kind: 'image', id })
    }
    const text = parts.some((p) => p.kind !== 'subject' && p.kind !== 'preheader')
    const hero = (heroOf(k).heroId ?? '') !== (heroOf('A').heroId ?? '')
    if (hero) parts.push({ kind: 'hero' })
    const ai = itemsOf('A')
    const xi = itemsOf(k)
    let products = false
    for (let i = 0; i < Math.max(ai.length, xi.length); i++) {
      if (ai[i]?.productId === xi[i]?.productId) continue
      products = true
      parts.push(xi[i] ? { kind: 'product', itemKey: xi[i].key } : { kind: 'slot', index: i })
    }
    // テンプレート(案ごとに持つときだけ)。違えば、プレビューのテンプレートの札に目印
    const tpl = ownsTemplate(ab) && pinnedTemplateKey(templateOfV(k)) !== pinnedTemplateKey(templateOfV('A'))
    if (tpl) parts.push({ kind: 'template' })
    return { parts, text, subject, hero, products, template: tpl }
  }
  // 開いたときの比べる要素(どの案も A と違わないときは、これを使う)
  const [abBaseTarget] = useState<AbTarget>(() => parseAbTest(card?.ab_test ?? draft?.card.ab_test)?.target ?? 'hero')
  /** 保存する比べる要素: A と違う所から決める(文言が違えば全体、件名だけなら件名、画像と商品なら両方 …) */
  const saveTarget = (): AbTarget | null => {
    if (!ab) return null
    if (!abAuto) return ab.target
    const ds = ab.variants.map(diffOf)
    const text = ds.some((d) => d.text)
    const subject = ds.some((d) => d.subject)
    const hero = ds.some((d) => d.hero)
    const products = ds.some((d) => d.products)
    // テンプレートが違えば、見出し・コピー・商品の枠も案ごとに要るので、全体
    if (ds.some((d) => d.template)) return 'all'
    if (text || (subject && (hero || products))) return 'all'
    if (subject) return 'subject'
    if (hero && products) return 'both'
    if (products) return 'products'
    if (hero) return 'hero'
    return abBaseTarget
  }
  const savedTargetAb = (): AbTest | null => (ab ? asTarget(saveTarget() ?? ab.target) : null)

  // ---- シンプルな画面の AB テスト(SU2)の操作
  /** 案の写し(商品は新しい行として。行 ID は持たない) */
  const copyOfVariant = (k: VariantKey): VariantData => {
    const h = heroOf(k)
    const x = textsOf(k)
    return {
      items: itemsOf(k).map((i) => ({ ...i, key: crypto.randomUUID(), rowId: undefined })),
      heroId: h.heroId,
      heroReason: h.heroReason,
      texts: { ...x, sectionTitles: [...x.sectionTitles], sectionCopies: [...x.sectionCopies] },
      template: templateOfV(k),
    }
  }
  // 「AI で別の案を作る」: 案を足した次の描画で、その案を AI に作らせる(作るのは、いま編集している案)
  const [abDraftPending, setAbDraftPending] = useState(false)
  useEffect(() => {
    if (!abDraftPending) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAbDraftPending(false)
    void draftActiveVariant()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abDraftPending])
  /** 案を足す(from の写しから始める。ai は A を写してから、AI に作らせる)。AB テストでなければ、始める */
  const abAddSimple = (from: VariantKey | 'ai') => {
    const base = from === 'ai' ? 'A' : from
    if (!ab) {
      const next: AbTest = { ...newAbTest('test'), target: 'all' }
      setAbAuto(true)
      setAb(next)
      loadVariant('B', copyOfVariant(base), next)
    } else {
      const k = nextVariant(ab)
      if (!k) return
      const next: AbTest = { ...ab, variants: [...ab.variants, k].sort() as VariantKey[] }
      setAb(next)
      loadVariant(k, copyOfVariant(base), next)
    }
    if (from === 'ai') setAbDraftPending(true)
  }
  // シンプルな画面で開いた AB テストは、どの部品も案ごとに直せるようにする(target all。足りない分は A の写しで始める)。
  // 開いただけで「変えた」にならないよう、変えたあとの中身を基準にし直す
  const abUpgradedRef = useRef(false)
  useEffect(() => {
    if (!ab || abAuto || original === null) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (ab.target !== 'all') changeTarget('all')
    setAbAuto(true)
    abUpgradedRef.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ab, abAuto, original])

  // A を直したら、B・C でまだ直していない部品(A の前の中身と同じ所)も、A に合わせる(SU2 ⑥。「B は A とこの部分だけが違う」を保つ)
  const prevA = useRef<{ texts: VariantText; heroId?: string; productIds: string[]; images: string[]; template: string } | null>(null)
  const aNow = { texts: curText(), heroId, productIds: items.map((i) => i.productId), images: items.map((i) => i.imageUrl ?? ''), template: pinnedTemplateKey(template) }
  const aKey = JSON.stringify(aNow)
  useEffect(() => {
    if (!ab || !abAuto || active !== 'A') {
      prevA.current = null
      return
    }
    const before = prevA.current
    prevA.current = { texts: { ...aNow.texts, sectionTitles: [...aNow.texts.sectionTitles], sectionCopies: [...aNow.texts.sectionCopies] }, heroId: aNow.heroId, productIds: [...aNow.productIds], images: [...aNow.images], template: aNow.template }
    if (!before) return
    setStash((prev) => {
      let changedAny = false
      const out = { ...prev }
      for (const k of ab.variants) {
        const v = prev[k]
        if (!v) continue
        const tx = v.texts ? { ...v.texts, sectionTitles: [...v.texts.sectionTitles], sectionCopies: [...v.texts.sectionCopies] } : undefined
        if (tx) {
          // 部品の中身: B のその部品が A の前の中身のままなら、A のいまの中身にする
          const bp = before.texts.parts ?? {}
          const np = aNow.texts.parts ?? {}
          const vp: PartContent = { ...(tx.parts ?? bp) }
          for (const id of new Set([...Object.keys(bp), ...Object.keys(np)])) {
            if (samePartContent({ x: vp[id] ?? {} }, { x: bp[id] ?? {} }) && !samePartContent({ x: np[id] ?? {} }, { x: bp[id] ?? {} })) {
              if (np[id]) vp[id] = np[id]
              else delete vp[id]
              changedAny = true
            }
          }
          tx.parts = vp
          for (const f of ['headline', 'copy', 'pushTitle', 'pushBody', 'subject', 'preheader'] as const) {
            if ((tx[f] ?? '') === (before.texts[f] ?? '') && (aNow.texts[f] ?? '') !== (before.texts[f] ?? '')) {
              tx[f] = aNow.texts[f] ?? ''
              changedAny = true
            }
          }
          for (const arr of ['sectionTitles', 'sectionCopies'] as const) {
            const n = Math.max(aNow.texts[arr].length, before.texts[arr].length)
            for (let i = 0; i < n; i++) {
              if ((tx[arr][i] ?? '') === (before.texts[arr][i] ?? '') && (aNow.texts[arr][i] ?? '') !== (before.texts[arr][i] ?? '')) {
                while (tx[arr].length <= i) tx[arr].push('')
                tx[arr][i] = aNow.texts[arr][i] ?? ''
                changedAny = true
              }
            }
          }
        }
        let hero = v.heroId
        let heroReason2 = v.heroReason
        if ((v.heroId ?? '') === (before.heroId ?? '') && (aNow.heroId ?? '') !== (before.heroId ?? '')) {
          hero = aNow.heroId
          heroReason2 = heroReason
          changedAny = true
        }
        // 商品は枠ごとに: B のその枠が A の前の商品のままなら、A のいまの商品にする
        const list = [...v.items]
        for (let i = 0; i < Math.max(aNow.productIds.length, before.productIds.length); i++) {
          const now = aNow.productIds[i]
          if (list[i]?.productId !== before.productIds[i] || now === before.productIds[i]) continue
          const src = items[i]
          if (src) list[i] = { ...src, key: crypto.randomUUID(), rowId: undefined }
          else list.splice(i, 1)
          changedAny = true
        }
        // 同じ商品の枠で、B の画像が A の前の画像のままなら、A のいまの画像にする(X64 の e。画像も「A と違う所だけ」を保つ)
        for (let i = 0; i < list.length; i++) {
          if (!list[i] || list[i].productId !== aNow.productIds[i] || (list[i].imageUrl ?? '') !== (before.images[i] ?? '') || aNow.images[i] === (before.images[i] ?? '')) continue
          list[i] = { ...list[i], imageUrl: aNow.images[i] || undefined, imageSource: items[i]?.imageSource }
          changedAny = true
        }
        if (aNow.productIds.length > before.productIds.length && list.length === before.productIds.length)
          for (let i = before.productIds.length; i < aNow.productIds.length; i++) list.push({ ...items[i], key: crypto.randomUUID(), rowId: undefined })
        // テンプレート: B が A の前のテンプレートのままなら、A のいまのテンプレートにする
        let tpl = v.template
        if (v.template && pinnedTemplateKey(v.template) === before.template && aNow.template !== before.template) {
          tpl = template
          changedAny = true
        }
        out[k] = { ...v, texts: tx, heroId: hero, heroReason: heroReason2, items: list, template: tpl }
      }
      return changedAny ? out : prev
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aKey, active, abAuto, ab])
  // いまの案が A と違う部品(目印と、違いが多いときの知らせ)
  const abDiff = ab && active !== 'A' ? diffOf(active) : null

  return { ab, setAb, active, stash, setStash, itemsOf, heroOf, textsOf, templateOfV, abForSave, switchVariant, startAbTest, addVariant, removeVariant, abAiBusy, comparing, setComparing, draftActiveVariant, stopAbTest, changeTarget, asTarget, decision, decideVariant, abAuto, saveTarget, savedTargetAb, abAddSimple, abUpgradedRef, abDiff }
}
