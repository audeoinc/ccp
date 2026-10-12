/** アプリ: 通知を押したときに開く画面 */
export type PushLinkKind = 'campaign' | 'product' | 'category' | 'home' | 'custom'
export interface PushLink {
  kind: PushLinkKind
  /** custom のときの URL(アプリ内の画面の URL・ディープリンク) */
  url?: string
}
/** アプリ: 送る相手 */
export type Audience = 'all' | 'members' | 'inactive30' | 'notOpenedEmail'

/** 通知に収まる文字数の目安(タイトル・本文。端末で切れ方が違うので、目安) */
export const PUSH_TITLE_MAX = 40
export const PUSH_BODY_MAX = 120

/** 配信カードの cr854_pushlink(JSON)を読む */
export const parsePushLink = (v?: string): PushLink | null => {
  if (!v) return null
  try {
    const o = JSON.parse(v) as PushLink
    return o && typeof o.kind === 'string' ? o : null
  } catch {
    return null
  }
}
