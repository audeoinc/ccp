// 画面の一部(フロート)を、そのままレポートとして印刷する(ブラウザの印刷で「PDF に保存」を選ぶと PDF になる)。
// 印刷のあいだだけ body に印を付け、index.css の「レポートの印刷」の決まりで、印刷するもの(data-print-report)以外を消す。
// 新しい部品(PDF を作るライブラリ)を足さずに、画面の見た目のまま出すため
const CLASS = 'printing-report'

/** 印刷する。title は、PDF に保存するときの、ファイル名の候補になる */
export function printReport(title: string) {
  const before = document.title
  document.title = title
  document.body.classList.add(CLASS)
  const done = () => {
    document.body.classList.remove(CLASS)
    document.title = before
    window.removeEventListener('afterprint', done)
  }
  window.addEventListener('afterprint', done)
  // 印を付けたあとの描き直しを待ってから、印刷の画面を開く
  window.setTimeout(() => window.print(), 50)
}
