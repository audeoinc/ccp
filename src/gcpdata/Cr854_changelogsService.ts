// GCP 版だけのテーブル「変更の記録」(server/schema.json の cr854_changelogs)。
// 配信日時・商品の方針が書き換わると、サーバーが、変更前と変更後を残す(server/ccp/data_api.py の WATCHED)。
// アラートの「MD 方針の変更」「日程の変更」は、ここから作る(src/alerts.ts)。対応したら「対応済み」にする。
// 撮影・デモ用のビルドでは、このファイルの読み込みを、サンプルデータに差し替える。
import { makeService } from '../gcp/services'

export interface Cr854_changelogs {
  cr854_changelogid: string
  /** 種類: date = 配信日時の変更 / policy = 商品の方針の変更 */
  cr854_kind?: 'date' | 'policy'
  /** 変わった項目(PostgreSQL の列名: scheduled_at / stage / promo_period / policy) */
  cr854_field?: string
  cr854_before?: string
  cr854_after?: string
  /** 方針の変更: 商品コード */
  cr854_productcode?: string
  /** 日程の変更: 配信 */
  _cr854_deliverycard_value?: string
  /** 日程の変更: そのときの配信名 */
  cr854_cardname?: string
  /** 変えた人(画面で入れた名前) */
  cr854_actor?: string
  /** 対応済みにした日時・人・メモ(空は、まだ) */
  cr854_resolvedat?: string
  cr854_resolvedby?: string
  cr854_resolvenote?: string
  createdon?: string
}

interface Result<T> {
  success: boolean
  data?: T
  error?: { message: string }
}

type Fields = Partial<Omit<Cr854_changelogs, 'cr854_changelogid' | '_cr854_deliverycard_value' | 'createdon'>>

const svc = makeService('cr854_changelogs')

export const Cr854_changelogsService = {
  getAll: (options?: { filter?: string; orderBy?: string[] }) => svc.getAll(options) as Promise<Result<Cr854_changelogs[]>>,
  update: (id: string, fields: Fields) => svc.update(id, fields) as Promise<Result<Cr854_changelogs>>,
}
