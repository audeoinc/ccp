// AI で作るテンプレートの下書き(T9。設計は docs/TEMPLATE_OBJECTS.md の 9 章)。AI の返答を、今の表の形に直して検査する所と、
// 「近いテンプレート」を探す所。React と AI の呼び出しを持たない(確かめのスクリプトから読めるように。呼び出しは templateAi.ts)
import { tr } from './i18n'
import { HERO_TABLE_ID, MAX_TABLE_COLS, MAX_TABLE_ROWS, newPartId, newSectionId, normalizeTable, parsePart } from './tables'
import type { HeroKind, PartType, Section, TablePart, TemplateLayout } from './templates'
import { boxCount, shapeOf, similarity } from './templateShape'

/** 入力の欄 */
export interface TemplateAiInput {
  /** 目的(何のための配信か) */
  purpose: string
  /** 載せる商品の数(箱の数) */
  itemCount: number
  /** 切り口・構成のメモ(任意) */
  angle: string
  /** 雰囲気 = メイン画像の形 */
  hero: HeroKind
}

/** AI の下書き(テンプレートの編集の新規にそのまま入れる形) */
export interface TemplateDraftOut {
  name: string
  description: string
  hero: HeroKind
  heroText: 'below'
  sections: Section[]
  heroTable?: Section
  /** この構成にした理由(画面に出すだけ。保存しない) */
  reason: string
}

/** 1 つのテンプレートに置けるセクションの数(layoutTemplates.ts の MAX_SECTIONS と同じ) */
const MAX_SECTIONS = 8
const HEROES: HeroKind[] = ['standard', 'collab', 'offer']
// AI が置いてよい部品(空き・ほかの種類は使わせない。空いたマスは読むときに空きで埋める)
const AI_TYPES: PartType[] = ['box', 'button', 'text', 'media', 'line', 'spacer']
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

/** 行の部品の並びを、表の部品にする(幅を左から足していき、行の幅は表の列の上限まで。はみ出す部品は外す) */
function rowParts(row: unknown, r: number): TablePart[] {
  if (!Array.isArray(row)) return []
  const out: TablePart[] = []
  let c = 0
  for (const raw of row) {
    const o = (raw ?? {}) as Record<string, unknown>
    const type = o.type as PartType
    if (!AI_TYPES.includes(type)) continue
    const w = Math.max(1, Math.min(MAX_TABLE_COLS, Math.round(typeof o.w === 'number' ? o.w : 1)))
    if (c + w > MAX_TABLE_COLS) break
    // 新しい ID を付け、位置・大きさを決めてから、今の読み方(parsePart)に通す(知らない値は、ここで外れる)
    const p = parsePart({ ...o, id: newPartId(type), type, c, r, w, h: 1 })
    if (p) out.push(p)
    c += w
  }
  return out
}

/** AI の返答を、テンプレートの下書きにする。形が読めなければ null(作り直しを促す) */
export function parseTemplateDraft(raw: unknown): TemplateDraftOut | null {
  const o = (raw ?? {}) as Record<string, unknown>
  if (!Array.isArray(o.sections)) return null
  const sections: Section[] = []
  for (const sraw of o.sections.slice(0, MAX_SECTIONS)) {
    const so = (sraw ?? {}) as Record<string, unknown>
    const rows = Array.isArray(so.rows) ? so.rows.slice(0, MAX_TABLE_ROWS) : []
    const parts = rows.flatMap((row, r) => rowParts(row, r))
    if (parts.length === 0) continue
    const cols = Math.max(1, ...parts.map((p) => p.c + p.w))
    const name = str(so.name, 40)
    const aiNote = str(so.aiNote, 300)
    sections.push(
      normalizeTable({
        kind: 'table',
        id: newSectionId(),
        cols,
        rows: rows.length,
        parts,
        slots: 0,
        ...(name ? { name } : {}),
        ...(so.heading === true ? { categoryHeading: true } : {}),
        ...(so.copy === false ? { copy: false } : {}),
        ...(aiNote ? { aiNote } : {}),
      }),
    )
  }
  if (sections.length === 0) return null
  // メイン画像の下のボタン(文言があれば。ヒーローの下の表 sec_hero)
  const heroButton = str(o.heroButton, 30)
  const btn = heroButton ? parsePart({ id: newPartId('button'), type: 'button', c: 0, r: 0, w: 1, h: 1, label: heroButton }) : null
  const heroTable = btn ? normalizeTable({ kind: 'table', id: HERO_TABLE_ID, cols: 1, rows: 1, parts: [btn], slots: 0, copy: false }) : undefined
  return {
    name: str(o.name, 40) || tr('AI の下書き', 'AI draft'),
    description: str(o.description, 120),
    hero: HEROES.includes(o.hero as HeroKind) ? (o.hero as HeroKind) : 'standard',
    heroText: 'below',
    sections,
    ...(heroTable ? { heroTable } : {}),
    reason: str(o.reason, 200),
  }
}

/** 下書きを、比べるための構成にする */
export const layoutOfDraft = (d: TemplateDraftOut): TemplateLayout => ({ hero: d.hero, heroText: d.heroText, sections: d.sections, ...(d.heroTable ? { heroTable: d.heroTable } : {}) })

export interface NearTemplate {
  id: string
  label: string
  /** 同じ構成(見た目の設定のほかは同じ) */
  same: boolean
  /** 似ている度(0〜1) */
  score: number
}

/**
 * 近いテンプレートを、似ている順に 3 つまで。
 * 作る前(draft なし): 箱の数とメイン画像の形が同じもの。作ったあと: 同じ構成か、似ている度 0.5 以上(箱の数が同じものを先に)
 */
export function nearTemplates(options: ({ id: string; label: string } & TemplateLayout)[], input: Pick<TemplateAiInput, 'itemCount' | 'hero'>, draft?: TemplateLayout): NearTemplate[] {
  const list = options.filter((o) => o.id !== 'free')
  if (!draft) {
    return list
      .filter((o) => boxCount(o) === input.itemCount && o.hero === input.hero)
      .map((o) => ({ id: o.id, label: o.label, same: false, score: 1 }))
      .slice(0, 3)
  }
  const mine = shapeOf(draft)
  const n = boxCount(draft)
  return list
    .map((o) => ({ id: o.id, label: o.label, same: shapeOf(o) === mine, score: similarity(draft, o), count: boxCount(o) === n }))
    .filter((x) => x.same || x.score >= 0.5)
    .sort((a, b) => Number(b.same) - Number(a.same) || Number(b.count) - Number(a.count) || b.score - a.score)
    .slice(0, 3)
    .map(({ id, label, same, score }) => ({ id, label, same, score }))
}
