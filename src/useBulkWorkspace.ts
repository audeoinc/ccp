// まとめて作る作業画面(BulkWorkspace)の、状態と操作。
// 週の表示の上で作る形(useWeekFrames)は、表示の場所を作業の場所に使うので、手順が分かりにくかった(利用者・チームの指摘、2026-10-19)。
// そこで、作業は全画面の作業画面で完結させ、① 対象 → ② 配信名・種類 → ③ 中身を AI で作る → ④ 確かめる、の順に進める。
// 中身のない枠は保存しない。①② は画面の中だけで持ち、③ で中身ができた配信から、1 本ずつ新規作成した下書きと同じ「未起案」で保存する
import { useEffect, useMemo, useRef, useState } from 'react'
import type { DeliveryCard, DeliveryCardFields } from './models/deliveryCards'
import type { Product } from './models/products'
import type { HeroImage } from './models/heroImages'
import type { WeekRow } from './data/weeks'
import { suggestNames } from './aiDraft'
import { channelOptions, departmentOptions, CHANNEL_EMAIL } from './status'
import { themeTypeLabel, type ThemeType } from './themeTypes'
import { sundayOf } from './weekLock'
import { tr } from './i18n'
import { BULK_PARALLEL, BULK_TIME, createDraft, generateFor, markChecked, overusedInWeek, weekDays, type DraftBase } from './bulkDraft'
import type { Progress } from './useWeekFrames'

interface Ctx {
  /** すべての配信(取りやめを除く) */
  cards: DeliveryCard[]
  cardProducts: Map<string, string[]>
  products: Product[]
  heroes: HeroImage[]
  weeks: WeekRow[]
  /** 国・チャネル・種別の既定(画面の絞り込み) */
  defaults: { country?: string; channel?: string; department?: string }
  /** 保存したら、配信を読み直す */
  onChanged: () => Promise<void>
}

export type Step = 1 | 2 | 3 | 4

/** ② で入れる、1 日分の行(まだ保存しない) */
export interface Row {
  name: string
  themeType: string
  /** AI の配信名の案の理由(案を入れたときだけ) */
  nameReason?: string
}

const mostCommon = (vs: string[]) => {
  const n = new Map<string, number>()
  for (const v of vs.filter(Boolean)) n.set(v, (n.get(v) ?? 0) + 1)
  return [...n].sort((a, b) => b[1] - a[1])[0]?.[0]
}
const label = (opts: { value: string; label: string }[], v?: string | null) => opts.find((o) => String(o.value) === String(v ?? ''))?.label ?? ''

export function useBulkWorkspace({ cards, cardProducts, products, heroes, weeks, defaults, onChanged }: Ctx) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>(1)
  const [weekStart, setWeekStart] = useState(() => sundayOf(new Date()))
  const [country, setCountryRaw] = useState('')
  const [channel, setChannelRaw] = useState(CHANNEL_EMAIL)
  // ① で選んだ日(YYYY-MM-DD)
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  // ② の行(日 → 配信名・種類)
  const [rows, setRows] = useState<Map<string, Row>>(new Map())
  const [naming, setNaming] = useState<Set<string>>(new Set())
  // ③ の進み具合・失敗・保存した配信(日 → 配信カードの id)
  const [progress, setProgress] = useState<Map<string, Progress>>(new Map())
  const [failed, setFailed] = useState<Map<string, string>>(new Map())
  const [made, setMade] = useState<Map<string, string>>(new Map())
  // ④ で見ている配信
  const [checkId, setCheckId] = useState<string | null>(null)
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
  // ② に進んだときの作る日。保存すると、その日は「配信あり」に変わるので、① の判定から毎回求めると、作った行が消えてしまう
  const [plan, setPlan] = useState<string[] | null>(null)
  /** 作る日(① では、選んだ作れる日。② 以降は、② に進んだときの日。日付の順) */
  const targets = plan ?? days.filter((d) => d.state === 'free' && chosen.has(d.key)).map((d) => d.key)
  const rowOf = (day: string): Row => rows.get(day) ?? { name: '', themeType: '' }
  const ready = (day: string) => !!rowOf(day).name.trim() && !!rowOf(day).themeType
  const allReady = targets.length > 0 && targets.every(ready)
  // ③ の対象(まだ保存していない日)
  const pending = targets.filter((d) => !made.has(d))

  // 国・チャネル・週を変えたら、作れる日を選び直す(既定は、作れる日すべて)
  const pickFree = (ws: Date, ch: string, co: string) => setChosen(new Set(weekDays(ws, cards, weeks, ch, co).filter((d) => d.state === 'free').map((d) => d.key)))

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
    setMade(new Map())
    setCheckId(null)
    setError(null)
    setPlan(null)
    setStep(1)
    setOpen(true)
  }
  /** 手順を移る。① に戻ると、作る日を選び直せる。① から先に進むと、作る日を決める */
  function goStep(k: Step) {
    if (k === 1) setPlan(null)
    else if (step === 1) setPlan(targets)
    setStep(k)
  }
  /** 閉じる。まだ保存していない入力があれば確かめる(作った中身は保存済みなので、消えない) */
  function close() {
    if (running) return
    const unsaved = targets.some((d) => !made.has(d) && (rowOf(d).name.trim() || rowOf(d).themeType))
    if (unsaved && !window.confirm(tr('中身をまだ作っていない配信名・種類は、保存されずに消えます。閉じますか?', 'Names and types without content are not saved and will be lost. Close anyway?'))) return
    setOpen(false)
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

  /** 行を、AI に渡す配信の形に(まだ保存していない) */
  const baseOf = (day: string): DraftBase => ({
    name: rowOf(day).name.trim(),
    scheduled_at: new Date(`${day}T${BULK_TIME}`).toISOString(),
    country: (country || undefined) as DeliveryCardFields['country'],
    channel: (channel || undefined) as DeliveryCardFields['channel'],
    department: (defaults.department || undefined) as DeliveryCardFields['department'],
    theme_type: rowOf(day).themeType || undefined,
  })

  /**
   * 配信名の案を出して、行に入れる(押すこと自体を、案の採用とみなす。あとで書き換えられる)。
   * まとめて出すときは、配信名がまだ空の行だけ(人が入れた名前は、上書きしない)
   */
  async function suggest(list: string[]) {
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
          }
        }),
        others,
      })
      setRows((m) => {
        const n = new Map(m)
        for (const x of names) n.set(x.id, { ...(n.get(x.id) ?? { name: '', themeType: '' }), name: x.name, nameReason: x.reason })
        return n
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setNaming((s) => new Set([...s].filter((d) => !list.includes(d))))
    }
  }

  /** ③ 中身を作る(人が押す)。できた配信から、新しい配信カードとして保存する */
  async function generate(list: string[]) {
    if (list.length === 0) return
    stopRef.current = false
    setError(null)
    setStep(3)
    setFailed((m) => new Map([...m].filter(([d]) => !list.includes(d))))
    setProgress((m) => new Map([...m, ...list.map((d) => [d, { step: tr('順番を待っています', 'Waiting'), done: 0, total: 7 }] as const)]))
    const queue = [...list]
    // 並行して作ると、同時に作っている配信のテーマが見えず、同じテーマになりやすい。
    // そこで、次の配信は、前の配信のテーマが決まってから始める(テーマのあとの工程は、並行して進む。useWeekFrames と同じ)
    const themes: string[] = []
    const done: { id: string; scheduled_at?: string; products: string[] }[] = []
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
        // 保存済みの配信と、先に作った配信のテーマを避け、同じ週で上限まで載せた商品は選ばない
        const cp = new Map(cardProducts)
        for (const m of done) cp.set(m.id, m.products)
        try {
          const res = await generateFor(
            base,
            {
              products,
              heroes,
              otherThemes: [...cards.map((x) => x.theme ?? ''), ...themes].filter(Boolean),
              avoidProductIds: overusedInWeek(base.scheduled_at, [...cards, ...done], cp),
              onTheme: (theme) => {
                if (theme) themes.push(theme)
                release()
              },
            },
            (s, n, total) => setProgress((m) => new Map(m).set(day, { step: s, done: n, total })),
            () => stopRef.current,
          )
          if (res.cancelled) {
            // 止めたときは、保存しない(行は残るので、もう一度作れる)
          } else if (!res.theme) {
            setFailed((m) => new Map(m).set(day, res.errors.join(' / ') || tr('テーマを作れませんでした', 'Could not come up with a theme')))
          } else {
            // 一部の工程が失敗しても、できたところまでを保存する(足りないところは、配信カードで直す)
            const card = await createDraft(base, res, products)
            done.push({ id: card.id, scheduled_at: card.scheduled_at, products: res.sections.flatMap((s) => s.selected.map((x) => x.productId)) })
            setMade((m) => new Map(m).set(day, card.id))
            if (res.errors.length > 0) setError(tr(`「${base.name}」は、一部の工程で失敗しました: ${res.errors.join(' / ')}`, `“${base.name}”: some steps failed: ${res.errors.join(' / ')}`))
            await onChanged()
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

  /** ④ で見る配信(保存した順ではなく、日付の順) */
  const madeCards = targets.map((d) => made.get(d)).filter((id): id is string => !!id).map((id) => cards.find((c) => c.id === id)).filter((c): c is DeliveryCard => !!c)
  const unchecked = madeCards.filter((c) => c.ai_unchecked_at).length

  /** 「確認した」: AI 下書き・未確認の印を外す */
  async function check(id: string) {
    setError(null)
    try {
      await markChecked(id)
      await onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return {
    open,
    openFor,
    close,
    step,
    setStep: goStep,
    weekStart,
    moveWeek,
    country,
    setCountry,
    channel,
    setChannel,
    days,
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
    made,
    running,
    generate,
    stop,
    madeCards,
    unchecked,
    checkId,
    setCheckId,
    check,
    error,
    clearError: () => setError(null),
  }
}

export type BulkWorkspaceState = ReturnType<typeof useBulkWorkspace>
