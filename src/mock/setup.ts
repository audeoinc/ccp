// 撮影・デモ用: 初期設定の画面(src/data/setup.ts)の身代わり。URL に ?setup=1 を付けたときだけ「初期設定が要る」を返す(ふだんの見本の画面は、そのまま)。
// 合言葉は sample-key。DB は host=localhost・name=ccp・user=ccp のときだけつながる。値はこのメモリの中だけ
import type { SetupService as Real, SetupState, SetupStep, SetupStepId } from '../data/setup'

const wanted = typeof location !== 'undefined' && new URLSearchParams(location.search).get('setup') === '1'
let entered = ''
let finished = false
const steps: Record<SetupStepId, SetupStep> = {
  db: { id: 'db', done: false, locked: false, values: { host: '', port: '5432', name: '', user: '' }, secretSet: false },
  // 環境から渡された値は、サーバーと同じく「済み」(見本で、変えられない段の見え方を出すため)
  google: { id: 'google', done: true, locked: true, values: { project: 'sample-project', location: 'global' } },
  assets: { id: 'assets', done: false, locked: false, values: { dir: '' } },
  password: { id: 'password', done: false, locked: false, values: {}, secretSet: false },
}
const view = (): SetupState => ({ needed: true, fileMode: 'default', reason: 'DB のつなぎ先(DATABASE_URL)がありません', steps: Object.values(steps).map((s) => ({ ...s, values: { ...s.values } })), file: '/srv/ccp/server/ccp.env' })
const wait = () => new Promise((r) => setTimeout(r, 700))

function check(step: SetupStepId, v: Record<string, string>): { ok: boolean; message: string } {
  if (step === 'db') {
    if (!v.host || !v.name || !v.user) return { ok: false, message: 'ホスト・DB の名前・ユーザーを入れてください' }
    const ok = v.host === 'localhost' && v.name === 'ccp' && v.user === 'ccp'
    return ok ? { ok, message: 'つながりました(PostgreSQL 16.4)' } : { ok, message: 'ホストが見つかりません(ホスト名を確かめてください)。(gaierror: Name or service not known)' }
  }
  if (step === 'google') return { ok: true, message: '認証が取れました(ccp-server@sample-project.iam.gserviceaccount.com)。AI と BigQuery は、始めたあとに ⚙ で確かめます' }
  if (step === 'assets') return v.dir?.startsWith('/') ? { ok: true, message: '書けます(保存するとフォルダを作ります)' } : { ok: false, message: '絶対パスで入れてください(起動する場所によって見つからなくなるため)' }
  return (v.password ?? '').length >= 8 ? { ok: true, message: '使えます' } : { ok: false, message: '8 文字以上にしてください' }
}

export const setSetupKey = (k: string) => {
  entered = k
}

export const SetupService: typeof Real = {
  state: async () => {
    if (!wanted || finished) return { data: { needed: false } }
    return entered === 'sample-key' ? { data: view() } : { data: { needed: true, reason: view().reason, fileMode: 'default', keyRequired: true } }
  },
  test: async (step, values) => {
    await wait()
    return { data: check(step, values) }
  },
  save: async (step, values) => {
    await wait()
    const r = check(step, values)
    if (r.ok) {
      steps[step].done = true
      steps[step].skipped = false
      if (step === 'db') steps.db.values = { host: values.host, port: values.port, name: values.name, user: values.user }
      if (step === 'assets') steps.assets.values = { dir: values.dir }
      if (step === 'password' || step === 'db') steps[step].secretSet = true
    }
    return { data: { ...r, state: view() } }
  },
  skip: async (step) => {
    steps[step].done = true
    steps[step].skipped = true
    return { data: view() }
  },
  importTemplate: async (template) => {
    await wait()
    if ((template as { kind?: string })?.kind !== 'ccp-settings-template') return { error: '設定の型のファイルではありません' }
    return { data: { dropped: [], pending: true } }
  },
  finish: async () => {
    finished = true
    return { data: { needed: false } }
  },
}
