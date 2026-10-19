// 配信の対象(X40): 誰に向けて作る配信か。性別・年代(と、アプリの送る相手)。AI の下書きと、商品の候補の前提にする。
// 「指定なし」は空の値。AI には何も伝えず、商品も絞らない
import { tr } from './i18n'
import type { Product } from './models/products'

export type TargetGender = '' | 'women' | 'men'
export const TARGET_GENDERS: Exclude<TargetGender, ''>[] = ['women', 'men']
export const genderLabel = (g: TargetGender): string => (g === 'women' ? tr('女性', 'Women') : g === 'men' ? tr('男性', 'Men') : tr('指定なし', 'Not specified'))

/** 年代(複数選べる。保存はカンマでつないだ文字) */
export const AGE_BANDS = ['10s', '20s', '30s', '40s', '50s'] as const
export type AgeBand = (typeof AGE_BANDS)[number]
export const ageLabel = (a: AgeBand): string => (a === '50s' ? tr('50代以上', '50+') : tr(`${a.slice(0, 2)}代`, `${a.slice(0, 2)}s`))
export const parseAges = (v?: string | null): AgeBand[] => (v ?? '').split(',').filter((x): x is AgeBand => (AGE_BANDS as readonly string[]).includes(x))
export const formatAges = (list: AgeBand[]): string => AGE_BANDS.filter((a) => list.includes(a)).join(',')

/** アプリの送る相手(これまで ⑥ 時刻・相手 にあったもの) */
export const AUDIENCES = ['all', 'members', 'inactive30', 'notOpenedEmail'] as const
export const audienceLabel = (v: string): string =>
  ({
    all: tr('アプリの利用者全員', 'All app users'),
    members: tr('会員だけ', 'Members only'),
    inactive30: tr('30 日以上、アプリを開いていない人', 'Inactive for 30+ days'),
    notOpenedEmail: tr('同じ施策のメールを開いていない人', 'Did not open the related email'),
  })[v] ?? v

/** AI に渡す、配信の対象の文(例: 「女性・20代・30代・会員だけ」)。指定がなければ undefined */
export function targetText(a: { gender?: string | null; ages?: string | null; audience?: string | null }): string | undefined {
  const parts = [
    a.gender === 'women' || a.gender === 'men' ? genderLabel(a.gender) : '',
    ...parseAges(a.ages).map(ageLabel),
    a.audience ? audienceLabel(a.audience) : '',
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(tr('・', ', ')) : undefined
}

/** 商品の性別(BigQuery の gender。mens / womens / unisex)。ない商品は、どちらにも出す */
export function fitsTarget(p: Pick<Product, 'gender'>, g?: string | null): boolean {
  if (g !== 'women' && g !== 'men') return true
  if (!p.gender || p.gender === 'unisex') return true
  return g === 'women' ? p.gender === 'womens' : p.gender === 'mens'
}

export const productGenderLabel = (v?: string | null): string =>
  v === 'womens' ? tr('ウィメンズ', 'Womens') : v === 'mens' ? tr('メンズ', 'Mens') : v === 'unisex' ? tr('ユニセックス', 'Unisex') : ''
