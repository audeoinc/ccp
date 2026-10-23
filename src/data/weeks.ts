// 表「週の計画」(週のレビューの状態。server/schema.json の weeks)。
// 撮影・デモ用のビルドでは、サンプルデータに差し替える。
import { makeService } from '../gcp/services'

/** 週の状態。draft = 下書き / review = レビュー中 / confirmed = 確定 */
export type WeekStatus = 'draft' | 'review' | 'confirmed'

export interface WeekRow {
  id: string
  /** 週の初め(日曜日。YYYY-MM-DD)。週・国・チャネルで 1 行(ST3・W8) */
  week_start?: string
  /** 国のコード。空の行は国を分ける前の行で、その週のすべての国・チャネルに効く(国とチャネルの行がなければ使う) */
  country?: string
  /** チャネル(email / app)。メールとアプリの計画を、別の人・別のときに確定できるように分ける */
  channel?: string
  status?: WeekStatus
  /** レビューに出した日時(ISO) */
  submitted_at?: string
  /** 確定した日時(ISO) */
  confirmed_at?: string
  /** この週の振り返りのメモ(結果の面で書き、翌週の計画の面に出す。FLOWS の C-7) */
  retro?: string
}

interface Result<T> {
  success: boolean
  data?: T
  error?: { message: string }
}

type Fields = Partial<Omit<WeekRow, 'id'>>

const svc = makeService('weeks')

export const WeeksService = {
  getAll: (options?: { filter?: string; orderBy?: string[] }) => svc.getAll(options) as Promise<Result<WeekRow[]>>,
  create: (record: Fields) => svc.create(record) as Promise<Result<WeekRow>>,
  update: (id: string, fields: Fields) => svc.update(id, fields) as Promise<Result<WeekRow>>,
}
