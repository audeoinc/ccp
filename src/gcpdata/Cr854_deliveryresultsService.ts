// GCP 版だけのテーブル「配信結果」(配信ごとに 1 行。server/schema.json の cr854_deliveryresults)。
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
}

export interface Cr854_deliveryresults {
  cr854_deliveryresultid: string
  _cr854_deliverycard_value?: string
  /** 送った日時(ISO) */
  cr854_sentat?: string
  /** 送った数(届いた数) */
  cr854_recipients?: number
  /** 開封した人の数(アプリは、通知をタップした人の数) */
  cr854_opens?: number
  /** リンクをクリックした人の数 */
  cr854_clicks?: number
  /** 配信から生まれた注文の数 */
  cr854_orders?: number
  /** 配信から生まれた売上 */
  cr854_revenue?: number
  /** 前年の同じ時期の、同じ種類の配信の売上(前年比に使う) */
  cr854_lastyearrevenue?: number
  /** 商品ごとの結果(JSON。ProductResult の配列) */
  cr854_products?: string
  /** リンクごとのクリック数(JSON。LinkResults。商品のリンクは cr854_products の clicks) */
  cr854_links?: string
  /** 振り返りのメモ(次に生かすこと) */
  cr854_notes?: string
}

interface Result<T> {
  success: boolean
  data?: T
  error?: { message: string }
}

type Fields = Partial<Omit<Cr854_deliveryresults, 'cr854_deliveryresultid' | '_cr854_deliverycard_value'>> & {
  'cr854_deliverycard@odata.bind'?: string
}

const svc = makeService('cr854_deliveryresults')

export const Cr854_deliveryresultsService = {
  getAll: (options?: { filter?: string; orderBy?: string[] }) => svc.getAll(options) as Promise<Result<Cr854_deliveryresults[]>>,
  create: (record: Fields) => svc.create(record) as Promise<Result<Cr854_deliveryresults>>,
  update: (id: string, fields: Fields) => svc.update(id, fields) as Promise<Result<Cr854_deliveryresults>>,
}
