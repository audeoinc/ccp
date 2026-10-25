// 配信カードの中身(入力欄・商品・候補・テンプレート・見出し・メイン画像・リンク・案)と、開いてから変えたかの判定・保存。
// 状態と保存は、配信カードでこの 1 か所だけ(CLAUDE.md。詳しい画面とシンプルな画面は、ここが返すものを、そのまま使って描く)。
// AB テストの案の出し入れ(useAbVariants)も、ここで呼ぶ(保存する中身が、案の中身に依るため)。整理 第3段 ①
import { useEffect, useMemo, useRef, useState } from 'react'
import { tr } from './i18n'
import { cardMarket, heroMarket, productMarket } from './market'
import { DeliveryCardsService } from './data/deliveryCards'
import type { DeliveryCard } from './models/deliveryCards'
import { DeliveryProductsService } from './data/deliveryProducts'
import type { Product } from './models/products'
import type { HeroImage } from './models/heroImages'
import { themeTypeLabel, type ThemeType } from './themeTypes'
import { fitsTarget, targetText } from './target'
import { DEFAULT_PUSH_TEMPLATE, DEFAULT_TEMPLATE, TEMPLATE_VALUES, channelOf, sectionIndexAt, sectionsOf, templateFromValue, type EmailTemplateId, type TemplateChannel, baseTemplateId, currentVersion, getTemplate, splitTemplateKey, templateKeyOfCard } from './templates'
import { remapSectionTexts } from './tables'
import { parsePushLink, type PushLink } from './pushLink'
import { DND_ITEM, DND_PRODUCT, SOURCE_MANUAL, STATE_CANDIDATE, STATE_SELECTED, type Candidate, type Item } from './items'
import type { AiCard, CopyLanguage, ProposedHero } from './aiSelect'
import { encodeLinks, parseLinks, type Links } from './links'
import type { WeekRow } from './data/weeks'
import { CardNotesService } from './data/cardNotes'
import { confirmedWeekOf, reopenWeek, scopeOfCard } from './weekLock'
import { logEvent, myName } from './history'
import { ApprovalsService } from './data/approvals'
import { CHANNEL_PUSH, channelOptions, countryOptions, statusRank } from './status'
import { isUsableHero } from './heroRights'
import { encodeAbTest, ownsProducts, ownsSubject, ownsTemplate, type VariantKey } from './abTest'
import { useAbVariants, type VariantData } from './useAbVariants'
import { STATUS_APPROVED, STATUS_NOT_STARTED, toForm, type Form } from './cardForm'
import { planSave, runSave } from './saveFlow'

/** 読み込み時点の配信商品の行(保存時の差分判定用) */
export interface RowSnap {
  reason: string
  source: string
  state: string
  section: number
  order: number
  /** AB テストの案(空 = A。X55) */
  variant: string
  /** この配信で使う画像(X64) */
  image: string
}


/** 元に戻す(SU1 ⑫)の 1 つ分: 反映の前の、配信カードの中身 */
export interface Snapshot {
  form: Form
  items: Item[]
  candidates: Candidate[]
  heroId?: string
  heroReason: string
  sectionTitles: string[]
  sectionCopies: string[]
  template: EmailTemplateId
  links: Links
  pushLink: PushLink | null
  audience: string
}

/** 各セクションのコピーは、改行を含みうるので JSON の配列で保存する(古い形式の改行区切りも読む) */
export function parseCopies(v?: string): string[] {
  if (!v) return []
  try {
    const a = JSON.parse(v)
    if (Array.isArray(a)) return a.map(String)
  } catch {
    // JSON でなければ、改行区切りとして読む
  }
  return v.split('\n')
}
export const encodeCopies = (a: string[]) => (a.some(Boolean) ? JSON.stringify(a) : '')

export interface CardEditorDeps {
  /** undefined のときは新規作成 */
  card?: DeliveryCard
  defaults?: Partial<Form>
  draft?: { card: DeliveryCard; items: Item[]; candidates: Candidate[] }
  products: Product[]
  heroes: HeroImage[]
  weeks: WeekRow[]
  focusProductId?: string
  /** シンプルな配信カードで描いているか */
  simpleOn: boolean
  next?: { name: string; position: string } | null
  onSaved: () => Promise<void>
  onCreated?: (id: string) => void
  onReopen?: (id: string) => void
  onBack: () => void
  onNext?: () => void
}

export function useCardEditor({ card, defaults, draft, products, heroes, weeks, focusProductId, simpleOn, next, onSaved, onCreated, onReopen, onBack, onNext }: CardEditorDeps) {
  const [form, setForm] = useState<Form>(() => (card ? toForm(card) : draft ? toForm(draft.card) : { ...toForm(), ...defaults }))

  const [items, setItems] = useState<Item[]>(() => draft?.items ?? [])
  // 選定候補(配信商品テーブルの「候補」の行。セクションごと)
  const [candidates, setCandidates] = useState<Candidate[]>(() => draft?.candidates ?? [])
  // 読み込み時点の配信商品(保存時に差分を取る)。読み込めなかったときは保存で消さないよう null のまま
  const [original, setOriginal] = useState<Map<string, RowSnap> | null>(card ? null : new Map())
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  // 保存のあとに、閉じずに次の配信を開くか(「保存して次へ」で立てる。確定した週の、理由を入力する流れでも引き継ぐ)
  const goNextRef = useRef(false)
  // 「保存」(閉じない)か「保存して閉じる」か(X52)
  const stayRef = useRef(false)
  const [justSaved, setJustSaved] = useState(false)
  // どちらのボタンで保存中か(ボタンの文字を「保存中...」にするため)
  const [saveMode, setSaveMode] = useState<'stay' | 'close'>('close')

  // コピー・ヘッドラインの言語(AI に渡す。保存はしない)
  // コピー・ヘッドラインの言語は、配信の国に合わせる(US は英語、JP は日本語)。以前は切り替えられたが、2026-10-16 に外した
  const language: CopyLanguage = 'auto'
  const [template, setTemplate] = useState<EmailTemplateId>(
    // 使った版で開く(テンプレートが編集されていても、この配信は、使った版の形のまま)
    () => (card ? templateKeyOfCard(card) : draft ? templateKeyOfCard(draft.card) : templateFromValue(undefined)),
  )
  // アプリ: 通知を押したときに開く画面と、送る相手
  const [pushLink, setPushLink] = useState<PushLink | null>(() => parsePushLink(card?.push_link))
  const [audience, setAudience] = useState<string>(card?.audience ?? '')
  const templateChannel: TemplateChannel = form.channel === String(CHANNEL_PUSH) ? 'push' : 'email'
  // チャネルを変えたら、テンプレートも、そのチャネルのものにする(メールのテンプレートでアプリの通知は作れないため)
  useEffect(() => {
    if (channelOf(template) === templateChannel) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTemplate(templateChannel === 'push' ? DEFAULT_PUSH_TEMPLATE : DEFAULT_TEMPLATE)
  }, [templateChannel, template])
  // カテゴリ系テンプレートの見出し(セクションの順。保存は 1 行 1 見出し)
  const [sectionTitles, setSectionTitles] = useState<string[]>(() => (card?.section_titles ? card.section_titles.split('\n') : []))
  // 各セクションのコピー(セクションの順)
  const [sectionCopies, setSectionCopies] = useState<string[]>(() => parseCopies(card?.section_copies))
  // メイン画像の候補(AI が案を出したときの分。保存はしない)
  const [heroCandidates, setHeroCandidates] = useState<ProposedHero[]>([])
  const [heroId, setHeroId] = useState<string | undefined>(card?.hero_image_id ?? undefined)
  const [heroReason, setHeroReason] = useState(card?.hero_reason ?? '')

  const [links, setLinks] = useState<Links>(() => parseLinks(card?.links))

  const [saving, setSaving] = useState(false)
  // 確定した週の変更: 保存の前に、理由を入力してもらう(null = 入力欄を出していない)
  const [changeReason, setChangeReason] = useState<string | null>(null)
  // 差し戻しの理由(null = 入力欄を出していない)
  // 承認・差し戻しの履歴に残す名前(週の状態の帯・コメントと共通)
  const [error, setError] = useState<string | null>(null)

  // 差し替えた理由(保存したときに、配信のメモ(種類 change)に残す。アラートの画面で差し替えたときと同じ記録)。
  // アラートへの対応と、商品のフロートで残りの候補と入れ替えたとき(X47)の両方
  const [alertNotes, setAlertNotes] = useState<string[]>([])
  // 商品・メイン画像は、配信カードの国に合う市場のものだけを、選定の対象にする(すでに載せた他の市場の商品は、表示のために残す)
  const market = cardMarket(form.country)
  // 配信の対象の性別が決まっていれば、それに合う商品だけ(女性向けなら、ウィメンズとユニセックス。X40)
  const poolProducts = useMemo(() => products.filter((p) => (!market || productMarket(p) === market) && fitsTarget(p, form.targetGender)), [products, market, form.targetGender])
  // 使える期限を過ぎた画像は、選ぶ候補・AI の候補から外す(いま使っている画像は残す。X59)
  const poolHeroes = useMemo(() => heroes.filter((h) => (!market || heroMarket(h) === market) && (isUsableHero(h) || h.id === heroId)), [heroes, market, heroId])
  // AB テスト(X55)・案から選ぶ(X57)・シンプルな画面の AB テスト(SU2)の、案の中身と操作(useAbVariants.ts)
  const { ab, setAb, active, stash, setStash, itemsOf, heroOf, textsOf, templateOfV, abForSave, switchVariant, startAbTest, addVariant, removeVariant, abAiBusy, comparing, setComparing, draftActiveVariant, stopAbTest, changeTarget, asTarget, decision, decideVariant, abAuto, saveTarget, savedTargetAb, abAddSimple, abUpgradedRef, abDiff } = useAbVariants({
    card, draft, form, setForm, items, setItems, heroId, setHeroId, heroReason, setHeroReason, sectionTitles, setSectionTitles, sectionCopies, setSectionCopies,
    template, setTemplate, setCandidates, setSelectedKey, setError, setAlertNotes, poolProducts, poolHeroes, language, templateChannel, simpleOn, original,
    // 押したときに呼ぶので、この下で作る関数でよい
    buildAiCard: () => buildAiCard(),
  })

  useEffect(() => {
    if (!card) return
    let cancelled = false
    DeliveryProductsService.getAll({
      filter: `delivery_card_id eq ${card.id}`,
      orderBy: ['sort_order asc'],
    })
      .then((res) => {
        if (cancelled) return
        if (!res.success) throw new Error(res.error?.message ?? tr('掲載商品の取得に失敗しました', 'Failed to load the products in this delivery'))
        const sel: Item[] = []
        const cands: Candidate[] = []
        const byVariant = new Map<string, Item[]>()
        const snap = new Map<string, RowSnap>()
        for (const r of res.data ?? []) {
          const state = r.state ?? STATE_SELECTED
          const section = r.section ?? 0
          const base: Item = {
            key: r.id,
            rowId: r.id,
            productId: r.product_id ?? '',
            reason: r.reason ?? '',
            source: r.source ?? SOURCE_MANUAL,
            ...(r.image_url ? { imageUrl: r.image_url, imageSource: r.image_source ?? '' } : {}),
          }
          const variant = r.variant ?? ''
          snap.set(base.rowId!, { reason: base.reason, source: base.source, state, section, order: r.sort_order ?? 0, variant, image: r.image_url ?? '' })
          if (state === STATE_CANDIDATE) cands.push({ ...base, section })
          else if (variant) byVariant.set(variant, [...(byVariant.get(variant) ?? []), base])
          else sel.push(base)
        }
        setItems(sel)
        // B・C 案の商品(X55)
        if (byVariant.size > 0)
          setStash((prev) => {
            const next = { ...prev }
            for (const [k, list] of byVariant) next[k as VariantKey] = { heroReason: '', ...next[k as VariantKey], items: list }
            return next
          })
        setCandidates(cands)
        setOriginal(snap)
        // アラートの画面から開いたときは、問題の商品を選んでおく(プレビューのその枠が強調され、見える位置までスクロールする)
        const focus = focusProductId ? sel.find((i) => i.productId === focusProductId) : undefined
        if (focus) setSelectedKey(focus.key)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
    // 選んでおく商品は、開いたときにだけ使う(配信カードは、配信ごとに作り直されるので、ここで読み直すことはない)
  }, [card, focusProductId, setStash])

  // 左ペインで手で書き換えたら、採用した案の補足は消す
  const STALE: Partial<Record<keyof Form, keyof Form>> = { theme: 'themeReason', headline: 'copyAngle', copy: 'copyAngle', instructions: 'instructionsAngle' }
  // いまの form に重ねる(描いたときの form に重ねると、同じ流れで先に変えた欄を、古い値で戻してしまうため)
  const set = <K extends keyof Form>(k: K) => (v: Form[K]) => {
    const stale = STALE[k]
    setForm((f) => ({ ...f, [k]: v, ...(stale ? { [stale]: '' } : {}) }))
  }
  const num = (v: string) => (v === '' ? undefined : (v as never))
  // 商品の引き当ては、1 つの表で(打つたびの描き直しで、一覧を何度も端から探さないように)
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])
  const productName = (id: string) => productById.get(id)?.name ?? ''

  const addProduct = (productId: string, at = items.length) => {
    if (items.some((i) => i.productId === productId)) return
    // 候補にあった商品なら、候補から選定へ移す(理由も引き継ぐ)
    const cand = candidates.find((c) => c.productId === productId)
    if (cand) setCandidates(candidates.filter((c) => c.key !== cand.key))
    const it: Item = cand
      ? { key: cand.key, rowId: cand.rowId, productId, reason: cand.reason, source: cand.source }
      : { key: crypto.randomUUID(), productId, reason: '', source: SOURCE_MANUAL }
    setItems([...items.slice(0, at), it, ...items.slice(at)])
    setSelectedKey(it.key)
  }

  // プレビューへのドロップ: 並べ替え(DND_ITEM)か、候補からの追加(DND_PRODUCT)
  const dropAt = (index: number, dt: DataTransfer) => {
    const itemKey = dt.getData(DND_ITEM)
    const productId = dt.getData(DND_PRODUCT)
    if (itemKey) {
      const from = items.findIndex((i) => i.key === itemKey)
      if (from < 0) return
      moveItem(from, Math.min(index, items.length - 1))
    } else if (productId) {
      addProduct(productId, index)
    }
  }

  // from の商品を to の位置へ移す(間の商品は1つずつずれる)
  const moveItem = (from: number, to: number) => {
    if (from === to || to < 0 || to >= items.length) return
    const next = [...items]
    const [it] = next.splice(from, 1)
    next.splice(to, 0, it)
    setItems(next)
  }

  // 同じカテゴリの商品を隣り合わせにする(カテゴリの並びは、現在の登場順を保つ)
  const groupByCategory = () => {
    const cat = (i: Item) => productById.get(i.productId)?.category_name ?? ''
    const order = [...new Set(items.map(cat))]
    setItems([...items].sort((a, b) => order.indexOf(cat(a)) - order.indexOf(cat(b))))
  }

  // エージェントに渡す、配信カードの現在の入力内容
  const buildAiCard = (): AiCard => {
    const label = (opts: { value: string; label: string }[], v: string) => opts.find((o) => String(o.value) === v)?.label ?? ''
    return {
      name: form.name,
      scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : '',
      country: label(countryOptions, form.country),
      channel: label(channelOptions, form.channel),
      department: '',
      themeType: form.themeType ? themeTypeLabel(form.themeType as ThemeType) : undefined,
      target: targetText({ gender: form.targetGender, ages: form.targetAges, audience: templateChannel === 'push' ? audience : '' }),
      theme: form.theme,
      headline: form.headline,
      copy: form.copy,
      instructions: form.instructions,
    }
  }

  // テンプレートを変えると、セクションの構成が変わるので、候補は破棄する(AI の案の破棄は、配信カードの changeTemplate)。変えたら true
  const applyTemplate = (id: EmailTemplateId): boolean => {
    if (id === template) return false
    // 同じテンプレートの版を替えるときは、番号で持っている見出し・コピーを、セクションの ID で読み替える
    // (セクションの並びが版で違っても、文が別のセクションへずれないように。T8 の 8.1。AB テストのほかの案の文も同じ)
    if (baseTemplateId(id) === baseTemplateId(template)) {
      const from = getTemplate(template)
      const to = getTemplate(id)
      setSectionTitles((prev) => remapSectionTexts(from, to, prev))
      setSectionCopies((prev) => remapSectionTexts(from, to, prev))
      // テンプレートを案ごとに持つときは、ほかの案はそれぞれのテンプレートのまま(読み替えない)
      if (!ownsTemplate(ab)) {
        setStash((prev) =>
          Object.fromEntries(
            Object.entries(prev).map(([k, v]) => [
              k,
              v?.texts ? { ...v, texts: { ...v.texts, sectionTitles: remapSectionTexts(from, to, v.texts.sectionTitles), sectionCopies: remapSectionTexts(from, to, v.texts.sectionCopies) } } : v,
            ]),
          ) as Partial<Record<VariantKey, VariantData>>,
        )
      }
    }
    setTemplate(id)
    setCandidates([])
    return true
  }

  const setSectionTitle = (i: number, text: string) =>
    setSectionTitles((prev) => {
      const next = [...prev]
      while (next.length <= i) next.push('')
      next[i] = text
      return next
    })

  const setSectionCopy = (i: number, text: string) =>
    setSectionCopies((prev) => {
      const next = [...prev]
      while (next.length <= i) next.push('')
      next[i] = text
      return next
    })

  const removeItem = (key: string) => {
    const idx = items.findIndex((i) => i.key === key)
    if (idx >= 0) {
      const section = sectionIndexAt(sectionsOf(template), idx)
      setCandidates([{ ...items[idx], section }, ...candidates])
    }
    setItems(items.filter((i) => i.key !== key))
    if (selectedKey === key) setSelectedKey(null)
  }

  // 差分を配信商品テーブルへ反映する(選定済み + 候補。削除 → 更新/追加)
  async function syncItems(cardId: string, cardName: string, before: Map<string, RowSnap>) {
    const sections = sectionsOf(template)
    const desired: { it: Item; state: typeof STATE_SELECTED | typeof STATE_CANDIDATE; section: number; order: number; variant: string }[] = [
      ...itemsOf('A').map((it, idx) => ({ it, state: STATE_SELECTED as typeof STATE_SELECTED, section: sectionIndexAt(sections, idx), order: idx + 1, variant: '' })),
      ...candidates.map((c, i) => ({ it: c as Item, state: STATE_CANDIDATE as typeof STATE_CANDIDATE, section: c.section, order: 1000 + i, variant: '' })),
      // AB テストで、案ごとに商品を持つとき: B・C 案の商品も、variant を付けて保存する(X55)
      ...(ab && ownsProducts(savedTargetAb())
        ? ab.variants.flatMap((k) => itemsOf(k).map((it, idx) => ({ it, state: STATE_SELECTED as typeof STATE_SELECTED, section: sectionIndexAt(sections, idx), order: idx + 1, variant: k })))
        : []),
    ]
    const keep = new Set(desired.map((d) => d.it.rowId).filter((id): id is string => !!id))
    for (const id of before.keys()) {
      if (!keep.has(id)) await DeliveryProductsService.delete(id)
    }
    for (const d of desired) {
      const fields = {
        sort_order: d.order,
        reason: d.it.reason,
        source: d.it.source,
        state: d.state,
        section: d.section,
        variant: d.variant,
        image_url: d.it.imageUrl ?? '',
        image_source: d.it.imageUrl ? (d.it.imageSource ?? '') : '',
      }
      let res
      if (d.it.rowId) {
        const old = before.get(d.it.rowId)
        if (old && old.reason === d.it.reason && old.source === d.it.source && old.state === d.state && old.section === d.section && old.order === d.order && old.variant === d.variant && old.image === (d.it.imageUrl ?? '')) continue
        res = await DeliveryProductsService.update(d.it.rowId, fields)
      } else {
        res = await DeliveryProductsService.create({
          ...fields,
          name: `${cardName} / ${productName(d.it.productId)}`,
          delivery_card_id: cardId,
          product_id: d.it.productId,
          state_code: 0,
        })
      }
      if (!res.success) throw new Error(res.error?.message ?? tr('掲載商品の保存に失敗しました', 'Failed to save the products in this delivery'))
    }
  }

  // 確定した週に入っている配信か(配信日時を変えるときは、移す前と移したあとの両方の週)。同じ週は 1 つにまとめる
  const lockedWeeks = [confirmedWeekOf(weeks, card?.scheduled_at, scopeOfCard(card ?? form)), confirmedWeekOf(weeks, form.scheduledAt, scopeOfCard(form))].filter(
    (w, i, all): w is WeekRow => !!w && all.findIndex((x) => x?.id === w.id) === i,
  )

  function submit(e: React.FormEvent) {
    e.preventDefault()
    goNextRef.current = false
    stayRef.current = false
    setSaveMode('close')
    requestSave()
  }

  /** 保存して、開いたまま続ける(X52。「保存して閉じる」とは別) */
  function saveAndStay() {
    goNextRef.current = false
    stayRef.current = true
    setSaveMode('stay')
    requestSave()
  }

  /** 保存して、次の配信を開く(週のレビュー・確定で、閉じてカレンダーで探し直さずに済むように。FLOWS.md の C-1) */
  function saveAndNext() {
    goNextRef.current = true
    stayRef.current = false
    requestSave()
  }

  function requestSave() {
    // 確定した週の配信は、すぐには保存しない。理由を入力してもらってから、保存して、週をレビューに戻す
    if (lockedWeeks.length > 0) {
      setChangeReason((r) => r ?? '')
      return
    }
    void save()
  }

  /** 保存する内容(ステータスを除く)。保存と、承認済みの配信の内容が変わったかの判定(再承認)の両方で使う */
  function buildContent() {
    return {
        name: form.name,
        scheduled_at: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : undefined,
        country: num(form.country),
        channel: num(form.channel),
        theme_type: form.themeType || (null as never),
        owner: form.owner.trim(),
        production_due: form.productionDue || (null as never),
        links: encodeLinks(links),
        push_link: pushLink ? JSON.stringify(pushLink) : '',
        audience: audience,
        target_gender: (form.targetGender || null) as never,
        target_ages: form.targetAges,
        // 件名を案ごとに持つときは、A 案の件名を配信の列に(X2・AB テスト)
        subject: ownsSubject(ab) ? (textsOf('A').subject ?? '') : form.subject,
        preheader: ownsSubject(ab) ? (textsOf('A').preheader ?? '') : form.preheader,
        push_title: textsOf('A').pushTitle,
        push_body: textsOf('A').pushBody,
        production_owner: form.productionOwner.trim(),
        handed_off_at: form.handedOffAt || (null as never),
        theme: form.theme,
        // 文言を案ごとに持つとき(X57)は、A 案の文言を配信の中身として保存する
        headline: textsOf('A').headline,
        products: itemsOf('A').map((i) => productName(i.productId)).filter(Boolean).join(' / '),
        copy: textsOf('A').copy,
        instructions: form.instructions,
        theme_reason: form.themeReason,
        copy_angle: form.copyAngle,
        instructions_angle: form.instructionsAngle,
        hero_reason: heroOf('A').heroReason,
        ab_test: encodeAbTest(abForSave(), decision),
        // 標準のテンプレートは、以前の選択肢の列にも書く(互換)。作ったテンプレートは、layoutkey だけ
        email_template: TEMPLATE_VALUES[baseTemplateId(templateOfV('A'))],
        // テンプレートの ID と、使った版の番号を分けて書く(いまの版を選んだときは、いまの版の番号)。B・C 案を直している間も、A のもの
        layout_key: baseTemplateId(templateOfV('A')),
        layout_version: splitTemplateKey(templateOfV('A')).version ?? currentVersion(baseTemplateId(templateOfV('A'))),
        section_titles: textsOf('A').sectionTitles.join('\n').replace(/\n+$/, ''),
        section_copies: encodeCopies(textsOf('A').sectionCopies),
        // 外したときは null を送ってルックアップを空にする
        hero_image_id: heroOf('A').heroId
          ? heroOf('A').heroId
          : card?.hero_image_id
            ? (null as never)
            : undefined,
    }
  }
  // 再承認の判定に使う、内容の要約。商品の名前の列は、商品の一覧の読み込みで変わるので、商品 ID の並びで比べる。
  // 開いたときの値(下の baseline)と比べる(保存済みの行と比べると、表し方の違いだけで「変わった」になるため)
  const contentKey = () => {
    const { products: _names, ...rest } = buildContent()
    void _names
    return JSON.stringify({ ...rest, items: itemsOf('A').map((i) => i.productId), variants: ab && ownsProducts(savedTargetAb()) ? ab.variants.map((k) => itemsOf(k).map((i) => i.productId)) : [] })
  }
  const baseline = useRef<string | null>(null)
  // 基準にした時点の中身(シンプルな配信カードの「元に戻す」で、反映の前に戻す)
  const committedSnap = useRef<Snapshot | null>(null)
  // 基準を取り直した回数(保存して開いたままのとき、「変えたか」を測り直すため)
  const [baseVersion, setBaseVersion] = useState(0)
  const takeSnapshot = (): Snapshot => ({ form, items, candidates, heroId, heroReason, sectionTitles, sectionCopies, template, links, pushLink, audience })
  useEffect(() => {
    // 掲載商品を読み込んだ時点(自動の下書きより前)の内容を、基準にする
    if (card && original !== null && baseline.current === null) {
      baseline.current = contentKey()
      committedSnap.current = takeSnapshot()
      setBaseVersion((v) => v + 1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card, original])
  const savedStatus = card?.status ?? STATUS_NOT_STARTED
  const approvedBefore = !!card && statusRank(savedStatus) >= statusRank(STATUS_APPROVED)
  // 開いた時点から内容が変わったか(承認・依頼の前に、保存してもらうため。基準は ref なので、描画の中では読まず、関数で渡す)
  const isDirty = () => baseline.current !== null && baseline.current !== contentKey()

  // 開いてから内容を変えたか(承認済み・確定した週の帯は、変えたときだけ出す。ふだんの説明は、右のプロセスのペインの状態の下)
  const [changed, setChanged] = useState(false)
  const currentKey = contentKey()
  useEffect(() => {
    setChanged(baseline.current !== null && baseline.current !== currentKey)
  }, [currentKey, baseVersion])
  // 承認(依頼・承認・差し戻し)を出すか: 保存済みで、確定していない配信(確定した週の配信は、確定後の変更の流れ)
  const canReview = !!card && lockedWeeks.length === 0 && statusRank(savedStatus) <= statusRank(STATUS_APPROVED)
  // 承認の依頼・承認で、サーバーが配信のステータスを変えたら、入力欄のステータスもそろえる(次の保存で、古いステータスを書き戻さないように)
  useEffect(() => {
    if (!card?.status) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm((f) => (f.status === String(card.status) ? f : { ...f, status: String(card.status) }))
  }, [card?.status])

  /**
   * 保存する。reason を渡したとき(確定した週の変更)は、配信を「承認待ち」に戻し、週をレビュー中に戻して、理由を記録する。
   * 承認済みの配信の内容を変えたときは、承認のやり直しが必要なので「承認待ち」に戻し、いまの承認の依頼を古いものにする。
   * 承認・差し戻しそのものは、ここではなく ApprovalBar(サーバーの窓口 /api/approvals)で行う(U4)
   */
  async function save(reason?: string): Promise<boolean> {
    const goNext = goNextRef.current
    const stay = stayRef.current
    setSaving(true)
    setError(null)
    try {
      // 何をするかを決めて(planSave)、決まった順に行う(runSave。順番は scripts/check-save.mjs が確かめる)
      const plan = planSave({
        isNew: !card,
        savedStatus: card?.status,
        formStatus: num(form.status),
        reason,
        approvedBefore,
        contentChanged: baseline.current !== null && baseline.current !== contentKey(),
      })
      const status = plan.status
      const fields = { ...buildContent(), status: status as DeliveryCard['status'] }
      const cardId = await runSave(plan, !card, {
        writeCard: async () => {
          const res = card ? await DeliveryCardsService.update(card.id, fields) : await DeliveryCardsService.create({ ...fields, state_code: 0 })
          if (!res.success) throw new Error(res.error?.message ?? tr('保存に失敗しました', 'Failed to save'))
          const id = card?.id ?? res.data?.id
          if (!id) throw new Error(tr('配信カードのIDを取得できませんでした', 'Could not get the delivery card ID'))
          return id
        },
        syncItems: original ? (id) => syncItems(id, form.name, original) : null,
        // 作業画面の案を、ここで新規作成として保存した(作業画面で、その案を保存済みにする)
        created: (id) => onCreated?.(id),
        reopenWeeks: async () => {
          for (const w of lockedWeeks) {
            const r = await reopenWeek(w, w.country ? { country: w.country, channel: w.channel } : scopeOfCard(form))
            if (!r.success) throw new Error(r.error?.message ?? tr('週をレビュー中に戻せませんでした', 'Could not put the week back in review'))
          }
        },
        noteReason: async (id) => {
          const n = await CardNotesService.create({
            kind: 'change',
            body: (reason ?? '').trim(),
            author: form.owner.trim(),
            delivery_card_id: id,
          })
          if (!n.success) throw new Error(n.error?.message ?? tr('変更の理由を記録できませんでした', 'Could not record the reason for the change'))
        },
        resetApproval: async (id) => {
          const a = await ApprovalsService.reset({ delivery_card_id: id })
          if (!a.success) throw new Error(a.error?.message ?? tr('承認の依頼を古いものにできませんでした', 'Could not mark the approval request as stale'))
        },
        logEvent: async (id, action) => {
          await logEvent({
            action,
            card: { id, name: form.name, scheduledAt: fields.scheduled_at },
            from: card?.status,
            to: fields.status,
            note: reason?.trim(),
          })
        },
        // アラートへの対応で差し替えた理由を、配信のメモ(種類 change)に残す
        saveAlertNotes: async (id) => {
          if (alertNotes.length === 0) return
          for (const body of alertNotes) await CardNotesService.create({ kind: 'change', body, author: myName() || form.owner || '', delivery_card_id: id })
          setAlertNotes([])
        },
        reload: onSaved,
      })
      goNextRef.current = false
      stayRef.current = false
      if (stay) {
        // 開いたまま続ける: 保存した内容を、変更の基準にし直す(掲載商品は、読み直した配信カードから読み直される)
        baseline.current = null
        setForm((f) => ({ ...f, status: String(status) }))
        setChangeReason(null)
        setJustSaved(true)
        window.setTimeout(() => setJustSaved(false), 3000)
        // 新しい配信は、保存した配信として開き直す
        if (!card) onReopen?.(cardId)
        return true
      }
      if (goNext && next && onNext) onNext()
      else onBack()
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      return false
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (!abUpgradedRef.current || !abAuto) return
    abUpgradedRef.current = false
    if (!changed) {
      baseline.current = contentKey()
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBaseVersion((v) => v + 1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abAuto, stash])

  const swapItems = (a: string, b: string) => {
    const i = items.findIndex((x) => x.key === a)
    const j = items.findIndex((x) => x.key === b)
    if (i < 0 || j < 0 || i === j) return
    const next = [...items]
    ;[next[i], next[j]] = [next[j], next[i]]
    setItems(next)
  }

  return { form, setForm, items, setItems, candidates, setCandidates, original, selectedKey, setSelectedKey, goNextRef, stayRef, justSaved, saveMode, setSaveMode, language, template, setTemplate, pushLink, setPushLink, audience, setAudience, templateChannel, sectionTitles, setSectionTitles, sectionCopies, setSectionCopies, heroCandidates, setHeroCandidates, heroId, setHeroId, heroReason, setHeroReason, links, setLinks, saving, changeReason, setChangeReason, error, setError, setAlertNotes, market, poolProducts, poolHeroes, ab, setAb, active, itemsOf, heroOf, textsOf, templateOfV, switchVariant, startAbTest, addVariant, removeVariant, abAiBusy, comparing, setComparing, draftActiveVariant, stopAbTest, changeTarget, asTarget, decision, decideVariant, saveTarget, abAddSimple, abDiff, set, productById, addProduct, dropAt, moveItem, groupByCategory, buildAiCard, applyTemplate, setSectionTitle, setSectionCopy, removeItem, lockedWeeks, submit, saveAndStay, saveAndNext, buildContent, committedSnap, approvedBefore, isDirty, changed, canReview, save, swapItems }
}
