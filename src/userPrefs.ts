// 人の設定を、ユーザーごとに保存する(バックログ ST6。サーバーは server/ccp/prefs.py)。
// 人の設定(ペインの幅・フロートの大きさ・言語・表示の大きさ・閉じたヒントなど)は、これまでどおり localStorage に読み書きする。
// ログインしている人がいれば、開いたときにその人の設定を localStorage に入れてから描き、変わった値をサーバーへ写す。
// ログインがなければ何もしない(人 = ブラウザのまま)。
//
// 書き込みは約 50 か所から localStorage.setItem を直接呼んでいるので、1 つずつ直さずに、ここで Storage の書き込みを拾う
// (直し漏れで、一部の設定だけ人に付いてこない、ということを避けるため。値の形もそれぞれのまま)。
import { appPath } from './appRoot'

// 送らない鍵(人を見分ける記録・書きかけ・開発用の画面の記録。だれの設定でもなく、そのブラウザのもの)
const LOCAL_ONLY = ['me.', 'comment.author', 'devRequest.', 'ccp-dev-']
const isShared = (key: string) => !LOCAL_ONLY.some((p) => key.startsWith(p))
// 開いたときに待つ長さ。DB が起きていないなどで返らなければ、ブラウザの値のまま描く(画面を待たせないため)
const WAIT_MS = 1500
const FLUSH_MS = 1000

const pending = new Map<string, string | null>()
let timer: ReturnType<typeof setTimeout> | undefined

function flush(keepalive = false) {
  clearTimeout(timer)
  timer = undefined
  if (!pending.size) return
  const set = Object.fromEntries(pending)
  pending.clear()
  // 送れなくても、ブラウザには残っている(次に変えたときに、また送る)
  void fetch(appPath('/api/prefs'), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ set }), keepalive }).catch(() => {})
}

function queue(key: string, value: string | null) {
  if (!isShared(key)) return
  pending.set(key, value)
  if (timer === undefined) timer = setTimeout(() => flush(), FLUSH_MS)
}

/** localStorage への書き込みを拾って、サーバーに写す(ログインしている人がいるときだけ呼ぶ) */
function watchWrites() {
  const proto = Storage.prototype
  const setItem = proto.setItem
  const removeItem = proto.removeItem
  proto.setItem = function (this: Storage, key: string, value: string) {
    setItem.call(this, key, value)
    if (this === window.localStorage) queue(key, String(value))
  }
  proto.removeItem = function (this: Storage, key: string) {
    removeItem.call(this, key)
    if (this === window.localStorage) queue(key, null)
  }
  // 幅を変えてすぐ閉じたときも、送り残さない
  window.addEventListener('pagehide', () => flush(true))
}

/**
 * 最初の描画の前に呼ぶ。ログインしている人の設定を localStorage に入れる(サーバーにある値が勝つ)。
 * サーバーにまだない設定(ログインして初めて開いたブラウザの値)は、その人の設定として送る。
 */
export async function loadUserPrefs(): Promise<void> {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), WAIT_MS)
  let data: { user_id: string | null; prefs: Record<string, string> } | undefined
  try {
    const res = await fetch(appPath('/api/prefs'), { signal: ctl.signal })
    const json = (await res.json().catch(() => null)) as { success: boolean; data?: typeof data } | null
    data = json?.success ? json.data : undefined
  } catch {
    // 待ちきれない・サーバーがない(撮影用のビルド)なら、ブラウザの値のまま
  } finally {
    clearTimeout(t)
  }
  if (!data?.user_id) return
  try {
    const server = data.prefs ?? {}
    for (const [k, v] of Object.entries(server)) if (isShared(k)) localStorage.setItem(k, v)
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k !== null && !(k in server)) queue(k, localStorage.getItem(k))
    }
  } catch {
    return // localStorage が使えないブラウザでは、写さない
  }
  watchWrites()
}
