// GCP 版だけのテーブル「操作の履歴」(誰が、いつ、何をしたか。server/schema.json の cr854_events)。
// 承認の履歴(バックログ W6)のために作ったが、配信カードの変更の履歴(X1)・アラートの対応(A5)でも使えるよう、種類(action)で分ける。
// Dataverse にはないので、ここで GCP 版のサービスを作る。撮影・デモ用のビルドでは、サンプルデータに差し替える。
import { makeService } from '../gcp/services'

/**
 * 操作の種類。
 * submit = 週をレビューに出した / draft = 週を下書きに戻した / confirm = 週を確定した / unconfirm = 週の確定を取り消した /
 * status = 配信のステータスを変えた(配信カードで) / reopen = 確定した週の配信を、理由を残して変えた(週はレビューに戻る)
 */
export type EventAction = 'submit' | 'draft' | 'confirm' | 'unconfirm' | 'status' | 'reopen'

export interface Cr854_events {
  cr854_eventid: string
  cr854_action?: EventAction
  /** どの週の出来事か(週の初めの日曜日。YYYY-MM-DD)。週の表示で、週ごとに出すため */
  cr854_weekstart?: string
  _cr854_deliverycard_value?: string
  /** 配信の名前(配信を消しても、履歴が読めるように、その時の名前を残す) */
  cr854_cardname?: string
  cr854_fromstatus?: number
  cr854_tostatus?: number
  /** 操作した人(ログインで人を見分けないので、画面で入れた名前) */
  cr854_actor?: string
  /** 補足(変えた理由・まとめて変えた配信の数 など) */
  cr854_note?: string
  createdon?: string
}

interface Result<T> {
  success: boolean
  data?: T
  error?: { message: string }
}

type Fields = Partial<Omit<Cr854_events, 'cr854_eventid' | '_cr854_deliverycard_value' | 'createdon'>> & {
  'cr854_deliverycard@odata.bind'?: string
}

const svc = makeService('cr854_events')

export const Cr854_eventsService = {
  getAll: (options?: { filter?: string; orderBy?: string[] }) => svc.getAll(options) as Promise<Result<Cr854_events[]>>,
  create: (record: Fields) => svc.create(record) as Promise<Result<Cr854_events>>,
}
