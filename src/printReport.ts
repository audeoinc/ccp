// 画面の一部(フロート)を、そのままレポートとして印刷する(ブラウザの印刷で「PDF に保存」を選ぶと PDF になる)。
// 印刷のあいだだけ body に印を付け、index.css の「レポートの印刷」の決まりで、印刷するもの(data-print-report)以外を消す。
// 新しい部品(PDF を作るライブラリ)を足さずに、画面の見た目のまま出すため
const CLASS = 'printing-report'

// A4 縦の、余白(10mm)を除いた広さ(CSS の px。1 インチ = 96px。190mm × 277mm)。高さは、印刷での文字の描き方の違いに備えて、余裕を見る
const PAGE_W = 718
const PAGE_H = 1000

/**
 * 印刷する。title は、PDF に保存するときの、ファイル名の候補になる。
 * 印刷のときの並び(index.css で、幅を固定して組み替える)で中身の大きさを測り、A4 縦 1 枚に収まる倍率で縮める
 */
export function printReport(title: string) {
  const before = document.title
  document.title = title
  document.body.classList.add(CLASS)
  const el = document.querySelector<HTMLElement>('[data-print-report]')
  const done = () => {
    document.body.classList.remove(CLASS)
    document.title = before
    if (el) el.style.zoom = ''
    window.removeEventListener('afterprint', done)
  }
  window.addEventListener('afterprint', done)
  // 印を付けたあとの組み替え(と、ヒートマップの枠の測り直し)を待ってから、大きさを測って縮め、印刷の画面を開く
  window.setTimeout(() => {
    if (el) {
      el.style.zoom = ''
      const z = Math.min(1, PAGE_W / el.scrollWidth, PAGE_H / el.scrollHeight)
      el.style.zoom = String(Math.floor(z * 1000) / 1000)
    }
    window.setTimeout(() => window.print(), 50)
  }, 300)
}
