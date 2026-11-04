// ログイン(OIDC。server/ccp/oidc.py)が切れたときの案内。
//
// サーバーが「ログインが切れた」(error.code = login)と返したら、画面の上に直接かぶせる(DB の準備中の表示 dbWake と同じ作り。
// どの画面からのデータの読み書きでも、同じように出すため)。ページを開き直すと、書きかけの中身が消えるので、
// ログインし直すのは別のタブで行い、この画面は数秒おきに確かめて、ログインできたら案内を消す(書きかけはそのまま残る)。

import { appPath } from '../appRoot'
import { PREF } from '../prefKeys'
import { readRaw } from '../settings'
import { Z } from '../layers'

const POLL_MS = 3000
let shown = false

const text = () =>
  readRaw(PREF.lang) === 'en'
    ? {
        title: 'Your sign-in has expired',
        body: 'What you were editing is still on this page. Sign in again in another tab, and you can carry on here.',
        button: 'Sign in again (opens a new tab)',
        waiting: 'Waiting for you to sign in…',
      }
    : {
        title: 'ログインが切れました',
        body: '書きかけの内容は、この画面に残っています。別のタブでログインし直すと、ここでそのまま続けられます。',
        button: 'ログインし直す(別のタブで開きます)',
        waiting: 'ログインを待っています…',
      }

/** ログインが切れた案内を出す(出ていれば何もしない)。ログインし直したら、自分で消える */
export function showLoginExpired(): void {
  if (shown) return
  shown = true
  const t = text()
  const root = document.createElement('div')
  root.setAttribute('role', 'alertdialog')
  root.setAttribute('aria-label', t.title)
  root.style.cssText = `position:fixed;inset:0;z-index:${Z.dbWake};display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.92);font-family:Inter,"Noto Sans JP",system-ui,sans-serif;color:#242424`
  const box = document.createElement('div')
  box.style.cssText = 'max-width:440px;padding:28px 32px;text-align:center'
  const line = (css: string, content: string) => {
    const el = document.createElement('div')
    el.style.cssText = css
    el.textContent = content
    return el
  }
  const button = document.createElement('button')
  button.type = 'button'
  button.style.cssText = 'font:inherit;font-size:14px;font-weight:600;padding:6px 16px;border-radius:4px;border:none;background:#0f6cbd;color:#fff;cursor:pointer'
  button.textContent = t.button
  const waiting = line('font-size:12px;color:#616161;margin-top:12px;visibility:hidden', t.waiting)
  box.append(line('font-size:16px;font-weight:600;margin-bottom:8px', t.title), line('font-size:13px;line-height:1.7;color:#616161;margin-bottom:16px', t.body), button, waiting)
  root.appendChild(box)
  document.body.appendChild(root)

  let timer = 0
  button.addEventListener('click', () => {
    // ログインを終えたタブは /auth/done(「このタブを閉じてください」)に着く
    window.open(appPath('/auth/login?next=/auth/done'), '_blank')
    waiting.style.visibility = 'visible'
    if (timer) return
    timer = window.setInterval(async () => {
      try {
        const res = await fetch(appPath('/api/me'))
        if (res.status === 401) return
        window.clearInterval(timer)
        root.remove()
        shown = false
      } catch {
        /* 一時的な通信の失敗は、次の確認でやり直す */
      }
    }, POLL_MS)
  })
}
