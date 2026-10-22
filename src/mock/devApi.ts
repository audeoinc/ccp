// 開発用の画面(/dev/)の窓口の身代わり(撮影・デモ用のビルド。vite.mock.config.ts で src/dev/api と差し替える)。
// BigQuery がなくても画面を確かめられるように、練習用の元データ(docs/bq_example/ と同じ名前の表)を見本として返す。
import type { ChatContext, ChatReply, ChatTurn, Column, DryRun, RunResult, Row, Settings, TableInfo } from '../dev/api'

export * from '../dev/api'

const DS = 'demo-project.ccp_dummy_src'

const TABLES: Record<string, { columns: Column[]; rows: Row[]; description: string }> = {
  m_item: {
    description: 'SKU ごとの商品マスタ(練習用)',
    columns: [
      { name: 'sku_cd', type: 'STRING', mode: 'REQUIRED', description: 'SKU のコード' },
      { name: 'item_cd', type: 'STRING', mode: 'REQUIRED', description: '品番(SPU)' },
      { name: 'country_cd', type: 'STRING', mode: 'NULLABLE', description: 'JPN / USA' },
      { name: 'item_nm', type: 'STRING', mode: 'NULLABLE', description: '商品名' },
      { name: 'div_nm', type: 'STRING', mode: 'NULLABLE', description: '部門 1' },
      { name: 'dept_nm', type: 'STRING', mode: 'NULLABLE', description: '部門 2' },
      { name: 'class_nm', type: 'STRING', mode: 'NULLABLE', description: 'サブカテゴリ' },
      { name: 'color_nm', type: 'STRING', mode: 'NULLABLE', description: '' },
      { name: 'size_nm', type: 'STRING', mode: 'NULLABLE', description: '' },
      { name: 'price', type: 'NUMERIC', mode: 'NULLABLE', description: '税込みの価格' },
      { name: 'on_sale_flg', type: 'BOOL', mode: 'NULLABLE', description: '販売中か' },
    ],
    rows: [
      { sku_cd: 'A1001-BK-M', item_cd: 'A1001', country_cd: 'JPN', item_nm: 'ウールのカーディガン', div_nm: 'ウィメンズ', dept_nm: 'ニット', class_nm: 'カーディガン', color_nm: 'ブラック', size_nm: 'M', price: '7990', on_sale_flg: true },
      { sku_cd: 'A1001-BK-L', item_cd: 'A1001', country_cd: 'JPN', item_nm: 'ウールのカーディガン', div_nm: 'ウィメンズ', dept_nm: 'ニット', class_nm: 'カーディガン', color_nm: 'ブラック', size_nm: 'L', price: '7990', on_sale_flg: true },
      { sku_cd: 'B2040-NV-30', item_cd: 'B2040', country_cd: 'USA', item_nm: 'Straight Jeans', div_nm: 'Men', dept_nm: 'Bottoms', class_nm: 'Denim', color_nm: 'Navy', size_nm: '30', price: '59.90', on_sale_flg: true },
      { sku_cd: 'C3300-WH-F', item_cd: 'C3300', country_cd: 'JPN', item_nm: 'リネンのシャツ', div_nm: 'メンズ', dept_nm: 'シャツ', class_nm: '長袖', color_nm: 'ホワイト', size_nm: 'F', price: null, on_sale_flg: false },
    ],
  },
  t_sales_daily: {
    description: 'SKU × 日の販売(販売がない日は行がない)',
    columns: [
      { name: 'sales_date', type: 'DATE', mode: 'REQUIRED', description: '' },
      { name: 'sku_cd', type: 'STRING', mode: 'REQUIRED', description: '' },
      { name: 'qty', type: 'INT64', mode: 'NULLABLE', description: '数量' },
      { name: 'amount', type: 'NUMERIC', mode: 'NULLABLE', description: '金額' },
    ],
    rows: [
      { sales_date: '2026-10-19', sku_cd: 'A1001-BK-M', qty: 3, amount: '23970' },
      { sales_date: '2026-10-19', sku_cd: 'B2040-NV-30', qty: 1, amount: '59.90' },
      { sales_date: '2026-10-20', sku_cd: 'A1001-BK-L', qty: 2, amount: '15980' },
    ],
  },
  t_inventory: {
    description: 'SKU ごとの在庫のスナップショット(1 時間に数回、追記)',
    columns: [
      { name: 'snapshot_at', type: 'TIMESTAMP', mode: 'REQUIRED', description: '' },
      { name: 'sku_cd', type: 'STRING', mode: 'REQUIRED', description: '' },
      { name: 'on_hand', type: 'INT64', mode: 'NULLABLE', description: '手元' },
      { name: 'allocated', type: 'INT64', mode: 'NULLABLE', description: '引き当て' },
    ],
    rows: [
      { snapshot_at: '2026-10-22T09:00:00+00:00', sku_cd: 'A1001-BK-M', on_hand: 40, allocated: 3 },
      { snapshot_at: '2026-10-22T09:00:00+00:00', sku_cd: 'B2040-NV-30', on_hand: 12, allocated: 0 },
    ],
  },
}

const ref = (id: string) => `${DS}.${id}`
const idOf = (r: string) => r.split('.').pop() ?? r
let settings: Settings = { datasets: [DS, 'demo-project.ccp_dummy'] }
const wait = <T,>(v: T) => new Promise<T>((ok) => window.setTimeout(() => ok(v), 250))

const fail = (error: string) => wait({ ok: false as const, error })

/** SQL の中の、見本の表の名前を拾う(身代わりなので、FROM の表をそのまま返すだけ) */
const tableIn = (sql: string) => Object.keys(TABLES).find((t) => sql.includes(t))

export const DevApi = {
  status: () => wait({ enabled: true, project: 'demo-project', account: 'demo@demo-project.iam.gserviceaccount.com', devwork: 'server/devwork', max_gb: 10 }),
  settings: () => wait(settings),
  saveSettings: (s: Settings) => {
    settings = s
    return wait({ ok: true as const })
  },
  projects: () => wait({ ok: true as const, default: 'demo-project', projects: ['demo-project', 'demo-analytics'] }),
  datasets: (project?: string) =>
    wait({ ok: true as const, project: project ?? 'demo-project', datasets: project === 'demo-analytics' ? ['mart_ctlg', 'mart_sales'] : ['ccp_dummy', 'ccp_dummy_src', 'ctlg_master', 'ctlg_stage', 'sales_daily'] }),
  chat: (messages: ChatTurn[], ctx: ChatContext) => {
    const ask = messages[messages.length - 1]?.text ?? ''
    const r: ChatReply = {
      ok: true,
      reply: `**m_item** の列を見ました(見本の返事です。いまの発言: 「${ask.slice(0, 40)}」)。

### CCP の列への当て方の案
- \`item_cd\` → SKU の \`product_code\`(品番)
- \`country_cd\` → \`market\`(JPN → JP、USA → US に直す)
- \`dept_nm\` → \`category\`(部門 2 が CCP のカテゴリに近い)
- \`price\` → \`price\``,
      sql: `SELECT
  CASE country_cd WHEN 'JPN' THEN 'JP' WHEN 'USA' THEN 'US' END AS market,
  item_cd AS product_code,
  ANY_VALUE(item_nm) AS name,
  ANY_VALUE(dept_nm) AS category,
  MAX(price) AS price
FROM \`${DS}.m_item\`
WHERE on_sale_flg
GROUP BY market, product_code`,
      questions: ctx.output ? [] : ['季節(season)に当たる列が見つかりません。別の表にありますか?'],
      steps: [`表を探した(${DS}、「ctlg」を含む、0 件)`, `表を探した(${DS}、3 件)`, `表の列を見た(${DS}.m_item)`, 'SQL を確かめた(通った。読む量 52,428,800 バイト)'],
      context_chars: 18_000,
    }
    return new Promise<ChatReply>((ok) => window.setTimeout(() => ok(r), 900))
  },
  context: (ctx: ChatContext) => wait({ ok: true as const, context: `あなたは BigQuery(GoogleSQL)の SQL を書く専門家です。…(見本)

## いまの接続
- 画面で開いているデータセット: \`${ctx.dataset}\`

## いまの SQL

\`\`\`sql
${ctx.sql}
\`\`\`` }),
  tables: (dataset: string) => {
    if (!dataset.endsWith('ccp_dummy_src')) return fail(`NotFound: 404 Not found: Dataset ${dataset}(見本は ${DS} だけです)`)
    return wait({ ok: true as const, tables: Object.keys(TABLES).map((id) => ({ id, ref: ref(id), type: 'TABLE' })) })
  },
  table: (r: string) => {
    const t = TABLES[idOf(r)]
    if (!t) return fail(`NotFound: 404 Not found: Table ${r}`)
    const info: TableInfo = {
      ok: true,
      ref: r,
      type: 'TABLE',
      description: t.description,
      rows: t.rows.length * 1000,
      bytes: t.rows.length * 1000 * 120,
      modified: '2026-10-22T09:05:00+00:00',
      location: 'asia-northeast1',
      partitioning: t.columns[0].type === 'DATE' ? { type: 'DAY', field: t.columns[0].name } : null,
      clustering: [],
      view_sql: '',
      sources: [],
      columns: t.columns,
    }
    return wait(info)
  },
  preview: (r: string) => {
    const t = TABLES[idOf(r)]
    if (!t) return fail(`NotFound: 404 Not found: Table ${r}`)
    return wait({ ok: true as const, columns: t.columns, rows: t.rows })
  },
  dryrun: (sql: string) => {
    const t = tableIn(sql)
    if (!t) return fail('BadRequest: 400 Not found: Table demo-project:ccp_dummy_src.xxx was not found in location asia-northeast1')
    const st = /^\s*(create|insert|delete|update|merge|drop)/i.test(sql) ? 'CREATE_TABLE_AS_SELECT' : 'SELECT'
    const d: DryRun = { ok: true, statement_type: st, bytes: 52_428_800, columns: TABLES[t].columns.map(({ name, type }) => ({ name, type })), runnable: st === 'SELECT', reason: st === 'SELECT' ? null : `SELECT ではないので流しません(文の種類: ${st})。表を作る SQL は、BigQuery のコンソールで実行してください`, max_bytes: 10 * 1024 ** 3 }
    return wait(d)
  },
  run: (sql: string, maxRows: number) => {
    const t = tableIn(sql)
    if (!t) return fail('BadRequest: 400 Not found: Table demo-project:ccp_dummy_src.xxx was not found in location asia-northeast1')
    if (/^\s*(create|insert|delete|update|merge|drop)/i.test(sql)) return fail('SELECT ではないので流しません(文の種類: CREATE_TABLE_AS_SELECT)。表を作る SQL は、BigQuery のコンソールで実行してください')
    const r: RunResult = { ok: true, columns: TABLES[t].columns.map(({ name, type }) => ({ name, type })), rows: TABLES[t].rows.slice(0, maxRows), total_rows: TABLES[t].rows.length, bytes: 52_428_800, billed: 52_428_800, seconds: 0.84, cached: false }
    return wait(r)
  },
}
