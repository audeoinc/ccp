// 試しのブランチだけ: 右のタブの整理の見本の写真(前 / 後)を撮る。main には入れない
//   node scripts/_pane-mock-shots.mjs <出力のフォルダー> [URL]
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import puppeteer from 'puppeteer-core'

const out = process.argv[2]
const URL = process.argv[3] ?? 'http://localhost:5193/'
mkdirSync(out, { recursive: true })
const exe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find((p) => existsSync(p))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// puppeteer.launch は Edge で起動に失敗することがあるので、scripts/screenshots.mjs と同じく Edge を直接起動して接続する
const edge = spawn(exe, ['--headless=new', '--remote-debugging-port=9334', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'panemock-'))}`, '--lang=ja-JP', '--no-first-run', 'about:blank'], { stdio: 'ignore' })
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch('http://127.0.0.1:9334/json/version')).ok) break
  } catch {
    /* 起動待ち */
  }
  await sleep(500)
}
const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9334', defaultViewport: { width: 1600, height: 1500, deviceScaleFactor: 1 } })
try {
  const page = await browser.newPage()
  for (const mode of ['before', 'after']) {
    await page.goto(URL, { waitUntil: 'networkidle2' })
    await page.evaluate((m) => {
      localStorage.setItem('ccp.paneMock', m === 'after' ? '1' : '0')
      localStorage.removeItem('ccp.paneGroups')
    }, mode)
    await page.goto(URL, { waitUntil: 'networkidle2' })
    // 画面の読み込み(初回は Vite の変換で遅い)を待つ
    await page.waitForFunction(() => document.body.innerText.includes('コンテンツプランナー'), { timeout: 120000 })
    await sleep(2000)
    // ログインの窓を閉じて、テンプレートの管理 → 新規作成
    await page.evaluate(async () => {
      ;[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'あとで')?.click()
      const tpl = await import('/src/templates.ts')
      tpl.openTemplateManager()
    })
    await page.waitForFunction(() => [...document.querySelectorAll('[role="dialog"] button')].some((x) => x.textContent.trim() === '新規作成'), { timeout: 60000 })
    await page.evaluate(() => {
      const d = [...document.querySelectorAll('[role="dialog"]')].pop()
      ;[...d.querySelectorAll('button')].find((x) => x.textContent.trim() === '新規作成')?.click()
    })
    await sleep(2000)
    const pane = async () =>
      page.evaluateHandle(() => {
        const tab = [...document.querySelectorAll('[role="tab"]')].find((x) => x.textContent.includes('セクションと部品'))
        return tab.closest('[role="tablist"]').parentElement
      })
    const shot = async (name) => {
      await sleep(700)
      const el = await pane()
      // ペインの中身の高さまで撮る(スクロールで切れないように、枠の高さを一時的に外す)
      await page.evaluate((e) => {
        e.dataset.oldStyle = e.getAttribute('style') ?? ''
        e.style.maxHeight = 'none'
        e.style.height = 'auto'
        e.style.overflow = 'visible'
      }, el)
      await el.screenshot({ path: join(out, `${name}-${mode}.png`) })
      await page.evaluate((e) => e.setAttribute('style', e.dataset.oldStyle), el)
    }
    const down = (sel) =>
      page.evaluate((q) => {
        const el = document.querySelector(q)
        el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))
        el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0 }))
      }, sel)
    // 1. セクションを選んだとき
    await down('[data-sec]:not([data-sec="sec_hero"])')
    await shot('1-section')
    // 2. 箱を選んだとき
    await down('[data-sec]:not([data-sec="sec_hero"]) [data-cell][data-type="box"]')
    await shot('2-box')
    // 4. キャンバスの ⚙ のポップアップ(箱)
    await page.evaluate(() => document.querySelector('button[aria-label="この箱の見せ方"]')?.click())
    await sleep(900)
    const pop = await page.evaluateHandle(() => [...document.querySelectorAll('span')].find((x) => /箱 \d+ の見せ方/.test(x.textContent) && x.childElementCount === 0)?.parentElement)
    if (pop && (await pop.evaluate((e) => !!e))) await pop.screenshot({ path: join(out, `4-popover-${mode}.png`) })
    await page.keyboard.press('Escape')
    await sleep(500)
    // 3. ボタンを選んだとき(ヒーローの下のボタン)
    await down('[data-sec="sec_hero"] [data-cell][data-type="button"]')
    await shot('3-button')
  }
} finally {
  await browser.close()
  edge.kill()
}
console.log('ok', out)
