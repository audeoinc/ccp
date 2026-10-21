import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// 撮影・デモ用の設定: データと AI を、サンプルデータ(src/mock)に差し替えて、アプリを動かす。
//   npx vite --config vite.mock.config.ts
// 本番のビルド(vite.config.ts)には、影響しない。サーバーも DB も要らない。
const mockServices = (): Plugin => ({
  name: 'mock-services',
  enforce: 'pre',
  resolveId(source) {
    // 承認の窓口(src/data/approvals。表ではなくサーバーの API)は、同じ判定をメモリ上で行う身代わりに差し替える
    if (/(?:^|\/)data\/approvals$/.test(source)) return fileURLToPath(new URL('./src/mock/approvals.ts', import.meta.url))
    // 制作の依頼の窓口(src/data/production)も、同じ流れをメモリ上で行う身代わりに
    if (/(?:^|\/)data\/production$/.test(source)) return fileURLToPath(new URL('./src/mock/production.ts', import.meta.url))
    // 指標の CSV の取り込み(src/data/metricsImport。表ではなくサーバーの API)は、メモリ上で置き換える身代わりに
    if (/(?:^|\/)data\/metricsImport$/.test(source)) return fileURLToPath(new URL('./src/mock/metricsImport.ts', import.meta.url))
    // 素材のファイルの置き場所(src/data/creativeFiles。表ではなくサーバーの API)は、ブラウザの中だけに置く身代わりに
    if (/(?:^|\/)data\/creativeFiles$/.test(source)) return fileURLToPath(new URL('./src/mock/creativeFiles.ts', import.meta.url))
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
  plugins: [mockServices(), react()],
  server: { port: 5190, strictPort: true },
})
