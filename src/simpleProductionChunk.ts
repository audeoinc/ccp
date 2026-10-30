// 制作のシンプルな画面のプログラム(分けて読む)。配信カードから同じ窓のまま切り替えるので、先に読んでおけるようにする。
// 最初の切り替えで読み込みを待つ間、配信カードは閉じたのに制作の画面がまだ出ず、後ろのカレンダーが見えていた(2026-10-30 利用者)
import { loadChunk } from './chunkReload'

let loaded: typeof import('./production/SimpleProductionPage') | null = null

export const loadSimpleProduction = () => loadChunk(() => import('./production/SimpleProductionPage')).then((m) => (loaded = m))

/** 読み終わっていれば、待たずに描ける部品(読み終わっていなければ null) */
export const loadedSimpleProduction = () => loaded?.SimpleProductionPage ?? null
