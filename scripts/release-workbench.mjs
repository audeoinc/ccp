// 利用先に渡す「Workbench 版」のリリース ZIP を作る(手順・約束事は docs/RELEASE.md)。
//   npm run release:workbench                 HEAD から作り、検査し、展開した先でビルドとテストを通す
//   npm run release:workbench -- --ref main   作る元のコミットを指定する
//   npm run release:workbench -- --no-test    検査だけ(npm ci・ビルド・サーバーのテストを省く。急ぐときの確認用。渡す ZIP は省かずに作る)
//   npm run release:workbench -- --publish    すべての確かめを通ったら、GitHub の Releases に公開する(タグ workbench-<版>。利用先は、そこからダウンロードする)
//
// 書き換えの手作業をなくすため、次をすべてこのスクリプトが行う。
//   ① コミット済みのファイル(git archive)から、入れるものだけを選ぶ(下の RULES。どれにも当たらないファイルがあれば止まる)
//   ② release/workbench/ の置き換え用のファイル(README・CLAUDE.md・手順書)を重ねる
//   ③ package.json から本番用のスクリプトを消し、文書の <!-- hosted:begin --> 〜 <!-- hosted:end --> の範囲を消す
//   ④ 版のファイル(VERSION.txt)を入れて ZIP にする
//   ⑤ ZIP を検査する(残してはいけない言葉・ファイル名・文書のリンク切れ)。展開した先で npm ci・npm run verify・サーバーのテストを通す
// コミット前の変更は入らない(ほかのセッションの作業中の変更が、混ざらないようにするため)。
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, posix, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { crc32, deflateRawSync, inflateRawSync } from 'node:zlib'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OVERLAY = 'release/workbench/files'
const OUT = join(ROOT, 'release-out')

// ---- 入れるもの・外すもの。上から順に見て、最初に当たった規則で決める。どれにも当たらなければ止まる
// (新しく足したファイルが、黙って入ったり、黙って落ちたりしないようにするため。足したら、ここに書く)
const RULES = [
  // 開発元の本番(Cloud Run + Cloud SQL)だけで使うもの
  ['exclude', /^(Dockerfile|\.dockerignore|\.gcloudignore|cloudbuild\.yaml)$/],
  // 見本の画面(デモのビルドを URL で開く。開発元だけで使う)
  ['exclude', /^(cloudbuild-preview\.yaml|preview\/)/],
  // 見本の画面の使い方(開発元の本番だけの仕組みなので、ZIP に入れない)
  ['exclude', /^docs\/PREVIEW\.md$/],
  ['exclude', /^scripts\/(deploy-gcp|gcp-smoke|release-workbench)\.mjs$/],
  ['exclude', /^server\/ccp\/hosted\//],
  ['exclude', /^server\/requirements-hosted\.txt$/],
  ['exclude', /^server\/tests\/test_hosted_/],
  ['exclude', /^\.github\//],
  // 開発用の文書(開発の進め方・本番の運用。利用先には、release/workbench/files の版を渡す)
  ['exclude', /^(README|CLAUDE)\.md$/],
  // UPDATE.md(利用先の Git への入れ方)は ZIP に入れない(利用者の指示 2026-10-20。手順は別に渡す)
  ['exclude', /^docs\/(GCP|HANDOVER|CLOUD|ONBOARDING|RELEASE|UPDATE)\.md$/],
  // HANDOVER の作業の記録(開発元の本番の話を含む)。BACKLOG の済んだ項目(docs/backlog-archive/)は、BACKLOG と同じく入れる
  ['exclude', /^docs\/handover-archive\//],
  ['exclude', /^docs\/font-compare\.html$/],
  // AI の置き場の比較(利用先に別に渡した資料。Copilot Studio などの名前を含むので ZIP に入れない)
  ['exclude', /^docs\/(AI_PLATFORMS\.md|AI_OUTLET_PLAN\.md|ai-platform-images\/)/],
  // 商品ページの画像を、リストを渡してまとめてダウンロードする道具(B11)と、その手順書は、当面 ZIP に入れない
  // (利用者の指示 2026-10-23。取り込み(ccp.cli import-images)・画像を選ぶ窓は入れる)
  ['exclude', /^(docs\/PRODUCT_IMAGES\.md|scripts\/collect-product-images\.py)$/],
  ['exclude', /^release\//],
  // 見本の商品の写真を AI で作る道具(開発側の手元で作り、写真は ZIP・パックで届ける)
  ['exclude', /^scripts\/sample-photos\.(py|json)$/],
  // 撮影用(手元の Edge を使う開発の道具)
  ['exclude', /^scripts\/screenshots\.mjs$/],
  // 画面
  ['include', /^(index\.html|vite\.config\.ts|vite\.mock\.config\.ts|eslint\.config\.js|helpMaterial\.ts|tsconfig(\.app|\.node)?\.json|package(-lock)?\.json|\.gitattributes|\.gitignore)$/],
  ['include', /^(src|public)\//],
  // 開発用の画面の入り口(/dev/。docs/DEVTOOLS.md)
  ['include', /^dev\/index\.html$/],
  // サーバー
  ['include', /^server\/ccp\//],
  ['include', /^server\/tests\//],
  ['include', /^server\/(requirements(-tools)?\.txt|schema\.json|seed\.json|workbench\.env\.example)$/],
  // 道具(Workbench の操作・npm run verify の確認・初期データ・文書の生成)
  ['include', /^scripts\/(workbench\.sh|check-(schema|approvals|policy|save|readiness|utm|parts|slots|template-ai)\.mjs|verify\.mjs|export-seed\.mjs|feature-reasons\.py|flows-sheet\.py)$/],
  // 文書(Workbench の手引き・設計・機能・開発の経緯・バックログ・ソースマップ)
  ['include', /^docs\//],
]

// package.json から消すスクリプト(開発元の本番への反映・撮影)
const DROP_SCRIPTS = ['deploy:gcp', 'screenshots']

// ---- 残してはいけない言葉(大文字小文字は区別しない)。足すときは docs/RELEASE.md の表も直す
const BANNED = [
  ['開発元の名前', /audeo/i],
  ['Power Platform 版', /power\s*apps|power\s*automate|power\s*platform|dataverse|copilot\s*studio/i],
  ['Cloud Run', /cloud\s*run|run\.app|\bkaniko\b/i],
  ['Cloud SQL', /cloud[\s_-]*sql|sqladmin/i],
  ['本番の反映', /deploy[:-]gcp|gcp-smoke|cloudbuild|cloud\s*build|\bgcloud\b|dockerfile|gcloudignore/i],
  ['DB の自動起動・停止', /dbctl|cloud\s*scheduler|idle[-_]check|CCP_DEV_GCLOUD/i],
  ['DB の自動起動・停止の設定', /\bDB_CONTROL\b|\bIDLE_CHECK_/], // 大文字だけ(db_controller などに当てないため)
  ['本番のサービス名', /contents-planner/i],
  ['開発用の文書', /HANDOVER\.md|CLOUD\.md|ONBOARDING\.md|GCP\.md|RELEASE\.md/],
]
// 中身を検査しないファイル(画像など。名前は検査する)
const BINARY = /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|otf|zip)$/i

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const option = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const ref = option('--ref', 'HEAD')
const runTests = !flag('--no-test')
const publish = flag('--publish')

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 })
const gitBuf = (...a) => execFileSync('git', a, { cwd: ROOT, maxBuffer: 1 << 30 })
const fail = (msg) => {
  console.error(`\n[NG] ${msg}`)
  process.exit(1)
}
const step = (msg) => console.log(`\n■ ${msg}`)

if (publish && !runTests) fail('--publish は --no-test と一緒には使えません(確かめを通った ZIP だけを公開する)')
if (publish) {
  // 同じ版(同じコミット)を公開済みなら、何もしない(毎日の手順を、1 日に 2 回実行しても困らないように)
  git('fetch', '-q', '--tags', 'origin')
  const done = git('rev-parse', '--short=7', `${ref}^{commit}`).trim()
  if (git('tag', '-l', `workbench-*-${done}`).trim()) {
    console.log(`この版(コミット ${done})は、もう Releases に公開してあります。何もしません`)
    process.exit(0)
  }
}

// ---- ① ファイルを選ぶ
step(`元のコミット: ${ref}`)
const sha = git('rev-parse', '--short=7', `${ref}^{commit}`).trim()
const commitDate = git('show', '-s', '--format=%cd', '--date=format:%Y-%m-%d', sha).trim()
const version = `${commitDate.replaceAll('-', '')}-${sha}`
if (ref === 'HEAD' && git('status', '--porcelain').trim()) console.log('  [注意] コミットしていない変更があります。ZIP には入りません(コミット済みの内容から作ります)')
console.log(`  版: ${version}(コミットの日付 ${commitDate})`)

// ls-tree の 1 行: <モード> <種類> <ID>\t<パス>
const tree = git('ls-tree', '-r', '-z', sha).split('\0').filter(Boolean).map((line) => {
  const [meta, path] = line.split('\t')
  const [mode, type, id] = meta.split(' ')
  return { mode, type, id, path }
})
const unknown = []
const picked = []
for (const entry of tree) {
  if (entry.type !== 'blob') continue
  const rule = RULES.find(([, re]) => re.test(entry.path))
  if (!rule) unknown.push(entry.path)
  else if (rule[0] === 'include') picked.push(entry)
}
if (unknown.length) fail(`入れるか外すかが決まっていないファイルがあります。scripts/release-workbench.mjs の RULES に足してください:\n  ${unknown.join('\n  ')}`)
console.log(`  入れる ${picked.length} 個 / 外す ${tree.length - picked.length} 個`)

// ---- ② ③ 中身を作る(パス → { data, mode })。git cat-file --batch で、まとめて読む
const files = new Map()
const batch = spawnSync('git', ['cat-file', '--batch'], { cwd: ROOT, input: picked.map((e) => e.id).join('\n') + '\n', maxBuffer: 1 << 30 })
if (batch.status !== 0) fail('git cat-file に失敗しました')
{
  // 出力: "<ID> blob <長さ>\n<中身>\n" の繰り返し
  let pos = 0
  for (const entry of picked) {
    const nl = batch.stdout.indexOf(0x0a, pos)
    const size = Number(batch.stdout.subarray(pos, nl).toString().split(' ')[2])
    files.set(entry.path, { data: batch.stdout.subarray(nl + 1, nl + 1 + size), mode: entry.mode === '100755' ? 0o755 : 0o644 })
    pos = nl + 1 + size + 1
  }
}
// 置き換え用のファイルも、コミット済みのものから取る
const overlay = tree.filter((e) => e.type === 'blob' && e.path.startsWith(`${OVERLAY}/`))
if (!overlay.length) fail(`${OVERLAY} がありません`)
for (const e of overlay) files.set(e.path.slice(OVERLAY.length + 1), { data: gitBuf('cat-file', 'blob', e.id), mode: e.mode === '100755' ? 0o755 : 0o644 })

const pkg = JSON.parse(files.get('package.json').data.toString('utf8'))
for (const name of DROP_SCRIPTS) delete pkg.scripts[name]
files.set('package.json', { data: Buffer.from(JSON.stringify(pkg, null, 2) + '\n'), mode: 0o644 })

// 文書・図の中の、本番だけの説明を消す(書き方は docs/RELEASE.md の「印」)
for (const [path, f] of files) {
  if (/\.md$/.test(path)) {
    const text = f.data.toString('utf8')
    const next = stripHosted(path, text)
    if (next !== text) f.data = Buffer.from(next)
  } else if (/\.drawio$/.test(path)) {
    // id が hosted_ で始まる部品と、それにつながる線を消す
    const text = f.data.toString('utf8')
    const next = text.replace(/<mxCell\b[^>]*?\b(?:id|source|target)="hosted_[^"]*"[^>]*?(?:\/>|>[\s\S]*?<\/mxCell>)/g, '')
    if (next !== text) f.data = Buffer.from(next)
  }
}

files.set('VERSION.txt', {
  data: Buffer.from(`CCP(Campaign Contents Planner)Workbench 版\n版: ${version}\n元のコミット: ${sha}\nコミットの日付: ${commitDate}\n`),
  mode: 0o644,
})

// ---- ④ ZIP にする(ZIP の中は、1 つのフォルダ ccp-workbench-<版>/ の下に置く)
const top = `ccp-workbench-${version}`
const zipPath = join(OUT, `${top}.zip`)
mkdirSync(OUT, { recursive: true })
writeFileSync(zipPath, makeZip([...files].sort(([a], [b]) => a.localeCompare(b)).map(([path, f]) => ({ name: `${top}/${path}`, ...f }))))
console.log(`  作りました: ${relative(ROOT, zipPath)}(${files.size} 個、${(statSync(zipPath).size / 1024 / 1024).toFixed(1)} MB)`)

// ---- ⑤ 検査(作った ZIP を読み直して確かめる)
step('ZIP の検査(残してはいけない言葉・ファイル名・リンク切れ)')
const entries = readZip(readFileSync(zipPath))
const problems = []
const names = new Set(entries.map((e) => e.name.slice(top.length + 1)))
for (const e of entries) {
  const path = e.name.slice(top.length + 1)
  if (!e.name.startsWith(`${top}/`)) problems.push(`${e.name}: フォルダ ${top}/ の外にあります`)
  if (/(^|\/)\.git(\/|$)/.test(path)) problems.push(`${path}: Git の中身が入っています`)
  for (const [label, re] of BANNED) if (re.test(path)) problems.push(`${path}: ファイル名に「${label}」(${re})`)
  if (BINARY.test(path)) continue
  const text = e.data.toString('utf8')
  text.split(/\r?\n/).forEach((line, i) => {
    for (const [label, re] of BANNED) {
      const m = line.match(re)
      if (m) problems.push(`${path}:${i + 1}: 「${label}」の言葉 ${JSON.stringify(m[0])} — ${line.trim().slice(0, 120)}`)
    }
  })
  if (/\.md$/.test(path)) {
    // 文書の中の、ZIP の中のファイルへのリンク([…](相対パス))が、切れていないか
    for (const m of text.matchAll(/\]\(([^)\s#]+)(#[^)]*)?\)/g)) {
      const target = m[1]
      if (/^[a-z]+:/i.test(target) || target.startsWith('/')) continue
      const resolved = posix.normalize(posix.join(posix.dirname(path), decodeURI(target))).replace(/\/$/, '')
      if (!names.has(resolved) && ![...names].some((n) => n.startsWith(`${resolved}/`))) problems.push(`${path}: リンク先 ${target} が ZIP にありません`)
    }
  }
}
if (problems.length) {
  console.error(problems.map((p) => `  ${p}`).join('\n'))
  fail(`検査で ${problems.length} 件見つかりました。言葉は書き換えるか、文書なら <!-- hosted:begin --> 〜 <!-- hosted:end --> で囲んでください(docs/RELEASE.md)`)
}
console.log('  OK')

if (!runTests) {
  console.log(`\n検査だけ行いました(--no-test)。展開した先でのビルドとテストは、まだ確かめていません: ${relative(ROOT, zipPath)}`)
  process.exit(0)
}

// ---- 展開した先で、ビルドとテストを通す(利用先と同じく、ZIP だけから動くことを確かめる)
const work = mkdtempSync(join(OUT, 'check-'))
step(`展開して確かめる: ${relative(ROOT, work)}`)
for (const e of entries) {
  const p = join(work, e.name)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, e.data, { mode: e.mode })
}
const app = join(work, top)
const run = (cmd, a, cwd = app) => {
  console.log(`  $ ${cmd} ${a.join(' ')}`)
  // Windows の npm は npm.cmd なので、シェルを通す。ほかは通さない(シェルを通すと、空白を含む引数が切れる)
  const r = spawnSync(cmd, a, { cwd, stdio: 'inherit', shell: process.platform === 'win32' && cmd === 'npm', env: { ...process.env, PYTHONUTF8: '1' } })
  if (r.status !== 0) fail(`${cmd} ${a.join(' ')} が失敗しました(展開した先: ${relative(ROOT, app)})`)
}
run('npm', ['ci', '--no-audit', '--no-fund'])
// 渡す前の確かめは、変えたファイルにかかわらず全部を通す(scripts/verify.mjs の --full)
run('npm', ['run', 'verify', '--', '--full'])
const python = findPython()
run(python, ['-m', 'venv', '.venv'], join(app, 'server'))
const venvPy = join(app, 'server', '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
run(venvPy, ['-m', 'pip', 'install', '-q', '--disable-pip-version-check', '-r', 'requirements.txt'], join(app, 'server'))
run(venvPy, ['-m', 'unittest', 'discover', 'tests'], join(app, 'server'))
// サーバーが、本番だけの仕組み(ccp/hosted)なしで起動の準備まで進むか(import して、API が並ぶか)
run(venvPy, ['-c', "import ccp.main as m; paths = {getattr(r, 'path', '') for r in m.app.routes}; assert '/api/db/status' in paths, paths; print('  サーバーを読み込めました')"], join(app, 'server'))

rmSync(work, { recursive: true, force: true })
console.log(`\n完了: ${relative(ROOT, zipPath)}(検査・ビルド・サーバーのテストを通りました)`)

// ---- GitHub の Releases に公開する(--publish)。版ごとのリリースに ZIP を添付する(リポジトリの履歴には入れない)
if (publish) {
  step('GitHub の Releases に公開する')
  git('fetch', '-q', 'origin')
  const full = git('rev-parse', `${sha}^{commit}`).trim()
  // タグを元のコミットに付けるので、そのコミットが GitHub にないと公開できない
  if (!git('branch', '-r', '--contains', full).trim()) fail(`元のコミット ${sha} が、まだ push されていません`)
  const tag = `workbench-${version}`
  const notes = [
    `Vertex AI Workbench で動かす CCP の版 ${version}(元のコミット ${sha}、コミットの日付 ${commitDate})。`,
    '',
    `添付の ccp-workbench-${version}.zip をダウンロードし、利用先の Git に入れてください(入れ方の手順は、別にお渡しします)。`,
    '検査(残してはいけない言葉・リンク切れ)と、展開した先での npm ci・npm run verify・サーバーのテストを通っています。',
  ].join('\n')
  const r = spawnSync('gh', ['release', 'create', tag, zipPath, '--target', full, '--title', `CCP Workbench 版 ${version}`, '--notes', notes], { cwd: ROOT, stdio: 'inherit' })
  if (r.status !== 0) fail('gh release create に失敗しました(同じ版がすでにあるか、gh auth status でサインインを確かめる)')
  console.log(`  公開しました: タグ ${tag}`)
}

// 印の 3 つの書き方: ① 行の中の <!-- hosted --> → その行を消す(表の行・箇条書き)
// ② <!-- hosted:begin --> 〜 <!-- hosted:end -->(mermaid の中では %% hosted:begin 〜 %% hosted:end)→ その範囲を消す。
//    始まりが行の先頭・終わりが行の末尾なら、行ごと消す(行の途中なら、その部分だけ)
function stripHosted(path, text) {
  const nl = text.includes('\r\n') ? '\r\n' : '\n'
  let out = text
    .split(/\r?\n/)
    .filter((line) => !/<!--\s*hosted\s*-->/.test(line))
    .join(nl)
  const BEGIN = /<!--\s*hosted:begin\s*-->|%%\s*hosted:begin/
  const END = /<!--\s*hosted:end\s*-->|%%\s*hosted:end/
  for (;;) {
    const b = BEGIN.exec(out)
    if (!b) break
    const e = END.exec(out.slice(b.index + b[0].length))
    if (!e) fail(`${path}: hosted:begin に対応する hosted:end がありません`)
    let from = b.index
    let to = b.index + b[0].length + e.index + e[0].length
    const lineStart = out.lastIndexOf('\n', from - 1) + 1
    const lineEnd = out.indexOf('\n', to)
    const before = out.slice(lineStart, from)
    const after = out.slice(to, lineEnd < 0 ? out.length : lineEnd)
    if (!before.trim() && !after.trim()) {
      from = lineStart
      to = lineEnd < 0 ? out.length : lineEnd + 1
    }
    out = out.slice(0, from) + out.slice(to)
  }
  if (END.test(out)) fail(`${path}: hosted:end に対応する hosted:begin がありません`)
  // 消したあとに、空行が 3 つ以上続かないようにする
  const lines = out.split(/\r?\n/)
  return lines.filter((line, i) => !(line.trim() === '' && lines[i - 1]?.trim() === '' && lines[i - 2]?.trim() === '')).join(nl)
}

function findPython() {
  for (const c of process.platform === 'win32' ? ['py', 'python'] : ['python3', 'python']) {
    const r = spawnSync(c, ['--version'])
    if (r.status === 0) return c
  }
  fail('Python が見つかりません(サーバーのテストに使う)')
}

// ---- ZIP の読み書き(Node の標準だけで行う。Windows・Linux のどちらでも同じ ZIP になるように)
// 実行の権限(scripts/workbench.sh)を残すため、作ったのは Unix として記録する
function makeZip(list) {
  const local = []
  const central = []
  let offset = 0
  for (const { name, data, mode } of list) {
    const nameBuf = Buffer.from(name, 'utf8')
    const body = deflateRawSync(data, { level: 9 })
    const crc = crc32(data)
    const head = Buffer.alloc(30)
    head.writeUInt32LE(0x04034b50, 0)
    head.writeUInt16LE(20, 4)
    head.writeUInt16LE(0x0800, 6) // 名前は UTF-8
    head.writeUInt16LE(8, 8) // deflate
    head.writeUInt32LE(0, 10) // 時刻は 0(同じコミットから、同じ ZIP ができるように)
    head.writeUInt32LE(crc, 14)
    head.writeUInt32LE(body.length, 18)
    head.writeUInt32LE(data.length, 22)
    head.writeUInt16LE(nameBuf.length, 26)
    local.push(head, nameBuf, body)
    const c = Buffer.alloc(46)
    c.writeUInt32LE(0x02014b50, 0)
    c.writeUInt16LE((3 << 8) | 20, 4)
    c.writeUInt16LE(20, 6)
    c.writeUInt16LE(0x0800, 8)
    c.writeUInt16LE(8, 10)
    c.writeUInt32LE(0, 12)
    c.writeUInt32LE(crc, 16)
    c.writeUInt32LE(body.length, 20)
    c.writeUInt32LE(data.length, 24)
    c.writeUInt16LE(nameBuf.length, 28)
    c.writeUInt32LE(((0o100000 | mode) << 16) >>> 0, 38)
    c.writeUInt32LE(offset, 42)
    central.push(c, nameBuf)
    offset += head.length + nameBuf.length + body.length
  }
  const centralBuf = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(list.length, 8)
  end.writeUInt16LE(list.length, 10)
  end.writeUInt32LE(centralBuf.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...local, centralBuf, end])
}

function readZip(buf) {
  const endAt = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  const count = buf.readUInt16LE(endAt + 10)
  let p = buf.readUInt32LE(endAt + 16)
  const out = []
  for (let i = 0; i < count; i++) {
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const size = buf.readUInt32LE(p + 20)
    const mode = (buf.readUInt32LE(p + 38) >>> 16) & 0o777
    const at = buf.readUInt32LE(p + 42)
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8')
    const start = at + 30 + buf.readUInt16LE(at + 26) + buf.readUInt16LE(at + 28)
    out.push({ name, mode: mode || 0o644, data: inflateRawSync(buf.subarray(start, start + size)) })
    p += 46 + nameLen + extraLen + commentLen
  }
  return out
}
