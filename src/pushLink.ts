import type { AppScreen } from './links'
/** アプリ: 通知を押したときに開く画面(message = この配信のメッセージ。既定) */
export type PushLinkKind = 'message' | 'campaign' | 'product' | 'category' | 'home' | 'custom'
export interface PushLink {
  kind: PushLinkKind
  /** custom のときの、アプリの画面の名前(FCM の data の screen) */
  url?: string
}
/** アプリ: 送る相手 */
export type Audience = 'all' | 'members' | 'inactive30' | 'notOpenedEmail'

/** 通知に収まる文字数の目安(タイトル・本文。端末で切れ方が違うので、目安) */
export const PUSH_TITLE_MAX = 40
export const PUSH_BODY_MAX = 120

/** 配信カードの push_link(JSON)を読む */
export const parsePushLink = (v?: string): PushLink | null => {
  if (!v) return null
  try {
    const o = JSON.parse(v) as PushLink
    return o && typeof o.kind === 'string' ? o : null
  } catch {
    return null
  }
}

/** 通知を押したときに開く画面が決まっているか(画面の名前を指定するときは、名前が要る) */
export const tapComplete = (l: PushLink | null | undefined): boolean => !!l?.kind && (l.kind !== 'custom' || !!l.url?.trim())

/**
 * 通知を押したときに開く画面を、アプリの画面の指定(src/links.ts の AppScreen)にする。
 * 商品・カテゴリは、紹介する商品(メッセージの最初の商品)から決める
 */
export function tapScreen(l: PushLink | null | undefined, first?: { product_code?: string; category?: string }): AppScreen | null {
  if (!tapComplete(l)) return null
  switch (l!.kind) {
    case 'product':
      return { kind: 'product', value: first?.product_code }
    case 'category':
      return { kind: 'category', value: first?.category }
    case 'custom':
      return { kind: 'custom', value: l!.url }
    default:
      return { kind: l!.kind }
  }
}
