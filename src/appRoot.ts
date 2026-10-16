// アプリの置き場所(末尾は /)。サーバーの API(/api/…)・画像(/img/…)のパスは、ここを基準にする。
// Cloud Run では「/」だが、Vertex AI Workbench のノートブックで手元のサーバーを動かすと、Jupyter の中継(/proxy/8081/)の下になる。
// そこで「/api/…」を呼ぶと、中継を通らずに Jupyter に届いてしまうため、読み込んだ JS の場所から、置き場所を求める。
// (画面の JS は <置き場所>/assets/ にあるので、その 1 つ上。ビルドの設定 base: './' と組で動く)
// (VITE_APP_ROOT_FROM_SCRIPT は、vite.config.ts で定義する。撮影・デモ用のビルドでは使わない)

const fromScript = import.meta.env.VITE_APP_ROOT_FROM_SCRIPT === 'true'
// 文字列の定数を new URL に直接書くと、Vite が「同梱するファイル」とみなして解決しようとするので、変数で渡す
const UP = '../'

export const APP_ROOT: string = (() => {
  // 開発サーバー(npm run dev:gcp)は、/api を中継するので、置き場所は「/」のまま
  if (!fromScript || import.meta.env.DEV) return '/'
  try {
    return new URL(UP, import.meta.url).pathname
  } catch {
    return '/'
  }
})()

/** 「/」で始まるアプリのパス(/api/…、/img/…)を、置き場所の下のパスにする。それ以外(https://… など)は、そのまま */
export const appPath = (path: string): string => (path.startsWith('/') && !path.startsWith('//') ? APP_ROOT + path.slice(1) : path)
