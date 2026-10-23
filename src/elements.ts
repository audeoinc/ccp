// 部品の中の要素(写真・名前・価格・ボタンの文言など)と、その ID(T8 の 8.4。設計は docs/TEMPLATE_OBJECTS.md の 8.4)。
// 要素の ID は「部品 ID ＋ 要素の名前」(例 box_2m8q.image)。新しい乱数の ID は作らない:
// 部品の形が変われば部品 ID と一緒に新しくなり、見せ方・文言・説明を変えても変わらない。計測(UTM)・ピン・分析は、この ID で数える

import { tr } from './i18n'
import { HERO_TABLE_ID, boxFields } from './tables'
import type { TablePart } from './templates'

export interface PartElement {
  /** 要素の名前(部品の中で一意。image / name / price …) */
  key: string
  /** 要素の ID(部品 ID.要素の名前) */
  id: string
  /** 文字か画像か */
  kind: 'text' | 'image'
  /** 押せる(メールの中でリンクになる)かの既定 */
  click: boolean
}

/** 要素の名前の画面の呼び名 */
export const elementLabel = (key: string): string =>
  ({
    image: tr('写真', 'photo'),
    name: tr('名前', 'name'),
    price: tr('価格', 'price'),
    swatches: tr('カラーチップ', 'color chips'),
    rating: tr('レビュー', 'reviews'),
    badge: tr('バッジ', 'badge'),
    desc: tr('説明', 'description'),
    button: tr('ボタン', 'button'),
    label: tr('文言', 'label'),
    text: tr('文', 'text'),
    headline: tr('ヘッドライン', 'headline'),
    copy: tr('コピー', 'copy'),
  })[key] ?? key

const el = (partId: string, key: string, kind: 'text' | 'image', click: boolean): PartElement => ({ key, id: `${partId}.${key}`, kind, click })

/**
 * 部品の要素の一覧(メールに出る順)。箱は、出すもの(fields)に入っているものだけ。
 * 押せるの既定: 写真・名前・ボタンは押せる / 価格・バッジ・説明・文は押せない
 */
export function partElements(p: TablePart): PartElement[] {
  if (p.type === 'box') {
    const fields = boxFields(p)
    return [el(p.id, 'image', 'image', true), ...fields.map((f) => el(p.id, f, 'text', f === 'name' || f === 'button'))]
  }
  // 画像のボタンは、画像と文言を別の要素に(画像だけのときは、文言はメールに出ない)
  if (p.type === 'button') return p.face === 'image' ? [el(p.id, 'image', 'image', true)] : p.face === 'both' ? [el(p.id, 'image', 'image', true), el(p.id, 'label', 'text', true)] : [el(p.id, 'label', 'text', true)]
  if (p.type === 'text') return [el(p.id, 'text', 'text', false)]
  if (p.type === 'media') return [el(p.id, 'image', 'image', true)]
  return []
}

/** ヒーローの要素(ヒーローのセクション sec_hero の中。ヒーローの下の表の部品は、それぞれの部品 ID で数える) */
export const heroElements = (): PartElement[] => [el(HERO_TABLE_ID, 'image', 'image', true), el(HERO_TABLE_ID, 'headline', 'text', false), el(HERO_TABLE_ID, 'copy', 'text', false)]

/** 要素の説明(書いていなければ、場所から自動で作る。例「S1 箱 1 の写真」) */
export const elementDesc = (p: TablePart, e: PartElement, where: string): string => p.els?.[e.key]?.desc || tr(`${where} の${elementLabel(e.key)}`, `${where} ${elementLabel(e.key)}`)

/** 要素が押せるか(要素ごとに切り替えたものが優先) */
export const elementClickable = (p: TablePart, e: PartElement): boolean => p.els?.[e.key]?.click ?? e.click
