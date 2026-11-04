// 結果のシンプルな画面のプログラム(分けて読む)。配信カード・制作の画面から同じ窓のまま切り替えるので、先に読んでおけるようにする(制作の画面と同じ作り)。
// 読み込みを待つ間に前の窓だけ閉じて、後ろのカレンダーが見えないように(2026-11-02 利用者)
import { loadChunk } from './chunkReload'

let loaded: typeof import('./results/SimpleResultsPage') | null = null

export const loadSimpleResults = () => loadChunk(() => import('./results/SimpleResultsPage')).then((m) => (loaded = m))

/** 読み終わっていれば、待たずに描ける部品(読み終わっていなければ null) */
export const loadedSimpleResults = () => loaded?.SimpleResultsPage ?? null
