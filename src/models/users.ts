// 表 users(ユーザーマスタ)の、1 行の型と選択肢。列を変えたら、server/schema.json と一緒に直す(scripts/check-schema.mjs が食い違いを見つける)。
// 設計は docs/APPROVAL.md。メールアドレスが、本人を見分けるかぎ(ログインが入ったら、ログインしたメールアドレスで行を引く。通知の宛先にもなる)

export const UserRole = {
  member: 'メンバー',
  admin: '管理者',
} as const
export type UserRole = keyof typeof UserRole

export const UserStatus = {
  active: '有効',
  inactive: '無効',
} as const
export type UserStatus = keyof typeof UserStatus

/** 書き込める列 */
export interface UserFields {
  name: string
  email?: string
  /** 管理者は、ログインが入ったら、ユーザー・承認グループを編集できる人になる(いまは印だけ) */
  role?: UserRole
  /** やめた人は、消さずに無効にする(履歴・承認の記録に名前が残るように) */
  status?: UserStatus
}

/** 読んだ 1 行 */
export interface User extends UserFields {
  id: string
  created_on?: string
  modified_on?: string
}
