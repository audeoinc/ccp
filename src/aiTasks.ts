import { askAgent } from './aiSelect'
import { tr } from './i18n'

// 質問と返信のやり取り(誰からでも、誰にでも)から、やること(タスク)の案を出す。案は保存しない(採用したものだけを、タスクとして保存する)
const TASKS_PROMPT = `あなたは、ファッション通販の配信(メール・プッシュ)の制作進行を手伝うアシスタントです。
下の「入力」の JSON を読み、質問した人(asker)と返信した人(replier)のやり取り(question と reply)から、「やること(タスク)」を取り出して、JSON だけで返してください。

# 出力の形式(厳守)
次の JSON オブジェクト 1 つだけを返す。JSON の外には、説明文、コードフェンス、前置き、あとがきを一切付けない。
{"tasks":[{"text":"...","assignee":"...","due":"YYYY-MM-DD"}]}

# ルール
1. text は、何をするかが一文で分かる、短い命令形(40 文字以内)。やり取りに書かれていないことは足さない。
2. assignee は、そのタスクをする人の名前。やり取りの内容から、作業をする側が asker(質問した人)か replier(返信した人)かを決める。分からなければ asker。
3. due は、card.productionDue(制作の締め切り)があればその日。なければ空文字。
4. やることがなければ {"tasks":[]} を返す。既に終わったことや、質問の繰り返しは、タスクにしない。
5. existing(既にあるタスク)と同じ内容は出さない。

# 入力
`

export interface TaskIdea {
  text: string
  assignee: string
  due: string
}

export async function suggestTasks(args: {
  question: string
  reply: string
  asker: string
  replier: string
  card: { name: string; productionDue: string }
  existing: string[]
}): Promise<TaskIdea[]> {
  const parsed = (await askAgent(TASKS_PROMPT, { task: 'suggest_tasks', ...args })) as { tasks?: { text?: string; assignee?: string; due?: string }[] }
  const list = (parsed.tasks ?? [])
    .filter((x) => x.text?.trim())
    .map((x) => ({ text: String(x.text).trim(), assignee: String(x.assignee ?? args.asker).trim(), due: /^\d{4}-\d{2}-\d{2}$/.test(String(x.due ?? '')) ? String(x.due) : '' }))
  if (!parsed.tasks) throw new Error(tr('タスクの案を取得できませんでした', 'Could not get task ideas'))
  return list
}
