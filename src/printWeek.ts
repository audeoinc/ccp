// 週の資料(W7)を印刷する(ブラウザの印刷で「PDF に保存」を選ぶと PDF になる)。
// 配信 1 本のレポート(printReport。A4 縦 1 枚に縮める)とは違い、週は配信が多いので、縮めずに複数の頁に流す。
// 印刷のあいだだけ body に印を付け、index.css の「週の資料の印刷」の決まりで、週の資料(data-print-week)以外を消す。
// PDF を作る部品を足さないのは、サーバーにも外にも頼らずに作れるようにするため(外につながらない環境でも、同じように動く)
const CLASS = 'printing-week'
// 画像の読み込みを待つ上限。遅い環境でも、いつまでも印刷の画面が出ない、とならないように
const IMAGE_WAIT_MS = 5000
// 配信のプレビューの、縮めたあとの大きさの上限(CSS の px)。幅は WeekReport の欄(320px)、高さは A4 縦の 1 頁から、見出しの分を引いたもの
const PREVIEW_W = 320
const PREVIEW_H = 960

/** メールのプレビューは、テンプレートによって縦に長い。1 頁からはみ出すと、次の頁に切れて読みにくいので、収まる倍率まで縮める */
function fitPreviews() {
  for (const el of document.querySelectorAll<HTMLElement>('[data-print-week] [data-week-preview]')) {
    el.style.zoom = '1'
    const z = Math.min(PREVIEW_W / el.scrollWidth, PREVIEW_H / el.scrollHeight)
    el.style.zoom = String(Math.floor(z * 1000) / 1000)
  }
}

const loaded = (img: HTMLImageElement) =>
  img.complete
    ? Promise.resolve()
    : new Promise<void>((resolve) => {
        img.addEventListener('load', () => resolve(), { once: true })
        img.addEventListener('error', () => resolve(), { once: true })
      })

/** 印刷する。title は、PDF に保存するときのファイル名の候補。印刷の画面を閉じたら、onDone を呼ぶ(資料を片付けるため) */
export function printWeek(title: string, onDone: () => void) {
  const before = document.title
  document.title = title
  document.body.classList.add(CLASS)
  const done = () => {
    document.body.classList.remove(CLASS)
    document.title = before
    window.removeEventListener('afterprint', done)
    onDone()
  }
  window.addEventListener('afterprint', done)
  // プレビューの画像が描かれてから印刷する(読み込み前に印刷すると、画像が抜ける)
  const imgs = [...document.querySelectorAll<HTMLImageElement>('[data-print-week] img')]
  const timeout = new Promise<void>((resolve) => window.setTimeout(resolve, IMAGE_WAIT_MS))
  void Promise.race([Promise.all(imgs.map(loaded)), timeout]).then(() => {
    fitPreviews()
    window.setTimeout(() => window.print(), 50)
  })
}
