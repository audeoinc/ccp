// まとめて AI で下書き(バックログ W14)の、下書きモードの状態と操作。
// 週の表示の上で下書きを作るので、状態は App が持ち、帯(BulkDraftBar)・週の列の札(DraftCard)・右の引き出し(DraftDrawer)が共有する
import { useEffect, useMemo, useRef, useState } from 'react'
import type { DeliveryCard } from './models/deliveryCards'
import type { Product } from './models/products'
import type { HeroImage } from './models/heroImages'
import type { WeekRow } from './data/weeks'
import { tr } from './i18n'
import { CHANNEL_EMAIL } from './status'
import { dayKeyOf } from './weekLock'
import {
  BULK_MAX,
  BULK_PARALLEL,
  BULK_TIME,
  draftCard,
  draftId,
  draftProductIds,
  emptyDays,
  generateDraft,
  loadBackup,
  lockedWeekOf,
  newDraft,
  overusedInWeek,
  saveBackup,
  saveDraft,
  type Draft,
} from './bulkDraft'

export interface BulkSetup {
  country: string
  channel: string
}

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
  onSaved: () => Promise<void>
}

const mostCommon = (vs: string[]) => {
  const n = new Map<string, number>()
  for (const v of vs.filter(Boolean)) n.set(v, (n.get(v) ?? 0) + 1)
  return [...n].sort((a, b) => b[1] - a[1])[0]?.[0]
}

export function useBulkDrafts({ cards, cardProducts, products, heroes, weeks, weekStart, defaults, onSaved }: Ctx) {
  // 下書きモードか(帯の「まとめて AI で下書き」で入り、保存か破棄を決めて抜ける)
  const [active, setActive] = useState(false)
  // 国・チャネル(最初のステップで 1 回だけ選ぶ。null = まだ選んでいない)。
  // 「今週の US 向けメール」のように、まとめて作る配信の国・チャネルは、ほとんど決まっているため、下書きごとには選ばせない
  const [setup, setSetup] = useState<BulkSetup | null>(null)
  const [pickCountry, setPickCountry] = useState('')
  const [pickChannel, setPickChannel] = useState(CHANNEL_EMAIL)
  const [drafts, setDraftsState] = useState<Draft[]>([])
  // 作っている途中でも、最新の下書きを読めるように、状態と同じものを ref にも持つ(並行して作るとき、先にできた下書きのテーマ・商品を避けるため)
  const draftsRef = useRef<Draft[]>([])
  const update = (fn: (ds: Draft[]) => Draft[]) => {
    draftsRef.current = fn(draftsRef.current)
    setDraftsState(draftsRef.current)
  }
  const patch = (key: string, p: Partial<Draft>) => update((ds) => ds.map((d) => (d.key === key ? { ...d, ...p } : d)))
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const cancelRef = useRef(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // ブラウザの控えから戻した数(知らせに出す)
  const [restored, setRestored] = useState(0)
  const department = defaults.department ?? ''

  // 作った下書きは、ブラウザに控える(画面が落ちたときに戻すため。下書きモードの外では控えを触らない)
  useEffect(() => {
    if (active) saveBackup(drafts)
  }, [active, drafts])
  // 画面を閉じたら、作っている途中の AI は止める
  useEffect(
    () => () => {
      cancelRef.current = true
    },
    [],
  )

  /**
   * 下書きモードに入る。ブラウザに控えがあれば、それを戻し、その下書きの日付を返す(その週へ移るため)。
   * なければ、国・チャネルを選ぶステップから始める(既定は、画面の絞り込み。国の絞り込みがなければ、いちばん多く配信している国。
   * 国が空だと、日本とアメリカの商品が混ざるため)
   */
  const start = (): Date | undefined => {
    const back = loadBackup()
    setError(null)
    setActive(true)
    if (back.length > 0) {
      update(() => back)
      setSetup({ country: back[0].country, channel: back[0].channel })
      setRestored(back.length)
      setSelectedKey(null)
      return back[0].scheduledAt ? new Date(back[0].scheduledAt) : undefined
    }
    setRestored(0)
    setSetup(null)
    setPickCountry(defaults.country || mostCommon(cards.map((c) => c.country ?? '')) || '')
    setPickChannel(defaults.channel || CHANNEL_EMAIL)
    return undefined
  }

  /** 下書きモードを抜ける(保存していない下書きは消える。確かめるのは呼ぶ側) */
  const exit = () => {
    cancelRef.current = true
    update(() => [])
    saveBackup([])
    setSetup(null)
    setSelectedKey(null)
    setRestored(0)
    setError(null)
    setActive(false)
  }

  // ---- 行(下書き)
  const live = drafts.filter((d) => d.state !== 'saved')
  const full = live.length >= BULK_MAX
  /** 見ている週の、選んだ国・チャネルの空いている日(下書きのある日を除く) */
  const freeDays = (c: BulkSetup) => {
    const taken = new Set(draftsRef.current.filter((d) => d.state !== 'saved').map((d) => d.scheduledAt.slice(0, 10)))
    return emptyDays(weekStart, cards, weeks, c.channel, c.country).filter((day) => !taken.has(day))
  }
  const fillEmpty = (c = setup) => {
    if (!c) return
    const room = BULK_MAX - draftsRef.current.filter((d) => d.state !== 'saved').length
    const added = freeDays(c)
      .slice(0, room)
      .map((day) => newDraft({ scheduledAt: `${day}T${BULK_TIME}`, ...c, department }))
    update((ds) => [...ds, ...added])
  }
  /** その日に、下書きを 1 本足す(週の列の「＋」) */
  const addOn = (day: string) => {
    if (!setup || full) return
    const d = newDraft({ scheduledAt: `${day}T${BULK_TIME}`, ...setup, department })
    update((ds) => [...ds, d])
  }
  // 最初のステップ: 国・チャネルを決めたら、見ている週の空いている日に、下書きを並べる
  const confirmSetup = () => {
    const c = { country: pickCountry, channel: pickChannel }
    setSetup(c)
    fillEmpty(c)
  }
  // 国・チャネルを選び直す(使える商品・テンプレートが変わるので、保存していない下書きは消す)
  const resetSetup = () => {
    if (draftsRef.current.some((d) => d.state === 'done') && !window.confirm(tr('保存していない下書きを破棄して、国・チャネルを選び直します。よろしいですか?', 'Discard the unsaved drafts and choose the country and channel again?'))) return
    update((ds) => ds.filter((d) => d.state === 'saved'))
    setSelectedKey(null)
    if (setup) {
      setPickCountry(setup.country)
      setPickChannel(setup.channel)
    }
    setSetup(null)
  }
  const remove = (d: Draft) => {
    if (d.state === 'done' && !window.confirm(tr('この下書きを破棄します。よろしいですか?', 'Discard this draft?'))) return
    update((ds) => ds.filter((x) => x.key !== d.key))
    if (selectedKey === d.key) setSelectedKey(null)
  }

  // ---- 作る
  const locked = (d: Draft) => lockedWeekOf(weeks, d)
  const ready = drafts.filter((d) => (d.state === 'idle' || d.state === 'failed') && d.scheduledAt && !locked(d))
  async function generate(keys: string[]) {
    if (keys.length === 0) return
    cancelRef.current = false
    setRunning(true)
    setError(null)
    update((ds) => ds.map((d) => (keys.includes(d.key) ? { ...d, state: 'running', step: tr('順番を待っています', 'Waiting'), done: 0, total: 7, error: undefined, result: undefined, checked: false } : d)))
    const queue = [...keys]
    // 並行して作ると、同時に作っている下書きのテーマが見えず、同じテーマになりやすい。
    // そこで、次の下書きは、前の下書きのテーマが決まってから始める(テーマのあとの工程は、並行して進む)
    const pending: string[] = []
    let themeGate: Promise<void> = Promise.resolve()
    const worker = async () => {
      for (;;) {
        // 待っている間に、他の下書きが先に始めたら、その下書きのテーマを待ち直す
        let gate: Promise<void>
        do {
          gate = themeGate
          await gate
        } while (gate !== themeGate)
        const key = queue.shift()
        if (!key || cancelRef.current) break
        const d = draftsRef.current.find((x) => x.key === key)
        if (!d) continue
        let release = () => undefined as void
        themeGate = new Promise<void>((r) => (release = r))
        // 保存済みの配信と、先にできた下書きのテーマを避け、同じ週で上限まで載せた商品は選ばない
        const others = draftsRef.current.filter((x) => x.key !== key && x.state === 'done' && x.result)
        const pseudo = others.map((x) => ({ id: draftId(x), scheduled_at: x.scheduledAt ? new Date(x.scheduledAt).toISOString() : undefined }))
        const cp = new Map(cardProducts)
        for (const x of others) cp.set(draftId(x), draftProductIds(x))
        try {
          const res = await generateDraft(
            d,
            {
              products,
              heroes,
              otherThemes: [...cards.map((c) => c.theme ?? ''), ...others.map((x) => x.result?.theme ?? ''), ...pending].filter(Boolean),
              avoidProductIds: overusedInWeek(d.scheduledAt, [...cards, ...pseudo], cp),
              onTheme: (theme) => {
                if (theme) pending.push(theme)
                release()
              },
            },
            (step, done, total) => patch(key, { step, done, total }),
            () => cancelRef.current,
          )
          if (res.cancelled) patch(key, { state: 'idle', step: undefined })
          else if (!res.theme) patch(key, { state: 'failed', step: undefined, error: res.errors.join(' / ') || tr('テーマを作れませんでした', 'Could not come up with a theme') })
          // 一部の工程が失敗しても、できたところまでを下書きにする(足りないところは、開いて直す)
          else patch(key, { state: 'done', step: undefined, result: res, checked: true, error: res.errors.length > 0 ? res.errors.join(' / ') : undefined })
        } catch (e) {
          patch(key, { state: 'failed', step: undefined, error: e instanceof Error ? e.message : String(e) })
        } finally {
          // テーマの前に止めた・失敗したときも、次の下書きを待たせない
          release()
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(BULK_PARALLEL, keys.length) }, worker))
    update((ds) => ds.map((d) => (d.state === 'running' ? { ...d, state: 'idle', step: undefined } : d)))
    setRunning(false)
  }
  const stop = () => {
    cancelRef.current = true
  }

  // ---- 保存・破棄
  const unsaved = drafts.filter((d) => d.state === 'done')
  // 確定した週に移した下書きは、保存の対象にしない
  const checked = unsaved.filter((d) => d.checked && !locked(d))
  async function saveDrafts(list: Draft[]): Promise<boolean> {
    if (list.length === 0) return true
    setSaving(true)
    setError(null)
    let ok = true
    for (const d of list) {
      if (locked(d)) {
        ok = false
        setError(tr('確定した週に入っている下書きは、保存できません。日を変えてください。', 'Drafts in a confirmed week cannot be saved. Change the day first.'))
        continue
      }
      try {
        const id = await saveDraft(d, products)
        patch(d.key, { state: 'saved', savedId: id, checked: false })
      } catch (e) {
        ok = false
        setError(e instanceof Error ? e.message : String(e))
        break
      }
    }
    await onSaved()
    setSaving(false)
    // 次の、保存していない下書きを選ぶ(続けて見比べられるように)。なければ、引き出しを閉じる
    setSelectedKey(draftsRef.current.find((d) => d.state === 'done')?.key ?? null)
    return ok
  }
  const discard = (list: Draft[]) => {
    if (list.length === 0) return
    if (!window.confirm(tr(`選んだ ${list.length} 本の下書きを破棄します。よろしいですか?`, `Discard ${list.length} selected draft(s)?`))) return
    const keys = new Set(list.map((d) => d.key))
    update((ds) => ds.filter((d) => !keys.has(d.key)))
    if (selectedKey && keys.has(selectedKey)) setSelectedKey(null)
  }
  /** 配信カードで開いて直し、そこで保存したとき */
  const markSaved = (key: string, id: string) => patch(key, { state: 'saved', savedId: id, checked: false })

  /** 抜ける前に、確かめる必要があるか(保存していない下書き・作っている途中・まだ作っていない下書きがある) */
  const pendingCount = live.length

  // 週の表示・確認の一覧に混ぜるための、仮の配信カード
  const liveCards = useMemo(() => live.filter((d) => d.scheduledAt).map((d) => ({ draft: d, card: draftCard(d, products) })), [live, products])
  const allProducts = useMemo(() => {
    const m = new Map(cardProducts)
    for (const { draft, card } of liveCards) m.set(card.id, draftProductIds(draft))
    return m
  }, [cardProducts, liveCards])
  /** その日の下書き(週の列に並べる) */
  const draftsOn = (day: string) => live.filter((d) => d.scheduledAt.slice(0, 10) === day).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))

  return {
    active,
    setup,
    pickCountry,
    setPickCountry,
    pickChannel,
    setPickChannel,
    drafts,
    live,
    liveCards,
    allProducts,
    draftsOn,
    selectedKey,
    select: setSelectedKey,
    selected: drafts.find((d) => d.key === selectedKey),
    running,
    saving,
    error,
    restored,
    full,
    ready,
    unsaved,
    checked,
    pendingCount,
    locked,
    freeDays,
    start,
    exit,
    confirmSetup,
    resetSetup,
    fillEmpty: () => fillEmpty(),
    addOn,
    patch,
    remove,
    generate,
    stop,
    saveDrafts,
    discard,
    markSaved,
    today: dayKeyOf(new Date()),
  }
}

export type BulkDrafts = ReturnType<typeof useBulkDrafts>
