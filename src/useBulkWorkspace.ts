// まとめて作る作業画面(BulkWorkspace)の、状態と操作。
// 週の表示の上で作る形(useWeekFrames)は、表示の場所を作業の場所に使うので、手順が分かりにくかった(利用者・チームの指摘、2026-10-19)。
// そこで、作業は全画面の作業画面で完結させ、① 計画する(週・チャネル・作る日と、配信名・種類。国はヘッダーの国) → ② 作って決める、の順に進める。
// ① と AI の案は画面の中だけで持つ。② で人が 1 本ずつ「保存」したもの(または配信カードで開いて保存したもの)だけを、1 本ずつ新規作成した下書きと同じ「未起案」で保存し、
// 保存しなかったものは破棄する(「AI 下書き・未確認」のような、途中の状態を増やさないため。2026-10-19 利用者の指摘)。
// AI で作らない道もある(① のあと、中身を入れずに保存する。1 本ずつ新規作成して、中身を入れずに保存したのと同じ)
import { useEffect, useMemo, useRef, useState } from 'react'
import type { DeliveryCard, DeliveryCardFields } from './models/deliveryCards'
import type { Product } from './models/products'
import type { HeroImage } from './models/heroImages'
import type { WeekRow } from './data/weeks'
import type { AutoDraftResult } from './autoDraft'
import { suggestNames } from './aiDraft'
import { channelOptions, departmentOptions, CHANNEL_EMAIL } from './status'
import { themeTypeLabel, type ThemeType } from './themeTypes'
import { sundayOf } from './weekLock'
import { tr } from './i18n'
import { DeliveryCardsService } from './data/deliveryCards'
import { limitText, weeklyLimit, weeklyLimitFor } from './weeklyLimit'
import type { CardAlert } from './cardAlerts'
import { SOURCE_AI, type Candidate, type Item } from './items'
import { BULK_PARALLEL, BULK_TIME, createDraft, createPlainDraft, generateFor, overusedInWeek, previewCard, productIdsOf, weekDays, type DraftBase } from './bulkDraft'
import type { Progress } from './useWeekFrames'
import type { DeliveryPattern } from './models/deliveryPatterns'
import { dayKeyOf } from './weekLock'

interface Ctx {
  /** すべての配信(取りやめを除く) */
  cards: DeliveryCard[]
  cardProducts: Map<string, string[]>
  products: Product[]
  heroes: HeroImage[]
  weeks: WeekRow[]
  /** 国ごとの配信の型(ST9)。選んだ国・チャネルの型があれば、型どおりに行を作る */
  patterns: DeliveryPattern[]
  /** 国・チャネル・種別の既定(画面の絞り込み) */
  defaults: { country?: string; channel?: string; department?: string }
  /** 保存したら、配信を読み直す */
  onChanged: () => Promise<void>
}

/** 1 = 計画する(週・チャネル・作る日と、配信名・種類)、2 = 作って決める(AI で作った案を並べ、1 本ずつ保存・破棄) */
export type Step = 1 | 2

/** ① で入れる、1 日分の行(まだ保存しない) */
export interface Row {
  name: string
  themeType: string
  /** AI の配信名の案の理由(案を入れたときだけ) */
  nameReason?: string
  /** 種類も AI の案で入れたか(人が選び直すと消える) */
  typeByAi?: boolean
}

/** 配信カードで開く、まだ保存していない案(配信カードは、新規作成として中身まで入れて開く) */
export interface BulkDraft {
  card: DeliveryCard
  items: Item[]
  candidates: Candidate[]
}

/** ③ で確かめる 1 本。保存する前は、仮の id の配信カード(previewCard) */
export interface ReviewItem {
  day: string
  card: DeliveryCard
  productIds: string[]
  state: 'unsaved' | 'saved' | 'discarded'
}

const mostCommon = (vs: string[]) => {
  const n = new Map<string, number>()
  for (const v of vs.filter(Boolean)) n.set(v, (n.get(v) ?? 0) + 1)
  return [...n].sort((a, b) => b[1] - a[1])[0]?.[0]
}
const label = (opts: { value: string; label: string }[], v?: string | null) => opts.find((o) => String(o.value) === String(v ?? ''))?.label ?? ''
const draftId = (day: string) => `draft:${day}`

/**
 * ① の 1 行。型(ST9)がなければ 1 日 = 1 行(鍵は日付)、あれば型の 1 本 = 1 行(鍵は「日付T時刻@型の id」)。
 * 同じ日・チャネルに 2 本以上の型がありうるので、鍵に時刻と型を入れる(利用者 2026-10-22 ③)
 */
export interface Line {
  key: string
  /** YYYY-MM-DD */
  day: string
  /** free = 作れる、used = 同じ国・チャネル(型なら同じ時刻)の配信がもうある、past = 過ぎた日、locked = 確定した週、nopattern = この曜日の型がない */
  state: 'free' | 'used' | 'past' | 'locked' | 'nopattern'
  same: { id: string; name: string }[]
  /** 型の時刻(HH:MM) */
  time?: string
  pattern?: DeliveryPattern
}

/** 鍵の日付(YYYY-MM-DD)と、時刻(型の行だけ。HH:MM) */
export const dayOfKey = (key: string) => key.slice(0, 10)
export const timeOfKey = (key: string) => (key[10] === 'T' ? key.slice(11, 16) : undefined)
const hhmm = (iso: string) => {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function useBulkWorkspace({ cards, cardProducts, products, heroes, weeks, patterns, defaults, onChanged }: Ctx) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>(1)
  const [weekStart, setWeekStart] = useState(() => sundayOf(new Date()))
  const [country, setCountryRaw] = useState('')
  const [channel, setChannelRaw] = useState(CHANNEL_EMAIL)
  // ① で選んだ日(YYYY-MM-DD)と、行(日 → 配信名・種類)
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [rows, setRows] = useState<Map<string, Row>>(new Map())
  const [naming, setNaming] = useState<Set<string>>(new Set())
  // ② の進み具合・失敗・できた中身(日 → AI の結果。まだ保存しない)
  const [progress, setProgress] = useState<Map<string, Progress>>(new Map())
  const [failed, setFailed] = useState<Map<string, string>>(new Map())
  const [results, setResults] = useState<Map<string, AutoDraftResult>>(new Map())
  // ③ で保存した配信(日 → 配信カードの id)と、破棄した日
  const [savedIds, setSavedIds] = useState<Map<string, string>>(new Map())
  const [discarded, setDiscarded] = useState<Set<string>>(new Set())
  const [savingDay, setSavingDay] = useState<string | null>(null)
  // 保存していない案があるまま閉じようとしたときの、閉じるダイアログ
  const [closeAsk, setCloseAsk] = useState(false)
  // 中身を作らずに保存した配信(日 → 配信カードの id)。1 本ずつ新規作成して、中身を入れずに保存したのと同じ
  const [plain, setPlain] = useState<Map<string, string>>(new Map())
  const [savingPlain, setSavingPlain] = useState(false)
  // ③ で見ている日
  const [checkDay, setCheckDay] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const stopRef = useRef(false)
  const running = progress.size > 0

  // 画面を閉じたら、作っている途中の AI は止める
  useEffect(
    () => () => {
      stopRef.current = true
    },
    [],
  )

  const days = useMemo(() => weekDays(weekStart, cards, weeks, channel, country), [weekStart, cards, weeks, channel, country])
  /** 選んだ国・チャネルの型(曜日・時刻・並び順の順) */
  const pats = useMemo(
    () =>
      patterns
        .filter((p) => (p.country ?? '') === country && (p.channel || CHANNEL_EMAIL) === channel && p.weekday !== undefined && p.weekday !== null)
        .sort((a, b) => (a.time ?? '').localeCompare(b.time ?? '') || (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [patterns, country, channel],
  )
  const byPattern = pats.length > 0
  const lines = useMemo(() => linesOf(days, pats, cards, channel, country), [days, pats, cards, channel, country])
  // 中身を作り始めたとき(または保存を始めたとき)の作る日。保存すると、その日は「配信あり」に変わるので、① の判定から毎回求めると、行が消えてしまう
  const [plan, setPlan] = useState<string[] | null>(null)
  /** 作る日(① では、選んだ作れる日。作り始めたら、その時の日。日付の順) */
  const targets = plan ?? lines.filter((d) => d.state === 'free' && chosen.has(d.key)).map((d) => d.key)
  /** 鍵の型(型の行だけ。型を消しても、作り始めた行は鍵から時刻が分かる) */
  const patternOf = (key: string) => {
    const id = key.split('@')[1]
    return id ? patterns.find((p) => p.id === id) : undefined
  }
  // 種類は、型の行なら型の種類で始める(既定値。人が変えられる)
  const rowOf = (day: string): Row => rows.get(day) ?? { name: '', themeType: patternOf(day)?.theme_type ?? '' }
  /** AI で中身を作れる行(配信名と種類。方向を決めてから作ると、作り直しが減る) */
  const ready = (day: string) => !!rowOf(day).name.trim() && !!rowOf(day).themeType
  const allReady = targets.length > 0 && targets.every(ready)
  /** 中身を作らずに保存できるか(配信名は空を許さない列なので、配信名だけは要る。種類は、あとでもよい) */
  const plainReady = targets.length > 0 && targets.every((d) => !!rowOf(d).name.trim())
  // ② の対象(まだ中身がなく、保存も破棄もしていない日)
  const pending = targets.filter((d) => !results.has(d) && !savedIds.has(d) && !discarded.has(d))
  /** 作り始めたら、① には戻らない(作った中身と、行の対応がずれるため) */
  const started = plan !== null

  // 国・チャネル・週を変えたら、作れる日を選び直す(既定は、作れる日すべて)
  const pickFree = (ws: Date, ch: string, co: string) => {
    const ps = patterns.filter((p) => (p.country ?? '') === co && (p.channel || CHANNEL_EMAIL) === ch && p.weekday !== undefined && p.weekday !== null)
    setChosen(new Set(linesOf(weekDays(ws, cards, weeks, ch, co), ps, cards, ch, co).filter((d) => d.state === 'free').map((d) => d.key)))
  }

  /** 作業画面を開く。既定は、見ている週と、画面の絞り込み。国の絞り込みがなければ、いちばん多く配信している国(国が空だと、日本とアメリカの商品が混ざるため) */
  function openFor(viewWeek: Date) {
    const ws = sundayOf(viewWeek)
    const co = defaults.country || mostCommon(cards.map((c) => String(c.country ?? ''))) || ''
    const ch = defaults.channel || CHANNEL_EMAIL
    stopRef.current = false
    setWeekStart(ws)
    setCountryRaw(co)
    setChannelRaw(ch)
    pickFree(ws, ch, co)
    setRows(new Map())
    setNaming(new Set())
    setProgress(new Map())
    setFailed(new Map())
    setResults(new Map())
    setSavedIds(new Map())
    setDiscarded(new Set())
    setPlain(new Map())
    setCheckDay(null)
    setCloseAsk(false)
    setError(null)
    setPlan(null)
    setStep(1)
    setOpen(true)
  }
  /** 手順を移る。① には、まだ作り始めていないときだけ戻れる(作る日を選び直せる) */
  function goStep(k: Step) {
    if (k === 1 && started) return
    setStep(k)
  }

  /** 行を、AI に渡す配信の形に(まだ保存していない) */
  const baseOf = (day: string): DraftBase => ({
    name: rowOf(day).name.trim(),
    // 型の行は型の時刻、それ以外は既定の時刻
    scheduled_at: new Date(`${dayOfKey(day)}T${timeOfKey(day) ?? BULK_TIME}`).toISOString(),
    // 型で決めたテンプレート(作るときの最新の版。中身を作るときは AI に選ばせない)
    layout_key: patternOf(day)?.layout_key || undefined,
    country: (country || undefined) as DeliveryCardFields['country'],
    channel: (channel || undefined) as DeliveryCardFields['channel'],
    department: (defaults.department || undefined) as DeliveryCardFields['department'],
    theme_type: rowOf(day).themeType || undefined,
  })

  // ---- ③ で確かめる 1 本ずつ(日付の順)
  const reviewItems: ReviewItem[] = targets
    .filter((d) => results.has(d))
    .map((day) => {
      const r = results.get(day)!
      const id = savedIds.get(day)
      const real = id ? cards.find((c) => c.id === id) : undefined
      return {
        day,
        card: real ?? previewCard(id ?? draftId(day), baseOf(day), r, products),
        productIds: (id && cardProducts.get(id)) || productIdsOf(r),
        state: id ? 'saved' : discarded.has(day) ? 'discarded' : 'unsaved',
      }
    })
  const unsavedCount = reviewItems.filter((x) => x.state === 'unsaved').length
  const savedCount = reviewItems.filter((x) => x.state === 'saved').length
  /** 比べるときの、すべての配信と商品(保存していない案も入れる。前後の配信と見比べるため) */
  const compareCards = [...cards, ...reviewItems.filter((x) => x.state === 'unsaved').map((x) => x.card)]
  const compareProducts = new Map(cardProducts)
  for (const x of reviewItems) if (x.state === 'unsaved') compareProducts.set(x.card.id, x.productIds)

  // ---- 週の中での重なり(週の確認の一覧 W4 と同じ見方を、保存する前の案にも当てる)
  const weekEnd = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7)
  const inThisWeek = (iso?: string) => !!iso && new Date(iso) >= weekStart && new Date(iso) < weekEnd
  /** この週の配信と、まだ保存していない案(破棄したものは除く) */
  const weekCards = compareCards.filter((c) => inThisWeek(c.scheduled_at))
  /** 商品ごとの、この週に載せる配信の数(もうある配信・保存した案・保存していない案のすべて) */
  const weekUse = new Map<string, number>()
  for (const c of weekCards) for (const pid of new Set(compareProducts.get(c.id) ?? [])) weekUse.set(pid, (weekUse.get(pid) ?? 0) + 1)
  const norm = (s?: string | null) => (s ?? '').trim().replace(/\s+/g, ' ')
  /** 案ごとの、週の中での気になる点(上限を超えた商品・同じテーマ・同じメイン画像の配信) */
  function issuesOf(x: ReviewItem): { over: string[]; sameTheme: string[]; sameHero: string[] } {
    if (x.state === 'discarded') return { over: [], sameTheme: [], sameHero: [] }
    const others = weekCards.filter((c) => c.id !== x.card.id)
    return {
      over: [...new Set(x.productIds)].filter((pid) => (weekUse.get(pid) ?? 0) > weeklyLimit(x.card)),
      sameTheme: norm(x.card.theme) ? others.filter((c) => norm(c.theme) === norm(x.card.theme)).map((c) => c.name) : [],
      sameHero: x.card.hero_image_id ? others.filter((c) => c.hero_image_id === x.card.hero_image_id).map((c) => c.name) : [],
    }
  }

  /**
   * 保存していない案を配信カードで開くときの、週の上限超えのアラート(配信カードの帯・商品の札に出し、
   * 「このアラートへの対応」から差し替える。直す場所を配信カードにそろえる)
   */
  function draftAlerts(day: string): CardAlert[] {
    const x = reviewItems.find((i) => i.day === day)
    if (!x) return []
    return issuesOf(x).over.map((pid) => ({
      kind: 'overLimit' as const,
      productId: pid,
      label: products.find((p) => p.id === pid)?.name ?? '',
      detail: tr(`この週に ${weekUse.get(pid) ?? 0} 本の配信に載っている(${limitText(weeklyLimitFor(x.card))})`, `In ${weekUse.get(pid) ?? 0} deliveries this week (${limitText(weeklyLimitFor(x.card))})`),
    }))
  }

  /** 閉じる。まだ保存していない入力・案があれば確かめる(保存したものは、消えない)。閉じたら true */
  function close(): boolean {
    if (running || savingPlain || savingDay) return false
    const lostRows = targets.some((d) => !results.has(d) && !savedIds.has(d) && !plain.has(d) && !discarded.has(d) && (rowOf(d).name.trim() || rowOf(d).themeType))
    // 保存していない案があるときは、閉じるダイアログ(まとめて保存して閉じる / 破棄して閉じる)で決めてもらう
    if (unsavedCount > 0) {
      setCloseAsk(true)
      return false
    }
    if (lostRows && !window.confirm(tr('まだ保存していない配信名・種類は、消えます。閉じますか?', 'Names and types not saved yet will be lost. Close anyway?'))) return false
    setOpen(false)
    return true
  }

  const setCountry = (v: string) => {
    setCountryRaw(v)
    pickFree(weekStart, channel, v)
  }
  const setChannel = (v: string) => {
    setChannelRaw(v)
    pickFree(weekStart, v, country)
  }
  const moveWeek = (delta: number) => {
    const ws = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + delta * 7)
    setWeekStart(ws)
    pickFree(ws, channel, country)
  }
  const toggleDay = (key: string, on: boolean) =>
    setChosen((s) => {
      const n = new Set(s)
      if (on) n.add(key)
      else n.delete(key)
      return n
    })
  const setRow = (day: string, patch: Partial<Row>) => setRows((m) => new Map(m).set(day, { ...rowOf(day), ...patch }))

  /**
   * 配信名の案を出して、行に入れる(押すこと自体を、案の採用とみなす。あとで書き換えられる)。
   * まとめて出すときは、配信名か種類が空の行だけ。keepNames のときは、人が入れた名前を上書きしない(種類だけ埋める)
   */
  async function suggest(list: string[], keepNames = false) {
    if (list.length === 0) return
    setError(null)
    setNaming((s) => new Set([...s, ...list]))
    try {
      const others = cards
        .filter((c) => c.name?.trim() && c.scheduled_at && Math.abs(new Date(c.scheduled_at).getTime() - weekStart.getTime()) < 21 * 86400000)
        .map((c) => ({ name: c.name, theme: c.theme, scheduledAt: c.scheduled_at }))
      const names = await suggestNames({
        slots: list.map((day) => {
          const b = baseOf(day)
          return {
            id: day,
            scheduledAt: b.scheduled_at ?? '',
            country,
            channel: label(channelOptions, channel),
            department: label(departmentOptions, defaults.department),
            themeType: b.theme_type ? themeTypeLabel(b.theme_type as ThemeType) : undefined,
            // 人が入れた名前は、種類を選ぶ手がかりにする(keepNames のときは、名前はそのまま残る)
            ...(keepNames && b.name ? { name: b.name } : {}),
          }
        }),
        others,
      })
      setRows((m) => {
        const n = new Map(m)
        for (const x of names) {
          const cur = n.get(x.id) ?? { name: '', themeType: '' }
          // 種類は、人がまだ選んでいない行だけ、AI の案で埋める(人が選んだ種類は変えない)
          const fill = !cur.themeType && !!x.themeType
          n.set(x.id, { ...cur, ...(keepNames && cur.name.trim() ? {} : { name: x.name, nameReason: x.reason }), ...(fill ? { themeType: x.themeType, typeByAi: true } : {}) })
        }
        return n
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setNaming((s) => new Set([...s].filter((d) => !list.includes(d))))
    }
  }

  /**
   * 中身を作らずに保存する。1 本ずつ新規作成して、中身を入れずに保存したのと同じ「未起案」の下書きにする
   * (中身は、あとで配信カードで作る。週の表示では、ふつうの配信として出る)
   */
  async function savePlainAll() {
    if (!plainReady) return
    const list = [...targets]
    setPlan(list)
    setError(null)
    setSavingPlain(true)
    try {
      for (const day of list) {
        if (plain.has(day)) continue
        const card = await createPlainDraft(baseOf(day))
        setPlain((m) => new Map(m).set(day, card.id))
      }
      await onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      await onChanged()
    } finally {
      setSavingPlain(false)
    }
  }

  /** ② 中身を作る(人が押す)。できた中身は、画面の中だけに持つ(保存は ③ で 1 本ずつ) */
  async function generate(list: string[]) {
    if (list.length === 0) return
    stopRef.current = false
    setError(null)
    setPlan((p) => p ?? targets)
    setStep(2)
    setFailed((m) => new Map([...m].filter(([d]) => !list.includes(d))))
    setProgress((m) => new Map([...m, ...list.map((d) => [d, { step: tr('順番を待っています', 'Waiting'), done: 0, total: 7 }] as const)]))
    const queue = [...list]
    // 並行して作ると、同時に作っている配信のテーマが見えず、同じテーマになりやすい。
    // そこで、次の配信は、前の配信のテーマが決まってから始める(テーマのあとの工程は、並行して進む。useWeekFrames と同じ)。
    // 先に作った案(まだ保存していない)のテーマ・商品も避ける
    const earlier = [...results.entries()].filter(([d]) => !discarded.has(d))
    const themes: string[] = earlier.map(([, r]) => r.theme ?? '').filter(Boolean)
    const done: { id: string; scheduled_at?: string; products: string[] }[] = earlier.map(([d, r]) => ({ id: draftId(d), scheduled_at: baseOf(d).scheduled_at, products: productIdsOf(r) }))
    let themeGate: Promise<void> = Promise.resolve()
    const worker = async () => {
      for (;;) {
        let gate: Promise<void>
        do {
          gate = themeGate
          await gate
        } while (gate !== themeGate)
        const day = queue.shift()
        if (!day || stopRef.current) break
        let release = () => undefined as void
        themeGate = new Promise<void>((r) => (release = r))
        const base = baseOf(day)
        const cp = new Map(cardProducts)
        for (const m of done) cp.set(m.id, m.products)
        try {
          const res = await generateFor(
            base,
            {
              products,
              heroes,
              otherThemes: [...cards.map((x) => x.theme ?? ''), ...themes].filter(Boolean),
              avoidProductIds: overusedInWeek(base.scheduled_at, [...cards, ...done], cp, base),
              onTheme: (theme) => {
                if (theme) themes.push(theme)
                release()
              },
            },
            (s, n, total) => setProgress((m) => new Map(m).set(day, { step: s, done: n, total })),
            () => stopRef.current,
          )
          if (res.cancelled) {
            // 止めたときは、何も残さない(行は残るので、もう一度作れる)
          } else if (!res.theme) {
            setFailed((m) => new Map(m).set(day, res.errors.join(' / ') || tr('テーマを作れませんでした', 'Could not come up with a theme')))
          } else {
            // 一部の工程が失敗しても、できたところまでを案にする(足りないところは、保存してから配信カードで直す)
            done.push({ id: draftId(day), scheduled_at: base.scheduled_at, products: productIdsOf(res) })
            setResults((m) => new Map(m).set(day, res))
            if (res.errors.length > 0) setError(tr(`「${base.name}」は、一部の工程で失敗しました: ${res.errors.join(' / ')}`, `“${base.name}”: some steps failed: ${res.errors.join(' / ')}`))
          }
        } catch (e) {
          setFailed((m) => new Map(m).set(day, e instanceof Error ? e.message : String(e)))
        } finally {
          release()
          setProgress((m) => {
            const n = new Map(m)
            n.delete(day)
            return n
          })
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(BULK_PARALLEL, list.length) }, worker))
    setProgress(new Map())
  }
  const stop = () => {
    stopRef.current = true
  }

  /** 次に確かめる、まだ保存も破棄もしていない案(いまの日の次から、なければ最初から) */
  const nextUnsaved = (after: string) => {
    const open = reviewItems.filter((x) => x.state === 'unsaved' && x.day !== after)
    return (open.find((x) => x.day > after) ?? open[0])?.day ?? null
  }

  /**
   * ③ 保存: この案を、1 本ずつ新規作成した下書きと同じ「未起案」で保存する。保存したら、次の案に進む。
   * open が true なら、保存したあと配信カードで開く(直すため)
   */
  async function save(day: string): Promise<string | null> {
    const r = results.get(day)
    if (!r || savedIds.has(day)) return savedIds.get(day) ?? null
    setError(null)
    setSavingDay(day)
    try {
      const card = await createDraft(baseOf(day), r, products)
      setSavedIds((m) => new Map(m).set(day, card.id))
      setDiscarded((s) => {
        const n = new Set(s)
        n.delete(day)
        return n
      })
      await onChanged()
      setCheckDay(nextUnsaved(day) ?? day)
      return card.id
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return null
    } finally {
      setSavingDay(null)
    }
  }
  /** ③ まとめて保存: まだ保存も破棄もしていない案を、すべて保存する(途中で切り上げるとき) */
  async function saveAll(): Promise<boolean> {
    const list = reviewItems.filter((x) => x.state === 'unsaved').map((x) => x.day)
    setError(null)
    for (const day of list) {
      const r = results.get(day)
      if (!r) continue
      setSavingDay(day)
      try {
        const card = await createDraft(baseOf(day), r, products)
        setSavedIds((m) => new Map(m).set(day, card.id))
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        setSavingDay(null)
        await onChanged()
        return false
      }
    }
    setSavingDay(null)
    await onChanged()
    return true
  }

  /**
   * ③ 破棄: この案は保存しない(破棄を取り消して、保存し直すこともできる)。
   * 保存したあとの案は、保存した配信カードを消す(作業画面で作ったばかりの下書きなので、取りやめではなく削除)
   */
  async function discard(day: string) {
    const id = savedIds.get(day)
    if (id) {
      if (!window.confirm(tr('保存したこの配信を消して、破棄します。よろしいですか?', 'Delete this saved delivery and discard it?'))) return
      setError(null)
      setSavingDay(day)
      try {
        await DeliveryCardsService.delete(id)
        setSavedIds((m) => {
          const n = new Map(m)
          n.delete(day)
          return n
        })
        await onChanged()
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        return
      } finally {
        setSavingDay(null)
      }
    }
    setDiscarded((s) => new Set(s).add(day))
    setCheckDay(nextUnsaved(day) ?? day)
  }

  /** 配信カードで開いて直すための、保存していない案(配信カードは、この中身を新規作成として開く。保存したら markSaved) */
  function draftFor(day: string): BulkDraft | null {
    const r = results.get(day)
    if (!r) return null
    const items: Item[] = r.sections.flatMap((s) => s.selected).map((x, i) => ({ key: `ai-${day}-${i}`, productId: x.productId, reason: x.reason, source: SOURCE_AI }))
    const candidates: Candidate[] = r.sections.flatMap((s, si) => s.candidates.map((x, i) => ({ key: `ai-${day}-c${si}-${i}`, productId: x.productId, reason: x.reason, source: SOURCE_AI, section: si })))
    return { card: previewCard(draftId(day), baseOf(day), r, products), items, candidates }
  }
  /** 配信カードで保存された(その案は、保存済みにする) */
  function markSaved(day: string, id: string) {
    setSavedIds((m) => new Map(m).set(day, id))
    setDiscarded((s) => {
      const n = new Set(s)
      n.delete(day)
      return n
    })
    setCheckDay(nextUnsaved(day) ?? day)
  }
  /** 確かめずに閉じる(閉じるダイアログで、決めたあと) */
  const closeNow = () => setOpen(false)
  function undoDiscard(day: string) {
    setDiscarded((s) => {
      const n = new Set(s)
      n.delete(day)
      return n
    })
  }

  /** 中身を作らずに保存した配信(日付の順) */
  const plainCards = targets.map((d) => plain.get(d)).filter((id): id is string => !!id).map((id) => cards.find((c) => c.id === id)).filter((c): c is DeliveryCard => !!c)

  return {
    open,
    openFor,
    close,
    step,
    setStep: goStep,
    weekStart,
    moveWeek,
    country,
    // 国はヘッダーで選んだ国(X33)。ヘッダーが「すべての国」のときだけ、作業画面で選ぶ
    countryFixed: !!defaults.country,
    setCountry,
    channel,
    setChannel,
    days,
    /** ① の行(型があれば型の 1 本ずつ、なければ 1 日ずつ) */
    lines,
    /** 選んだ国・チャネルに型があるか */
    byPattern,
    chosen,
    toggleDay,
    targets,
    rowOf,
    setRow,
    ready,
    allReady,
    naming,
    suggest,
    pending,
    progress,
    failed,
    results,
    running,
    generate,
    stop,
    started,
    reviewItems,
    unsavedCount,
    savedCount,
    savedIds,
    compareCards,
    compareProducts,
    weekUse,
    issuesOf,
    draftAlerts,
    savingDay,
    save,
    discard,
    saveAll,
    draftFor,
    markSaved,
    closeNow,
    closeAsk,
    setCloseAsk,
    undoDiscard,
    plainReady,
    savePlainAll,
    savingPlain,
    plainCards,
    checkDay,
    setCheckDay,
    error,
    clearError: () => setError(null),
  }
}

export type BulkWorkspaceState = ReturnType<typeof useBulkWorkspace>

/**
 * ① の行を作る。型がなければ 1 日 = 1 行。型があれば、その週の日ごとに、曜日の合う型の 1 本 = 1 行
 * (すでにその日・チャネル・時刻の配信があれば、その型の行は作れない。利用者 2026-10-22 ③)
 */
function linesOf(
  days: ReturnType<typeof weekDays>,
  pats: DeliveryPattern[],
  cards: { id: string; name: string; scheduled_at?: string; channel?: string; country?: string }[],
  channel: string,
  country: string,
): Line[] {
  if (pats.length === 0) return days.map((d) => ({ key: d.key, day: d.key, state: d.state, same: d.same }))
  const same = (c: { channel?: string; country?: string }) => (c.channel ?? CHANNEL_EMAIL) === channel && (!country || !c.country || c.country === country)
  const out: Line[] = []
  for (const d of days) {
    const ps = pats.filter((p) => p.weekday === d.date.getDay())
    if (ps.length === 0) {
      out.push({ key: d.key, day: d.key, state: d.state === 'past' || d.state === 'locked' ? d.state : 'nopattern', same: d.same })
      continue
    }
    for (const p of ps) {
      const time = p.time || BULK_TIME
      const at = cards.filter((c) => same(c) && c.scheduled_at && dayKeyOf(new Date(c.scheduled_at)) === d.key && hhmm(c.scheduled_at) === time)
      const state: Line['state'] = d.state === 'past' || d.state === 'locked' ? d.state : at.length > 0 ? 'used' : 'free'
      out.push({ key: `${d.key}T${time}@${p.id}`, day: d.key, time, pattern: p, state, same: at.map((c) => ({ id: c.id, name: c.name })) })
    }
  }
  return out
}
