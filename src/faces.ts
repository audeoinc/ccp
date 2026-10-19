// 面(計画・制作・結果)の色と名前(X38)。いまどの面にいるかを、ヘッダーの下の帯・面の名前・フロートの札で、同じ色で示す。
// 色は、メールとアプリの札(ChannelBadge の青とベリー)と重ならないものにした(同じ題名の左に並ぶため。利用者の判断 2026-10-19)

export type Face = 'calendar' | 'production' | 'results'

/** 面の色(帯・面の名前・札の文字と枠) */
export const FACE_COLOR: Record<Face, string> = {
  calendar: '#4f52b2', // 藍(インディゴ)
  production: '#c4501b', // 橙(在庫僅少の橙より、赤み寄り)
  results: '#0b7a66', // 緑(ティール寄り。「前年より上」の緑とずらす)
}

/** 面のごく薄い色(帯の地) */
export const FACE_TINT: Record<Face, string> = {
  calendar: '#eef0fb',
  production: '#fcf0ea',
  results: '#e8f5f1',
}

/** ロゴ風の面の名前(英字。帯の左端) */
export const FACE_LOGO: Record<Face, string> = {
  calendar: 'PLAN',
  production: 'PRODUCTION',
  results: 'RESULTS',
}
