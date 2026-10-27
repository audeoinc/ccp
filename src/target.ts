// 配信の対象(X40): 誰に向けて作る配信か。性別・年代と、送る相手(メールとアプリ)。AI の下書きと、商品の候補の前提にする。
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

/**
 * 送る相手。メールでもアプリでも、同じ列(delivery_cards.audience)・同じ欄で決める(2026-10-27 利用者の決め: 分ける必然はない)。
 * 選べる値はチャネルで少し違う: 「同じ施策のメールを開いていない人」(notOpenedEmail)は、アプリからメールを開かなかった人に送るための区分なのでアプリだけ、
 * 「前回のメールを開いていない人」(notOpenedLast)はメールだけ
 */
export const AUDIENCES = ['all', 'members', 'inactive30', 'notOpenedEmail', 'notOpenedLast'] as const
export type AudienceChannel = 'email' | 'push'
/** そのチャネルで選べる送る相手 */
export const audiencesFor = (channel: AudienceChannel): string[] =>
  channel === 'push' ? ['all', 'members', 'inactive30', 'notOpenedEmail'] : ['all', 'members', 'inactive30', 'notOpenedLast']
/** 送る相手がそのチャネルで決まっているか(チャネルを替えて、そのチャネルにない値が残っているときは、決まっていない) */
export const audienceSet = (v: string | null | undefined, channel: AudienceChannel): boolean => !!v && audiencesFor(channel).includes(v)
/** 送る相手の名前。全員・30 日休眠はチャネルで言い方を変える(チャネルが分からなければ、どちらでも通じる言い方) */
export const audienceLabel = (v: string, channel?: AudienceChannel): string =>
  ({
    all: channel === 'push' ? tr('アプリの利用者全員', 'All app users') : channel === 'email' ? tr('メールの配信先全員', 'All email subscribers') : tr('全員', 'Everyone'),
    members: tr('会員だけ', 'Members only'),
    inactive30: channel === 'push' ? tr('30 日以上、アプリを開いていない人', 'Inactive for 30+ days') : tr('30 日以上、休眠している人', 'Dormant for 30+ days'),
    notOpenedEmail: tr('同じ施策のメールを開いていない人', 'Did not open the related email'),
    notOpenedLast: tr('前回のメールを開いていない人', 'Did not open the last email'),
  })[v] ?? v

/** AI に渡す、配信の対象の文(例: 「女性・20代・30代・会員だけ」)。指定がなければ undefined */
export function targetText(a: { gender?: string | null; ages?: string | null; audience?: string | null; channel?: AudienceChannel }): string | undefined {
  const parts = [
    a.gender === 'women' || a.gender === 'men' ? genderLabel(a.gender) : '',
    ...parseAges(a.ages).map(ageLabel),
    a.audience && (!a.channel || audienceSet(a.audience, a.channel)) ? audienceLabel(a.audience, a.channel) : '',
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
