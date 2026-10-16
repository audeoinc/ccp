// テーマの種類(値下げ・セール・新作 など)。テーマは自由な文なので、そのままでは「同じ種類の過去の配信」を集められない。
// 配信カードに種類を持たせ(theme_type)、結果を、同じ種類の過去の配信と比べるのに使う。
// 種類は AI が分け(classifyThemeTypes)、人が直せる。まだ分けていない配信は、言葉から推し量った種類(guessThemeType)で扱う。
import type { DeliveryCard } from './models/deliveryCards'
import { askAgent } from './aiSelect'
import { tr } from './i18n'

import { guessThemeType, type ThemeType } from './themeGuess'

export { guessThemeType, type ThemeType }

/** 種類の一覧(画面の並び順) */
export const THEME_TYPES: ThemeType[] = ['price', 'sale', 'new', 'member', 'season', 'restock', 'other']

export function themeTypeLabel(v: ThemeType): string {
  switch (v) {
    case 'price':
      return tr('値下げ', 'Price drop')
    case 'sale':
      return tr('セール', 'Sale')
    case 'new':
      return tr('新作', 'New arrivals')
    case 'member':
      return tr('会員向け', 'Members')
    case 'season':
      return tr('季節の特集', 'Seasonal feature')
    case 'restock':
      return tr('再入荷', 'Restock')
    default:
      return tr('その他', 'Other')
  }
}

const isThemeType = (v: unknown): v is ThemeType => typeof v === 'string' && (THEME_TYPES as string[]).includes(v)

/** 配信の種類(入っていれば、それ。なければ、推し量った種類) */
export function themeTypeOf(c: DeliveryCard): { type: ThemeType; guessed: boolean } {
  return isThemeType(c.theme_type) ? { type: c.theme_type, guessed: false } : { type: guessThemeType(c), guessed: true }
}

const CLASSIFY_PROMPT = `あなたは、ファッション通販の配信(メール・プッシュ)の企画を手伝うアシスタントです。
下の「入力」の JSON の deliveries(配信の一覧)を読み、それぞれの配信の「テーマの種類」を、次の中から 1 つ選んで、JSON だけで返してください。

# 種類
- price: 値下げ(特定の商品の価格を下げた知らせ)
- sale: セール(期間限定の割引・タイムセール・ブラックフライデーなど)
- new: 新作(新しく入った商品・先取り)
- member: 会員向け(会員限定・会員感謝)
- season: 季節の特集(季節・行事・天候に合わせた着こなしや商品の特集)
- restock: 再入荷
- other: どれにも当てはまらない

# 出力の形式(厳守)
次の JSON オブジェクト 1 つだけを返す。JSON の外には、説明文、コードフェンス、前置き、あとがきを一切付けない。
{"types":[{"id":"...","type":"price | sale | new | member | season | restock | other"}]}

# ルール
1. 入力のすべての配信について、id をそのまま返す。
2. 迷ったら、配信の目的(何を売りたいか)で選ぶ。割引が主ならセール、季節の着こなしが主なら季節の特集。

# 入力
`

/** AI で、配信のテーマの種類を分ける。返すのは、配信 ID → 種類 */
export async function classifyThemeTypes(cards: DeliveryCard[]): Promise<Map<string, ThemeType>> {
  const deliveries = cards.map((c) => ({ id: c.id, name: c.name ?? '', theme: c.theme ?? '', headline: c.headline ?? '', copy: c.copy ?? '' }))
  const parsed = (await askAgent(CLASSIFY_PROMPT, { task: 'classify_theme_types', deliveries })) as { types?: { id?: string; type?: string }[] }
  if (!parsed.types) throw new Error(tr('テーマの種類を取得できませんでした', 'Could not get theme types'))
  return new Map(parsed.types.filter((x) => x.id && isThemeType(x.type)).map((x) => [String(x.id), x.type as ThemeType]))
}
