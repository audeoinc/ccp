// 在庫の持ちの材料(直近 4 週の販売数の合計と、いちばん新しい週の在庫)を、商品コードの一覧から 1 回でまとめて読む窓口(server/ccp/stock_cover.py)。
// 表ではなくサーバーの API。撮影・デモ用のビルド(vite.mock.config.ts)では、メモリ上の表から同じものを作る身代わり(src/mock/stockCover.ts)に差し替える。
import { appPath } from '../appRoot'

/** 商品ごとの材料。週の実績がない商品は入らない */
export type StockCoverInputs = Record<string, { last4: number; stock: number | null }>

export const StockCoverService = {
  async get(codes: string[]): Promise<StockCoverInputs> {
    const res = await fetch(appPath(`/api/stock-cover?codes=${encodeURIComponent(codes.join(','))}`))
    const json = (await res.json().catch(() => null)) as { success: boolean; data?: StockCoverInputs; error?: { message: string } } | null
    if (!json?.success || !json.data) throw new Error(json?.error?.message ?? `うまくいきませんでした(${res.status})`)
    return json.data
  },
}
