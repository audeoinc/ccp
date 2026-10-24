// 分けて読み込む画面(App の lazy。整理 第2段 ④)が読めなかったときに、一度だけ画面を読み直す。
// 反映の前から開いていたタブは、古い版の分割ファイルの名前を取りに行く。新しい版のサーバーには、そのファイルがないので 404 になる
// (CCP は 1 日に何度も反映する)。読み直せば、新しい版の名前で読める。
// 読み直しても読めないとき(サーバーが落ちているなど)に、読み直しを繰り返さないよう、印(sessionStorage)で 2 回目は止める
// (印はタブごと。localStorage の設定の仕組み(settings.ts)とは別)
const KEY = 'ccp.chunkReloadAt'

/** まだ読み直していなければ、読み直す(読み直したら true) */
function reloadOnce(): boolean {
  try {
    if (sessionStorage.getItem(KEY)) return false
    sessionStorage.setItem(KEY, String(Date.now()))
  } catch {
    // 覚えられないときは、繰り返しを止められないので、読み直さない
    return false
  }
  window.location.reload()
  return true
}

/** 分けた画面を読む。読めたら印を消し(次の反映でも、また一度だけ読み直せるように)、読めなければ一度だけ読み直す */
export async function loadChunk<T>(load: () => Promise<T>): Promise<T> {
  try {
    const m = await load()
    try {
      sessionStorage.removeItem(KEY)
    } catch {
      /* 消せなくても、読めている */
    }
    return m
  } catch (e) {
    // 読み直す間は、待ったまま(読み込み中の表示のまま、画面が読み直される)
    if (reloadOnce()) return new Promise<T>(() => {})
    throw e
  }
}

/** Vite の先読み(分けたファイルが使う CSS・ほかのファイル)が読めなかったときも、同じく一度だけ読み直す。main.tsx で 1 回呼ぶ */
export function watchChunkErrors() {
  window.addEventListener('vite:preloadError', (e) => {
    if (reloadOnce()) e.preventDefault()
  })
}
