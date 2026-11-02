// 配信カード(CardDetail とシンプルな配信カードの一式)のプログラム。最初の画面(カレンダー)には要らないので分けて読み、
// カレンダーを出したあとに裏で読んでおく(押したときに待たないように。optimize-survey の 3-2。2026-11-02)
import { loadChunk } from './chunkReload'

let loaded: typeof import('./CardDetail') | null = null

export const loadCardDetail = () => loadChunk(() => import('./CardDetail')).then((m) => (loaded = m))

/** 読み終わっていれば、待たずに描ける部品(読み終わっていなければ null) */
export const loadedCardDetail = () => loaded?.CardDetail ?? null
