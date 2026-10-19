// 本番(Cloud Run のサービス contents-planner)への反映。安全装置つき。
//   npm run deploy:gcp
// 反映してよい状態(main で、最新で、変更が残っていない)のときだけ、検証 → クラウドでビルド → gcloud run deploy を行う。
// ビルドは cloudbuild.yaml(kaniko。npm ci・pip install などの層をキャッシュする)。うまくいかなければ、
// これまでの `gcloud run deploy --source .`(キャッシュなし)に切り替える。最初から --source にするなら DEPLOY_BUILD=source。
// 複数人が反映しても、他の人の変更を消さないための安全装置つき。
// 反映したあとは、git のタグ(deployed-gcp/日時)を残し、GitHub にも送る。
//
// 事前に必要なこと(docs/ONBOARDING.md の「本番への反映」):
//   - gcloud CLI のインストールと、`gcloud auth login`(Google アカウントでサインイン)
//   - GCP プロジェクトの権限(プロジェクトの管理者が付ける)
//   - プロジェクト ID: 環境変数 GCP_PROJECT、なければ `gcloud config get-value project`
// 環境変数・シークレット(DB のパスワードなど)は、サービスに設定済み。再反映では、そのまま引き継がれる。

import { exec, execSync } from 'node:child_process'

const REGION = process.env.GCP_REGION ?? 'asia-northeast1'
const SERVICE = process.env.GCP_SERVICE ?? 'contents-planner'

const sh = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim()
const shq = (cmd) => execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() // エラーの表示を出さない版
const run = (cmd) => execSync(cmd, { stdio: 'inherit' })
const fail = (msg) => {
  console.error(`\n反映を中止しました: ${msg}\n`)
  process.exit(1)
}
// いくつかのコマンドを同時に走らせ、終わったものから出力をまとめて出す(混ざって読めなくならないように)
const runAll = (cmds) =>
  Promise.all(
    cmds.map(
      ([label, cmd]) =>
        new Promise((resolve) => {
          exec(cmd, { maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
            const out = `${stdout}${stderr}`.trim()
            console.log(`\n--- ${label}: ${err ? '失敗' : 'OK'} ---${out ? `\n${out}` : ''}`)
            resolve(!err)
          })
        }),
    ),
  )

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

// 2. 最新であること(リモートより遅れていない・進んでいない)と、
// 4. 前回の反映を表示する。同じコミットなら、反映し直さない
// (ほかの人の反映を待ったあとにも、もう一度確かめるので、まとめておく)
const head = sh('git rev-parse HEAD')
const checkUpToDate = () => {
  run('git fetch origin --tags')
  const behind = Number(sh('git rev-list --count HEAD..origin/main'))
  const ahead = Number(sh('git rev-list --count origin/main..HEAD'))
  if (behind > 0) fail(`リモートの main が ${behind} 件先に進んでいます。git pull してから、もう一度実行してください。`)
  if (ahead > 0) fail(`まだ push していないコミットが ${ahead} 件あります。チームが同じコードを見られるよう、先に git push してください。`)
  const last = sh('git tag --list "deployed-gcp/*" --sort=-creatordate').split('\n').filter(Boolean)[0]
  if (last) {
    const lastCommit = sh(`git rev-list -n 1 ${last}`)
    const lastInfo = sh(`git tag -l --format="%(creatordate:iso8601) %(contents:subject)" ${last}`)
    console.log(`前回の反映: ${last}(コミット ${lastCommit.slice(0, 7)}) ${lastInfo}`)
    if (lastCommit === head) fail('このコミットは、すでに反映済みです(反映し直す必要はありません)。')
  }
}
checkUpToDate()

// 3. 変更が残っていないこと(追跡しているファイルの未コミットの変更)
const dirty = sh('git status --porcelain --untracked-files=no')
if (dirty) fail(`コミットしていない変更があります:\n${dirty}`)

// ほかの人(別の PC)が、同じサービスに反映している最中なら、そちらを優先して、終わるまで待つ。
// --source の反映のビルドにも、cloudbuild.yaml のビルドにも、タグ service_<サービス名> が付く。
// 待ったあとは、main が先に進んでいないか・同じコミットが反映済みでないかを、確かめ直す。
const WAIT_STEP_SEC = 20
const WAIT_MAX_MIN = 20
const busyBuilds = () => {
  try {
    return shq(
      `gcloud builds list --project ${project} --region ${REGION} --limit 10 --format="value(id)"` +
        ` --filter="tags=service_${SERVICE} AND (status=WORKING OR status=QUEUED)"`,
    )
      .split('\n')
      .filter(Boolean)
  } catch {
    // 一覧を見る権限がないなどで確かめられないときは、これまでどおり進める(反映そのものは止めない)
    console.warn('(ほかの人の反映中のビルドを、確かめられませんでした。このまま進めます。)')
    return []
  }
}
const waitForOthers = async () => {
  let busy = busyBuilds()
  if (busy.length === 0) return
  console.log(`\nほかの人の反映(Cloud Build ${busy.join(', ')})が進行中です。終わるまで待ちます(最大 ${WAIT_MAX_MIN} 分。やめるなら Ctrl+C)。`)
  const until = Date.now() + WAIT_MAX_MIN * 60 * 1000
  while (busy.length > 0) {
    if (Date.now() > until) fail(`ほかの人の反映が ${WAIT_MAX_MIN} 分たっても終わりません。Cloud Build の履歴を確かめてから、もう一度実行してください。`)
    await new Promise((r) => setTimeout(r, WAIT_STEP_SEC * 1000))
    busy = busyBuilds()
  }
  // ビルドのあと、リビジョンの切り替えと反映の印(タグ)の送信が続くので、少し待ってから確かめ直す
  console.log('ほかの人のビルドが終わりました。リビジョンの切り替えを待ってから、もう一度確かめます。')
  await new Promise((r) => setTimeout(r, 60 * 1000))
  checkUpToDate()
}

console.log(`\n反映先: プロジェクト ${project} / リージョン ${REGION} / サービス ${SERVICE}(アカウント ${account})`)

// 5. 検証 → ビルド → 反映
// 型チェックと lint を同時に行う。画面のビルド(vite build)は、クラウドの中で行うので、ここではしない
// (手元の dist は送らない。.gcloudignore)。
console.log('\n[1/3] 型チェックと lint(同時に)')
const checks = await runAll([
  ['型チェック(tsc -b)', 'npx tsc -b'],
  ['lint(eslint)', 'npx eslint .'],
])
if (checks.includes(false)) fail('型チェックか lint が通りませんでした(上の出力)。')

// 手元の確認のあいだに、ほかの人が反映を始めていることもあるので、クラウドでビルドする直前に見る
await waitForOthers()

const short = sh('git rev-parse --short HEAD')
// これまでの --source の反映と同じ、イメージの置き場(Artifact Registry の cloud-run-source-deploy)と、
// ソースを置くバケットを使う(新しく作るものはない)
const image = `${REGION}-docker.pkg.dev/${project}/cloud-run-source-deploy/${SERVICE}`
let built = false
if (process.env.DEPLOY_BUILD !== 'source') {
  console.log('\n[2/3] クラウドでビルド(gcloud builds submit。層のキャッシュを使う。初回や依存を変えたときは数分かかります)')
  try {
    // ログは Cloud Logging だけに出す設定なので、ここには流さない(流そうとすると、権限によっては失敗扱いになる)
    run(
      `gcloud builds submit . --config cloudbuild.yaml --project ${project} --region ${REGION}` +
        ` --gcs-source-staging-dir gs://run-sources-${project}-${REGION}/builds` +
        ` --substitutions _IMAGE=${image},_TAG=${short} --suppress-logs`,
    )
    built = true
  } catch {
    console.warn('\n(キャッシュつきのビルドに失敗しました。これまでの --source の反映に切り替えます。ログは Cloud Build の履歴で見られます。)')
  }
}
if (built) {
  console.log('\n[3/3] 反映(gcloud run deploy --image)')
  run(`gcloud run deploy ${SERVICE} --image ${image}:${short} --project ${project} --region ${REGION} --quiet`)
} else {
  console.log('\n[2-3/3] 反映(gcloud run deploy --source。クラウドでキャッシュなしでビルドするので、数分かかります)')
  run(`gcloud run deploy ${SERVICE} --source . --project ${project} --region ${REGION} --quiet`)
}

// 6. 反映の印(タグ)を残して、GitHub に送る(失敗しても、反映は済んでいる)
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
