import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'

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

// ビルドの設定(サーバーが配信する版。Workbench でも動く)。
//   開発:   npm run dev      (別のターミナルで、サーバーを 8080 で起動しておく。/api はそこへ中継する)
//   ビルド: npm run build    (dist-gcp/ にできる。サーバーがこれを配信する)
// 撮影・デモ用(サンプルデータで動かす)は、vite.mock.config.ts。
export default defineConfig({
  plugins: [react()],
  // 開いたときの初期値。国の絞り込みは US、画面の言語は English
  define: {
    'import.meta.env.VITE_DEFAULT_COUNTRY': JSON.stringify('US'),
    'import.meta.env.VITE_DEFAULT_LANG': JSON.stringify('en'),
    // API・画像のパスを、読み込んだ JS の場所から求める(src/appRoot.ts。Workbench の /proxy/8082/ の下でも動くように)
    'import.meta.env.VITE_APP_ROOT_FROM_SCRIPT': JSON.stringify('true'),
    'import.meta.env.VITE_BUILD_ID': JSON.stringify(buildId()),
  },
  // 画面のファイル(assets/…)を、相対パスで読み込む(置き場所が「/」でなくても読めるように)
  base: './',
  build: {
    outDir: 'dist-gcp',
    // ページは 2 つ: CCP の画面(/)と、開発用の画面(/dev/。docs/DEVTOOLS.md。サーバーが CCP_DEVTOOLS=1 のときだけ配信する)
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        dev: fileURLToPath(new URL('./dev/index.html', import.meta.url)),
      },
    },
    // SVG は、大きさにかかわらず、アプリの中に埋め込む(既定は 4KB 以下だけ)
    assetsInlineLimit: (file) => (file.endsWith('.svg') ? true : undefined),
  },
  server: { port: 5191, strictPort: true, proxy: { '/api': 'http://localhost:8080' } },
})
