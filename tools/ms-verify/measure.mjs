// CCP の頼み T1〜T6 を Copilot Studio のエージェントに送り、速さと答えの形を測る(検証の道具。CCP の画面・サーバーには入れない)。
// 方式 1(Direct Line)と方式 2(Microsoft 365 Agents SDK)の両方で送れる。手順と結果は docs/MS_AI_VERIFY.md。
// 方式 2 は、Microsoft のサンプル microsoft/Agents の samples/nodejs/copilotstudio-client を元にした。
//
//   node measure.mjs              方式 2 で T1〜T5 を、それぞれ決めた回数ずつ送る
//   node measure.mjs --via dl     方式 1(Direct Line)で送る。設定の DIRECT_LINE_SECRET を使い、サインインはしない
//   node measure.mjs --via aib    方式 3(AI Builder のプロンプトを Dataverse の Predict で呼ぶ)。アプリだけの認証(AIB_CLIENT_ID・AIB_CLIENT_SECRET)。
//                                 プロンプトは名前(AIB_PROMPT_NAME。既定「CCP AI 出口の検証 中継」)で探し、頼みの文を入力 request に入れる
//                                 (Predict は外から直接呼べず「Source is null」で断られた。手順書 15.5)
//   node measure.mjs --via flow   方式 3 を、Power Automate の流れを窓口にして呼ぶ(AIB_FLOW_URL に {"request": …} を POST し、{"text": …} を受け取る)
//   node measure.mjs --via dl --secret-name DIRECT_LINE_SECRET_GH   別のエージェントの鍵(設定の別の名前)で送る
//   node measure.mjs --runs 5     どれも 5 回ずつ送る
//   node measure.mjs --only T3    T3 だけ
//   node measure.mjs --model "GPT Chat Latest"   記録に書くモデルの名前(設定の MODEL_LABEL より優先)
//   node measure.mjs --only T6 --image images/<写真>.jpg   T6 を、画像を付けて送る(写真は各自で用意する。リポジトリには入れない)
//   node measure.mjs --only T9 --image a.jpg --image b.jpg …   T9 は画像を何枚も付ける(--image を並べる。最大 8 枚)。T6〜T8 は 1 枚
//   node measure.mjs --only T9 --image … --theme "…" --product "…" --strengths "…"   T9 の配信と商品を、写真に合わせる
//   node measure.mjs --via flow --pad --only T9 --image …   流れの画像の欄の足りない分を白い画像で埋める(空の欄は断られるため)
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
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { TESTS, SAMPLES, IMAGE_TESTS } from './tests.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ENV_FILE = path.join(os.homedir(), '.ccp', 'ms-verify.env')
const CACHE_FILE = path.join(HERE, '.token-cache.json')
const OUT_DIR = path.join(HERE, 'results')

const args = process.argv.slice(2)
const opt = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
// 同じ名前を何度も渡せるもの(--image)
const opts = (name) => args.flatMap((a, i) => (a === name && args[i + 1] ? [args[i + 1]] : []))

if (args.includes('--self-test')) {
  let bad = 0
  for (const t of [...TESTS, ...IMAGE_TESTS].filter((x) => SAMPLES[x.id])) {
    const [text, want, count] = SAMPLES[t.id]
    const r = t.check(text, count)
    const pass = r.ok === want
    if (!pass) bad++
    console.log(`${pass ? 'OK' : 'NG'} ${t.id} ok=${r.ok}(見込み ${want}) ${r.notes.join(' / ')}`)
  }
  process.exit(bad ? 1 : 0)
}

const via = opt('--via') ?? 'sdk'
// 別のエージェントの Direct Line の鍵を、設定の別の名前で持つとき(例: --secret-name DIRECT_LINE_SECRET_GH)。いつもの鍵を書き換えずに済む
const DL_SECRET_NAME = opt('--secret-name') ?? 'DIRECT_LINE_SECRET'
if (!/^[A-Z_]+$/.test(DL_SECRET_NAME)) throw new Error(`--secret-name は大文字と _ だけの名前です: ${DL_SECRET_NAME}`)
if (!['sdk', 'dl', 'aib', 'flow'].includes(via)) throw new Error(`--via は sdk・dl・aib・flow です: ${via}`)

function readEnv() {
  if (!fs.existsSync(ENV_FILE)) throw new Error(`設定のファイルがありません: ${ENV_FILE}`)
  const env = {}
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/)
    if (m) env[m[1]] = m[2]
  }
  const need =
    via === 'dl' ? [DL_SECRET_NAME] : via === 'flow' ? ['AIB_FLOW_URL'] : via === 'aib' ? ['TENANT_ID', 'AIB_CLIENT_ID', 'AIB_CLIENT_SECRET', 'DATAVERSE_URL'] : ['COPILOT_ENVIRONMENT_ID', 'COPILOT_AGENT_SCHEMA_NAME', 'TENANT_ID', 'APP_CLIENT_ID']
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
async function askOnce(client, prompt, images) {
  const t0 = performance.now()
  let conversationId = ''
  for await (const act of client.startConversationStreaming({ emitStartConversationEvent: false, locale: 'ja-JP' })) {
    conversationId = act.conversation?.id ?? conversationId
  }
  const tStart = performance.now()
  const activity = new Activity('message')
  activity.text = prompt
  if (images.length) activity.attachments = images
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
async function askOnceDl(dl, prompt, images) {
  const t0 = performance.now()
  const { token } = await dlFetch(`${dl.base}/tokens/generate`, dl.secret, {})
  const conv = await dlFetch(`${dl.base}/conversations`, token, {})
  const tStart = performance.now()
  const activity = { type: 'message', from: { id: DL_ME }, locale: 'ja-JP', text: prompt }
  let myId
  if (images.length) {
    // Direct Line は添付の data: の URL を受け付けない(InvalidUri)。ファイルは upload の入口に、頼みの文と一緒に multipart で送る。
    // 何枚もあるときは、file の部分を並べる(並べた順が添付の順。T9 の番号はこの順)
    const form = new FormData()
    form.append('activity', new Blob([JSON.stringify(activity)], { type: 'application/vnd.microsoft.activity' }))
    for (const image of images) {
      const [, mime, b64] = image.contentUrl.match(/^data:([^;]+);base64,(.*)$/)
      form.append('file', new Blob([Buffer.from(b64, 'base64')], { type: mime }), image.name)
    }
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

// ---- 方式 3: AI Builder。人のサインインなしに、アプリの鍵(クライアント シークレット)で Dataverse のトークンを取る
async function aibToken(env) {
  const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: env.AIB_CLIENT_ID, client_secret: env.AIB_CLIENT_SECRET, scope: `${env.DATAVERSE_URL.replace(/\/+$/, '')}/.default` })
  const res = await fetch(`https://login.microsoftonline.com/${env.TENANT_ID}/oauth2/v2.0/token`, { method: 'POST', body })
  const json = await res.json().catch(() => ({}))
  // 失敗の理由(AADSTS の番号と文)だけを出す。鍵・トークンは出さない
  if (!res.ok || !json.access_token) throw new Error(`トークンを取れません ${res.status}: ${String(json.error_description ?? json.error ?? '').split(/\r?\n/)[0].slice(0, 200)}`)
  return json.access_token
}

async function dvFetch(dv, url, body) {
  const res = await fetch(url.startsWith('http') ? url : `${dv.base}/api/data/v9.2/${url}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${dv.token}`, Accept: 'application/json', 'Content-Type': 'application/json', 'OData-MaxVersion': '4.0', 'OData-Version': '4.0' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Dataverse ${res.status}: ${text.replace(/[0-9a-fA-F]{8}-[0-9a-fA-F-]{27}/g, '<ID>').slice(0, 300)}`)
  return text ? JSON.parse(text) : {}
}

// プロンプト(表 msdyn_aimodel の 1 行)を名前で探す。ID は画面に出さない
async function aibPromptId(dv, name) {
  const got = await dvFetch(dv, `msdyn_aimodels?$select=msdyn_aimodelid,msdyn_name&$filter=msdyn_name eq '${name.replace(/'/g, "''")}'`)
  const rows = got.value ?? []
  if (rows.length !== 1) throw new Error(`プロンプト「${name}」が ${rows.length} 件見つかりました(1 件のはず)`)
  return rows[0].msdyn_aimodelid
}

async function askOnceAib(dv, prompt, images) {
  if (images.length) throw new Error('方式 3 で画像を送る形は、まだ作っていない(画像の入力を持つプロンプトが要る)')
  const t0 = performance.now()
  let out = await dvFetch(dv, `msdyn_aimodels(${dv.promptId})/Microsoft.Dynamics.CRM.Predict`, {
    version: '2.0',
    requestv2: { '@odata.type': '#Microsoft.Dynamics.CRM.expando', request: prompt },
  })
  // まだできていなければ 202 と、取りに行く先が返る
  const deadline = t0 + 120_000
  while (out.overrideHttpStatusCode === 202 && out.overrideLocation && performance.now() < deadline) {
    await sleep(Math.max(500, Number(out.overrideRetryAfter ?? 1) * 1000))
    out = await dvFetch(dv, out.overrideLocation)
  }
  const tEnd = performance.now()
  const r = out.responsev2 ?? {}
  if (r.operationStatus && r.operationStatus !== 'Success') throw new Error(`Predict の結果: ${r.operationStatus}`)
  const text = r.predictionOutput?.text ?? r.predictionOutput?.structuredOutput?.text ?? ''
  const s = ((tEnd - t0) / 1000).toFixed(2)
  return { startSec: '0.00', firstSec: s, firstTextSec: s, endSec: s, messages: text ? 1 : 0, types: `predict(${r.operationStatus ?? '?'}${r.predictionOutput?.finishReason ? '・' + r.predictionOutput.finishReason : ''})`, text }
}

// ---- 方式 3 の窓口: Power Automate の流れ。流れの URL には署名の鍵が入ることがあるので、URL は画面に出さない
// 画像は、Power Automate のファイルの形({"$content-type", "$content": base64})で image に入れる。
// 画像は別の流れ(画像の入力を持つプロンプト)に送るので、URL は AIB_FLOW_IMAGE_URL。
// 送れる枚数はプロンプトの画像の入力の数(AIB_FLOW_IMAGE_MAX。既定 1)。1 枚目は imageBase64、何枚もなら imageBase64_1〜_N にも入れる
// プロンプトの画像の入力は、空(null)だと「入力パラメーターがモデルに対して無効です」で断られる(手順書 15.8)。
// --pad を付けると、足りない欄を小さな白い画像で埋め、頼みの文に「空の画像は無視する」と足す(層が枚数の違いを吸収する形の試し)
function blankPng(size = 64) {
  const crc = (buf) => {
    let c = ~0
    for (const b of buf) {
      c ^= b
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
    }
    return ~c >>> 0
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type), data])
    const c = Buffer.alloc(4)
    c.writeUInt32BE(crc(td))
    return Buffer.concat([len, td, c])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // 8 ビット
  ihdr[9] = 0 // グレー
  const raw = Buffer.alloc((size + 1) * size, 0xff)
  for (let y = 0; y < size; y++) raw[y * (size + 1)] = 0 // 各行の先頭はフィルターなし
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
  return png.toString('base64')
}

async function askOnceFlow(url, prompt, images, max = 1, pad = false) {
  if (images.length > max) throw new Error(`流れで送れる画像は ${max} 枚まで(プロンプトの画像の入力の数。${ENV_FILE} の AIB_FLOW_IMAGE_MAX)`)
  if (pad && images.length && images.length < max) {
    prompt += `\n画像 ${images.length}〜画像 ${max - 1} は、枠を埋めるための空の白い画像です。無視し、images にも picks にも書かない。`
  }
  const payload = { request: prompt }
  if (pad && images.length && images.length < max) {
    const blank = blankPng()
    for (let i = images.length; i < max; i++) payload[`imageBase64_${i + 1}`] = blank
  }
  images.forEach((img, i) => {
    const [, mime, b64] = img.contentUrl.match(/^data:([^;]+);base64,(.*)$/)
    // 流れの Image の欄には base64ToBinary(triggerBody()?['imageBase64']) を式で入れる。
    // 欄は受けた中身を自分で base64 にするので、base64 の文をそのまま入れると 2 重に包まれて読めない(MS_AI_VERIFY.md 15.8)
    if (i === 0) {
      payload.image = { '$content-type': mime, '$content': b64 }
      payload.imageBase64 = b64
    }
    if (max > 1) payload[`imageBase64_${i + 1}`] = b64
  })
  const t0 = performance.now()
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  const body = await res.text()
  const tEnd = performance.now()
  if (!res.ok) throw new Error(`流れ ${res.status}: ${body.replace(/https?:\/\/\S+/g, '<URL>').slice(0, 300)}`)
  let text = body
  try {
    const j = JSON.parse(body)
    if (typeof j?.text === 'string') text = j.text
  } catch {
    /* 文のまま返す流れ */
  }
  const s = ((tEnd - t0) / 1000).toFixed(2)
  return { startSec: '0.00', firstSec: s, firstTextSec: s, endSec: s, messages: text ? 1 : 0, types: `flow(${res.status})`, text }
}

const env = readEnv()
const model = opt('--model') ?? env.MODEL_LABEL ?? ''
if (!model) throw new Error(`モデルの名前がありません。エージェントで選んだモデルを ${ENV_FILE} の MODEL_LABEL か --model で渡してください`)
let ask
if (via === 'flow') {
  ask = (prompt, images) => {
    if (images.length && !env.AIB_FLOW_IMAGE_URL) throw new Error(`画像の流れの URL がありません(${ENV_FILE} の AIB_FLOW_IMAGE_URL)`)
    return askOnceFlow(images.length ? env.AIB_FLOW_IMAGE_URL : env.AIB_FLOW_URL, prompt, images, Number(env.AIB_FLOW_IMAGE_MAX ?? 1), args.includes('--pad'))
  }
} else if (via === 'aib') {
  // トークンとプロンプトの ID は 1 度だけ取る(層でも使い回す形)。表の「会話を始める」は 0 にし、取った秒数はここに出す
  const t0 = performance.now()
  const dv = { base: env.DATAVERSE_URL.replace(/\/+$/, ''), token: await aibToken(env) }
  dv.promptId = await aibPromptId(dv, env.AIB_PROMPT_NAME || 'CCP AI 出口の検証 中継')
  console.log(`トークンとプロンプトの ID を取った: ${((performance.now() - t0) / 1000).toFixed(2)} 秒`)
  ask = (prompt, images) => askOnceAib(dv, prompt, images)
} else if (via === 'dl') {
  // 窓口は、チャネルの画面に出る URL(地域ごとに違うことがある)。なければ既定の窓口
  const dl = { base: `${(env.DIRECT_LINE_ENDPOINT || 'https://directline.botframework.com').replace(/\/+$/, '').replace(/\/v3\/directline$/, '')}/v3/directline`, secret: env[DL_SECRET_NAME] }
  ask = (prompt, images) => askOnceDl(dl, prompt, images)
} else {
  const settings = new ConnectionSettings({ environmentId: env.COPILOT_ENVIRONMENT_ID, agentIdentifier: env.COPILOT_AGENT_SCHEMA_NAME })
  const token = await getToken(env, settings)
  const client = new CopilotStudioClient(settings, token)
  ask = (prompt, images) => askOnce(client, prompt, images)
}

const only = opt('--only')
const runsOverride = opt('--runs') ? Number(opt('--runs')) : null
// 画像は Bot Framework の添付の形(contentType と contentUrl)で渡す。CCP の画像も base64 で持つので、data: の URL にする
const images = opts('--image').map((imagePath) => {
  const ext = path.extname(imagePath).toLowerCase()
  const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }[ext]
  if (!mime) throw new Error(`画像の形式が分かりません: ${ext}`)
  const data = fs.readFileSync(imagePath)
  return { contentType: mime, contentUrl: `data:${mime};base64,${data.toString('base64')}`, name: path.basename(imagePath), bytes: data.length }
})
// 画像を付けたときは画像の頼み(既定は T6)。T6〜T8 は 1 枚、T9 は 1〜8 枚(CCP の商品ページの画像の提案と同じ上限)
const tests = images.length ? IMAGE_TESTS.filter((t) => (only ? t.id === only : t.id === 'T6')) : TESTS.filter((x) => !only || x.id === only)
if (images.length && !tests.length) throw new Error(`画像を付けて送れるのは ${IMAGE_TESTS.map((t) => t.id).join('・')} です: ${only}`)
for (const t of tests) {
  const max = t.images === 'many' ? 8 : 1
  if (images.length > max) throw new Error(`${t.id} に付けられる画像は ${max} 枚までです(${images.length} 枚)`)
}
const sent = images.map(({ bytes, ...rest }) => rest)
const imageNote = images.length ? `${images.length} 枚・${images.map((x) => Math.round(x.bytes / 1024) + 'KB').join('+')}` : ''

const rows = []
for (const t of tests) {
  for (let i = 1; i <= (runsOverride ?? t.runs); i++) {
    let r
    try {
      r = await ask(typeof t.prompt === 'function' ? t.prompt(images.length, { theme: opt('--theme'), product: opt('--product'), strengths: opt('--strengths') }) : t.prompt, sent)
    } catch (e) {
      r = { startSec: '', firstSec: '', firstTextSec: '', endSec: '', messages: 0, types: '', text: '', error: String(e?.message ?? e) }
    }
    const c = r.error ? { json: false, fenced: false, ok: false, notes: [`呼び出しの失敗: ${r.error}`] } : t.check(r.text, images.length)
    rows.push({ via, model, id: t.id, name: t.name, run: i, images: imageNote, ...r, ...c })
    console.log(`${t.id} #${i}${imageNote ? ` [${imageNote}]` : ''} 始め ${r.startSec}s / 最初 ${r.firstSec}s / 本文 ${r.firstTextSec}s / 終わり ${r.endSec}s / JSON ${c.json ? '○' : c.fenced ? '△' : '×'} / 決まり ${c.ok ? '○' : '×'} ${c.notes.join(' / ')}`)
  }
}

fs.mkdirSync(OUT_DIR, { recursive: true })
// ファイルの名前にもモデルを入れる(モデルを替えて測った表を並べて見比べやすいように)
const stamp = `${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}_${via}_${model.replace(/[^\w.-]+/g, '-')}`
const md = [
  `方式: ${via === 'dl' ? '1(Direct Line。取りに行く間隔 ' + POLL_MS + 'ms)' : via === 'aib' ? '3(AI Builder の Predict)' : via === 'flow' ? '3(AI Builder を Power Automate の流れから)' : '2(Agents SDK)'} / モデル: ${model}`,
  '',
  '| 頼み | 回 | 画像 | 会話を始める(秒) | 最初に届く(秒) | 本文が届く(秒) | 終わり(秒) | 届いた種類 | JSON | 決まり | 守れなかった所 |',
  '|---|---|---|---|---|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.id} ${r.name} | ${r.run} | ${r.images} | ${r.startSec} | ${r.firstSec} | ${r.firstTextSec} | ${r.endSec} | ${r.types} | ${r.json ? '○' : r.fenced ? '△(囲みあり)' : '×'} | ${r.ok ? '○' : '×'} | ${r.notes.join(' / ')} |`),
].join('\n')
fs.writeFileSync(path.join(OUT_DIR, `${stamp}.md`), md + '\n')
// 答えの全文は、ここにだけ残す(リポジトリには入れない)
fs.writeFileSync(path.join(OUT_DIR, `${stamp}.json`), JSON.stringify(rows, null, 2))
console.log(`\n${md}\n\n書き出した: ${path.join(OUT_DIR, stamp)}.md / .json`)
