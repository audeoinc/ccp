// データベースの「準備中」表示。
//
// DB を普段は止めておく環境では、サーバーが「データベースを起動している」と返す。DB につながらないときも同じく、全画面に準備中の表示を出し、
// 数秒おきに /api/db/status を確認して、使えるようになったら画面を読み込み直す。
// 画面のコード(React)には手を入れず、ここで、画面の上に直接かぶせる(どの画面からのデータの読み書きでも、同じように出すため)。

import { appPath } from '../appRoot'

const POLL_MS = 4000
const GIVE_UP_MS = 25 * 60 * 1000
let shown = false

const lang = (): 'ja' | 'en' => {
  try {
    return localStorage.getItem('ui.lang') === 'en' ? 'en' : 'ja'
  } catch {
    return 'ja'
  }
}

const TEXT = {
  ja: { title: 'データベースを起動しています', body: '使っていない間は停止しているため、起動に 10 分ほどかかることがあります。準備ができると、自動で読み込み直します。', slow: '時間がかかっています。しばらくしてから、ページを読み込み直してください。' },
  en: { title: 'Starting the database', body: 'The database is stopped while idle, so it can take around 10 minutes to start. This page reloads automatically when it is ready.', slow: 'This is taking longer than expected. Please reload the page in a little while.' },
}

// DB の自動起動を使わない環境(Workbench など)で、つながらないとき。待っても起動しないので、理由と直し方を出す
const UNREACHABLE = {
  ja: {
    title: 'データベースにつながりません',
    hint: 'サーバーを起動したターミナルで、DB の設定(DATABASE_URL など)が読み込まれているかを確かめてください。同じターミナルで python -m ccp.cli check を実行すると、原因がわかります(手順書 docs/WORKBENCH.md)。直したら、サーバーを起動し直してください。この画面は、つながると自動で読み込み直します。',
  },
  en: {
    title: 'Cannot connect to the database',
    hint: 'Check that the DB settings (DATABASE_URL etc.) are loaded in the terminal that started the server. Run python -m ccp.cli check in that terminal to find the cause (docs/WORKBENCH.md), then restart the server. This page reloads automatically once connected.',
  },
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)

/** 準備中の表示を出す。detail があれば、「つながりません」の表示(Workbench など、DB の自動起動を使わない環境) */
export function showDbWake(detail?: string): void {
  if (shown) return
  shown = true
  const t = TEXT[lang()]
  const u = UNREACHABLE[lang()]
  const root = document.createElement('div')
  root.setAttribute('role', 'status')
  root.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.92);font-family:Inter,"Noto Sans JP",system-ui,sans-serif;color:#242424'
  root.innerHTML = `
    <style>@keyframes ccp-spin{to{transform:rotate(360deg)}}</style>
    <div style="max-width:420px;padding:28px 32px;text-align:center">
      <div style="width:28px;height:28px;margin:0 auto 16px;border:3px solid #d1d1d1;border-top-color:#2f4fbf;border-radius:50%;animation:ccp-spin 1s linear infinite"></div>
      <div style="font-size:16px;font-weight:600;margin-bottom:8px">${detail ? u.title : t.title}</div>
      ${detail ? `<div id="ccp-wake-detail" style="font-size:12px;line-height:1.6;color:#b10e1c;margin-bottom:10px;word-break:break-all">${esc(detail)}</div>` : ''}
      <div id="ccp-wake-body" style="font-size:13px;line-height:1.7;color:#616161">${detail ? u.hint : t.body}</div>
    </div>`
  document.body.appendChild(root)

  const started = Date.now()
  const timer = window.setInterval(async () => {
    try {
      const res = await fetch(appPath('/api/db/status'))
      const json = (await res.json()) as { state?: string; detail?: string }
      if (json.state === 'running') {
        window.clearInterval(timer)
        location.reload()
        return
      }
      // つながらない理由が変わったら(設定を直した途中など)、表示も変える
      const d = root.querySelector('#ccp-wake-detail')
      if (json.state === 'unreachable' && d && json.detail) d.textContent = json.detail
    } catch {
      /* 一時的な通信の失敗は、次の確認でやり直す */
    }
    if (Date.now() - started > GIVE_UP_MS) {
      window.clearInterval(timer)
      const body = root.querySelector('#ccp-wake-body')
      if (body) body.textContent = t.slow
    }
  }, POLL_MS)
}
