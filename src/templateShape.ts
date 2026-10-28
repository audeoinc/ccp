// テンプレートの構成の形と、似ている度(テンプレートの管理の「同じ構成」・AI で作るときの「近いテンプレート」。T9)
import { boxesOf, toTableLayout } from './tables'
import type { Section, TemplateLayout } from './templates'

/** セクションの形(表に直して、部品の種類・位置・大きさ・見せ方)。ID・文言・見出しは比べない */
export const sectionShape = (sec: Section) =>
  JSON.stringify([sec.cols, sec.rows, [...(sec.parts ?? [])].sort((a, b) => a.r - b.r || a.c - b.c).map((p) => [p.type, p.c, p.r, p.w, p.h, p.view ?? 'card'])])
/** 構成の形の並び。以前の種類のテンプレートも、表に直してから比べる(同じ見た目なら、同じ形になる) */
export const shapesOf = (l: TemplateLayout) => {
  const t = toTableLayout(l)
  return [...(t.heroTable ? ['hero:' + sectionShape(t.heroTable)] : []), ...t.sections.map(sectionShape)]
}
/** 構成の形。同じなら、見た目の設定のほかは同じテンプレート */
export const shapeOf = (l: TemplateLayout) => JSON.stringify(shapesOf(l))
/** 似ている度(0〜1): セクションの形の並びが、どれだけ同じ順に重なるか(最長共通部分列 ÷ 長いほうの数) */
export const similarity = (a: TemplateLayout, b: TemplateLayout) => {
  const x = shapesOf(a)
  const y = shapesOf(b)
  if (x.length === 0 || y.length === 0) return 0
  const dp = Array.from({ length: x.length + 1 }, () => new Array<number>(y.length + 1).fill(0))
  for (let i = 1; i <= x.length; i++) for (let j = 1; j <= y.length; j++) dp[i][j] = x[i - 1] === y[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1])
  return dp[x.length][y.length] / Math.max(x.length, y.length)
}

/** 商品の枠(箱)の数。以前の種類のテンプレートも、表に直して数える */
export const boxCount = (l: TemplateLayout): number => toTableLayout(l).sections.reduce((n, sec) => n + boxesOf(sec).length, 0)

/** この似ている度から上を「よく似ている」として、編集中の「似ているテンプレート」の知らせに出す */
export const VERY_SIMILAR = 0.8

/** セクションの呼び名(編集の構成の一覧と同じ形: S1 主役 · 2 × 2 · 商品 4) */
export const sectionTitle = (sec: Section, i: number, t: (ja: string, en: string) => string) =>
  `S${i + 1}${sec.name?.trim() ? ` ${sec.name.trim()}` : ''} · ${(sec.rows ?? 0) > 0 ? `${sec.cols} × ${sec.rows}` : t('空', 'empty')} · ${t(`商品 ${sec.slots}`, `${sec.slots} items`)}`
