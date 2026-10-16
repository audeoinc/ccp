// テーマの種類を、配信の言葉から推し量る(AI で分けるまでの仮の種類)。
// 撮影用の AI の身代わり(src/mock/agent.ts)からも使うので、ほかのファイルを読み込まない(読み込みの輪を作らないため)
export type ThemeType = 'price' | 'sale' | 'new' | 'member' | 'season' | 'restock' | 'other'

// 言葉から推し量る(AI で分けるまでの仮の種類。上から順に、先に当たったもの)
const RULES: [ThemeType, RegExp][] = [
  ['price', /値下げ|プライスダウン|price ?drop|markdown|price cut/i],
  ['restock', /再入荷|restock|back in stock/i],
  ['member', /会員|メンバー|member|loyalty|vip/i],
  ['sale', /セール|sale|deal|offer|割引|% ?off|black friday|ブラックフライデー|last call|ラストコール|limited/i],
  ['new', /新作|新着|new|arrival|先取り|launch|入荷/i],
  ['season', /秋|冬|春|夏|季節|ハロウィン|holiday|halloween|fall|autumn|winter|spring|summer|雨|rain|cozy|layer|knit|outer|アウター|ニット|ブーツ|boots/i],
]

/** 配信の言葉(配信名・テーマ・見出し)から、種類を推し量る */
export function guessThemeType(c: { name?: string; theme?: string; headline?: string }): ThemeType {
  const text = [c.name, c.theme, c.headline].filter(Boolean).join(' ')
  return RULES.find(([, re]) => re.test(text))?.[0] ?? 'other'
}

