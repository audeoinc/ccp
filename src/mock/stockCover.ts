// 撮影・デモ用: 在庫の持ちの材料の窓口(src/data/stockCover)の身代わり。サーバー(server/ccp/stock_cover.py)と同じ集計を、メモリ上の表で行う
import type { StockCoverInputs } from '../data/stockCover'
import { tables } from './db'

export type { StockCoverInputs }

export const StockCoverService = {
  async get(codes: string[]): Promise<StockCoverInputs> {
    const out: StockCoverInputs = {}
    for (const code of new Set(codes)) {
      // 週の新しい順に 4 週
      const rows = tables.WeeklyPerformancesService.filter((r) => r.product_code === code).sort((a, b) => String(b.week_start ?? '').localeCompare(String(a.week_start ?? ''))).slice(0, 4)
      if (rows.length === 0) continue
      out[code] = { last4: rows.reduce((n, r) => n + Number(r.units ?? 0), 0), stock: rows[0].stock == null ? null : Number(rows[0].stock) }
    }
    return out
  },
}
