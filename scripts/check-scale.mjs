// 開いたときの画面の大きさを、画面に合わせて決める(src/uiScale.ts の autoScaleFor。settings.me.autoscale)の境目を、例で確かめる。
//   node scripts/check-scale.mjs   ← npm run verify に含まれる
// 目安は、割り戻した広さが 1440×820 以上。候補は 100・90・80% で、どれでも収まらなければ下限の 80%(70%・110% は自動では選ばない)
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createServer } from 'vite'
import { report, viteForChecks } from './check-approvals.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// [ブラウザの中の幅, 高さ, 期待する倍率, 例の説明]
const CASES = [
  [1920, 960, 1, '1920×1080・拡大 100%'],
  [1440, 820, 1, 'ちょうど目安'],
  [1439, 820, 0.9, '幅が 1 足りない'],
  [1440, 819, 0.9, '高さが 1 足りない'],
  [1536, 740, 0.9, '1920×1080・拡大 125%'],
  [1296, 738, 0.9, '90% のちょうど境目'],
  [1295, 738, 0.8, '90% に 1 足りない'],
  [1280, 600, 0.8, '1920×1080・拡大 150%'],
  [1366, 650, 0.8, '1366×768'],
  [800, 500, 0.8, 'とても狭い(下限)'],
]

/** 確かめる(server は、src を読み込む Vite のサーバー) */
export async function checkScale(server) {
  const problems = []
  const { autoScaleFor } = await server.ssrLoadModule('/src/uiScale.ts')
  for (const [w, h, want, note] of CASES) {
    const got = autoScaleFor(w, h)
    if (got !== want) problems.push(`${note}(${w}×${h}): ${got}(期待: ${want})`)
  }
  return { problems, ok: `表示の大きさの自動 OK(${CASES.length} 例)`, title: '表示の大きさの自動の決め方が、例と合いません' }
}

// 単独で流したとき
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = await createServer(viteForChecks(root))
  try {
    report(await checkScale(server))
  } finally {
    await server.close()
  }
}
