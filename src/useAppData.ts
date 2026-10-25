import { useCallback, useEffect, useState } from 'react'
import { DeliveryCardsService } from './data/deliveryCards'
import type { DeliveryCard } from './models/deliveryCards'
import { ProductsService } from './data/products'
import type { Product } from './models/products'
import { HeroImagesService } from './data/heroImages'
import { ProductPoliciesService } from './data/productPolicies'
import type { HeroImage } from './models/heroImages'
import { DeliveryProductsService } from './data/deliveryProducts'
import { ProductImagesService } from './data/productImages'
import type { ProductImage } from './models/productImages'
import type { DeliveryProduct } from './models/deliveryProducts'
import { CardNotesService, type CardNote } from './data/cardNotes'
import { WeeksService, type WeekRow } from './data/weeks'
import { EventsService, type CardEvent } from './data/events'
import { DeliveryPatternsService } from './data/deliveryPatterns'
import type { DeliveryPattern } from './models/deliveryPatterns'
import { PolicyRulesService } from './data/policyRules'
import { SalesPoliciesService } from './data/salesPolicies'
import { bqOutputLabel, syncBigQuery, type BqSyncResult } from './gcp/bq'
import { clearProductDataCache } from './useProductData'
import type { VariantKey } from './abTest'
import { STATE_CANDIDATE } from './items'
import { withHeroLabels, withProductLabels } from './labels'
import { loadCountryApply } from './countryApply'
import { loadCountrySettings } from './countrySettings'
import { setActivePolicies, setActiveRules, setActiveSales } from './aiSelect'
import { setLimitRules } from './weeklyLimit'
import type { PolicyLite } from './reviewChecks'
import { todayYmd } from './dates'
import { tr } from './i18n'
import { useStableCallback } from './useStableCallback'

/** App が持つ表(読み直すとき、変わった表だけを選べる) */
export type LoadPart = 'cards' | 'cardProducts' | 'notes' | 'weeks' | 'events' | 'images'
export const ALL_PARTS: readonly LoadPart[] = ['cards', 'cardProducts', 'notes', 'weeks', 'events', 'images']

/** 画面の上の帯に出す知らせ(取り込み・見本の作成などの結果) */
export interface Notice {
  intent: 'success' | 'warning' | 'error'
  text: string
}

/**
 * 画面全体が使う表の読み込みと読み直し(App から分けた。整理 第 3 段)。
 * 開いたときに 1 回すべてを読み、保存のあとは、変わった表だけを読み直す(loadParts)。
 * 読み込みの失敗は error に入れる(画面は、読めた表だけで使える)
 */
export function useAppData(opts: {
  /** 配信カードを読んだとき(App が、初めて開いたときの月を決める) */
  onCardsLoaded: (cards: DeliveryCard[]) => void
  /** BigQuery の取り込みの結果を知らせる */
  notify: (n: Notice) => void
}) {
  const onCardsLoaded = useStableCallback(opts.onCardsLoaded)
  const notify = useStableCallback(opts.notify)
  const [cards, setCards] = useState<DeliveryCard[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [heroes, setHeroes] = useState<HeroImage[]>([])
  // メイン画像のライブラリを読み直す(画像を上げた・直したあと。X59)
  const reloadHeroes = useCallback(async () => {
    const res = await HeroImagesService.getAll({ orderBy: ['image_code asc'] })
    if (res.success) setHeroes((res.data ?? []).map(withHeroLabels))
  }, [])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // BigQuery からの取り込み(B2・B4)。設定がない環境では configured: false のまま、何も出さない
  const [bq, setBq] = useState<BqSyncResult | null>(null)
  const [bqBusy, setBqBusy] = useState(false)
  useEffect(() => {
    void loadCountrySettings()
    void loadCountryApply()
  }, [])
  const [patterns, setPatterns] = useState<DeliveryPattern[]>([])
  const loadPatterns = useCallback(async () => {
    const r = await DeliveryPatternsService.getAll()
    if (r.success) setPatterns(r.data ?? [])
  }, [])
  // 開いたときに 1 回読む(型を変えたら、型の画面が読み直しを頼む)
  useEffect(() => {
    void (async () => {
      const r = await DeliveryPatternsService.getAll()
      if (r.success) setPatterns(r.data ?? [])
    })()
  }, [])
  const loadMarketingPolicies = useCallback(async () => {
    const [r, s] = await Promise.all([PolicyRulesService.getAll({ top: 5000 }), SalesPoliciesService.getAll({ top: 5000 })])
    if (r.success) {
      const rules = (r.data ?? []).map((x) => ({
          ruleId: x.rule_id ?? '',
          title: x.title ?? '',
          appliesTo: (x.applies_to ?? '').split(',').filter(Boolean),
          strength: x.strength ?? 'info',
          market: (x.market ?? '').split(',').filter(Boolean),
          channel: (x.channel ?? '').split(',').filter(Boolean),
          periodStart: x.period_start || undefined,
          periodEnd: x.period_end || undefined,
          checkSpec: x.check_spec || undefined,
          body: x.body ?? '',
        }))
      setActiveRules(rules)
      setLimitRules(rules)
    }
    if (s.success)
      setActiveSales(
        (s.data ?? []).map((x) => ({
          weekStart: (x.week_start ?? '').slice(0, 10),
          market: x.market ?? '',
          scope: x.scope ?? 'all',
          target: x.target ?? '',
          stage: x.stage || undefined,
          priority: x.priority ?? undefined,
          promoPeriod: x.promo_period || undefined,
          focus: x.focus || undefined,
          note: x.note || undefined,
        })),
      )
  }, [])

  // 配信カードごとの掲載商品(メールの並び順の商品 ID。候補の行は入れない)。数は、一覧の「商品数」「工程」と、締め切りの警告に使う
  const [cardProducts, setCardProducts] = useState<Map<string, string[]>>(new Map())
  // AB テストの B・C 案の商品(配信 ID → 案 → 商品 ID。X55。制作の依頼の写しに入れる)
  const [variantProducts, setVariantProducts] = useState<Map<string, Partial<Record<VariantKey, string[]>>>>(new Map())
  // 配信ごとに選んだ商品の画像(配信 ID → 商品 ID → 画像の URL。X64。制作のページに渡す)
  const [cardImages, setCardImages] = useState<Map<string, Map<string, string>>>(new Map())
  // モデルの使用期限が入っている商品画像だけ(配信日より前に切れる画像のアラート。期限のない画像は読まない)
  const [expiringImages, setExpiringImages] = useState<ProductImage[]>([])
  // 配信の商品の行のすべて(在庫・方針のアラートが、載っている場所に使う)
  const [productRows, setProductRows] = useState<DeliveryProduct[]>([])
  // アラートの読み直しの合図。結果・実績は、すべてを読み直すときだけ(配信カードの保存では変わらない)。
  // 変更の記録は、配信カードを読み直すとき(日程の変更は、配信の保存でサーバーが残す)
  const [resultsKey, setResultsKey] = useState(0)
  const [changeKey, setChangeKey] = useState(0)
  // 配信カードごとの、質問の未解決の数(一覧の列)
  const [questionCounts, setQuestionCounts] = useState<Map<string, number>>(new Map())
  // 配信カードごとの、未解決の質問の宛先・質問した人と、未完了のタスクの担当(絞り込みの「担当」で、その人がかかわる配信も出すため)
  const [noteParties, setNoteParties] = useState<Map<string, Set<string>>>(new Map())
  // 配信カードごとの、未完了のタスクの数(一覧の列・週の表示)
  const [taskCounts, setTaskCounts] = useState<Map<string, number>>(new Map())
  // 配信カードごとの、未対応のレビューのコメントの数(週の表示・確認の一覧)
  const [commentCounts, setCommentCounts] = useState<Map<string, number>>(new Map())
  // 配信カードごとの、未対応のレビューのコメント(週の資料に、本文を載せる)
  const [openComments, setOpenComments] = useState<Map<string, CardNote[]>>(new Map())
  // 週の計画(週のレビューの状態)
  const [weeks, setWeeks] = useState<WeekRow[]>([])
  // 確定した週の配信を変えたときの理由(週の状態の帯に、確定後の変更として出す)
  const [changeNotes, setChangeNotes] = useState<CardNote[]>([])
  // 承認の履歴(週の操作・配信のステータスの変更。週の状態の帯で、週ごとに出す)
  const [events, setEvents] = useState<CardEvent[]>([])
  // 配信カードごとの、期日を過ぎた未完了のタスクの数(週の表示で、問題として目立たせる)
  const [overdueTasks, setOverdueTasks] = useState<Map<string, number>>(new Map())
  // 商品の販売方針(商品コードごと。週の確認の一覧で、主力の漏れを見るため)
  const [policies, setPolicies] = useState<Map<string, PolicyLite>>(new Map())

  // 表を読み直す。parts で、変わった表だけにできる(保存のたびに、すべての表を読み直さないため)
  const fetchParts = useCallback(async (parts: readonly LoadPart[]) => {
    const has = (p: LoadPart) => parts.includes(p)
    try {
      if (has('cardProducts')) DeliveryProductsService.getAll()
        .then((res) => {
          if (!res.success) return // 数が出ないだけで、画面は使える
          // 在庫・方針のアラートも、同じ行を使う(2 回読まない)
          setProductRows(res.data ?? [])
          const rows = (res.data ?? [])
            .filter((r) => r.delivery_card_id && r.state !== STATE_CANDIDATE && !r.variant) // AB テストの B・C 案の商品は、配信の中身(A 案)に入れない(X55)
            .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
          const byCard = new Map<string, string[]>()
          for (const r of rows) {
            const id = r.delivery_card_id!
            if (r.product_id) byCard.set(id, [...(byCard.get(id) ?? []), r.product_id])
          }
          setCardProducts(byCard)
          const byVariant = new Map<string, Partial<Record<VariantKey, string[]>>>()
          for (const r of (res.data ?? []).filter((x) => x.delivery_card_id && x.variant && x.product_id && x.state !== STATE_CANDIDATE).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))) {
            const m = byVariant.get(r.delivery_card_id!) ?? {}
            const k = r.variant as VariantKey
            m[k] = [...(m[k] ?? []), r.product_id!]
            byVariant.set(r.delivery_card_id!, m)
          }
          setVariantProducts(byVariant)
          // 同じ商品を A と B・C 案で違う画像にしたときは、A 案の画像(写しの商品は 1 つの画像しか持てないため)
          const images = new Map<string, Map<string, string>>()
          for (const r of [...(res.data ?? [])].sort((a, b) => Number(!a.variant) - Number(!b.variant))) {
            if (!r.delivery_card_id || !r.product_id || !r.image_url || r.state === STATE_CANDIDATE) continue
            const m = images.get(r.delivery_card_id) ?? new Map<string, string>()
            m.set(r.product_id, r.image_url)
            images.set(r.delivery_card_id, m)
          }
          setCardImages(images)
        })
        .catch(() => undefined)
      if (has('images')) ProductImagesService.getAll({ filter: 'model_usable_until ne null' })
        .then((res) => res.success && setExpiringImages(res.data ?? []))
        .catch(() => undefined)
      if (has('notes')) CardNotesService.getAll()
        .then((res) => {
          if (!res.success) return
          const counts = new Map<string, number>()
          const tasks = new Map<string, number>()
          const overdue = new Map<string, number>()
          const comments = new Map<string, number>()
          const commentNotes = new Map<string, CardNote[]>()
          const parties = new Map<string, Set<string>>()
          const addParty = (id: string, name?: string) => {
            if (name?.trim()) parties.set(id, (parties.get(id) ?? new Set()).add(name.trim()))
          }
          const today = todayYmd()
          setChangeNotes((res.data ?? []).filter((n) => n.kind === 'change'))
          for (const n of res.data ?? []) {
            const id = n.delivery_card_id
            if (!id || n.resolved) continue
            // 変更の理由は記録、コメントへの返信はスレッドの一部なので、質問・タスクの数には入れない
            if (n.kind === 'change' || n.kind === 'reply') continue
            if (n.kind === 'comment') {
              // やり取り(2026-10-17 に質問と 1 つにした)は宛先を持てるので、「担当」の絞り込みの候補に足す
              addParty(id, n.assignee)
              comments.set(id, (comments.get(id) ?? 0) + 1)
              commentNotes.set(id, [...(commentNotes.get(id) ?? []), n])
              continue
            }
            if (n.kind === 'task') {
              addParty(id, n.assignee)
              tasks.set(id, (tasks.get(id) ?? 0) + 1)
              if (n.due && n.due.slice(0, 10) < today) overdue.set(id, (overdue.get(id) ?? 0) + 1)
            }
            else {
              // 質問: 誰からでも、誰にでも(宛先は assignee の列)。週の資料では、コメントと同じ「未解決のやり取り」に並べる
              addParty(id, n.author)
              addParty(id, n.assignee)
              counts.set(id, (counts.get(id) ?? 0) + 1)
              commentNotes.set(id, [...(commentNotes.get(id) ?? []), n])
            }
          }
          setNoteParties(parties)
          setQuestionCounts(counts)
          setTaskCounts(tasks)
          setOverdueTasks(overdue)
          setCommentCounts(comments)
          setOpenComments(commentNotes)
        })
        .catch(() => undefined)
      if (has('weeks')) WeeksService.getAll()
        .then((res) => {
          if (res.success) setWeeks(res.data ?? [])
        })
        .catch(() => undefined)
      if (has('events')) EventsService.getAll({ orderBy: ['created_on desc'] })
        .then((res) => {
          if (res.success) setEvents(res.data ?? [])
        })
        .catch(() => undefined)
      if (!has('cards')) return
      const res = await DeliveryCardsService.getAll({ orderBy: ['scheduled_at asc'] })
      if (!res.success) throw new Error(res.error?.message ?? tr('配信カードの取得に失敗しました', 'Failed to load delivery cards'))
      const data = res.data ?? []
      setCards(data)
      setError(null)
      onCardsLoaded(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [onCardsLoaded])
  const loadParts = useCallback(
    async (parts: readonly LoadPart[]) => {
      if (parts.includes('cards')) setChangeKey((k) => k + 1)
      await fetchParts(parts)
    },
    [fetchParts],
  )
  // 配信カードの保存など、結果・実績は変わらない操作のあと(App が持つ表は、すべて読み直す)
  const reloadCards = useCallback(() => loadParts(ALL_PARTS), [loadParts])
  // すべてを読み直す(結果の取り込み・⚙ の見本など、何が変わったか分からない操作のあと)
  const load = useCallback(async () => {
    setResultsKey((k) => k + 1)
    await loadParts(ALL_PARTS)
  }, [loadParts])

  const loadProducts = useCallback(
    () =>
      ProductsService.getAll({ orderBy: ['product_code asc'] })
        .then((res) => {
          if (res.success) setProducts((res.data ?? []).map(withProductLabels))
          else setError(res.error?.message ?? tr('商品の取得に失敗しました', 'Failed to load products'))
          return res.success
        })
        .catch((e: unknown) => {
          setError(e instanceof Error ? e.message : String(e))
          return false
        }),
    [],
  )

  // BigQuery の変わった出力を取り込み、取り込めたら商品(在庫・売上の集計)を読み直す。
  // force は ⚙ のボタン(変わっていなくても、すべて読み直す)。開いたときは、変わった出力だけ(サーバーが判定する)
  const runBqSync = useCallback(
    async (force: boolean) => {
      setBqBusy(true)
      const { result, error: err } = await syncBigQuery(force)
      setBqBusy(false)
      setBq(result)
      if (result.imported.length) {
        clearProductDataCache()
        await loadProducts()
      }
      const names = (list: { name: string }[]) => list.map((x) => bqOutputLabel(x.name)).join(tr('・', ', '))
      if (err) notify({ intent: 'error', text: err })
      else if (result.failed.length)
        notify({
          intent: 'warning',
          text:
            tr(`BigQuery から取り込めなかったデータがあります(前のデータのまま使います): `, `Some BigQuery data was not imported (the previous data is kept): `) +
            result.failed.map((f) => `${bqOutputLabel(f.name)} — ${f.message}`).join(' / '),
        })
      // 開いたときの取り込みは、うまくいったら知らせない(在庫が変わるたびに出て、うるさいため)。ボタンのときだけ結果を出す
      else if (force && result.imported.length) notify({ intent: 'success', text: tr(`BigQuery から取り込みました: ${names(result.imported)}`, `Imported from BigQuery: ${names(result.imported)}`) })
      else if (force && result.configured) notify({ intent: 'success', text: tr('BigQuery から読み直しました(取り込むデータはありませんでした)', 'Checked BigQuery (nothing to import)') })
    },
    [loadProducts, notify],
  )

  useEffect(() => {
    // 開いたときは、アラートも自分で読むので、読み直しの合図は出さない(2 回読まないため)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchParts(ALL_PARTS)
    // 商品を読めたら(DB が使えるとわかってから)、BigQuery の更新を確かめる
    void loadProducts().then((ok) => {
      if (ok) void runBqSync(false)
    })
    void loadMarketingPolicies().catch(() => undefined) // 読めなくても、決まりなしで画面は使える
    ProductPoliciesService.getAll({ select: ['product_code', 'stage', 'promo_period', 'policy', 'promo_plan'] })
      .then((res) => {
        if (!res.success) return // 主力の漏れが出ない・AI が方針を使わないだけで、画面は使える
        const rows = (res.data ?? []).filter((r) => r.product_code)
        setPolicies(new Map(rows.map((r) => [r.product_code!, { stage: r.stage, promoPeriod: r.promo_period }])))
        // AI の商品の選定にも、MD 方針を渡す(バックログ M2)
        setActivePolicies(new Map(rows.map((r) => [r.product_code!, { stage: r.stage, policy: r.policy, promoPlan: r.promo_plan, promoPeriod: r.promo_period }])))
      })
      .catch(() => undefined)
    HeroImagesService.getAll({ orderBy: ['image_code asc'] })
      .then((res) => {
        if (res.success) setHeroes((res.data ?? []).map(withHeroLabels))
        else setError(res.error?.message ?? tr('メイン画像の取得に失敗しました', 'Failed to load hero images'))
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [fetchParts, loadProducts, runBqSync, loadMarketingPolicies])

  return {
    cards, products, heroes, loading, error, setError, bq, bqBusy, patterns, policies,
    cardProducts, variantProducts, cardImages, expiringImages, productRows, resultsKey, changeKey,
    questionCounts, noteParties, taskCounts, commentCounts, openComments, overdueTasks, changeNotes,
    weeks, setWeeks, events,
    reloadHeroes, loadPatterns, loadMarketingPolicies, loadParts, reloadCards, load, loadProducts, runBqSync,
  }
}
