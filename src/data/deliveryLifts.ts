// 表「配信の増分」(server/schema.json の delivery_lifts)。配信ごとに、送った群とホールドアウト(わざと送らなかった群)の、期間中の購買を比べる。
// 配信結果(delivery_results)の売上は「配信を通った売上」で、配信がなくても生まれた売上を含む。増分は、ホールドアウトとの差で測る。
// 本来は、配信の仕組みでホールドアウトを作り、顧客ごとの購買をデータ基盤で集計して取り込む。いまは見本(src/impact.ts・server/ccp/impact.py)。
import { tableService } from '../gcp/services'

export interface DeliveryLiftFields {
  delivery_card_id?: string
  /** 送らなかった割合(0〜1) */
  holdout_rate?: number
  /** 購買を数えた日数(配信の日から) */
  window_days?: number
  /** 送った群・送らなかった群の人数 */
  treated_users?: number
  holdout_users?: number
  /** 期間中の注文(店舗・EC・配信を通らない分も含む) */
  treated_orders?: number
  holdout_orders?: number
  /** 期間中の売上(同上) */
  treated_revenue?: number
  holdout_revenue?: number
  /** 1 = 見本の行 */
  sample?: number
}

export interface DeliveryLift extends DeliveryLiftFields {
  id: string
  created_on?: string
}

export const DeliveryLiftsService = tableService<DeliveryLift, DeliveryLiftFields>('delivery_lifts')
