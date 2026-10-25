// 配信カードの保存の流れ(src/saveFlow.ts)が、例どおりに決めて、決まった順に行うことを確かめる。
//   node scripts/check-save.mjs        ← npm run verify に含まれる
// 確定した週・承認済みの配信・新規作成・失敗したときの止まり方など、保存の流れを直すときに崩れやすい所を、例で固める(整理 第3段 ④)。
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createServer } from 'vite'
import { report, viteForChecks } from './check-approvals.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// input = planSave に渡すもの、plan = 決めること、steps = runSave が行う順(失敗させる段は fail に)
const cases = [
  {
    name: '新規作成',
    input: { isNew: true, formStatus: 'not_started', approvedBefore: false, contentChanged: false },
    plan: { status: 'not_started', revoke: false, reopen: false, resetApproval: false, event: null },
    steps: ['writeCard:not_started', 'syncItems', 'created', 'saveAlertNotes', 'reload'],
  },
  {
    name: '承認前の配信を直した',
    input: { isNew: false, savedStatus: 'not_started', formStatus: 'not_started', approvedBefore: false, contentChanged: true },
    plan: { status: 'not_started', revoke: false, reopen: false, resetApproval: false, event: null },
    steps: ['writeCard:not_started', 'syncItems', 'saveAlertNotes', 'reload'],
  },
  {
    name: '承認済みの配信の中身を変えた(承認待ちに戻し、承認をやり直す)',
    input: { isNew: false, savedStatus: 'approved', formStatus: 'approved', approvedBefore: true, contentChanged: true },
    plan: { status: 'reviewing', revoke: true, reopen: false, resetApproval: true, event: 'revoke' },
    steps: ['writeCard:reviewing', 'syncItems', 'resetApproval', 'logEvent:revoke', 'saveAlertNotes', 'reload'],
  },
  {
    name: '承認済みの配信を、変えずに保存した',
    input: { isNew: false, savedStatus: 'approved', formStatus: 'approved', approvedBefore: true, contentChanged: false },
    plan: { status: 'approved', revoke: false, reopen: false, resetApproval: false, event: null },
    steps: ['writeCard:approved', 'syncItems', 'saveAlertNotes', 'reload'],
  },
  {
    name: '承認済みの配信で、人がステータスを変えた(やり直しにしない)',
    input: { isNew: false, savedStatus: 'approved', formStatus: 'confirmed', approvedBefore: true, contentChanged: true },
    plan: { status: 'confirmed', revoke: false, reopen: false, resetApproval: false, event: 'status' },
    steps: ['writeCard:confirmed', 'syncItems', 'logEvent:status', 'saveAlertNotes', 'reload'],
  },
  {
    name: '確定した週の配信を、理由を入れて変えた(週をレビューに戻す)',
    input: { isNew: false, savedStatus: 'confirmed', formStatus: 'confirmed', reason: '在庫切れ', approvedBefore: true, contentChanged: true },
    plan: { status: 'reviewing', revoke: false, reopen: true, resetApproval: true, event: 'reopen' },
    steps: ['writeCard:reviewing', 'syncItems', 'reopenWeeks', 'noteReason', 'resetApproval', 'logEvent:reopen', 'saveAlertNotes', 'reload'],
  },
  {
    name: '確定した週に、新しい配信を作った',
    input: { isNew: true, formStatus: 'not_started', reason: '追加', approvedBefore: false, contentChanged: false },
    plan: { status: 'reviewing', revoke: false, reopen: true, resetApproval: false, event: null },
    steps: ['writeCard:reviewing', 'syncItems', 'created', 'reopenWeeks', 'noteReason', 'saveAlertNotes', 'reload'],
  },
  {
    name: '商品の行を読めていない(行を書かない。消してしまわないように)',
    input: { isNew: false, savedStatus: 'not_started', formStatus: 'not_started', approvedBefore: false, contentChanged: true },
    noItems: true,
    plan: { status: 'not_started', revoke: false, reopen: false, resetApproval: false, event: null },
    steps: ['writeCard:not_started', 'saveAlertNotes', 'reload'],
  },
  {
    name: '週を戻せなかった(承認の依頼・履歴・読み直しには進まない)',
    input: { isNew: false, savedStatus: 'confirmed', formStatus: 'confirmed', reason: '差し替え', approvedBefore: true, contentChanged: true },
    fail: 'reopenWeeks',
    plan: { status: 'reviewing', revoke: false, reopen: true, resetApproval: true, event: 'reopen' },
    steps: ['writeCard:reviewing', 'syncItems', 'reopenWeeks'],
  },
]

/** 確かめる(server は、src を読み込む Vite のサーバー) */
export async function checkSave(server) {
  const problems = []
  const m = await server.ssrLoadModule('/src/saveFlow.ts')
  for (const c of cases) {
    const plan = m.planSave(c.input)
    if (JSON.stringify(plan) !== JSON.stringify(c.plan)) problems.push(`「${c.name}」の決めること: ${JSON.stringify(plan)}(期待: ${JSON.stringify(c.plan)})`)
    const log = []
    const step = (name, label = name) => async () => {
      log.push(label)
      if (c.fail === name) throw new Error('fail')
    }
    const io = {
      writeCard: async (status) => {
        log.push(`writeCard:${status}`)
        return 'card-1'
      },
      syncItems: c.noItems ? null : step('syncItems'),
      created: () => log.push('created'),
      reopenWeeks: step('reopenWeeks'),
      noteReason: step('noteReason'),
      resetApproval: step('resetApproval'),
      logEvent: async (_id, action) => {
        log.push(`logEvent:${action}`)
      },
      saveAlertNotes: step('saveAlertNotes'),
      reload: step('reload'),
    }
    let failed = false
    try {
      await m.runSave(plan, c.input.isNew, io)
    } catch {
      failed = true
    }
    if (failed !== !!c.fail) problems.push(`「${c.name}」: ${failed ? '途中で止まった' : '止まらなかった'}`)
    if (JSON.stringify(log) !== JSON.stringify(c.steps)) problems.push(`「${c.name}」の順番: ${log.join(' → ')}(期待: ${c.steps.join(' → ')})`)
  }
  return { problems, ok: `save flow OK(${cases.length} 例)`, title: '配信カードの保存の流れが、例と合いません' }
}

// 単独で流したとき
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = await createServer(viteForChecks(root))
  try {
    report(await checkSave(server))
  } finally {
    await server.close()
  }
}
