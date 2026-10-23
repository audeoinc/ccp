// 週の枠と、まとめて AI で中身を作る(バックログ W14)の、画面の状態と操作。
// 枠は保存された配信カードなので、ここで持つのは、作っている途中の進み具合・選択・入力の途中など、画面だけの状態。
// App が持ち、帯(FrameBar)・週の列の枠(FrameCard)・確かめる引き出し(CheckDrawer)が共有する
import { useEffect, useMemo, useRef, useState } from 'react'
import type { DeliveryCard } from './models/deliveryCards'
import type { Product } from './models/products'
import type { HeroImage } from './models/heroImages'
import type { WeekRow } from './data/weeks'
import { scopeOfCard } from './weekLock'
import { DeliveryCardsService } from './data/deliveryCards'
import { suggestNames } from './aiDraft'
import { channelOptions, departmentOptions, CHANNEL_EMAIL } from './status'
import { themeTypeLabel, type ThemeType } from './themeTypes'
import { tr } from './i18n'
import { BULK_PARALLEL, applyResult, createFrames, emptyDays, frameReady, generateFor, isFrame, lockedWeekOf, markChecked, overusedInWeek } from './bulkDraft'

interface Ctx {
  /** すべての配信(取りやめを除く) */
  cards: DeliveryCard[]
  cardProducts: Map<string, string[]>
  products: Product[]
  heroes: HeroImage[]
  weeks: WeekRow[]
  /** 見ている週の初め(日曜日) */
  weekStart: Date
  /** 国・チャネル・種別の既定(画面の絞り込み) */
  defaults: { country?: string; channel?: string; department?: string }
  /** 保存したら、配信を読み直す */
  onChanged: () => Promise<void>
}

export interface Progress {
  step: string
  done: number
  total: number
}

const mostCommon = (vs: string[]) => {
  const n = new Map<string, number>()
  for (const v of vs.filter(Boolean)) n.set(v, (n.get(v) ?? 0) + 1)
  return [...n].sort((a, b) => b[1] - a[1])[0]?.[0]
}
const label = (opts: { value: string; label: string }[], v?: string | null) => opts.find((o) => String(o.value) === String(v ?? ''))?.label ?? ''

export function useWeekFrames({ cards, cardProducts, products, heroes, weeks, weekStart, defaults, onChanged }: Ctx) {
  // 枠を作る最初のステップ(国・チャネル)を開いているか
  const [setupOpen, setSetupOpen] = useState(false)
  const [pickCountry, setPickCountry] = useState('')
  const [pickChannel, setPickChannel] = useState(CHANNEL_EMAIL)
  const [creating, setCreating] = useState(false)
  // 中身を作っている枠の進み具合(id → 工程)と、失敗した理由
  const [progress, setProgress] = useState<Map<string, Progress>>(new Map())
  const [failed, setFailed] = useState<Map<string, string>>(new Map())
  // 中身を作る対象に選んだ枠
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // 配信名の案を出している枠
  const [naming, setNaming] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  // 確かめる引き出しで開いている配信
  const [checkId, setCheckId] = useState<string | null>(null)
  const stopRef = useRef(false)
  const running = progress.size > 0

  // 画面を閉じたら、作っている途中の AI は止める
  useEffect(
    () => () => {
      stopRef.current = true
    },
    [],
  )

  const weekEnd = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7)
  const inWeek = (c: DeliveryCard) => !!c.scheduled_at && new Date(c.scheduled_at) >= weekStart && new Date(c.scheduled_at) < weekEnd
  /** 見ている週の枠(中身のない配信) */
  const frames = useMemo(
    () => cards.filter((c) => inWeek(c) && isFrame(c, (cardProducts.get(c.id) ?? []).length)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cards, cardProducts, weekStart],
  )
  const frameIds = useMemo(() => new Set(frames.map((c) => c.id)), [frames])
  const isLocked = (c: DeliveryCard) => !!lockedWeekOf(weeks, c.scheduled_at, scopeOfCard(c))
  const ready = frames.filter((c) => frameReady(c) && !isLocked(c) && !progress.has(c.id))
  const chosen = ready.filter((c) => selected.has(c.id))

  // ---- 枠を作る
  /** 最初のステップを開く。既定は、画面の絞り込み。国の絞り込みがなければ、いちばん多く配信している国(国が空だと、日本とアメリカの商品が混ざるため) */
  const openSetup = () => {
    setError(null)
    setPickCountry(defaults.country || mostCommon(cards.map((c) => String(c.country ?? ''))) || '')
    setPickChannel(defaults.channel || CHANNEL_EMAIL)
    setSetupOpen(true)
  }
  const freeDays = () => emptyDays(weekStart, cards, weeks, pickChannel, pickCountry)
  async function makeFrames() {
    setCreating(true)
    setError(null)
    try {
      await createFrames(freeDays(), { country: pickCountry, channel: pickChannel, department: defaults.department ?? '' })
      setSetupOpen(false)
      await onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCreating(false)
    }
  }

  // ---- 枠の入力(配信名・種類は、入れたらすぐ保存する。枠は保存された配信カードなので)
  async function saveField(c: DeliveryCard, fields: { name?: string; theme_type?: string }) {
    setError(null)
    const res = await DeliveryCardsService.update(c.id, fields)
    if (!res.success) setError(res.error?.message ?? tr('保存に失敗しました', 'Failed to save'))
    await onChanged()
  }
  /** 枠を消す(中身がないので、取りやめではなく、消してよい) */
  async function remove(c: DeliveryCard) {
    if (!window.confirm(tr('この枠を消します。よろしいですか?', 'Delete this slot?'))) return
    setError(null)
    try {
      await DeliveryCardsService.delete(c.id)
      setSelected((s) => {
        const n = new Set(s)
        n.delete(c.id)
        return n
      })
      await onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  const toggle = (id: string, on: boolean) =>
    setSelected((s) => {
      const n = new Set(s)
      if (on) n.add(id)
      else n.delete(id)
      return n
    })

  /**
   * 配信名の案を出して、枠に入れる(押すこと自体を、案の採用とみなす。あとで書き換えられる)。
   * まとめて出すときは、配信名がまだ空の枠だけ(人が入れた名前は、上書きしない)
   */
  async function nameFrames(list: DeliveryCard[]) {
    if (list.length === 0) return
    setError(null)
    setNaming((s) => new Set([...s, ...list.map((c) => c.id)]))
    try {
      const others = cards
        .filter((c) => !list.some((x) => x.id === c.id) && c.name?.trim() && c.scheduled_at && Math.abs(new Date(c.scheduled_at).getTime() - weekStart.getTime()) < 21 * 86400000)
        .map((c) => ({ name: c.name, theme: c.theme, scheduledAt: c.scheduled_at }))
      const names = await suggestNames({
        slots: list.map((c) => ({
          id: c.id,
          scheduledAt: c.scheduled_at ?? '',
          country: String(c.country ?? ''),
          channel: label(channelOptions, c.channel),
          department: label(departmentOptions, c.department),
          themeType: c.theme_type ? themeTypeLabel(c.theme_type as ThemeType) : undefined,
        })),
        others,
      })
      for (const n of names) {
        const res = await DeliveryCardsService.update(n.id, { name: n.name })
        if (!res.success) throw new Error(res.error?.message ?? tr('保存に失敗しました', 'Failed to save'))
      }
      await onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setNaming((s) => new Set([...s].filter((id) => !list.some((c) => c.id === id))))
    }
  }

  // ---- 中身を作る(人が押す。そろった枠をまとめて、または選んだ枠だけ)
  async function generate(list: DeliveryCard[]) {
    if (list.length === 0) return
    stopRef.current = false
    setError(null)
    setFailed((m) => new Map([...m].filter(([id]) => !list.some((c) => c.id === id))))
    setProgress((m) => new Map([...m, ...list.map((c) => [c.id, { step: tr('順番を待っています', 'Waiting'), done: 0, total: 7 }] as const)]))
    const queue = [...list]
    // 並行して作ると、同時に作っている枠のテーマが見えず、同じテーマになりやすい。
    // そこで、次の枠は、前の枠のテーマが決まってから始める(テーマのあとの工程は、並行して進む)
    const pending: string[] = []
    const made: { id: string; scheduled_at?: string; products: string[] }[] = []
    let themeGate: Promise<void> = Promise.resolve()
    const worker = async () => {
      for (;;) {
        // 待っている間に、他の枠が先に始めたら、その枠のテーマを待ち直す
        let gate: Promise<void>
        do {
          gate = themeGate
          await gate
        } while (gate !== themeGate)
        const c = queue.shift()
        if (!c || stopRef.current) break
        let release = () => undefined as void
        themeGate = new Promise<void>((r) => (release = r))
        // 保存済みの配信と、先に作った枠のテーマを避け、同じ週で上限まで載せた商品は選ばない
        const cp = new Map(cardProducts)
        for (const m of made) cp.set(m.id, m.products)
        try {
          const res = await generateFor(
            c,
            {
              products,
              heroes,
              otherThemes: [...cards.map((x) => x.theme ?? ''), ...pending].filter(Boolean),
              avoidProductIds: overusedInWeek(c.scheduled_at, [...cards, ...made], cp, c),
              onTheme: (theme) => {
                if (theme) pending.push(theme)
                release()
              },
            },
            (step, done, total) => setProgress((m) => new Map(m).set(c.id, { step, done, total })),
            () => stopRef.current,
          )
          if (res.cancelled) {
            // 止めたときは、枠のまま残す
          } else if (!res.theme) {
            setFailed((m) => new Map(m).set(c.id, res.errors.join(' / ') || tr('テーマを作れませんでした', 'Could not come up with a theme')))
          } else {
            // 一部の工程が失敗しても、できたところまでを書き込む(足りないところは、配信カードで直す)
            await applyResult(c, res, products)
            made.push({ id: c.id, scheduled_at: c.scheduled_at, products: res.sections.flatMap((s) => s.selected.map((x) => x.productId)) })
            if (res.errors.length > 0) setError(tr(`「${c.name}」は、一部の工程で失敗しました: ${res.errors.join(' / ')}`, `“${c.name}”: some steps failed: ${res.errors.join(' / ')}`))
            setSelected((s) => {
              const n = new Set(s)
              n.delete(c.id)
              return n
            })
            await onChanged()
          }
        } catch (e) {
          setFailed((m) => new Map(m).set(c.id, e instanceof Error ? e.message : String(e)))
        } finally {
          // テーマの前に止めた・失敗したときも、次の枠を待たせない
          release()
          setProgress((m) => {
            const n = new Map(m)
            n.delete(c.id)
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
    setupOpen,
    openSetup,
    closeSetup: () => setSetupOpen(false),
    pickCountry,
    setPickCountry,
    pickChannel,
    setPickChannel,
    freeDays,
    creating,
    makeFrames,
    frames,
    frameIds,
    isLocked,
    ready,
    chosen,
    selected,
    toggle,
    progress,
    failed,
    running,
    naming,
    error,
    saveField,
    remove,
    nameFrames,
    generate,
    stop,
    check,
    checkId,
    openCheck: setCheckId,
  }
}

export type WeekFrames = ReturnType<typeof useWeekFrames>
