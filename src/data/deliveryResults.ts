// 表「配信結果」(配信ごとに 1 行。server/schema.json の delivery_results)。
// 配信のあとに、配信の仕組み(メール・アプリの配信サービス)の結果を取り込む。いまは CSV の取り込みと、ダミーのデータ。
// 撮影・デモ用のビルドでは、このファイルの読み込みを、サンプルデータに差し替える。
import { makeService } from '../gcp/services'

/** 商品ごとの結果(配信から商品ページへのクリック・注文) */
export interface ProductResult {
  productId: string
  clicks: number
  units: number
  revenue: number
}

/** 商品以外のリンクのクリック数。buttons は、プレビューの上から順のボタン */
export interface LinkResults {
  hero?: number
  buttons?: number[]
  /** プレビューに出ないリンク(フッターなど) */
  other?: number
  /**
   * 要素の ID(utm_content の版 3。box_2m8q.image など)ごとのクリック(T8 の 8.10)。hero・buttons・商品の clicks にも足した上で、細かい分けを残す。
   * 部品・セクションの単位は、ここから集計でまとめる
   */
  els?: Record<string, number>
}

export interface DeliveryResult {
  id: string
  delivery_card_id?: string
  /** 送った日時(ISO) */
  sent_at?: string
  /** 送った数(届いた数) */
  recipients?: number
  /** 開封した人の数(アプリは、通知をタップした人の数) */
  opens?: number
  /** リンクをクリックした人の数 */
  clicks?: number
  /** 配信から生まれた注文の数 */
  orders?: number
  /** 配信から生まれた売上 */
  revenue?: number
  /** 前年の同じ時期の、同じ種類の配信の売上(前年比に使う) */
  last_year_revenue?: number
  /** 商品ごとの結果(JSON。ProductResult の配列) */
  products?: string
  /** リンクごとのクリック数(JSON。LinkResults。商品のリンクは products の clicks) */
  links?: string
  /** 振り返りのメモ(次に生かすこと) */
  notes?: string
  /** 学び(notes)の名前。学びのカードの見出し(X78)。空なら、メモの 1 行目の先頭を出す */
  learning_title?: string
  /** AB テストの案('A'・'B'・'C'。AB テストでない配信は空。X55 の段階 2) */
  variant?: string
  /** AB テストの区分('test' = テストに回した分 / 'rollout' = 勝ち案を残りに送った分。空 = 配信全体) */
  segment?: string
}

interface Result<T> {
  success: boolean
  data?: T
  error?: { message: string }
}

type Fields = Partial<Omit<DeliveryResult, 'id' | 'delivery_card_id'>> & {
  'delivery_card_id'?: string
}

const svc = makeService('delivery_results')

export const DeliveryResultsService = {
  getAll: (options?: { filter?: string; orderBy?: string[] }) => svc.getAll(options) as Promise<Result<DeliveryResult[]>>,
  create: (record: Fields) => svc.create(record) as Promise<Result<DeliveryResult>>,
  update: (id: string, fields: Fields) => svc.update(id, fields) as Promise<Result<DeliveryResult>>,
}
