// 表 category_metrics(カテゴリの週の指標。X48)の読み込み。書き込みは、サーバーの取り込み(/api/metrics。src/data/metricsImport.ts)だけ。
// 1 行 = カテゴリ × 週 × 項目。値は、外で計算し終えたもの(順位・WoW・MoM・YoY まで)。項目の一覧と、増減の読み方は src/metrics.ts。
// 撮影・デモ用のビルドでは、このファイルの読み込みを、サンプルデータに差し替える。
import { makeService } from '../gcp/services'

export interface CategoryMetric {
  id: string
  market?: string
  /** 商品の category と同じ値(tops など) */
  category?: string
  /** 週の開始日(月曜。YYYY-MM-DD) */
  week_start?: string
  /** 項目の名前(src/metrics.ts の CATEGORY_METRIC_KEYS) */
  metric?: string
  value?: number
  /** 同じ市場のカテゴリ同士での順位(1 が上)と、その母数 */
  rank?: number
  rank_of?: number
  /** 前週比 / 前月比(暦の月の同じ日まで)/ 前年比。数・金額は割合(0.05 = +5%)、率の項目は差(0.02 = +2pt) */
  wow?: number
  mom?: number
  yoy?: number
  source_file?: string
  imported_at?: string
}

interface Result<T> {
  success: boolean
  data?: T
  error?: { message: string }
}

const svc = makeService('category_metrics')

export const CategoryMetricsService = {
  getAll: (options?: { filter?: string; orderBy?: string[]; top?: number }) => svc.getAll(options) as Promise<Result<CategoryMetric[]>>,
}
