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
