// npm run verify の中身。表・承認・決まりの確かめ(速い)のあとに、型チェック・lint・ビルド(重い。2 分ほど)を通す。
//   node scripts/verify.mjs          ← 変えたファイルが文書(.md)だけなら、重い所を飛ばす
//   node scripts/verify.mjs --full   ← いつでも全部(VERIFY_FULL=1 でも同じ)
// 文書だけの変更では、型チェック・lint・ビルドの結果は変わらない(CLAUDE.md の作業の約束 1)ので、待ち時間を減らすために飛ばす(2026-10-23)。
// 変えたファイルは、まだコミットしていないものと、origin/main にまだ入っていないコミットのもの。
// Git がない所(Workbench 版の ZIP を展開した先など)や、変えたファイルが分からないとき・1 つもないときは、全部を通す
import { execFileSync, spawnSync } from 'node:child_process'

const run = (cmd, args) => {
  console.log(`\n> ${[cmd, ...args].join(' ')}`)
  // Windows では npx が .cmd なので、シェルを通して呼ぶ(引数はこのファイルの中の決まった語だけなので、1 つの文にまとめて渡す)
  const r = process.platform === 'win32' ? spawnSync([cmd, ...args].join(' '), { stdio: 'inherit', shell: true }) : spawnSync(cmd, args, { stdio: 'inherit' })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

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
run('node', ['scripts/check-approvals.mjs'])
run('node', ['scripts/check-policy.mjs'])
if (docsOnly) {
  console.log(`\n変えたファイルは文書だけ(${counted.length} 件)なので、型チェック・lint・ビルドは飛ばしました(全部を通すときは npm run verify -- --full)。`)
} else {
  run('npx', ['tsc', '-b'])
  run('npx', ['eslint', '.'])
  run('npx', ['vite', 'build'])
}
