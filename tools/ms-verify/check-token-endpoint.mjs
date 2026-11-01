// 鍵なしの入口(Direct Line のトークン エンドポイント)が、鍵を必須にしたエージェントで本当に断るかを確かめる。
// 設定の COPILOT_TOKEN_ENDPOINT の URL に、鍵を付けずにトークンを頼む。URL・トークンは画面に出さず、断られたか・トークンが出たかだけを出す。
//   node check-token-endpoint.mjs
//
// チャネルの画面でコピーできるのが Agents SDK 用の接続先(…/copilotstudio/dataverse-backed/authenticated/bots/<スキーマ名>/conversations)
// だけのときは、同じホストとスキーマ名から Direct Line のトークン エンドポイント
// (…/powervirtualagents/botsbyschema/<スキーマ名>/directline/token)を組み立てる(SDK 用の接続先に鍵なしで頼んでも 404 になるだけで、試しにならない)。
// 見込み: 「セキュリティで保護されたアクセスを要求する」をオンにして公開していれば 403、オフなら 200 でトークンが出る。

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const ENV_FILE = path.join(os.homedir(), '.ccp', 'ms-verify.env')
const env = {}
for (const line of fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/)
  if (m) env[m[1]] = m[2]
}
if (!env.COPILOT_TOKEN_ENDPOINT) throw new Error(`設定が空です: COPILOT_TOKEN_ENDPOINT(${ENV_FILE})`)

let url = new URL(env.COPILOT_TOKEN_ENDPOINT)
const sdk = url.pathname.match(/\/copilotstudio\/dataverse-backed\/authenticated\/bots\/([^/]+)\//)
if (sdk) {
  url = new URL(`/powervirtualagents/botsbyschema/${sdk[1]}/directline/token?api-version=2022-03-01-preview`, url.origin)
  console.log('Agents SDK 用の接続先だったので、Direct Line のトークン エンドポイントを組み立てて試す')
}

const res = await fetch(url)
const text = await res.text()
let body = {}
try {
  body = JSON.parse(text)
} catch {
  /* JSON でない答え */
}
const gotToken = typeof body.token === 'string' && body.token.length > 0
console.log(`答えの番号: ${res.status}`)
console.log(`トークンが出たか: ${gotToken ? '出た(鍵なしで話しかけられる)' : '出なかった'}`)
// 断られたときの理由だけを出す(トークン・ID・URL は出さない)
if (!gotToken) {
  const reason = `${body.ErrorCode ?? body.error?.code ?? body.code ?? ''} ${body.ErrorMessage ?? body.error?.message ?? body.message ?? text}`
  console.log(`理由: ${reason.replace(/[0-9a-fA-F]{8}-[0-9a-fA-F-]{27}/g, '<ID>').replace(/https?:\/\/\S+/g, '<URL>').slice(0, 200)}`)
}
