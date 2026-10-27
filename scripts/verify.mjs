// npm run verify の中身。表・承認・決まりの確かめ(速い)のあとに、型チェック・lint(同時に)・ビルドを通す。
// CLAUDE.md の作業の約束 1 の確かめは、これ 1 つで足りる(中で tsc -b・eslint・vite build を流す。別に 3 つを流し直さない)。
//   node scripts/verify.mjs          ← 変えたファイルが文書(.md)だけなら、重い所を飛ばす
//   node scripts/verify.mjs --full   ← いつでも全部(VERIFY_FULL=1 でも同じ)
// 文書だけの変更では、型チェック・lint・ビルドの結果は変わらない(CLAUDE.md の作業の約束 1)ので、待ち時間を減らすために飛ばす(2026-10-23)。
// 変えたファイルは、まだコミットしていないものと、origin/main にまだ入っていないコミットのもの。
// Git がない所(Workbench 版の ZIP を展開した先など)や、変えたファイルが分からないとき・1 つもないときは、全部を通す
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { checkApprovals, report, viteForChecks } from './check-approvals.mjs'
import { checkPolicy } from './check-policy.mjs'
import { checkSave } from './check-save.mjs'
import { checkReadiness } from './check-readiness.mjs'
import { checkUtm } from './check-utm.mjs'
import { checkParts } from './check-parts.mjs'
import { checkSlots } from './check-slots.mjs'
import { checkTemplateAi } from './check-template-ai.mjs'

const run = (cmd, args) => {
  console.log(`\n> ${[cmd, ...args].join(' ')}`)
  // Windows では npx が .cmd なので、シェルを通して呼ぶ(引数はこのファイルの中の決まった語だけなので、1 つの文にまとめて渡す)
  const r = process.platform === 'win32' ? spawnSync([cmd, ...args].join(' '), { stdio: 'inherit', shell: true }) : spawnSync(cmd, args, { stdio: 'inherit' })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

/** 終わるのを待つ(同時に流す型チェックと lint のため)。出力は終わってからまとめて出す(2 つの出力が混ざらないように) */
const runQuiet = (cmd, args) =>
  new Promise((resolve) => {
    const p = process.platform === 'win32' ? spawn([cmd, ...args].join(' '), { shell: true }) : spawn(cmd, args)
    let out = ''
    p.stdout.on('data', (d) => (out += d))
    p.stderr.on('data', (d) => (out += d))
    p.on('close', (code) => resolve({ label: [cmd, ...args].join(' '), code: code ?? 1, out }))
  })

const git = (args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })

/** 変えたファイルの一覧。分からなければ null */
function changedFiles() {
  try {
    const files = new Set()
    for (const line of git(['status', '--porcelain', '-uall']).split('\n')) {
      // 「XY 名前」または「XY 元 -> 先」
      const name = line.slice(3).split(' -> ').pop()?.trim().replace(/^"|"$/g, '')
      if (name) files.add(name)
    }
    let base = ''
    try {
      base = git(['merge-base', 'origin/main', 'HEAD']).trim()
    } catch {
      return null
    }
    for (const name of git(['diff', '--name-only', base, 'HEAD']).split('\n')) if (name.trim()) files.add(name.trim())
    return [...files]
  } catch {
    return null
  }
}

const full = process.argv.includes('--full') || process.env.VERIFY_FULL === '1'
const files = full ? null : changedFiles()
// .claude/ は手元の Claude の設定(起動の設定など。Git に入れない)で、型チェック・ビルドに関わらないので数えない
const counted = files?.filter((f) => !f.startsWith('.claude/')) ?? []
const docsOnly = counted.length > 0 && counted.every((f) => /\.md$/i.test(f))

run('node', ['scripts/check-schema.mjs'])
// 承認の判定・must の決まり・配信カードの保存の流れ・送る前の確かめ・計測の utm_content・部品の配信ごとの中身・テンプレートを AI で作る所は、1 つの Vite のサーバーで続けて流す(別々に起動すると、その分待つ)
{
  const server = await createServer(viteForChecks(join(dirname(fileURLToPath(import.meta.url)), '..')))
  try {
    report(await checkApprovals(server))
    report(await checkPolicy(server))
    report(await checkSave(server))
    report(await checkReadiness(server))
    report(await checkUtm(server))
    report(await checkParts(server))
    report(await checkSlots(server))
    report(await checkTemplateAi(server))
  } finally {
    await server.close()
  }
}
if (docsOnly) {
  console.log(`\n変えたファイルは文書だけ(${counted.length} 件)なので、型チェック・lint・ビルドは飛ばしました(全部を通すときは npm run verify -- --full)。`)
} else {
  // 型チェックと lint は互いに関係しないので、同時に流す(lint は前の結果を覚えて、変えたファイルだけ見る --cache)
  // 変わったかは、ファイルの中身で見分ける(--cache-strategy content)。既定の日時と大きさでは、rebase・切り替えのあとに古い結果を使って、
  // CI では落ちる誤りを見逃したことがあるため(2026-10-25、6518fb2)。--full(いつでも全部)は、CI と同じく前の結果を使わない
  const lintArgs = full ? ['eslint', '.'] : ['eslint', '.', '--cache', '--cache-strategy', 'content', '--cache-location', 'node_modules/.cache/eslint-content/']
  console.log(`\n> npx tsc -b と npx eslint .${full ? '' : ' --cache'}(同時に)`)
  const results = await Promise.all([runQuiet('npx', ['tsc', '-b']), runQuiet('npx', lintArgs)])
  for (const r of results) {
    if (r.out.trim()) console.log(`\n[${r.label}]\n${r.out.trimEnd()}`)
  }
  const bad = results.filter((r) => r.code !== 0)
  if (bad.length) {
    console.error(`\n通りませんでした: ${bad.map((r) => r.label).join(' / ')}`)
    process.exit(1)
  }
  console.log('型チェック・lint: OK')
  run('npx', ['vite', 'build'])
}
