// CCP の頼み T1〜T6 を Copilot Studio のエージェントに送り、速さと答えの形を測る(検証の道具。CCP の画面・サーバーには入れない)。
// 方式 1(Direct Line)と方式 2(Microsoft 365 Agents SDK)の両方で送れる。手順と結果は docs/MS_AI_VERIFY.md。
// 方式 2 は、Microsoft のサンプル microsoft/Agents の samples/nodejs/copilotstudio-client を元にした。
//
//   node measure.mjs              方式 2 で T1〜T5 を、それぞれ決めた回数ずつ送る
//   node measure.mjs --via dl     方式 1(Direct Line)で送る。設定の DIRECT_LINE_SECRET を使い、サインインはしない
//   node measure.mjs --runs 5     どれも 5 回ずつ送る
//   node measure.mjs --only T3    T3 だけ
//   node measure.mjs --model "GPT Chat Latest"   記録に書くモデルの名前(設定の MODEL_LABEL より優先)
//   node measure.mjs --only T6 --image images/t6-sample.png   T6 を、画像を付けて送る
//   node measure.mjs --self-test  つながずに、確かめの仕組みだけを試す
//
// モデルはエージェントの画面で選ぶ(つなぎ方からは分からない)。選んだ名前を MODEL_LABEL か --model で渡し、記録に残す。
//
// 設定(鍵・環境の ID など)は、リポジトリの外の %USERPROFILE%\.ccp\ms-verify.env から読む。ここには書かない。
// 方式 2 のサインインは、最初の 1 回だけブラウザが開く(人が行う)。トークンはこのフォルダの .token-cache.json に残る
// (消せば、次はサインインし直し)。.token-cache.json と results/ は Git に入れない(.gitignore)。

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { TESTS, SAMPLES, T6_TEST } from './tests.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ENV_FILE = path.join(os.homedir(), '.ccp', 'ms-verify.env')
const CACHE_FILE = path.join(HERE, '.token-cache.json')
const OUT_DIR = path.join(HERE, 'results')

const args = process.argv.slice(2)
const opt = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}

if (args.includes('--self-test')) {
  let bad = 0
  for (const t of TESTS) {
    const [text, want] = SAMPLES[t.id]
    const r = t.check(text)
    const pass = r.ok === want
    if (!pass) bad++
    console.log(`${pass ? 'OK' : 'NG'} ${t.id} ok=${r.ok}(見込み ${want}) ${r.notes.join(' / ')}`)
  }
  process.exit(bad ? 1 : 0)
}

const via = opt('--via') ?? 'sdk'
if (!['sdk', 'dl'].includes(via)) throw new Error(`--via は sdk か dl です: ${via}`)

function readEnv() {
  if (!fs.existsSync(ENV_FILE)) throw new Error(`設定のファイルがありません: ${ENV_FILE}`)
  const env = {}
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/)
    if (m) env[m[1]] = m[2]
  }
  const need = via === 'dl' ? ['DIRECT_LINE_SECRET'] : ['COPILOT_ENVIRONMENT_ID', 'COPILOT_AGENT_SCHEMA_NAME', 'TENANT_ID', 'APP_CLIENT_ID']
  const missing = need.filter((k) => !env[k])
  if (missing.length) throw new Error(`設定が空です: ${missing.join(', ')}(${ENV_FILE})`)
  return env
}

const { PublicClientApplication } = await import('@azure/msal-node')
const { CopilotStudioClient, ConnectionSettings } = await import('@microsoft/agents-copilotstudio-client')
const { Activity, ActivityTypes } = await import('@microsoft/agents-activity')
const open = (await import('open')).default

const cachePlugin = {
  beforeCacheAccess: async (ctx) => {
    if (fs.existsSync(CACHE_FILE)) ctx.tokenCache.deserialize(fs.readFileSync(CACHE_FILE, 'utf8'))
  },
  afterCacheAccess: async (ctx) => {
    if (ctx.cacheHasChanged) fs.writeFileSync(CACHE_FILE, ctx.tokenCache.serialize())
  },
}

async function getToken(env, settings) {
  const pca = new PublicClientApplication({
    auth: { clientId: env.APP_CLIENT_ID, authority: `https://login.microsoftonline.com/${env.TENANT_ID}` },
    cache: { cachePlugin },
  })
  const scopes = [CopilotStudioClient.scopeFromSettings(settings)]
  const accounts = await pca.getAllAccounts()
  if (accounts.length) {
    try {
      return (await pca.acquireTokenSilent({ account: accounts[0], scopes })).accessToken
    } catch {
      /* 期限切れなど。人にサインインし直してもらう */
    }
  }
  console.log('ブラウザでサインインしてください(人が行う)')
  return (await pca.acquireTokenInteractive({ scopes, openBrowser: async (url) => void (await open(url)) })).accessToken
}

// 1 回の頼み。CCP の呼び出しは 1 回ずつ独立しているので、毎回新しい会話を始める(前の答えが混ざらないように)
async function askOnce(client, prompt, image) {
  const t0 = performance.now()
  let conversationId = ''
  for await (const act of client.startConversationStreaming({ emitStartConversationEvent: false, locale: 'ja-JP' })) {
    conversationId = act.conversation?.id ?? conversationId
  }
  const tStart = performance.now()
  const activity = new Activity('message')
  activity.text = prompt
  if (image) activity.attachments = [image]
  if (conversationId) activity.conversation = { id: conversationId }
  let first = null
  let firstText = null
  const texts = []
  const types = []
  for await (const r of client.sendActivityStreaming(activity)) {
    if (first === null) first = performance.now()
    types.push(r.type)
    if (r.type === ActivityTypes.Message && r.text) {
      if (firstText === null) firstText = performance.now()
      texts.push(r.text)
    }
  }
  const tEnd = performance.now()
  const s = (a, b) => (a === null ? '' : ((b - a) / 1000).toFixed(2))
  return {
    startSec: s(t0, tStart),
    firstSec: s(tStart, first ?? tEnd),
    firstTextSec: firstText === null ? '' : s(tStart, firstText),
    endSec: s(tStart, tEnd),
    messages: texts.length,
    types: [...new Set(types)].join('+'),
    // 答えが何通かに分かれて届いたときは、最後のもの(ふつうは本文)を使う
    text: texts.at(-1) ?? '',
  }
}

// ---- 方式 1: Direct Line。鍵(シークレット)は短い期限のトークンに取り替えてから使い、鍵そのものは会話に流さない(CCP の層も同じ形にする)
const DL_ME = 'ccp-verify'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function dlFetch(url, token, body) {
  const res = await fetch(url, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  // 失敗の中身に鍵やトークンは入らないが、念のため本文は 200 文字までにする
  if (!res.ok) throw new Error(`Direct Line ${res.status}: ${text.slice(0, 200)}`)
  return text ? JSON.parse(text) : {}
}

// Direct Line には答えの終わりの合図がない。自分の頼みへの返事(replyToId)で、文のある message が届いたら終わりとみなす。
// 取りに行く間隔(POLL_MS)の分だけ、届いてから気づくまでが遅れる
const POLL_MS = 250
async function askOnceDl(dl, prompt, image) {
  const t0 = performance.now()
  const { token } = await dlFetch(`${dl.base}/tokens/generate`, dl.secret, {})
  const conv = await dlFetch(`${dl.base}/conversations`, token, {})
  const tStart = performance.now()
  const activity = { type: 'message', from: { id: DL_ME }, locale: 'ja-JP', text: prompt }
  let myId
  if (image) {
    // Direct Line は添付の data: の URL を受け付けない(InvalidUri)。ファイルは upload の入口に、頼みの文と一緒に multipart で送る
    const [, mime, b64] = image.contentUrl.match(/^data:([^;]+);base64,(.*)$/)
    const form = new FormData()
    form.append('activity', new Blob([JSON.stringify(activity)], { type: 'application/vnd.microsoft.activity' }))
    form.append('file', new Blob([Buffer.from(b64, 'base64')], { type: mime }), image.name)
    const res = await fetch(`${dl.base}/conversations/${conv.conversationId}/upload?userId=${DL_ME}`, { method: 'POST', headers: { Authorization: `Bearer ${conv.token ?? token}` }, body: form })
    const text = await res.text()
    if (!res.ok) throw new Error(`Direct Line upload ${res.status}: ${text.slice(0, 200)}`)
    myId = JSON.parse(text).id
  } else {
    myId = (await dlFetch(`${dl.base}/conversations/${conv.conversationId}/activities`, conv.token ?? token, activity)).id
  }
  let watermark = ''
  let first = null
  let firstText = null
  const texts = []
  const types = []
  const deadline = tStart + 120_000
  while (firstText === null && performance.now() < deadline) {
    await sleep(POLL_MS)
    const got = await dlFetch(`${dl.base}/conversations/${conv.conversationId}/activities${watermark ? `?watermark=${watermark}` : ''}`, conv.token ?? token)
    watermark = got.watermark ?? watermark
    for (const a of got.activities ?? []) {
      if (a.from?.id === DL_ME) continue
      if (first === null) first = performance.now()
      types.push(a.type)
      if (a.type === 'message' && a.text && (!a.replyToId || a.replyToId === myId)) {
        if (firstText === null) firstText = performance.now()
        texts.push(a.text)
      }
    }
  }
  const tEnd = performance.now()
  const s = (a, b) => (a === null ? '' : ((b - a) / 1000).toFixed(2))
  if (firstText === null) throw new Error('120 秒待っても答えが届かなかった')
  return {
    startSec: s(t0, tStart),
    firstSec: s(tStart, first ?? tEnd),
    firstTextSec: s(tStart, firstText),
    endSec: s(tStart, tEnd),
    messages: texts.length,
    types: [...new Set(types)].join('+'),
    text: texts.at(-1) ?? '',
  }
}

const env = readEnv()
const model = opt('--model') ?? env.MODEL_LABEL ?? ''
if (!model) throw new Error(`モデルの名前がありません。エージェントで選んだモデルを ${ENV_FILE} の MODEL_LABEL か --model で渡してください`)
let ask
if (via === 'dl') {
  // 窓口は、チャネルの画面に出る URL(地域ごとに違うことがある)。なければ既定の窓口
  const dl = { base: `${(env.DIRECT_LINE_ENDPOINT || 'https://directline.botframework.com').replace(/\/+$/, '').replace(/\/v3\/directline$/, '')}/v3/directline`, secret: env.DIRECT_LINE_SECRET }
  ask = (prompt, image) => askOnceDl(dl, prompt, image)
} else {
  const settings = new ConnectionSettings({ environmentId: env.COPILOT_ENVIRONMENT_ID, agentIdentifier: env.COPILOT_AGENT_SCHEMA_NAME })
  const token = await getToken(env, settings)
  const client = new CopilotStudioClient(settings, token)
  ask = (prompt, image) => askOnce(client, prompt, image)
}

const only = opt('--only')
const runsOverride = opt('--runs') ? Number(opt('--runs')) : null
// 画像は Bot Framework の添付の形(contentType と contentUrl)で渡す。CCP の画像も base64 で持つので、data: の URL にする
const imagePath = opt('--image')
let image = null
if (imagePath) {
  const ext = path.extname(imagePath).toLowerCase()
  const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }[ext]
  if (!mime) throw new Error(`画像の形式が分かりません: ${ext}`)
  image = { contentType: mime, contentUrl: `data:${mime};base64,${fs.readFileSync(imagePath).toString('base64')}`, name: path.basename(imagePath) }
}
const tests = image ? [T6_TEST] : TESTS

const rows = []
for (const t of tests.filter((x) => !only || x.id === only)) {
  for (let i = 1; i <= (runsOverride ?? t.runs); i++) {
    let r
    try {
      r = await ask(t.prompt, image)
    } catch (e) {
      r = { startSec: '', firstSec: '', firstTextSec: '', endSec: '', messages: 0, types: '', text: '', error: String(e?.message ?? e) }
    }
    const c = r.error ? { json: false, fenced: false, ok: false, notes: [`呼び出しの失敗: ${r.error}`] } : t.check(r.text)
    rows.push({ via, model, id: t.id, name: t.name, run: i, ...r, ...c })
    console.log(`${t.id} #${i} 始め ${r.startSec}s / 最初 ${r.firstSec}s / 本文 ${r.firstTextSec}s / 終わり ${r.endSec}s / JSON ${c.json ? '○' : c.fenced ? '△' : '×'} / 決まり ${c.ok ? '○' : '×'} ${c.notes.join(' / ')}`)
  }
}

fs.mkdirSync(OUT_DIR, { recursive: true })
// ファイルの名前にもモデルを入れる(モデルを替えて測った表を並べて見比べやすいように)
const stamp = `${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}_${via}_${model.replace(/[^\w.-]+/g, '-')}`
const md = [
  `方式: ${via === 'dl' ? '1(Direct Line。取りに行く間隔 ' + POLL_MS + 'ms)' : '2(Agents SDK)'} / モデル: ${model}`,
  '',
  '| 頼み | 回 | 会話を始める(秒) | 最初に届く(秒) | 本文が届く(秒) | 終わり(秒) | 届いた種類 | JSON | 決まり | 守れなかった所 |',
  '|---|---|---|---|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.id} ${r.name} | ${r.run} | ${r.startSec} | ${r.firstSec} | ${r.firstTextSec} | ${r.endSec} | ${r.types} | ${r.json ? '○' : r.fenced ? '△(囲みあり)' : '×'} | ${r.ok ? '○' : '×'} | ${r.notes.join(' / ')} |`),
].join('\n')
fs.writeFileSync(path.join(OUT_DIR, `${stamp}.md`), md + '\n')
// 答えの全文は、ここにだけ残す(リポジトリには入れない)
fs.writeFileSync(path.join(OUT_DIR, `${stamp}.json`), JSON.stringify(rows, null, 2))
console.log(`\n${md}\n\n書き出した: ${path.join(OUT_DIR, stamp)}.md / .json`)
