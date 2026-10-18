// 各機能のスクリーンショットを docs/screenshots/ に作る(サンプルデータ + 模擬の AI。実データには触れない)。
//   npm run screenshots
// モックのサーバー(vite.mock.config.ts)を自動で起動し、Edge を puppeteer-core で操作して撮影する。
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
// 保存先と、撮る画面の URL(既定は、モックのサーバー)。写真のある環境で撮るときは、SHOTS_URL・SHOTS_OUT で変える
const out = process.env.SHOTS_OUT ?? join(root, 'docs', 'screenshots')
mkdirSync(out, { recursive: true })
const PORT = 5190
const URL = process.env.SHOTS_URL ?? `http://localhost:${PORT}/`

const EDGES = [
  process.env.BROWSER_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].filter(Boolean)
const executablePath = EDGES.find((p) => existsSync(p))
if (!executablePath) throw new Error('Edge / Chrome が見つかりません(環境変数 BROWSER_PATH で指定できます)')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function up() {
  try {
    return (await fetch(URL)).ok
  } catch {
    return false
  }
}

let server
if (!process.env.SHOTS_URL && !(await up())) {
  server = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', '--config', 'vite.mock.config.ts'], { cwd: root, stdio: 'ignore', shell: process.platform === 'win32' })
  for (let i = 0; i < 60 && !(await up()); i++) await sleep(500)
}

const profile = mkdtempSync(join(tmpdir(), 'shots-'))
const DEBUG_PORT = 9333
// puppeteer.launch は Edge で起動に失敗することがあるため、Edge を直接起動して接続する
const edge = spawn(executablePath, ['--headless=new', `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`, '--lang=en-US', '--no-first-run', 'about:blank'], {
  stdio: 'ignore',
})
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)).ok) break
  } catch {
    /* 起動待ち */
  }
  await sleep(500)
}
const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${DEBUG_PORT}`, defaultViewport: { width: 1600, height: 960, deviceScaleFactor: 2 } })

/** 見出しなどの文字(前方一致)を持つ、いちばん内側の要素を押す */
async function click(page, text, { tag = 'button,[role=tab],[role=menuitem],[role=option],div,span', nth = 0, wait = 350, top = false } = {}) {
  const ok = await page.evaluate(
    (text, tag, nth, top) => {
      // top: いちばん手前のダイアログの中だけを探す(背面の同名のボタンを押さない)
      const dialogs = document.querySelectorAll('[role=dialog]')
      const root = top && dialogs.length ? dialogs[dialogs.length - 1] : document
      const els = [...root.querySelectorAll(tag)].filter((e) => {
        const r = e.getBoundingClientRect()
        // 文字が番号だけに縮んでいるタブ(aria-label に名前)も探せるようにする
        return r.width > 0 && r.height > 0 && ((e.textContent ?? '').trim().replace(/^[✓●\s]+/, '').startsWith(text) || (e.getAttribute('aria-label') ?? '').startsWith(text))
      })
      // いちばん内側(子孫に同じ文字の要素がないもの)
      const inner = els.filter((e) => !els.some((o) => o !== e && e.contains(o)))
      const el = inner[nth]
      if (!el) return false
      el.scrollIntoView({ block: 'center' })
      el.click()
      return true
    },
    text,
    tag,
    nth,
    top,
  )
  if (!ok) throw new Error(`見つかりません: ${text}`)
  await sleep(wait)
}

const clickLabel = async (page, label, wait = 350) => {
  const ok = await page.evaluate((label) => {
    const el = [...document.querySelectorAll('[aria-label]')].find((e) => e.getAttribute('aria-label') === label && e.getBoundingClientRect().width > 0)
    if (!el) return false
    el.click()
    return true
  }, label)
  if (!ok) throw new Error(`見つかりません(aria-label): ${label}`)
  await sleep(wait)
}

/** 「AI が考えている」表示が消えるまで待つ */
async function idle(page, extra = 600) {
  await sleep(1500)
  for (let i = 0; i < 60; i++) {
    const busy = await page.evaluate(() => [...document.querySelectorAll('[role=progressbar],.fui-Spinner')].some((e) => e.getBoundingClientRect().width > 0))
    if (!busy) break
    await sleep(500)
  }
  await sleep(extra)
}

const shot = async (page, name, clip) => {
  await page.screenshot({ path: join(out, `${name}.png`), ...(clip ? { clip } : {}) })
  console.log('saved', name)
}

async function fresh(lang) {
  const page = await browser.newPage()
  page.on('dialog', (d) => d.accept()) // 「編集中の内容を破棄しますか」などの確認は、承諾する
  await page.emulateTimezone('Asia/Tokyo')
  await page.evaluateOnNewDocument((lang) => localStorage.setItem('ui.lang', lang), lang)
  await page.goto(URL, { waitUntil: 'networkidle0' })
  await sleep(800)
  return page
}

const dialogShot = async (page, name) => {
  const rect = await page.evaluate(() => {
    const all = document.querySelectorAll('[role=dialog]')
    const d = all[all.length - 1]
    if (!d) return null
    const r = d.getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: r.height }
  })
  await shot(page, name, rect ?? undefined)
}

const closeDialog = async (page) => {
  await page.keyboard.press('Escape')
  await sleep(500)
  if (await page.$('[role=dialog]')) {
    await click(page, 'キャンセル', { tag: 'button' }).catch(() => undefined)
    await click(page, 'Cancel', { tag: 'button' }).catch(() => undefined)
  }
}

const open = async (page, name) => {
  await click(page, name, { tag: 'div,span,button' })
  await page.waitForSelector('[role=dialog]')
  await sleep(1200)
}

const CARD = (L) => (L === 'ja' ? '秋の新作ニット' : 'Fall Arrivals')
const T = (L, ja, en) => (L === 'ja' ? ja : en)

/** ⚙ のメニューから選ぶ */
const settingsMenu = async (page, L, item) => {
  await clickLabel(page, T(L, '設定(テンプレート・言語・自動の下書き)', 'Settings (templates, language, auto-draft)'), 500)
  await click(page, item, { tag: '[role=menuitem],[role=menuitemcheckbox]' })
}

/** 見せ方・面の切り替え(ツールバー・ヘッダーのボタン) */
const view = async (page, label, wait = 1200) => click(page, label, { tag: 'button', wait })

/** 配信カードの中ペインのタブ */
const cardTab = async (page, label) => {
  await click(page, label, { tag: '[role=tab]', top: true })
  await sleep(700)
}

/** 画面の上から決まった高さまでを撮る(ツールバーと中身) */
const fullShot = (page, name) => shot(page, name)

const SCENES = {
  // ---- 計画の面
  async calendar(page, L) {
    await view(page, T(L, '計画', 'Plan'))
    await view(page, T(L, '月', 'Month'))
    await fullShot(page, `${L}-01-calendar`)
  },
  async miniCalendar(page, L) {
    await clickLabel(page, T(L, '2026年10月(押すと、月・週・日を選べる)', 'October 2026 (click to jump to a month, week or day)'), 700).catch(async () => {
      // 文言が変わっていても開けるように、期間の文字のボタンを探す
      await page.evaluate(() => [...document.querySelectorAll('button[aria-label]')].find((b) => /jump to a month/.test(b.getAttribute('aria-label') ?? ''))?.click())
      await sleep(700)
    })
    await fullShot(page, `${L}-02-mini-calendar`)
    await page.keyboard.press('Escape')
    await sleep(400)
  },
  async week(page, L) {
    await view(page, T(L, '週', 'Week'))
    await fullShot(page, `${L}-03-week`)
    // 確定の前に直すこと: 「週を確定」の左の印を押して一覧を開き、項目を選ぶと、かかわる配信・商品が目立つ
    const openFix = () =>
      page.evaluate(() => [...document.querySelectorAll('button[aria-label]')].find((b) => /before confirming|確定の前に直すこと/.test(b.getAttribute('aria-label') ?? ''))?.click())
    await openFix()
    await sleep(600)
    await click(page, T(L, '主力の漏れ', 'Lead items not featured'), { tag: 'span', wait: 900 }).catch(() => undefined)
    await fullShot(page, `${L}-04-week-checklist`)
    await click(page, T(L, '主力の漏れ', 'Lead items not featured'), { tag: 'span', wait: 500 }).catch(() => undefined)
    await page.keyboard.press('Escape')
    await sleep(400)
    await view(page, T(L, '進み具合', 'Progress'))
    await fullShot(page, `${L}-05-week-progress`)
    await view(page, T(L, '商品', 'Products'))
  },
  async bulkDrafts(page, L) {
    await view(page, T(L, '週', 'Week'))
    await clickLabel(page, T(L, '次の週', 'Next week'), 1200)
    // ヘッダーの「新規作成 ▾」の ▾ から、この週の枠を作る(W14)
    await clickLabel(page, T(L, '新規作成のほかの方法', 'More ways to create'), 600)
    await click(page, T(L, 'この週の枠を作る', 'Create slots for this week'), { tag: '[role=menuitem]', wait: 1200 })
    await fullShot(page, `${L}-06-bulk-drafts-start`)
    // 「n 本の枠を作る」→ 名前のない枠に配信名の案 → 種類を入れる → そろった枠の中身を作る(できるまで待つ。最大 6 分)
    // 「5 本の枠を作る」は数から始まるので、前方一致の click ではなく、終わりの文字で探す
    await page.evaluate((s) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim().endsWith(s))?.click(), T(L, '本の枠を作る', 'slot(s)'))
    await sleep(1500)
    await click(page, T(L, '名前のない', 'Suggest names'), { tag: 'button', wait: 2500 })
    const kinds = ['season', 'sale', 'new', 'collab', 'limited']
    const n = await page.evaluate(() => document.querySelectorAll('select[aria-label="種類"], select[aria-label="Type"]').length)
    for (let i = 0; i < n; i++) {
      const sels = await page.$$('select[aria-label="種類"], select[aria-label="Type"]')
      if (sels[i]) await sels[i].select(kinds[i % kinds.length])
      await sleep(600)
    }
    await click(page, T(L, 'そろった', 'Create all'), { tag: 'button', wait: 3000 })
    for (let i = 0; i < 180; i++) {
      const busy = await page.evaluate((s) => [...document.querySelectorAll('button')].some((b) => b.textContent.includes(s)), T(L, '作るのをやめる', 'Stop'))
      if (!busy) break
      await sleep(2000)
    }
    await idle(page, 2000)
    await fullShot(page, `${L}-07-bulk-drafts`)
    await clickLabel(page, T(L, '前の週', 'Previous week'), 1000).catch(() => undefined)
  },
  async list(page, L) {
    await view(page, T(L, '一覧', 'List'))
    await fullShot(page, `${L}-08-list`)
    await view(page, T(L, '月', 'Month'))
  },

  // ---- 配信カード
  async cardDialog(page, L) {
    await open(page, CARD(L))
    await dialogShot(page, `${L}-09-card-dialog`)
    await clickLabel(page, T(L, '商品情報を開く', 'Open product info')).catch(() => undefined)
    await sleep(800)
    await dialogShot(page, `${L}-10-product-info`)
    await closeDialog(page)
  },
  async aiTabs(page, L) {
    await open(page, CARD(L))
    for (const [k, tab, area] of [
      ['11-theme', T(L, '① テーマ', '1. Theme')],
      ['12-template', T(L, '② テンプレート', '2. Template')],
      ['13-hero', T(L, '③ ヒーロー', '3. Hero')],
      ['14-sections', T(L, '④ セクション', '4. Sections')],
      ['16-links', T(L, '⑤ リンク先', '5. Links')],
      ['15-instructions', T(L, '⑥ 制作指示', '6. Notes')],
      ['17-handoff', T(L, '引き継ぎ', 'Handoff')],
      ['18-tasks', T(L, 'タスク', 'Tasks')],
      ['19-comments', T(L, 'コメント', 'Comments')],
    ]) {
      // 引き継ぎ・タスク・コメントは、右端のプロセスのペインのタブ(2026-10-17 に中ペインから移した)
      if (area) await cardTab(page, area)
      await cardTab(page, tab)
      await dialogShot(page, `${L}-${k}`)
    }
    await closeDialog(page)
  },
  async aiSuggest(page, L) {
    await open(page, CARD(L))
    await cardTab(page, T(L, '① テーマ', '1. Theme'))
    await click(page, T(L, '案を作り直す', 'Regenerate ideas'), { tag: 'button' }).catch(() => click(page, T(L, 'AIで案を出す', 'Suggest with AI'), { tag: 'button' }))
    await idle(page)
    await dialogShot(page, `${L}-20-ai-theme-ideas`)
    await cardTab(page, T(L, '③ ヒーロー', '3. Hero'))
    await click(page, T(L, 'メイン画像をAIで選定', 'Select main image with AI'), { tag: 'button' })
    await idle(page)
    await dialogShot(page, `${L}-21-ai-hero`)
    await cardTab(page, T(L, '④ セクション', '4. Sections'))
    await click(page, T(L, 'このセクションをまとめてAIで選定', 'Select this whole section with AI'), { tag: 'button' })
    await idle(page, 1200)
    await dialogShot(page, `${L}-22-ai-section`)
    await closeDialog(page)
  },
  async aiChat(page, L) {
    await open(page, CARD(L))
    await cardTab(page, T(L, '④ セクション', '4. Sections'))
    await page.type('[role=dialog] textarea[placeholder^="AI"], [role=dialog] textarea[placeholder^="Tell"]', T(L, 'もっと手頃な価格の商品で', 'Use more affordable products'))
    await page.keyboard.press('Enter')
    await idle(page, 1200)
    await dialogShot(page, `${L}-23-ai-chat-update`)
    await page.type('[role=dialog] textarea[placeholder^="AI"], [role=dialog] textarea[placeholder^="Tell"]', T(L, 'この構成をどう思う?', 'What do you think of this lineup?'))
    await page.keyboard.press('Enter')
    await idle(page, 1200)
    await dialogShot(page, `${L}-24-ai-chat-answer`)
    await closeDialog(page)
  },
  async productDetail(page, L) {
    await open(page, CARD(L))
    // 右端の商品情報の、先頭の商品の行(「コード ・ 価格 ・ 在庫」の行)を押す
    const ok = await page.evaluate(() => {
      const hits = [...document.querySelectorAll('[role=dialog] *')].filter((e) => /^[A-Z]?\d{2,6}\s*[・•·]/.test((e.textContent ?? '').trim()) && e.getBoundingClientRect().x > 1000)
      const el = hits.find((e) => !hits.some((o) => o !== e && e.contains(o)))
      el?.click()
      return !!el
    })
    if (!ok) throw new Error('商品行が見つかりません')
    await sleep(1200)
    await dialogShot(page, `${L}-25-product-detail`)
    await closeDialog(page)
  },
  async appCard(page, L) {
    // アプリの配信(通知 + メッセージ)
    await open(page, T(L, 'タイムセール', 'Flash Deal'))
    await cardTab(page, T(L, '③ 通知', '3. Notification'))
    await dialogShot(page, `${L}-26-app-notification`)
    await cardTab(page, T(L, '⑤ リンク先', '5. Links'))
    await dialogShot(page, `${L}-27-app-links`)
    await closeDialog(page)
  },

  // ---- テンプレート(⚙ の「テンプレートの管理」)
  async templates(page, L) {
    await settingsMenu(page, L, T(L, 'テンプレートの管理', 'Manage templates'))
    await page.waitForSelector('[role=dialog]')
    await sleep(1000)
    await dialogShot(page, `${L}-28-template-manager`)
    await click(page, T(L, '新規作成', 'New'), { tag: 'button', top: true })
    await sleep(600)
    await dialogShot(page, `${L}-29-template-new`)
    await click(page, 'Standard Hero + 4 Grid Items', { tag: 'div,span', top: true })
    await sleep(500)
    await click(page, T(L, '複製して編集', 'Duplicate to edit'), { tag: 'button', top: true })
    await sleep(600)
    await dialogShot(page, `${L}-30-template-duplicate-edit`)
    await closeDialog(page)
  },

  // ---- 結果の面
  async results(page, L) {
    await view(page, T(L, '結果', 'Results'), 1800)
    await view(page, T(L, '月', 'Month'))
    await fullShot(page, `${L}-31-results-month`)
    await view(page, T(L, '週', 'Week'), 1500)
    // 今週は、まだ結果のない配信が多いので、1 週前を撮る
    await clickLabel(page, T(L, '前の週', 'Previous week'), 2500)
    await fullShot(page, `${L}-32-results-week`)
    await clickLabel(page, T(L, '次の週', 'Next week'), 800)
    await view(page, T(L, '一覧', 'List'))
    await fullShot(page, `${L}-33-results-list`)
    // 詳しい結果(一覧の行を押す)
    await page.evaluate(() => document.querySelector('table tbody tr')?.click())
    await page.waitForSelector('[role=dialog]')
    await sleep(2500)
    await dialogShot(page, `${L}-34-result-detail`)
    await closeDialog(page)
    await view(page, T(L, '比べる', 'Compare'), 2500)
    await fullShot(page, `${L}-35-results-compare`)
    await view(page, T(L, '月', 'Month'))
    await view(page, T(L, '計画', 'Plan'))
  },

  // ---- アラート
  async alerts(page, L) {
    await click(page, T(L, 'アラート', 'Alerts'), { tag: 'button', wait: 1500 })
    await fullShot(page, `${L}-36-alerts`)
    await click(page, T(L, '差し替え', 'Replace'), { tag: 'button', wait: 800 })
    await idle(page, 1200)
    await fullShot(page, `${L}-37-alert-replace`)
    // 差し替えのパネルだけを閉じる(アラートのフロートの「アラートを閉じる」と取り違えないよう、aria-label で探す)
    await clickLabel(page, T(L, '閉じる', 'Close'), 600).catch(() => undefined)
    await click(page, T(L, 'アラートの条件', 'Alert conditions'), { tag: 'button', wait: 800 })
    await dialogShot(page, `${L}-38-alert-conditions`)
    await closeDialog(page)
    // アラートから配信カードを開く(問題の商品を選んだ状態で開く)
    await clickLabel(page, T(L, '配信カードを開く', 'Open the delivery card'), 1500).catch(async () => {
      await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => (b.title || b.getAttribute('aria-label') || '').includes('Open the delivery card'))?.click())
      await sleep(1500)
    })
    // アラートはフロート。配信カードは、その上に重なる(ダイアログが 2 つになる)
    if ((await page.$$('[role=dialog]')).length >= 2) {
      await sleep(1000)
      await dialogShot(page, `${L}-39-card-alerts`)
      await closeDialog(page)
    }
    // アラートのフロートを閉じる
    await clickLabel(page, T(L, 'アラートを閉じる', 'Close alerts'), 600).catch(() => undefined)
    await view(page, T(L, '計画', 'Plan'))
  },
}

try {
  for (const L of (process.env.LANGS ?? 'en').split(',')) {
    const page = await fresh(L)
    for (const [name, fn] of Object.entries(SCENES)) {
      if (process.env.ONLY && !process.env.ONLY.split(',').includes(name)) continue
      try {
        await fn(page, L)
      } catch (e) {
        console.error(`失敗: ${name}:`, e.message)
      }
    }
    await page.close()
  }
} finally {
  await browser.close().catch(() => undefined)
  if (process.platform === 'win32') spawn('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' })
  else edge.kill()
  await sleep(1000)
  server?.kill()
  try {
    rmSync(profile, { recursive: true, force: true })
  } catch {
    /* 後始末に失敗しても無視 */
  }
}

export { click, clickLabel, idle, dialogShot }
