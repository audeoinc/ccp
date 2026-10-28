// テンプレートを AI で直す(入口「AI で直す」。設計は docs/TEMPLATE_OBJECTS.md の 11 章)。AI に渡す形と、返答の検査。
// 残す部品の ID は、そのまま残す(UTM・ピン・配信カードの part_content が、部品の ID でつながっているため)。
// React と AI の呼び出しを持たない(確かめのスクリプトから読めるように。呼び出しは templateAi.ts)
import { toStored } from './layoutTemplates'
import { HERO_TABLE_ID, MAX_TABLE_COLS, MAX_TABLE_ROWS, newPartId, newSectionId, normalizeTable, parsePart, partsOf } from './tables'
import type { PartType, Section, TablePart } from './templates'

/** 1 つのテンプレートに置けるセクションの数(layoutTemplates.ts の MAX_SECTIONS と同じ) */
const MAX_SECTIONS = 8
// AI が置いてよい部品(空きは書かせない。空いたマスは読むときに空きで埋める)
const AI_TYPES: PartType[] = ['box', 'button', 'text', 'media', 'line', 'spacer']
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

/** 直す前の形(編集中の下書きのうち、AI に渡す所) */
export interface EditableLayout {
  sections: Section[]
  heroTable?: Section
}

/** AI に渡す形: 保存する形から、空きのマスと、表の作りの印(kind・slots)を除いたもの */
/** 持ち物から、いくつかの鍵を除く */
const omit = (o: object, keys: string[]) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)))
const forAi = (sec: Section) => {
  const st = toStored(sec)
  return { ...omit(st, ['kind', 'slots']), parts: partsOf(st).filter((p) => p.type !== 'empty') }
}
export const layoutForAi = (l: EditableLayout) => ({
  ...(l.heroTable && partsOf(l.heroTable).some((p) => p.type !== 'empty') ? { heroTable: forAi(l.heroTable) } : {}),
  sections: l.sections.filter((sec) => sec.kind === 'table').map(forAi),
})

/** 変わった所(部品の ID ごと) */
export interface EditDiff {
  /** 設定が変わった部品 */
  changed: string[]
  /** 足した部品 */
  added: string[]
  /** 動いただけの部品(位置・大きさだけが変わった) */
  moved: string[]
  /** 消した部品 */
  removed: string[]
  /** ID を付け直してしまった部品を、元の ID に戻した数 */
  healed: number
  /** セクションの並び(ID の順)が変わったか */
  reordered: boolean
}

export interface TemplateEditOut extends EditableLayout {
  /** 何を変えたか(画面に出すだけ。保存しない) */
  summary: string
  diff: EditDiff
}

/** 部品の中身(位置と ID を除いた、保存する形)。同じなら、設定は変わっていない */
const bodyOf = (p: TablePart) => JSON.stringify(omit(parsePart(p) ?? p, ['id', 'c', 'r', 'w', 'h']))
const placeOf = (p: TablePart) => `${p.c},${p.r},${p.w},${p.h}`

/** 返答のセクションを、表のセクションにする(ID は take で決める) */
function readSection(raw: unknown, sectionId: string, takePart: (raw: Record<string, unknown>, type: PartType) => string): Section | null {
  const so = (raw ?? {}) as Record<string, unknown>
  const cols = Math.min(MAX_TABLE_COLS, Math.max(1, Math.round(typeof so.cols === 'number' ? so.cols : 2)))
  const rows = Math.min(MAX_TABLE_ROWS, Math.max(0, Math.round(typeof so.rows === 'number' ? so.rows : 0)))
  const parts: TablePart[] = []
  for (const praw of Array.isArray(so.parts) ? so.parts : []) {
    const o = (praw ?? {}) as Record<string, unknown>
    const type = o.type as PartType
    if (!AI_TYPES.includes(type)) continue
    const p = parsePart({ ...o, id: takePart(o, type), type, w: o.w ?? 1, h: o.h ?? 1 })
    if (p) parts.push(p)
  }
  if (parts.length === 0) return null
  const name = str(so.name, 40)
  const aiNote = str(so.aiNote, 300)
  return normalizeTable({
    kind: 'table',
    id: sectionId,
    cols,
    rows,
    parts,
    slots: 0,
    ...(name ? { name } : {}),
    ...(aiNote ? { aiNote } : {}),
    ...(Array.isArray(so.evenRows) ? { evenRows: so.evenRows.filter((r): r is number => typeof r === 'number') } : {}),
    ...(so.mobile === 'stack' ? { mobile: 'stack' as const } : {}),
    ...(typeof so.bg === 'string' ? { bg: so.bg as Section['bg'] } : {}),
    ...(so.space === 'tight' || so.space === 'wide' ? { space: so.space } : {}),
    ...(so.divider === true ? { divider: true } : {}),
    ...(so.categoryHeading === true ? { categoryHeading: true } : {}),
    ...(so.copy === false ? { copy: false } : {}),
  })
}

/**
 * AI の返答を、直したあとの形にする。形が読めなければ null(作り直しを促す)。
 * ID は、今の形にあって・種類が同じで・まだ使っていないものだけ残し、ほかは新しくする。
 * 新しくした部品が、消えた部品と同じセクション・同じ種類・同じ中身なら、消えた部品の ID に戻す(ID を付け直してしまった返答の救い)
 */
export function parseTemplateEdit(raw: unknown, before: EditableLayout): TemplateEditOut | null {
  const o = (raw ?? {}) as Record<string, unknown>
  if (!Array.isArray(o.sections)) return null
  // 今の部品(ID → 部品とセクション)
  const old = new Map<string, { p: TablePart; sec: string }>()
  const oldSecs = new Set<string>()
  for (const sec of [...(before.heroTable ? [before.heroTable] : []), ...before.sections]) {
    if (sec.id) oldSecs.add(sec.id)
    for (const p of partsOf(sec)) if (p.type !== 'empty') old.set(p.id, { p, sec: sec.id ?? '' })
  }
  const usedParts = new Set<string>()
  const usedSecs = new Set<string>([HERO_TABLE_ID])
  const fresh = new Set<string>()
  const takePart = (ro: Record<string, unknown>, type: PartType) => {
    const id = typeof ro.id === 'string' ? ro.id : ''
    if (id && old.get(id)?.p.type === type && !usedParts.has(id)) {
      usedParts.add(id)
      return id
    }
    const nid = newPartId(type)
    fresh.add(nid)
    return nid
  }
  const takeSection = (ro: Record<string, unknown>) => {
    const id = typeof ro.id === 'string' ? ro.id : ''
    if (id && oldSecs.has(id) && !usedSecs.has(id)) {
      usedSecs.add(id)
      return id
    }
    return newSectionId()
  }

  const sections: Section[] = []
  for (const sraw of o.sections.slice(0, MAX_SECTIONS)) {
    const sec = readSection(sraw, takeSection((sraw ?? {}) as Record<string, unknown>), takePart)
    if (sec) sections.push(sec)
  }
  if (sections.length === 0) return null
  // メイン画像の下の表: 返答になければ、今のまま(その部品の ID も使ったものに数える)
  let heroTable: Section | undefined
  if (o.heroTable && typeof o.heroTable === 'object') {
    heroTable = readSection(o.heroTable, HERO_TABLE_ID, takePart) ?? undefined
  } else {
    heroTable = before.heroTable
    for (const p of heroTable ? partsOf(heroTable) : []) usedParts.add(p.id)
  }

  // ID の救い: 消えた部品と、同じセクション・種類・中身の新しい部品があれば、消えた部品の ID に戻す
  let healed = 0
  const heal = (sec: Section): Section => {
    let touched = false
    const parts = partsOf(sec).map((p) => {
      if (!fresh.has(p.id)) return p
      // 同じセクションのものを先に。セクションごと作り直された返答(セクションの ID も新しい)のために、ほかのセクションのものも探す
      const cand = [...old.entries()].filter(([id, x]) => !usedParts.has(id) && x.p.type === p.type && bodyOf(x.p) === bodyOf(p))
      const hit = cand.find(([, x]) => x.sec === sec.id) ?? cand[0]
      if (!hit) return p
      usedParts.add(hit[0])
      healed++
      touched = true
      return { ...p, id: hit[0] }
    })
    return touched ? { ...sec, parts } : sec
  }
  const healedSections = sections.map(heal)
  const healedHero = heroTable && heroTable !== before.heroTable ? heal(heroTable) : heroTable

  // 変わった所
  const order = (list: Section[]) => list.map((sec) => sec.id).join('|')
  const diff: EditDiff = { changed: [], added: [], moved: [], removed: [], healed, reordered: order(healedSections) !== order(before.sections) }
  const after = new Set<string>()
  for (const sec of [...(healedHero ? [healedHero] : []), ...healedSections]) {
    for (const p of partsOf(sec)) {
      if (p.type === 'empty') continue
      after.add(p.id)
      const was = old.get(p.id)
      if (!was) diff.added.push(p.id)
      else if (bodyOf(was.p) !== bodyOf(p)) diff.changed.push(p.id)
      else if (placeOf(was.p) !== placeOf(p)) diff.moved.push(p.id)
    }
  }
  for (const id of old.keys()) if (!after.has(id)) diff.removed.push(id)

  return { sections: healedSections, ...(healedHero ? { heroTable: healedHero } : {}), summary: str(o.summary, 200), diff }
}

/** 何も変わっていないか(AI が、頼んだことを形にできなかったとき) */
export const isNoChange = (d: EditDiff) => !d.reordered && d.changed.length + d.added.length + d.moved.length + d.removed.length === 0
