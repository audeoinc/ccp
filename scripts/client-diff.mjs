// 届いた版(vendor)と今の差分を、「足した所」と「共通のコードを変えた所」に分けて出す(docs/AWS_CUSTOMIZE.md の 5 章)。
// 版を取り込む前に、何がぶつかりうるかを見るため。共通のコードを変えたのに CHANGES.md にないファイルも教える。何も変えない。
//   npm run client:diff                 ← ccp/ の中で実行する
//   node scripts/client-diff.mjs [比べる元。既定は vendor]
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// AWS 側だけの場所(開発側はここにファイルを作らない)
const CLIENT = /^(src\/client\/|server\/ccp\/client\/|docs\/client\/)/
const KIND = { M: '変えた', D: '消した', T: '種類を変えた' }

/** git diff --name-status の行を、足した所と共通を変えた所に分ける */
export function classify(lines, changesText) {
  const added = []
  const common = []
  for (const line of lines) {
    const [status, path] = line.split('\t')
    if (!path) continue
    if (status === 'A' || CLIENT.test(path)) added.push({ path, outside: !CLIENT.test(path) })
    else common.push({ path, kind: KIND[status] ?? status, recorded: changesText.includes(path) })
  }
  return { added, common }
}

export function report({ added, common }, base) {
  const out = [`■ ${base} と今の差分`, '', `足した所(マージでぶつかりにくい): ${added.length} 個`]
  for (const a of added) out.push(`  ${a.path}${a.outside ? '(AWS 側の場所の外。版に同じ名前のファイルが来るとぶつかります)' : ''}`)
  out.push('', `共通のコードを変えた所(マージでぶつかりうる): ${common.length} 個`)
  for (const c of common) out.push(`  ${c.kind}: ${c.path}${c.recorded ? '' : '  ← CHANGES.md にありません'}`)
  const missing = common.filter((c) => !c.recorded).length
  if (missing) out.push('', `次にやること: 「CHANGES.md にありません」の ${missing} 個を、理由と一緒に docs/client/CHANGES.md に書いてください。要らない変更なら、${base} の形に戻してください`)
  return out.join('\n')
}

if (process.argv[1]?.endsWith('client-diff.mjs')) {
  const base = process.argv[2] ?? 'vendor'
  const git = (args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  try {
    git(['rev-parse', '--verify', '--quiet', `${base}^{commit}`])
  } catch {
    console.error(`比べる元のブランチ ${base} がありません。\n次にやること: docs/AWS_CUSTOMIZE.md の 5.1 で ${base} を作ってください(別の名前なら、node scripts/client-diff.mjs <名前>)`)
    process.exit(1)
  }
  // --relative: ccp/ の中で実行すると、ccp/ の中だけを、ccp/ からの場所で出す。--no-renames: 名前の変更は、消した + 足した として見せる
  const lines = git(['-c', 'core.quotePath=false', 'diff', '--name-status', '--no-renames', '--relative', base]).split('\n')
  const changes = join('docs', 'client', 'CHANGES.md')
  const text = existsSync(changes) ? readFileSync(changes, 'utf8') : ''
  console.log(report(classify(lines, text), base))
}
