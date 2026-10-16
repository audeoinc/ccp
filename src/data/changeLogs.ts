// 表「変更の記録」(server/schema.json の change_logs)。
// 配信日時・商品の方針が書き換わると、サーバーが、変更前と変更後を残す(server/ccp/data_api.py の WATCHED)。
// アラートの「MD 方針の変更」「日程の変更」は、ここから作る(src/alerts.ts)。対応したら「対応済み」にする。
// 撮影・デモ用のビルドでは、このファイルの読み込みを、サンプルデータに差し替える。
import { makeService } from '../gcp/services'

export interface ChangeLog {
  id: string
  /** 種類: date = 配信日時の変更 / policy = 商品の方針の変更 */
  kind?: 'date' | 'policy'
  /** 変わった項目(PostgreSQL の列名: scheduled_at / stage / promo_period / policy) */
  field?: string
  before_value?: string
  after_value?: string
  /** 方針の変更: 商品コード */
  product_code?: string
  /** 日程の変更: 配信 */
  delivery_card_id?: string
  /** 日程の変更: そのときの配信名 */
  card_name?: string
  /** 変えた人(画面で入れた名前) */
  actor?: string
  /** 対応済みにした日時・人・メモ(空は、まだ) */
  resolved_at?: string
  resolved_by?: string
  resolve_note?: string
  created_on?: string
}

interface Result<T> {
  success: boolean
  data?: T
  error?: { message: string }
}

type Fields = Partial<Omit<ChangeLog, 'id' | 'delivery_card_id' | 'created_on'>>

const svc = makeService('change_logs')

export const ChangeLogsService = {
  getAll: (options?: { filter?: string; orderBy?: string[] }) => svc.getAll(options) as Promise<Result<ChangeLog[]>>,
  update: (id: string, fields: Fields) => svc.update(id, fields) as Promise<Result<ChangeLog>>,
}
