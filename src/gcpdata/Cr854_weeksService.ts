// GCP 版だけのテーブル「週の計画」(週のレビューの状態。server/schema.json の cr854_weeks)。
// Dataverse にはないので、ここで GCP 版のサービスを作る。撮影・デモ用のビルドでは、サンプルデータに差し替える。
import { makeService } from '../gcp/services'

/** 週の状態。draft = 下書き / review = レビュー中 / confirmed = 確定 */
export type WeekStatus = 'draft' | 'review' | 'confirmed'

export interface Cr854_weeks {
  cr854_weekid: string
  /** 週の初め(日曜日。YYYY-MM-DD)。1 週に 1 行 */
  cr854_weekstart?: string
  cr854_status?: WeekStatus
  /** レビューに出した日時(ISO) */
  cr854_submittedat?: string
  /** 確定した日時(ISO) */
  cr854_confirmedat?: string
}

interface Result<T> {
  success: boolean
  data?: T
  error?: { message: string }
}

type Fields = Partial<Omit<Cr854_weeks, 'cr854_weekid'>>

const svc = makeService('cr854_weeks')

export const Cr854_weeksService = {
  getAll: (options?: { filter?: string; orderBy?: string[] }) => svc.getAll(options) as Promise<Result<Cr854_weeks[]>>,
  create: (record: Fields) => svc.create(record) as Promise<Result<Cr854_weeks>>,
  update: (id: string, fields: Fields) => svc.update(id, fields) as Promise<Result<Cr854_weeks>>,
}
