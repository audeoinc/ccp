// 開発用の画面(/dev/)の窓口の身代わり(撮影・デモ用のビルド。vite.mock.config.ts で src/dev/api と差し替える)。
// BigQuery がなくても画面を確かめられるように、練習用の元データ(docs/bq_example/ と同じ名前の表)を見本として返す。
import type { ChatContext, ChatEvent, ChatTurn, CheckResult, ColumnProfile, RunEntry, ConvertEvent, GcsFile, PolicyDraft, PolicyPreview, VersionMeta, Column, DryRun, RunResult, Row, Settings, TableInfo } from '../dev/api'

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
  models: () => wait({ ok: true as const, default: 'gemini-demo-pro', models: ['gemini-demo-pro', 'gemini-demo-flash'], thinking: 'high' }),
  /** 思考・調べたこと・返事を、少しずつ届ける(本物と同じ順で、届き方を確かめられるように) */
  chatStream: async (messages: ChatTurn[], ctx: ChatContext, onEvent: (e: ChatEvent) => void, signal?: AbortSignal) => {
    const ask = messages[messages.length - 1]?.text ?? ''
    const later = (ms: number) => new Promise<void>((ok) => window.setTimeout(ok, ms))
    const events: ChatEvent[] = [
      { type: 'start', model: ctx.model ?? 'gemini-demo-pro', thinking: 'high' },
      { type: 'thought', text: '**表を探す**\n利用者は ctlg を含む表を探している。まず list_tables で名前の一部で探す。\n\n' },
      { type: 'step', text: `表を探した(${DS}、「ctlg」を含む、0 件)` },
      { type: 'thought', text: '**範囲を広げる**\nctlg を含む表がない。データセットの表をすべて見て、商品マスタに当たる表を探す。m_item が商品マスタらしい。\n\n' },
      { type: 'step', text: `表を探した(${DS}、3 件)` },
      { type: 'step', text: `表の列を見た(${DS}.m_item)` },
      { type: 'thought', text: '**CCP の列に当てる**\nSPU のキーは market と product_code。item_cd が品番、country_cd は JPN/USA なので JP/US に直す。dept_nm がカテゴリに近い。\n' },
      { type: 'step', text: 'SQL を確かめた(通った。読む量 52,428,800 バイト)' },
      {
        type: 'final',
        reply: `**m_item** の列を見ました(見本の返事です。いまの発言: 「${ask.slice(0, 40)}」)。\n\n### CCP の列への当て方の案\n- \`item_cd\` → \`product_code\`(品番)\n- \`country_cd\` → \`market\`(JPN → JP、USA → US に直す)\n- \`dept_nm\` → \`category\`(部門 2 が CCP のカテゴリに近い)\n- \`price\` → \`price\`\n\n| 元の列 | CCP の列 | 変換 |\n|---|---|---|\n| \`item_cd\` | \`product_code\` | そのまま |\n| \`country_cd\` | \`market\` | JPN → JP |\n\n念のため、件数も見てください:\n\n\`\`\`sql\nSELECT COUNT(*) AS n\nFROM \`${DS}.m_item\`\n\`\`\``,
        sqls: [
          { title: '国のコードの値を確かめる', sql: `SELECT country_cd, COUNT(*) AS n\nFROM \`${DS}.m_item\`\nGROUP BY country_cd` },
          {
            title: 'SPU の形にする',
            sql: `SELECT\n  CASE country_cd WHEN 'JPN' THEN 'JP' WHEN 'USA' THEN 'US' END AS market,\n  item_cd AS product_code,\n  ANY_VALUE(item_nm) AS name,\n  ANY_VALUE(dept_nm) AS category,\n  MAX(price) AS price\nFROM \`${DS}.m_item\`\nWHERE on_sale_flg\nGROUP BY market, product_code`,
          },
        ],
        questions: ctx.output ? [] : ['季節(season)に当たる列が見つかりません。別の表にありますか?'],
      },
    ]
    for (const ev of events) {
      await later(ev.type === 'final' ? 900 : 600)
      if (signal?.aborted) return
      onEvent(ev)
    }
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
    const d: DryRun = { ok: true, statement_type: st, bytes: 52_428_800, columns: TABLES[t].columns.map(({ name, type }) => ({ name, type })), runnable: st === 'SELECT', reason: st === 'SELECT' ? null : `SELECT ではないので流しません(文の種類: ${st})。表を作る SQL は、BigQuery のコンソールで実行してください`, max_bytes: 10 * 1024 ** 3, cost_usd: 0.0003, price_per_tib: 6.25, weight: '軽い', tables: [ref(t)], views: [] }
    return wait(d)
  },
  run: (sql: string, maxRows: number) => {
    const t = tableIn(sql)
    if (!t) return fail('BadRequest: 400 Not found: Table demo-project:ccp_dummy_src.xxx was not found in location asia-northeast1')
    if (/^\s*(create|insert|delete|update|merge|drop)/i.test(sql)) return fail('SELECT ではないので流しません(文の種類: CREATE_TABLE_AS_SELECT)。表を作る SQL は、BigQuery のコンソールで実行してください')
    const r: RunResult = { ok: true, columns: TABLES[t].columns.map(({ name, type }) => ({ name, type })), rows: TABLES[t].rows.slice(0, maxRows), total_rows: TABLES[t].rows.length, bytes: 52_428_800, billed: 52_428_800, seconds: 0.84, cached: false, job: { job_id: 'bquxjob_demo_123', location: 'asia-northeast1', processed: 52_428_800, billed: 52_428_800, cost_usd: 0.0003, price_per_tib: 6.25, slot_ms: 1840, elapsed: 0.84, cached: false, weight: '軽い', tables: [ref(t)], views: [] } }
    return wait(r)
  },
}

// 出力ごとの版(身代わり。ブラウザのメモリの中だけ)
const work: Record<string, { versions: (VersionMeta & { sql: string })[]; adopted: number | null }> = {}
let target = { dataset: 'demo-project.ccp_out', prefix: 'ccp_' }
const workOf = (o: string) => (work[o] ??= { versions: [], adopted: null })
const LABELS: Record<string, [string, string]> = {
  spu: ['SPU', 'BQ_SPU'], sku: ['SKU', 'BQ_SKU'], sku_stock: ['SKU の在庫', 'BQ_SKU_STOCK'],
  weekly: ['週ごとの実績', 'BQ_WEEKLY'], forecast: ['天気予報', 'BQ_FORECAST'], ranking: ['販売チャネルごとの順位', 'BQ_RANKING'],
}

export const WorkApi = {
  list: () =>
    wait({
      ok: true as const,
      target,
      outputs: Object.fromEntries(Object.entries(LABELS).map(([k, [label, env]]) => [k, { label, env, versions: workOf(k).versions.map((x) => ({ v: x.v, created: x.created, check: x.check })), adopted: workOf(k).adopted }])),
    }),
  save: (output: string, sql: string) => {
    const w = workOf(output)
    const last = w.versions[w.versions.length - 1]
    if (last && last.sql.trim() === sql.trim()) return wait({ ok: true as const, v: last.v, same: true })
    const v = (last?.v ?? 0) + 1
    w.versions.push({ v, created: new Date().toISOString(), check: null, sql })
    return wait({ ok: true as const, v, same: false })
  },
  get: (output: string, v: number) => {
    const x = workOf(output).versions.find((y) => y.v === v)
    return x ? wait({ ok: true as const, ...x }) : fail(`v${v} はありません`)
  },
  adopt: (output: string, v: number | null) => {
    workOf(output).adopted = v
    return wait({ ok: true as const })
  },
  target: (dataset: string, prefix: string) => {
    target = { dataset, prefix }
    return wait({ ok: true as const })
  },
  check: (output: string, sql: string, opts: { version?: number | null; withContext: boolean; run: boolean }) => {
    const ctx = opts.withContext && output === 'sku' && workOf('spu').adopted ? ['spu'] : []
    const base: CheckResult = { ok: true, output, columns: [], missing: [], missing_optional: ['length'], bytes: 52_428_800, cost_usd: 0.0003, price_per_tib: 6.25, weight: '軽い', context: ctx, max_bytes: 10 * 1024 ** 3, ran: false }
    if (!opts.run) return wait(base)
    const issues = [
      { level: 'NG', message: 'キー(market, product_code)が重なっている組があります: 2 組', count: 0, examples: ['JP/A1001', 'JP/B2040'] },
      { level: '注意', message: 'category に、CCP の選択肢にない値があります', count: 12, examples: ['ニット', 'Bottoms'] },
    ]
    const r: CheckResult = { ...base, ran: true, rows: 4000, issues, ng: 1, warn: 1, notes: [], checked_at: new Date().toISOString() }
    const x = opts.version ? workOf(output).versions.find((y) => y.v === opts.version) : null
    if (x) x.check = { checked_at: r.checked_at!, rows: 4000, ng: 1, warn: 1 }
    return new Promise<CheckResult>((ok) => window.setTimeout(() => ok(r), sql.length ? 900 : 0))
  },
}

// AI との会話(身代わり。ブラウザのメモリの中だけ)
const chats: Record<string, { title: string; output: string; created: string; updated: string; messages: unknown[] }> = {}
const firstText = (m: unknown[]) => String((m.find((x) => (x as { role?: string }).role === 'user') as { text?: string } | undefined)?.text ?? '新しい会話').slice(0, 40)

export const ChatApi = {
  list: () => wait({ ok: true as const, chats: Object.entries(chats).map(([id, c]) => ({ id, title: c.title, created: c.created, updated: c.updated, count: c.messages.length, output: c.output })).sort((a, b) => b.updated.localeCompare(a.updated)) }),
  get: (id: string) => (chats[id] ? wait({ ok: true as const, id, ...chats[id] }) : fail('その会話はありません')),
  save: (id: string, body: { title?: string; output: string; messages: unknown[] }) => {
    const now = new Date().toISOString()
    chats[id] = { title: body.title || chats[id]?.title || firstText(body.messages), output: body.output, created: chats[id]?.created ?? now, updated: now, messages: body.messages }
    return wait({ ok: true as const })
  },
  remove: (id: string) => {
    delete chats[id]
    return wait({ ok: true as const })
  },
}

// ポリシーの文書(身代わり)。GCS の見本のフォルダと、書き直しの見本を返す
const POLICY_FILES: GcsFile[] = [
  { name: 'policy/表現ガイド.xlsx', size: 48_000, updated: '2026-10-20T09:00:00Z', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  { name: 'policy/秋冬の販売方針.pdf', size: 820_000, updated: '2026-10-18T09:00:00Z', type: 'application/pdf' },
  { name: 'policy/memo.docx', size: 12_000, updated: '2026-10-01T09:00:00Z', type: '' },
]
const SAMPLE_RULES = `# ルール集: 表現の決まり
- 版: 2026-10-20
- 出どころ: 表現ガイド.xlsx

## R-COPY-001 価格は税込みで書く
- 対象: copy, headline
- 強さ: must
- 市場: JP

## R-TONE-002 口調は、落ち着いた丁寧語
- 対象: copy
- 強さ: should
`
const SAMPLE_SALES = 'week_start,market,scope,target,stage,priority,focus\n2026-10-26,JP,all,,,,防寒を主役に\n2026-10-26,JP,category,ニット,主力,1,\n'

export const PolicyApi = {
  list: (bucket: string, prefix: string) =>
    wait({ ok: true as const, bucket, prefix, folders: prefix ? [] : ['policy/'], files: prefix === 'policy/' ? POLICY_FILES : [] }),
  extract: (_bucket: string, names: string[]) =>
    wait({
      ok: true as const,
      docs: names.map((n) =>
        n.endsWith('.pdf') ? { name: n, kind: 'pdf', size: 820_000 } : { name: n, kind: 'xlsx', text: '### シート: 表現の決まり\n\n```csv\n区分,決まり,強さ\n価格,税込みで書く,必ず\n口調,落ち着いた丁寧語,なるべく\n```', chars: 80 },
      ),
    }),
  convert: async (body: { names: string[] }, onEvent: (e: ConvertEvent) => void, signal?: AbortSignal) => {
    const later = (ms: number) => new Promise<void>((ok) => window.setTimeout(ok, ms))
    const events: ConvertEvent[] = [
      { type: 'start', model: 'gemini-demo-pro', thinking: 'high' },
      ...body.names.map((n): ConvertEvent => ({ type: 'step', text: `${n} を読んだ` })),
      { type: 'thought', text: '**分け方を決める**\n表現の決まりはルール系、週ごとの方針は販売系に分ける。\n' },
      { type: 'final', reply: '2 つのファイルに分けました(見本の返事です)。', files: [{ kind: 'rules', filename: '表現ガイド.md', content: SAMPLE_RULES }, { kind: 'sales', filename: '秋冬の販売方針.csv', content: SAMPLE_SALES }], questions: ['「なるべく」は should として扱いました。よいですか?'] },
    ]
    for (const ev of events) {
      await later(500)
      if (signal?.aborted) return
      onEvent(ev)
    }
  },
  drafts: () => wait({ ok: true as const, drafts: [] }),
  preview: (d: PolicyDraft) => wait(mockPreview(d)),
  import: (d: PolicyDraft) => wait(mockPreview(d)),
}

/** 取り込みの確かめの身代わり(## R- の見出しを決まりとして数え、「強さ」がないものを読めない決まりにする) */
function mockPreview(d: PolicyDraft): PolicyPreview {
  if (d.kind === 'sales') {
    const rows = d.content.trim().split('\n').slice(1)
    return { kind: 'sales', filename: d.filename, title: '', count: rows.length, problems: [], weeks: [{ week_start: '2026-10-26', market: 'JP', rows: rows.length }] }
  }
  const blocks = d.content.split(/\n(?=## )/).filter((b) => b.startsWith('## '))
  const ok = blocks.filter((b) => b.includes('強さ:'))
  return {
    kind: 'rules',
    filename: d.filename,
    title: '表現の決まり',
    count: ok.length,
    problems: blocks.filter((b) => !b.includes('強さ:')).map((b) => ({ line: 1, where: b.split('\n')[0].slice(3), message: '強さ がありません' })),
    rules: ok.map((b) => ({ rule_id: b.split(' ')[1], title: b.split('\n')[0].split(' ').slice(2).join(' '), strength: b.includes('must') ? 'must' : 'should', market: b.includes('市場: JP') ? 'JP' : null, channel: null })),
  }
}

// 作業ファイル(身代わり。ブラウザのメモリの中だけ)
const workFiles: Record<string, { content: string; pinned: boolean; updated: string }> = {
  'コーディングルール.md': { content: '# SQL のコーディングルール(見本)\n- 予約語は大文字\n- CTE の名前は小文字のスネークケース\n', pinned: true, updated: '2026-10-23T09:00:00Z' },
}
export const FilesApi = {
  list: () => wait({ ok: true as const, files: Object.entries(workFiles).map(([name, f]) => ({ name, size: f.content.length, updated: f.updated, pinned: f.pinned })).sort((a, b) => b.updated.localeCompare(a.updated)) }),
  get: (name: string) => (workFiles[name] ? wait({ ok: true as const, name, content: workFiles[name].content, pinned: workFiles[name].pinned }) : fail(`${name} はありません`)),
  save: (name: string, content: string) => {
    const overwritten = !!workFiles[name]
    workFiles[name] = { content, pinned: workFiles[name]?.pinned ?? false, updated: new Date().toISOString() }
    return wait({ ok: true as const, overwritten })
  },
  remove: (name: string) => {
    delete workFiles[name]
    return wait({ ok: true as const })
  },
  pin: (name: string, pinned: boolean) => {
    if (workFiles[name]) workFiles[name].pinned = pinned
    return wait({ ok: true as const })
  },
  fromXlsx: (name: string) => {
    workFiles[name] = { content: '### シート: Sheet1\n\n```csv\na,b\n```', pinned: false, updated: new Date().toISOString() }
    return wait({ ok: true as const, overwritten: false, chars: 30 })
  },
}

// 実行の履歴と、列の中身(身代わり)
const runs: RunEntry[] = [
  { id: 1, at: '2026-10-23T09:10:00+09:00', source: 'AI', sql: `SELECT country_cd, COUNT(*) AS n\nFROM \`${DS}.m_item\`\nGROUP BY country_cd`, ok: true, rows: 2, processed: 1_048_576, billed: 10_485_760, cost_usd: 0.0001, seconds: 0.6, error: '' },
  { id: 2, at: '2026-10-23T09:12:00+09:00', source: '画面', sql: `SELECT itm_cd FROM \`${DS}.m_item\``, ok: false, rows: null, processed: null, billed: null, cost_usd: null, seconds: null, error: 'BadRequest: 400 Unrecognized name: itm_cd; Did you mean item_cd? at [1:8]' },
]
export const RunApi = {
  history: (q = '') => wait({ ok: true as const, runs: [...runs].reverse().filter((r) => !q || r.sql.toLowerCase().includes(q.toLowerCase()) || r.error.toLowerCase().includes(q.toLowerCase())) }),
  profile: (table: string, column: string, confirm = false) => {
    const t = TABLES[idOf(table)]
    const col = t?.columns.find((c) => c.name === column)
    if (!t || !col) return fail(`列 ${column} が ${table} にありません`)
    const base: ColumnProfile = { ok: true, table, column, type: col.type, mode: col.mode ?? 'NULLABLE', description: col.description ?? '', bytes: column === 'item_nm' ? 3 * 1024 ** 3 : 52_428_800, cost_usd: column === 'item_nm' ? 0.02 : 0.0003, sql: '' }
    if (base.bytes > 1024 ** 3 && !confirm) return wait({ ...base, needs_confirm: true })
    const counts = new Map<string | null, number>()
    for (const r of t.rows) {
      const v = r[column] == null ? null : String(r[column])
      counts.set(v, (counts.get(v) ?? 0) + 1)
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([value, n]) => ({ value, n: n * 1000 }))
    const nulls = counts.get(null) ?? 0
    runs.push({ id: runs.length + 1, at: new Date().toISOString(), source: '列を調べる', sql: `SELECT COUNT(*) AS total … FROM \`${table}\``, ok: true, rows: t.rows.length * 1000, processed: base.bytes, billed: null, cost_usd: null, seconds: 0.9, error: '' })
    const vals = top.map((x) => x.value).filter((v): v is string => v != null).sort()
    return wait({ ...base, total: t.rows.length * 1000, nulls: nulls * 1000, null_rate: nulls / t.rows.length, distinct_approx: counts.size, min_value: vals[0] ?? null, max_value: vals[vals.length - 1] ?? null, top, seconds: 0.9 })
  },
}
