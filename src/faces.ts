// 面(計画・制作・結果)の色と名前(X38)。いまどの面にいるかを、ヘッダーの下の帯・面の名前・フロートの札で、同じ色で示す。
// 色は、メールとアプリの札(ChannelBadge の青とベリー)と重ならないものにした(同じ題名の左に並ぶため。利用者の判断 2026-10-19)

export type Face = 'calendar' | 'production' | 'results'

// 色は CSS の変数で持つ。明るいテーマは、変数がないときの色(下の値)をそのまま使い、暗いテーマだけ index.css で変数を入れる
// (以前は明るいテーマの色を直に書いていて、暗いテーマでも白っぽい帯になっていた。整理 第2段 ⑧)

/** 面の色(帯・面の名前・札の文字と枠) */
export const FACE_COLOR: Record<Face, string> = {
  calendar: 'var(--ccp-face-calendar, #4f52b2)', // 藍(インディゴ)
  production: 'var(--ccp-face-production, #c4501b)', // 橙(在庫僅少の橙より、赤み寄り)
  results: 'var(--ccp-face-results, #0b7a66)', // 緑(ティール寄り。「前年より上」の緑とずらす)
}

/** 面のごく薄い色(帯の地) */
export const FACE_TINT: Record<Face, string> = {
  calendar: 'var(--ccp-face-calendar-tint, #eef0fb)',
  production: 'var(--ccp-face-production-tint, #fcf0ea)',
  results: 'var(--ccp-face-results-tint, #e8f5f1)',
}

/** ロゴ風の面の名前(英字。帯の左端) */
export const FACE_LOGO: Record<Face, string> = {
  calendar: 'PLAN',
  production: 'PRODUCTION',
  results: 'RESULTS',
}
