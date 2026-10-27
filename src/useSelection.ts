import { useState, type Dispatch, type SetStateAction } from 'react'
import { DND_CAND, DND_ITEM, DND_PRODUCT, SOURCE_AI, SOURCE_MANUAL, type Candidate, type Item } from './items'
import { sectionRange, sectionsOf, type EmailTemplateId, type SectionInfo } from './templates'
import { filled, joinSections, removeKey, splitSections } from './slots'

interface Args {
  template: EmailTemplateId
  items: Item[]
  setItems: Dispatch<SetStateAction<Item[]>>
  candidates: Candidate[]
  setCandidates: Dispatch<SetStateAction<Candidate[]>>
}

/** 選定済み商品・候補の操作(昇格・降格・並べ替え・ドラッグ&ドロップ) */
export function useSelection({ template, items, setItems, candidates, setCandidates }: Args) {
  const sections = sectionsOf(template)

  /** そのセクションの選定済み商品(最後のセクションは、枠を超えた分も含める。空いた枠の行は除く) */
  const listOf = (sec: SectionInfo) => {
    const [from, to] = sectionRange(sections, sec, items.length)
    return filled(items.slice(from, to))
  }
  const isFull = (sec: SectionInfo) => Number.isFinite(sec.slots) && listOf(sec).length >= sec.slots

  // 並びの操作は、セクションごとの並びに分けて直し、戻す(ほかのセクションの商品は動かさない。src/slots.ts)
  const inSection = (sec: SectionInfo, f: (list: Item[]) => Item[]) =>
    setItems((prev) => {
      const lists = splitSections(prev, sections)
      if (!lists[sec.index]) return prev
      lists[sec.index] = f(lists[sec.index])
      return joinSections(lists, sections)
    })

  const moveInSection = (sec: SectionInfo, key: string, delta: number) =>
    inSection(sec, (list) => {
      const i = list.findIndex((x) => x.key === key)
      const j = i + delta
      if (i < 0 || j < 0 || j >= list.length) return list
      const next = [...list]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })

  const demote = (sec: SectionInfo, item: Item) => {
    setItems((prev) => removeKey(prev, sections, item.key))
    setCandidates((prev) => [{ ...item, section: sec.index }, ...prev])
  }

  /** 候補を選定済みへ。枠がいっぱいなら、そのセクションの最後の商品を候補へ下げる */
  const promote = (sec: SectionInfo, cand: Candidate) => {
    const list = listOf(sec)
    const full = isFull(sec)
    let nextList = [...list]
    let nextCands = candidates.filter((c) => c.key !== cand.key)
    if (full) {
      const last = list[list.length - 1]
      nextList = nextList.filter((x) => x.key !== last.key)
      nextCands = [{ ...last, section: sec.index }, ...nextCands]
    }
    nextList.push({ key: cand.key, rowId: cand.rowId, productId: cand.productId, reason: cand.reason, source: cand.source })
    // そのセクションの末尾に入れる(前のセクションが空いていても、このセクションの枠に入る)
    const lists = splitSections(items, sections)
    lists[sec.index] = nextList
    setItems(joinSections(lists, sections))
    setCandidates(nextCands)
  }

  const addManual = (sec: SectionInfo, productId: string) => {
    if (items.some((x) => !x.gap && x.productId === productId)) return
    const existing = candidates.find((c) => c.productId === productId)
    promote(sec, existing ?? { key: crypto.randomUUID(), productId, reason: '', source: SOURCE_MANUAL, section: sec.index })
  }

  // ---- ドラッグ&ドロップ
  const [dropKey, setDropKey] = useState<string | null>(null)
  const startDrag = (kind: 'item' | 'cand', key: string, productId: string) => (e: React.DragEvent) => {
    if (kind === 'item') e.dataTransfer.setData(DND_ITEM, key)
    else {
      e.dataTransfer.setData(DND_CAND, key)
      e.dataTransfer.setData(DND_PRODUCT, productId) // 右のプレビューへも落とせる
    }
    e.dataTransfer.effectAllowed = 'move'
  }
  const overTarget = (id: string) => (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDropKey(id)
  }
  const leaveTarget = (id: string) => () => setDropKey((k) => (k === id ? null : k))

  /** 候補(または商品一覧の商品)を、選定済みの target と入れ替える */
  const swapIn = (sec: SectionInfo, target: Item, incoming: Candidate) => {
    setItems((prev) => prev.map((x) => (x.key === target.key ? { key: incoming.key, rowId: incoming.rowId, productId: incoming.productId, reason: incoming.reason, source: incoming.source } : x)))
    setCandidates((prev) => [{ ...target, section: sec.index }, ...prev.filter((c) => c.key !== incoming.key)])
  }

  /** 選定済みの行へのドロップ: 選定済みどうしは並べ替え、候補・商品一覧からは入れ替え */
  const dropOnSelected = (sec: SectionInfo, target: Item, dt: DataTransfer) => {
    const itemKey = dt.getData(DND_ITEM)
    const candKey = dt.getData(DND_CAND)
    const productId = dt.getData(DND_PRODUCT)
    if (itemKey) {
      if (itemKey === target.key) return
      inSection(sec, (list) => {
        const a = list.findIndex((x) => x.key === itemKey)
        const b = list.findIndex((x) => x.key === target.key)
        if (a < 0 || b < 0) return list
        const next = [...list]
        const [moved] = next.splice(a, 1)
        next.splice(b, 0, moved)
        return next
      })
    } else if (candKey) {
      const c = candidates.find((x) => x.key === candKey)
      if (c) swapIn(sec, target, c)
    } else if (productId && !items.some((x) => !x.gap && x.productId === productId)) {
      const c = candidates.find((x) => x.productId === productId) ?? { key: crypto.randomUUID(), productId, reason: '', source: SOURCE_MANUAL, section: sec.index }
      swapIn(sec, target, c)
    }
  }

  /** 選定済みリストの空きへのドロップ(枠に余裕があるときだけ、候補・商品一覧から追加) */
  const dropOnSelectedArea = (sec: SectionInfo, dt: DataTransfer) => {
    if (isFull(sec)) return
    const candKey = dt.getData(DND_CAND)
    const productId = dt.getData(DND_PRODUCT)
    const c = candKey ? candidates.find((x) => x.key === candKey) : undefined
    if (c) promote(sec, c)
    else if (productId) addManual(sec, productId)
  }

  /** 候補の領域へのドロップ: 選定済みの商品を、候補へ戻す */
  const dropOnCandidates = (sec: SectionInfo, dt: DataTransfer) => {
    const itemKey = dt.getData(DND_ITEM)
    const it = itemKey ? items.find((x) => x.key === itemKey) : undefined
    if (it && listOf(sec).some((x) => x.key === it.key)) demote(sec, it)
  }

  const setItemReason = (key: string, reason: string) => setItems((prev) => prev.map((x) => (x.key === key ? { ...x, reason } : x)))
  const setCandReason = (key: string, reason: string) => setCandidates((prev) => prev.map((x) => (x.key === key ? { ...x, reason } : x)))

  const toItems = (rows: { productId: string; reason: string }[]): Item[] =>
    rows.map((r) => ({ key: crypto.randomUUID(), productId: r.productId, reason: r.reason, source: SOURCE_AI }))

  return {
    sections,
    listOf,
    isFull,
    moveInSection,
    demote,
    promote,
    addManual,
    dropKey,
    setDropKey,
    startDrag,
    overTarget,
    leaveTarget,
    swapIn,
    dropOnSelected,
    dropOnSelectedArea,
    dropOnCandidates,
    setItemReason,
    setCandReason,
    toItems,
  }
}
