// 本番(Cloud Run のサービス contents-planner)への反映。安全装置つき。
//   npm run deploy:gcp
// 反映してよい状態(main で、最新で、変更が残っていない)のときだけ、検証 → gcloud run deploy を行う。
// 複数人が反映しても、他の人の変更を消さないための安全装置つき。
// 反映したあとは、git のタグ(deployed-gcp/日時)を残し、GitHub にも送る。
//
// 事前に必要なこと(docs/ONBOARDING.md の「本番への反映」):
//   - gcloud CLI のインストールと、`gcloud auth login`(Google アカウントでサインイン)
//   - GCP プロジェクトの権限(プロジェクトの管理者が付ける)
//   - プロジェクト ID: 環境変数 GCP_PROJECT、なければ `gcloud config get-value project`
// 環境変数・シークレット(DB のパスワードなど)は、サービスに設定済み。再反映では、そのまま引き継がれる。

import { execSync } from 'node:child_process'

const REGION = process.env.GCP_REGION ?? 'asia-northeast1'
const SERVICE = process.env.GCP_SERVICE ?? 'contents-planner'

const sh = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim()
const shq = (cmd) => execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() // エラーの表示を出さない版
const run = (cmd) => execSync(cmd, { stdio: 'inherit' })
const fail = (msg) => {
  console.error(`\n反映を中止しました: ${msg}\n`)
  process.exit(1)
}

// 0. gcloud とプロジェクト
let project = process.env.GCP_PROJECT
try {
  shq('gcloud --version')
} catch {
  fail('gcloud CLI が見つかりません。インストールして、`gcloud auth login` でサインインしてください(docs/ONBOARDING.md)。')
}
if (!project) {
  try {
    project = shq('gcloud config get-value project')
  } catch {
    project = ''
  }
}
if (!project || project === '(unset)') fail('プロジェクト ID が分かりません。`gcloud config set project <プロジェクトID>` か、環境変数 GCP_PROJECT で指定してください。')
let account = ''
try {
  account = shq('gcloud config get-value account')
} catch {
  account = ''
}
if (!account || account === '(unset)') fail('gcloud にサインインしていません。`gcloud auth login` を実行してください。')

// 1. main にいること
const branch = sh('git rev-parse --abbrev-ref HEAD')
if (branch !== 'main') fail(`ブランチが ${branch} です。反映は、マージ済みの main から行います(git checkout main)。`)

// 2. 最新であること(リモートより遅れていない・進んでいない)
run('git fetch origin --tags')
const behind = Number(sh('git rev-list --count HEAD..origin/main'))
const ahead = Number(sh('git rev-list --count origin/main..HEAD'))
if (behind > 0) fail(`リモートの main が ${behind} 件先に進んでいます。git pull してから、もう一度実行してください。`)
if (ahead > 0) fail(`まだ push していないコミットが ${ahead} 件あります。チームが同じコードを見られるよう、先に git push してください。`)

// 3. 変更が残っていないこと(追跡しているファイルの未コミットの変更)
const dirty = sh('git status --porcelain --untracked-files=no')
if (dirty) fail(`コミットしていない変更があります:\n${dirty}`)

// 4. 前回の反映を表示する。同じコミットなら、反映し直さない
const head = sh('git rev-parse HEAD')
const last = sh('git tag --list "deployed-gcp/*" --sort=-creatordate').split('\n').filter(Boolean)[0]
if (last) {
  const lastCommit = sh(`git rev-list -n 1 ${last}`)
  const lastInfo = sh(`git tag -l --format="%(creatordate:iso8601) %(contents:subject)" ${last}`)
  console.log(`前回の反映: ${last}(コミット ${lastCommit.slice(0, 7)}) ${lastInfo}`)
  if (lastCommit === head) fail('このコミットは、すでに反映済みです(反映し直す必要はありません)。')
}

console.log(`\n反映先: プロジェクト ${project} / リージョン ${REGION} / サービス ${SERVICE}(アカウント ${account})`)

// 5. 検証 → 反映(ビルドは、クラウドの中で行われる。数分かかる)
console.log('\n[1/4] 型チェック')
run('npx tsc -b')
console.log('\n[2/4] lint')
run('npx eslint .')
console.log('\n[3/4] ビルド')
run('npm run build')
console.log('\n[4/4] 反映(gcloud run deploy。クラウドでビルドするので、数分かかります)')
run(`gcloud run deploy ${SERVICE} --source . --project ${project} --region ${REGION} --quiet`)

// 6. 反映の印(タグ)を残して、GitHub に送る(失敗しても、反映は済んでいる)
const short = sh('git rev-parse --short HEAD')
const now = new Date()
const pad = (n) => String(n).padStart(2, '0')
const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
const tag = `deployed-gcp/${stamp}`
let who = ''
try {
  who = sh('git config user.name')
} catch {
  who = ''
}
try {
  run(`git tag -a ${tag} -m "deployed (GCP) by ${who || 'unknown'} (${short})"`)
  run(`git push origin ${tag}`)
  console.log(`\n反映の印(タグ ${tag})を、GitHub に送りました。`)
} catch {
  console.warn(`\n(反映は済んでいますが、タグの作成・送信に失敗しました。必要なら、手で: git tag -a ${tag} -m "deployed" && git push origin ${tag})`)
}
console.log(`\n反映しました(コミット ${short})。`)
