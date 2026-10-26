// テンプレートの部品の、配信ごとの中身(T8 段階 6。設計は docs/TEMPLATE_OBJECTS.md の 6.1)。
// 配信カードの列 part_content に JSON で持つ(部品 ID → 文・画像)。部品 ID は版をまたいでも同じなので、版を替えても中身が付いてくる。
// テンプレートで許した部品だけを書き換える: テキストは overridable が false でないもの、画像・動画は swap が true のもの、画像のボタンは swap が false でないもの。
// ボタンの文言(段階 6 の続き。2026-10-26): テキストと同じ印 overridable(省略は書き換えてよい)・同じ入れ物 text で持つ。画像だけのボタンは文言を出さないので書き換えない
// 許していない部品の中身は、列にあっても使わない(テンプレートで「書き換えない」にしたら、テンプレートのまま)
import { getTemplate, type EmailTemplateId, type TablePart, type TemplateLayout } from './templates'
import { partsOf } from './tables'

/** 部品 1 つの、配信ごとの中身(空はテンプレートのまま) */
export interface PartValue {
  /** テキストの部品の文・ボタンの文言 */
  text?: string
  /** 画像の URL(部品の画像のライブラリから選ぶと、その URL と imageId) */
  src?: string
  imageId?: string
  /** 画像の代わりの文 */
  alt?: string
}

/** 部品 ID → 中身 */
export type PartContent = Record<string, PartValue>

// 画像の URL は、http(s) か、アプリの中の道(/ で始まる)だけ(javascript: などを入れさせない。テンプレートの画像と同じ決まり)
const url = (v: unknown): string | undefined => (typeof v === 'string' && /^(https?:\/\/|\/)/i.test(v.trim()) ? v.trim().slice(0, 1000) : undefined)
const str = (v: unknown, max: number): string | undefined => (typeof v === 'string' && v.trim() ? v.slice(0, max) : undefined)

/** 1 つの中身を整える(空の項目は外す。何もなければ null) */
function cleanValue(raw: unknown): PartValue | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const v: PartValue = {}
  const text = str(o.text, 2000)
  if (text) v.text = text
  const src = url(o.src)
  if (src) {
    v.src = src
    const imageId = str(o.imageId, 100)
    if (imageId) v.imageId = imageId
  }
  const alt = str(o.alt, 200)
  if (alt) v.alt = alt
  return Object.keys(v).length > 0 ? v : null
}

export function parsePartContent(json?: string | null): PartContent {
  if (!json) return {}
  try {
    const o = JSON.parse(json) as unknown
    if (!o || typeof o !== 'object' || Array.isArray(o)) return {}
    const out: PartContent = {}
    for (const [id, raw] of Object.entries(o as Record<string, unknown>)) {
      const v = cleanValue(raw)
      if (v && id) out[id] = v
    }
    return out
  } catch {
    return {}
  }
}

/** 保存する形(空なら空文字。列を空にする) */
export const encodePartContent = (pc: PartContent): string => {
  const clean = parsePartContent(JSON.stringify(pc))
  // 部品の順は ID の順にそろえる(足した順の違いだけで「変わった」にならないように)
  const ids = Object.keys(clean).sort()
  return ids.length > 0 ? JSON.stringify(Object.fromEntries(ids.map((id) => [id, clean[id]]))) : ''
}

/** テキストの部品で、配信ごとに書き換えてよいか */
export const canRewriteText = (p: TablePart) => p.type === 'text' && p.overridable !== false
/** 画像の部品(画像・動画の部品と、画像のボタン)で、配信ごとに差し替えてよいか */
export const canSwapImage = (p: TablePart) => (p.type === 'media' && p.swap === true) || (p.type === 'button' && !!p.face && p.swap !== false)

/** ボタンの文言を、配信ごとに書き換えてよいか(画像だけのボタンは文言を出さないので、書き換えない) */
export const canRewriteLabel = (p: TablePart) => p.type === 'button' && p.face !== 'image' && p.overridable !== false
/** 文(テキストの文・ボタンの文言)を書き換えてよいか */
export const canRewrite = (p: TablePart) => canRewriteText(p) || canRewriteLabel(p)
/** テンプレートで書き換え・差し替えを許した部品か(許していなければ、配信カードに欄を出さない) */
export const hasPartFields = (p: TablePart) => canRewrite(p) || canSwapImage(p)

/** テンプレートの文(テキストは固定の文、ボタンは文言。ボタンの文言が空のときの既定の文言は、描く側が決める) */
export const templateText = (p: TablePart): string => (p.type === 'button' ? p.label : p.text) ?? ''

/** 文(書き換えていれば、その文。テキストの文・ボタンの文言) */
export const partText = (p: TablePart, pc?: PartContent): string => (canRewrite(p) && pc?.[p.id]?.text) || templateText(p)

/** 画像の部品の画像と代わりの文(差し替えていれば、その画像) */
export function partImageOf(p: TablePart, pc?: PartContent): { src?: string; alt?: string } {
  const v = canSwapImage(p) ? pc?.[p.id] : undefined
  return v?.src ? { src: v.src, alt: v.alt ?? p.alt } : { src: p.src, alt: v?.alt ?? p.alt }
}

/** 配信の中身を重ねた部品(プレビューで描く形。テンプレートで許した所だけ、文・画像を差し替える) */
export function effectivePart(p: TablePart, pc?: PartContent): TablePart {
  if (!pc?.[p.id]) return p
  const img = partImageOf(p, pc)
  const text = partText(p, pc) || undefined
  return { ...p, ...(p.type === 'button' ? { label: text } : { text }), src: img.src, alt: img.alt, ...(img.src !== p.src ? { imageId: pc[p.id]?.imageId } : {}) }
}

/** テンプレートの部品を ID で探す(ヒーローの下の表も含む) */
export function findPart(layout: Pick<TemplateLayout, 'sections' | 'heroTable'>, id: string): TablePart | undefined {
  return [...(layout.heroTable ? [layout.heroTable] : []), ...layout.sections].flatMap((sec) => partsOf(sec)).find((p) => p.id === id)
}

/** テンプレート(表の部品)の中の、配信ごとに書き換えてよい部品 */
export function rewritableParts(layout: Pick<TemplateLayout, 'sections' | 'heroTable'>): TablePart[] {
  return [...(layout.heroTable ? [layout.heroTable] : []), ...layout.sections].flatMap((sec) => partsOf(sec)).filter((p) => canRewrite(p) || canSwapImage(p))
}

/**
 * 保存する中身に絞る: いまのテンプレートにある、書き換えてよい部品の分だけ(テキスト・ボタンの文、画像の部品の画像と代わりの文)。
 * ほかのテンプレートに替えた・部品を消したときに、使わない中身を持ち続けないため
 */
export function prunePartContent(pc: PartContent, templateId: EmailTemplateId): PartContent {
  const out: PartContent = {}
  for (const p of rewritableParts(getTemplate(templateId))) {
    const v = pc[p.id]
    if (!v) continue
    // 文を書き換えてよい部品は文、差し替えてよい画像は画像と代わりの文(画像の上に文字のボタンは、両方)
    const kept: PartValue = { ...(canRewrite(p) ? { text: v.text } : {}), ...(canSwapImage(p) ? { src: v.src, imageId: v.src ? v.imageId : undefined, alt: v.alt } : {}) }
    const clean = cleanValue(kept)
    if (clean) out[p.id] = clean
  }
  return out
}

/** 1 つの部品の中身を変えた、新しい中身(空にした項目は外し、何もなくなれば部品ごと外す = テンプレートに戻す) */
export function setPartValue(pc: PartContent, id: string, patch: Partial<PartValue> | null): PartContent {
  const next = { ...pc }
  const v = patch === null ? null : cleanValue({ ...(pc[id] ?? {}), ...patch })
  if (v) next[id] = v
  else delete next[id]
  return next
}

/** 2 つの中身が同じか(AB の案の違い・変えたかの判定) */
export const samePartContent = (a: PartContent, b: PartContent) => encodePartContent(a) === encodePartContent(b)
