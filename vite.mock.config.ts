import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
import { helpMaterial } from './helpMaterial'

// 画面の版(ビルドしたときのコミットと日付)。開発へのリクエストを「対応済み」にしたときに残す(どの版で直ったかが、書いた人に分かるように)。
// Git がない所でビルドしたときは、日付だけ
const buildId = () => {
  const day = new Date().toISOString().slice(0, 10)
  try {
    return `${day} ${execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()}`
  } catch {
    return day
  }
}

// 撮影・デモ用の設定: データと AI を、サンプルデータ(src/mock)に差し替えて、アプリを動かす。
//   npx vite --config vite.mock.config.ts
// 本番のビルド(vite.config.ts)には、影響しない。サーバーも DB も要らない。
const mockServices = (): Plugin => ({
  name: 'mock-services',
  enforce: 'pre',
  resolveId(source, importer) {
    // 承認の窓口(src/data/approvals。表ではなくサーバーの API)は、同じ判定をメモリ上で行う身代わりに差し替える
    if (/(?:^|\/)data\/approvals$/.test(source)) return fileURLToPath(new URL('./src/mock/approvals.ts', import.meta.url))
    // 「？ 聞く」の保存と FAQ の窓口(src/data/help。サーバーの API)も、ブラウザの中だけで同じ動きをする身代わりに
    if (/(?:^|\/)data\/help$/.test(source)) return fileURLToPath(new URL('./src/mock/help.ts', import.meta.url))
    // 制作の依頼の窓口(src/data/production)も、同じ流れをメモリ上で行う身代わりに
    if (/(?:^|\/)data\/production$/.test(source)) return fileURLToPath(new URL('./src/mock/production.ts', import.meta.url))
    // 指標の CSV の取り込み(src/data/metricsImport。表ではなくサーバーの API)は、メモリ上で置き換える身代わりに
    if (/(?:^|\/)data\/metricsImport$/.test(source)) return fileURLToPath(new URL('./src/mock/metricsImport.ts', import.meta.url))
    // 素材のファイルの置き場所(src/data/creativeFiles。表ではなくサーバーの API)は、ブラウザの中だけに置く身代わりに
    if (/(?:^|\/)data\/creativeFiles$/.test(source)) return fileURLToPath(new URL('./src/mock/creativeFiles.ts', import.meta.url))
    // メイン画像を上げる窓口(src/data/heroUpload)も、ブラウザの中だけに置く身代わりに
    if (/(?:^|\/)data\/heroUpload$/.test(source)) return fileURLToPath(new URL('./src/mock/heroUpload.ts', import.meta.url))
    // 決まりを画面で直す窓口(src/data/policyEdit。X61)は、メモリ上の表を書き換える身代わりに
    if (/(?:^|\/)data\/policyEdit$/.test(source)) return fileURLToPath(new URL('./src/mock/policyEdit.ts', import.meta.url))
    // 部品の画像を上げる窓口(src/data/partUpload。X59 ③)も同じ
    if (/(?:^|\/)data\/partUpload$/.test(source)) return fileURLToPath(new URL('./src/mock/partUpload.ts', import.meta.url))
    // 商品ページから画像を選ぶ窓口(src/data/productPages。X64)は、ブラウザの中で見本のページを作る身代わりに
    if (/(?:^|\/)data\/productPages$/.test(source)) return fileURLToPath(new URL('./src/mock/productPages.ts', import.meta.url))
    // 在庫の持ちの材料をまとめて読む窓口(src/data/stockCover)は、メモリ上の表で同じ集計をする身代わりに
    if (/(?:^|\/)data\/stockCover$/.test(source)) return fileURLToPath(new URL('./src/mock/stockCover.ts', import.meta.url))
    // 開発用の画面の窓口(src/dev/api。/dev/)は、見本の表を返す身代わりに(BigQuery がなくても画面を確かめられるように)
    if (source === './api' && importer?.replace(/\\/g, '/').includes('/src/dev/')) return fileURLToPath(new URL('./src/mock/devApi.ts', import.meta.url))
    // だれが開いているか(src/data/me)は、ログインなしの身代わりに
    if (/(?:^|\/)data\/me$/.test(source)) return fileURLToPath(new URL('./src/mock/me.ts', import.meta.url))
    // 表ごとのサービス(src/data/<名前>。書き出す名前は <名前の先頭を大文字>Service)を差し替える
    const m = source.match(/(?:^|\/)data\/(\w+)$/)
    if (m) return `\0mock:${m[1][0].toUpperCase()}${m[1].slice(1)}Service`
  },
  load(id) {
    if (!id.startsWith('\0mock:')) return
    const name = id.slice('\0mock:'.length)
    return `import { makeService } from '/src/mock/db.ts'\nexport const ${name} = makeService('${name}')\n`
  },
})

export default defineConfig({
  plugins: [mockServices(), react(), helpMaterial(fileURLToPath(new URL('.', import.meta.url)))],
  define: { 'import.meta.env.VITE_BUILD_ID': JSON.stringify(buildId()) },
  server: { port: 5190, strictPort: true },
})
