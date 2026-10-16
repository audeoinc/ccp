// サーバー + DB の動作確認。画面を開いて、カレンダーのカードが出るか、カードを開けるか(商品の画像も読めるか)、エラーが出ていないかを見る。
//   CCP_URL=http://localhost:8080 CCP_PASSWORD=... node scripts/gcp-smoke.mjs [出力する画像のパス]
// Basic 認証は、ユーザー名は何でもよく、パスワードだけを見る(サーバーの APP_PASSWORD)。
// 画面は、既定(国の絞り込みは US、言語は English)で開く。画面の言語は、日本語でも英語でも判定できる。
//   CCP_CARD         開いて確認するカード(既定: Fall Arrivals。US のカード)
//   CCP_EMPTY_CARD   CCP_SMOKE_AI=full で使う、内容が空のカード(既定: 冬支度スタート。絞り込みを外して探す)
//   CCP_SMOKE_AI     1: テーマ案だけ / full: 空のカードを、すべて AI で下書き(実際に Gemini を呼ぶので、費用がかかる)
//   CCP_VIEW_H       画面の高さ(既定 960)
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import puppeteer from 'puppeteer-core'

const BASE = process.env.CCP_URL ?? 'http://localhost:8080'
const PASSWORD = process.env.CCP_PASSWORD ?? ''
const outImage = process.argv[2]
const CARD = process.env.CCP_CARD ?? 'Fall Arrivals'
const EMPTY_CARD = process.env.CCP_EMPTY_CARD ?? '冬支度スタート'
const PORT = 9334
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const exe = [
  process.env.BROWSER_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find((p) => p && existsSync(p))
if (!exe) throw new Error('Edge / Chrome が見つかりません(BROWSER_PATH で指定できます)')

const profile = mkdtempSync(join(tmpdir(), 'smoke-'))
const edge = spawn(exe, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' })
let failed = false
try {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) break
    } catch {
      /* 起動待ち */
    }
    await sleep(500)
  }
  const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${PORT}`, defaultViewport: { width: 1600, height: Number(process.env.CCP_VIEW_H ?? 960), deviceScaleFactor: 1 } })
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('response', (r) => {
    if (r.url().includes('/api/') && r.status() >= 400) errors.push(`${r.status()} ${r.url()}`)
  })
  await page.authenticate({ username: 'ccp', password: PASSWORD })
  await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 60000 })
  await sleep(1500)

  // DB が停止中なら、「準備中」の表示が出て、起動したら自動で読み込み直される(最大 30 分待つ)
  let sawWake = false
  let cards = false
  const waitStarted = Date.now()
  for (let i = 0; i < 1800 && !cards; i++) {
    const st = await page.evaluate(() => ({
      wake: !!document.querySelector('[role=status]') && /データベースを起動|Starting the database/.test(document.body.innerText),
      cards: document.body.innerText.includes(name),
    }), CARD)
    sawWake ||= st.wake
    cards = st.cards
    if (!cards) await sleep(1000)
  }
  if (sawWake) console.log(`DB の準備中の表示が出て、${Math.round((Date.now() - waitStarted) / 1000)} 秒後に、自動で読み込み直された`)
  console.log('カレンダーに配信カードが出ている:', cards)
  if (!cards) failed = true

  // カードを開く(配信カード・商品・メイン画像など、ほかのテーブルの読み込みも確認する)
  await page.evaluate((name) => {
    const el = [...document.querySelectorAll('div,span')].find((e) => e.children.length === 0 && (e.textContent ?? '').trim() === name)
    el?.click()
  }, CARD)
  await sleep(2500)
  const opened = await page.evaluate(() => !!document.querySelector('[role=dialog]') && /テーマ|Theme/.test(document.querySelector('[role=dialog]').innerText) && /掲載商品|Products in this delivery/.test(document.querySelector('[role=dialog]').innerText))
  console.log(`カード「${CARD}」を開いて、内容(テーマ・掲載商品)が出ている:`, opened)
  if (!opened) failed = true
  // 画像(/img/…)が、あれば、すべて読み込めている(商品・メイン画像の配信の確認)
  const imgs = await page.evaluate(() => [...document.images].filter((i) => i.src.includes('/img/')).map((i) => i.complete && i.naturalWidth > 0))
  console.log(`画像(/img/): ${imgs.length} 点中 ${imgs.filter(Boolean).length} 点が読み込み済み`)
  if (imgs.some((ok) => !ok)) failed = true

  // AI(Gemini)の確認。CCP_SMOKE_AI=1(テーマ案だけ)/ full(空のカードを、すべて AI で下書き)のときだけ(実際に Gemini を呼ぶので、費用がかかる)
  if (process.env.CCP_SMOKE_AI === '1' || process.env.CCP_SMOKE_AI === 'full') {
    const started = Date.now()
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('[role=dialog] button')].find((e) => /^(AIで案を出す|案を作り直す|Suggest with AI|Regenerate ideas)/.test((e.textContent ?? '').trim()))
      b?.click()
    })
    let ideas = false
    for (let i = 0; i < 90 && !ideas; i++) {
      await sleep(1000)
      ideas = await page.evaluate(() => /AIの案\(未採用\)|AI ideas \(not adopted\)/.test(document.body.innerText))
    }
    console.log(`AI のテーマ案が出た: ${ideas}(${Math.round((Date.now() - started) / 1000)} 秒)`)
    if (!ideas) failed = true
  }

  if (process.env.CCP_SMOKE_AI === 'full') {
    // 空のカードを開くと、「開いたとき自動で下書き」(既定でオン)が、テーマ → … → 制作指示まで、続けて AI に頼む。
    // 空のカードは、US 以外にあるので、国の絞り込みを外して探す
    await page.keyboard.press('Escape')
    await sleep(800)
    await page.evaluate(() => {
      ;[...document.querySelectorAll('button')].find((e) => /^(クリア|Clear)$/.test((e.textContent ?? '').trim()))?.click()
    })
    await sleep(800)
    await page.evaluate((name) => {
      const el = [...document.querySelectorAll('div,span')].find((e) => e.children.length === 0 && (e.textContent ?? '').trim() === name)
      el?.click()
    }, EMPTY_CARD)
    const started = Date.now()
    let done = false
    for (let i = 0; i < 300 && !done; i++) {
      await sleep(1000)
      done = await page.evaluate(() => /(工程|Steps) 5 \/ 5/.test(document.body.innerText))
    }
    console.log(`すべて AI で下書き: ${done ? '完了(工程 5 / 5)' : '終わらなかった'}(${Math.round((Date.now() - started) / 1000)} 秒)`)
    if (!done) failed = true
    if (outImage) await page.screenshot({ path: outImage.replace(/\.png$/, '-full.png') })
  }

  const banner = await page.evaluate(() => [...document.querySelectorAll('[role=alert],.fui-MessageBar')].map((e) => e.textContent?.trim()).filter(Boolean))
  if (banner.length) console.log('お知らせの帯:', banner)
  // 準備中の表示が出たときの 503(db_starting)は、想定どおりの動きなので、エラーに数えない
  const unexpected = sawWake ? errors.filter((e) => !e.startsWith('503 ')) : errors
  if (unexpected.length) {
    console.log('エラー:', unexpected)
    failed = true
  }
  if (outImage) await page.screenshot({ path: outImage })
  await browser.disconnect()
} finally {
  if (process.platform === 'win32') spawn('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' })
  else edge.kill()
  await sleep(800)
  try {
    rmSync(profile, { recursive: true, force: true })
  } catch {
    /* 後始末に失敗しても無視 */
  }
}
console.log(failed ? 'NG' : 'OK')
process.exit(failed ? 1 : 0)
