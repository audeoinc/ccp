// 検証の道具 tools/ms-verify/ を、手で 1 つずつ落とさずに渡せるように ZIP に固める(手順は docs/MS_AI_VERIFY.md の 12.4)。
//   npm run pack:ms-verify                ZIP を作り、中身の一覧と検査を出す → release-out/ccp-ms-verify-<日付>-<コミット>.zip
//   npm run pack:ms-verify -- --publish   検査を通ったら、GitHub の Releases に公開する(タグ ms-verify-<日付>-<コミット>)。
//                                          公開は利用者の承認のあとだけ行う(連絡係が流す)
//
// 入れるのは、コミット済みの tools/ms-verify/ と docs/MS_AI_VERIFY.md の写し(ほかのセッションの作業中の変更が混ざらないように)。
// 部品(node_modules)・設定(*.env)・サインインのトークン・測った結果は、コミットされていなくても、名前で必ず外す。
// 検査: 環境の ID・メール・環境のホストなどの形と、手元の設定(%USERPROFILE%\.ccp\ms-verify.env)の値が、ZIP に入っていないか。
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { crc32, deflateRawSync, inflateRawSync } from 'node:zlib'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'release-out')
const TOOL = 'tools/ms-verify/'
const DOC = 'docs/MS_AI_VERIFY.md'
const ENV_FILE = join(homedir(), '.ccp', 'ms-verify.env')

// 名前で必ず外すもの(.gitignore で Git に入らないはずのものも、念のため)
const NEVER = [/(^|\/)node_modules\//, /(^|\/)\.token-cache\.json$/, /(^|\/)results\//, /\.env$/]
// 入っていてはいけない形(値そのものは画面に出さない)
const PATTERNS = [
  ['GUID(環境・テナント・アプリの ID の形)', /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i],
  ['メールアドレス', /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z0-9.-]+/],
  ['テナントのドメイン', /\.onmicrosoft\.com/i],
  ['環境の URL(Dataverse)', /\borg[0-9a-f]{6,}\.crm\d*\.dynamics\.com/i],
  ['環境のホスト(Power Platform API)', /\b[0-9a-f]{20,}\.environment\.api\.powerplatform\.com/i],
  ['開発元の名前', /audeo/i],
]
const BINARY = /\.(png|jpe?g|gif|webp)$/i

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 })
const gitBuf = (...a) => execFileSync('git', a, { cwd: ROOT, maxBuffer: 1 << 28 })
const fail = (msg) => {
  console.error(`\n[NG] ${msg}`)
  process.exit(1)
}
const publish = process.argv.includes('--publish')

const sha = git('rev-parse', '--short=7', 'HEAD').trim()
const date = git('show', '-s', '--format=%cd', '--date=format:%Y%m%d', 'HEAD').trim()
const version = `${date}-${sha}`
const top = `ccp-ms-verify-${version}`
if (git('status', '--porcelain', '--', TOOL, DOC).trim()) console.log(`[注意] ${TOOL} か ${DOC} に、コミットしていない変更があります。ZIP には入りません(コミット済みの内容から作ります)`)

// ---- 入れるファイルを集める
const files = []
for (const path of git('ls-tree', '-r', '--name-only', 'HEAD', '--', TOOL).split('\n').filter(Boolean)) {
  if (NEVER.some((re) => re.test(path))) continue
  files.push({ name: `${top}/${path.slice(TOOL.length)}`, data: gitBuf('show', `HEAD:${path}`) })
}
if (!files.length) fail(`${TOOL} がコミットされていません`)
files.push({ name: `${top}/docs/MS_AI_VERIFY.md`, data: gitBuf('show', `HEAD:${DOC}`) })
files.sort((a, b) => a.name.localeCompare(b.name))

// ---- ZIP にする
mkdirSync(OUT, { recursive: true })
const zipPath = join(OUT, `${top}.zip`)
writeFileSync(zipPath, makeZip(files))

// ---- 作った ZIP を読み直して検査する
const forbidden = []
if (existsSync(ENV_FILE)) {
  for (const line of readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/)
    if (!m || !m[2]) continue
    // FORBIDDEN_WORDS には、設定に入らない名前(テナント・環境の名前など)をカンマで並べておける
    if (m[1] === 'FORBIDDEN_WORDS') forbidden.push(...m[2].split(',').map((w) => [`FORBIDDEN_WORDS の言葉`, w.trim()]).filter(([, w]) => w))
    else if (m[1] !== 'MODEL_LABEL' && m[2].length >= 6) forbidden.push([`設定の ${m[1]} の値`, m[2]])
  }
}
const problems = []
const entries = readZip(readFileSync(zipPath))
console.log(`\n■ ZIP の中身(${entries.length} 個)`)
for (const { name, data } of entries) {
  console.log(`  ${name}(${data.length} バイト)`)
  if (NEVER.some((re) => re.test(name))) problems.push(`${name}: 入れてはいけないファイル`)
  if (BINARY.test(name)) continue
  const text = data.toString('utf8')
  for (const [label, re] of PATTERNS) if (re.test(text)) problems.push(`${name}: ${label}`)
  for (const [label, value] of forbidden) if (text.includes(value)) problems.push(`${name}: ${label}`)
}
console.log(`\n■ 検査: 形 ${PATTERNS.length} 種類と、手元の設定の値 ${forbidden.length} 個(${existsSync(ENV_FILE) ? '設定のファイルあり' : '設定のファイルなし。形だけを見た'})`)
if (problems.length) fail(`検査で ${problems.length} 件見つかりました(値は出しません)。\n  ${problems.join('\n  ')}`)
console.log('  OK(見つからなかった)')
console.log(`\n作りました: ${relative(ROOT, zipPath)}(${(statSync(zipPath).size / 1024).toFixed(0)} KB)`)

// ---- GitHub の Releases に公開する(--publish)
if (publish) {
  if (git('status', '--porcelain', '--', TOOL, DOC).trim()) fail('コミットしていない変更があるので、公開しません')
  git('fetch', '-q', 'origin')
  const full = git('rev-parse', 'HEAD').trim()
  if (!git('branch', '-r', '--contains', full).trim()) fail(`元のコミット ${sha} が、まだ push されていません`)
  const tag = `ms-verify-${version}`
  const notes = [
    `CCP の頼みを Copilot Studio のエージェントに送って測る検証の道具(元のコミット ${sha})。CCP の画面・サーバーには入れない。`,
    '',
    `添付の ${top}.zip を展開し、中の README.md と docs/MS_AI_VERIFY.md の 12.4 の手順で使ってください。鍵・環境の ID は ZIP に入っていません(各自の %USERPROFILE%\\.ccp\\ms-verify.env に書く)。`,
  ].join('\n')
  const r = spawnSync('gh', ['release', 'create', tag, zipPath, '--target', full, '--title', `CCP ms-verify ${version}`, '--notes', notes], { cwd: ROOT, stdio: 'inherit' })
  if (r.status !== 0) fail('gh release create に失敗しました(同じ版がすでにあるか、gh auth status でサインインを確かめる)')
  console.log(`公開しました: タグ ${tag}`)
}

// ---- ZIP の読み書き(Node の標準だけ。scripts/release-workbench.mjs と同じ作り。時刻は 0 にして、同じコミットから同じ ZIP ができるように)
function makeZip(list) {
  const local = []
  const central = []
  let offset = 0
  for (const { name, data } of list) {
    const nameBuf = Buffer.from(name, 'utf8')
    const body = deflateRawSync(data, { level: 9 })
    const crc = crc32(data)
    const head = Buffer.alloc(30)
    head.writeUInt32LE(0x04034b50, 0)
    head.writeUInt16LE(20, 4)
    head.writeUInt16LE(0x0800, 6)
    head.writeUInt16LE(8, 8)
    head.writeUInt32LE(0, 10)
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
    c.writeUInt32LE(((0o100000 | 0o644) << 16) >>> 0, 38)
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
    const at = buf.readUInt32LE(p + 42)
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8')
    const start = at + 30 + buf.readUInt16LE(at + 26) + buf.readUInt16LE(at + 28)
    out.push({ name, data: inflateRawSync(buf.subarray(start, start + size)) })
    p += 46 + nameLen + extraLen + commentLen
  }
  return out
}
