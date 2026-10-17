// must の決まりの確かめ(src/policyCheck.ts)が、例どおりに動くことを確かめる。
//   node scripts/check-policy.mjs        ← npm run verify に含まれる
// 例の決まりは docs/policy_example/rules.md と同じ書き方。
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const server = await createServer({ configFile: false, root, appType: 'custom', logLevel: 'error', server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, include: [] } })
const problems = []
const rules = [
  { ruleId: 'R-COPY-001', title: '価格は税込み', checkSpec: '含めない /\\d[\\d,]*円(?!\\s*[(（]税込)/' },
  { ruleId: 'R-COPY-002', title: '最上級を使わない', checkSpec: '含めない 最高, 最安, best ever' },
  { ruleId: 'R-SEL-010', title: '在庫調整を入れない', checkSpec: '除く 段階=在庫調整' },
  { ruleId: 'R-SHIP-001', title: '送料の注記', checkSpec: '含める /送料/' },
  { ruleId: 'R-SCH-001', title: '週 2 回まで', checkSpec: '上限 週 2 回' },
]
const stages = { A1: '主力', B2: 'Clearance', C3: '在庫調整' }
const cases = [
  { name: '守れている', output: { headline: '秋の新作', copy: '1,980円(税込)。送料無料' }, expect: [] },
  { name: '税込みがない', output: { copy: '1,980円で。送料無料' }, expect: ['R-COPY-001'] },
  { name: '最上級(大文字・小文字を問わない)', output: { copies: [{ text: 'The BEST EVER coat. 送料無料' }] }, expect: ['R-COPY-002'] },
  { name: '理由の中の言葉は数えない', output: { copy: '送料無料', reason: '最高の売れ行き' }, expect: [] },
  { name: '必ず含める言葉がない', output: { copy: '秋のコート' }, expect: ['R-SHIP-001'] },
  { name: '在庫調整の商品(英語の段階も)', output: { products: [{ code: 'A1' }, { code: 'B2', reason: 'x' }, { code: 'C3' }] }, expect: ['R-SEL-010'], detail: { 'R-SEL-010': 'B2, C3' } },
  { name: '文字の案がない返答では、含めるを確かめない', output: { products: [{ code: 'A1' }] }, expect: [] },
]
try {
  const m = await server.ssrLoadModule('/src/policyCheck.ts')
  for (const c of cases) {
    const got = m.findViolations(rules, c.output, (code) => stages[code])
    const ids = got.map((v) => v.ruleId)
    if (JSON.stringify(ids) !== JSON.stringify(c.expect)) problems.push(`「${c.name}」: ${JSON.stringify(ids)}(期待: ${JSON.stringify(c.expect)})`)
    for (const [id, d] of Object.entries(c.detail ?? {})) {
      const v = got.find((x) => x.ruleId === id)
      if (v?.detail !== d) problems.push(`「${c.name}」: ${id} の detail が ${v?.detail}(期待: ${d})`)
    }
  }
  if (m.parseCheck('なんとなく') !== undefined) problems.push('読めない確かめ方が undefined になりません')
  if (m.parseCheck('上限 週 2 回')?.n !== 2) problems.push('上限 週 2 回 を読めません')
} finally {
  await server.close()
}
if (problems.length) {
  console.error('must の決まりの確かめが、例と合いません:\n- ' + problems.join('\n- '))
  process.exit(1)
}
console.log(`policy checks OK(${cases.length} 例)`)
