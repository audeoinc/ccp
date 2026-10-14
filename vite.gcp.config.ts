import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// GCP 版(Cloud Run)のビルド設定: Dataverse の生成サービス(generated/services)を、サーバーの API を呼ぶ互換サービス
// (src/gcp/services.ts)に差し替える。画面のコードは、Power Apps 版と同じ。
//   開発:   npm run dev:gcp      (別のターミナルで、サーバーを 8080 で起動しておく。/api はそこへ中継する)
//   ビルド: npm run build:gcp    (dist-gcp/ にできる。サーバーがこれを配信する)
const gcpServices = (): Plugin => ({
  name: 'gcp-services',
  enforce: 'pre',
  resolveId(source) {
    const m = source.match(/generated\/services\/(Cr854_\w+Service)$/)
    if (m) return `\0gcp:${m[1]}`
  },
  load(id) {
    if (!id.startsWith('\0gcp:')) return
    const name = id.slice('\0gcp:'.length)
    // AI要求は、テーブルではなく、サーバーの /api/ask(Gemini)に置き換える
    if (name === 'Cr854_airequestsService') return `import { makeAiRequestService } from '/src/gcp/ai.ts'
export const ${name} = makeAiRequestService()
`
    const table = name.replace(/Service$/, '').replace(/^C/, 'c') // Cr854_deliverycardsService → cr854_deliverycards
    return `import { makeService } from '/src/gcp/services.ts'\nexport const ${name} = makeService('${table}')\n`
  },
})

export default defineConfig({
  plugins: [gcpServices(), react()],
  // GCP 版の、開いたときの初期値(Power Apps 版には、影響しない)。国の絞り込みは US、画面の言語は English
  define: {
    'import.meta.env.VITE_DEFAULT_COUNTRY': JSON.stringify('US'),
    'import.meta.env.VITE_DEFAULT_LANG': JSON.stringify('en'),
    // API・画像のパスを、読み込んだ JS の場所から求める(src/appRoot.ts。Workbench の /proxy/8081/ の下でも動くように)
    'import.meta.env.VITE_APP_ROOT_FROM_SCRIPT': JSON.stringify('true'),
  },
  // 画面のファイル(assets/…)を、相対パスで読み込む(置き場所が「/」でなくても読めるように)
  base: './',
  build: {
    outDir: 'dist-gcp',
    // Power Apps 版と同じ(SVG は、アプリの中に埋め込む)
    assetsInlineLimit: (file) => (file.endsWith('.svg') ? true : undefined),
  },
  server: { port: 5191, strictPort: true, proxy: { '/api': 'http://localhost:8080' } },
})
