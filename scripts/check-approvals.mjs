// 承認の判定(src/approvals.ts)が、サーバー(server/ccp/approvals.py)と同じ例で同じ結果になることを確かめる。
//   node scripts/check-approvals.mjs        ← npm run verify に含まれる
// 例は server/tests/approval_cases.json(サーバーのテスト test_approvals.py も同じ例を使う)。片方だけ直して、ずれる事故を防ぐ。
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createServer } from 'vite'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const cases = JSON.parse(readFileSync(join(root, 'server', 'tests', 'approval_cases.json'), 'utf8'))

/** 確かめる(server は、src を読み込む Vite のサーバー)。合わない例の一覧と、通ったときの一行を返す */
export async function checkApprovals(server) {
  const problems = []
  const m = await server.ssrLoadModule('/src/approvals.ts')
  for (const c of cases.outcome) {
    const got = m.requestOutcome(c.rule, c.decisions)
    if (got !== c.expect) problems.push(`outcome「${c.name}」: ${got}(期待: ${c.expect})`)
  }
  for (const c of cases.eligible) {
    const got = m.eligibleReviewers(c.reviewers, c.actor, c.groups, c.requester)
    if (JSON.stringify(got) !== JSON.stringify(c.expect)) problems.push(`eligible「${c.name}」: ${JSON.stringify(got)}(期待: ${JSON.stringify(c.expect)})`)
  }
  return { problems, ok: `approvals OK(${cases.outcome.length + cases.eligible.length} 例)`, title: '承認の判定が、例と合いません' }
}

// 単独で流したとき
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = await createServer(viteForChecks(root))
  try {
    report(await checkApprovals(server))
  } finally {
    await server.close()
  }
}

/** 確かめに使う Vite のサーバーの設定(画面のビルドの設定は読まない) */
export function viteForChecks(rootDir) {
  return { configFile: false, root: rootDir, appType: 'custom', logLevel: 'error', server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, include: [] } }
}

/** 結果を出し、合わなければ止める */
export function report(r) {
  if (r.problems.length) {
    console.error(`${r.title}:\n- ` + r.problems.join('\n- '))
    process.exit(1)
  }
  console.log(r.ok)
}
