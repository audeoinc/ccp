// 表「操作の履歴」(誰が、いつ、何をしたか。server/schema.json の events)。
// 承認の履歴(バックログ W6)のために作ったが、配信カードの変更の履歴(X1)・アラートの対応(A5)でも使えるよう、種類(action)で分ける。
// 撮影・デモ用のビルドでは、サンプルデータに差し替える。
import { makeService } from '../gcp/services'
import type { DeliveryCardStatus } from '../models/deliveryCards'

/**
 * 操作の種類。
 * submit = 週をレビューに出した / draft = 週を下書きに戻した / confirm = 週を確定した / unconfirm = 週の確定を取り消した /
 * status = 配信のステータスを変えた(配信カードで) / reopen = 確定した週の配信を、理由を残して変えた(週はレビューに戻る) /
 * approve = 承認した(配信 1 本、または週の検討中の配信をまとめて) / reject = 差し戻した(理由つき) /
 * revoke = 承認済みの配信の内容が変わったので、検討中に戻した(再承認が必要) /
 * bulk_create = AI でまとめて作った配信を保存した(W14) /
 * user_change = ユーザーを足した・変えた / group_change = 承認グループを足した・変えた・メンバーを出し入れした(U1。週・配信に結び付かない) /
 * rule_change = 種別ごとの承認の決まりを変えた(U3) / request = 承認を依頼した / withdraw = 承認の依頼を取り下げた(U4。approve・reject は、依頼に対する承認・差し戻しにも使う)
 */
export type EventAction = 'submit' | 'draft' | 'confirm' | 'unconfirm' | 'status' | 'reopen' | 'approve' | 'reject' | 'revoke' | 'bulk_create' | 'user_change' | 'group_change' | 'rule_change' | 'request' | 'withdraw'

export interface CardEvent {
  id: string
  action?: EventAction
  /** どの週の出来事か(週の初めの日曜日。YYYY-MM-DD)。週の表示で、週ごとに出すため */
  week_start?: string
  delivery_card_id?: string
  /** 配信の名前(配信を消しても、履歴が読めるように、その時の名前を残す) */
  card_name?: string
  from_status?: DeliveryCardStatus
  to_status?: DeliveryCardStatus
  /** 操作した人(ログインで人を見分けないので、画面で入れた名前) */
  actor?: string
  /** 補足(変えた理由・まとめて変えた配信の数 など) */
  note?: string
  created_on?: string
}

interface Result<T> {
  success: boolean
  data?: T
  error?: { message: string }
}

type Fields = Partial<Omit<CardEvent, 'id' | 'delivery_card_id' | 'created_on'>> & {
  'delivery_card_id'?: string
}

const svc = makeService('events')

export const EventsService = {
  getAll: (options?: { filter?: string; orderBy?: string[] }) => svc.getAll(options) as Promise<Result<CardEvent[]>>,
  create: (record: Fields) => svc.create(record) as Promise<Result<CardEvent>>,
}
