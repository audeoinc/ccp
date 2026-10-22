import { useEffect, useRef, useState } from 'react'
import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Dropdown,
  Option,
  Spinner,
  Tag,
  TagGroup,
  Textarea,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components'
import { ArrowUpRegular, ChevronDownRegular, ChevronRightRegular, DeleteRegular, DocumentSearchRegular, SparkleRegular, TableAddRegular } from '@fluentui/react-icons'
import { MarkdownLite } from '../MarkdownLite'
import { DevApi, isFailure, type ChatContext, type ChatTurn } from './api'
import { CopyButton } from './CopyButton'

const useStyles = makeStyles({
  root: {
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusLarge,
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    height: 'calc(100vh - 80px)',
    position: 'sticky',
    top: '12px',
  },
  head: { display: 'flex', alignItems: 'center', gap: '4px', padding: '8px 12px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  title: { fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold, display: 'flex', alignItems: 'center', gap: '6px', flexGrow: 1 },
  ctx: { padding: '8px 12px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, display: 'flex', flexDirection: 'column', gap: '6px' },
  ctxToggle: { display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', border: 'none', background: 'none', padding: 0, color: tokens.colorNeutralForeground2, fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold },
  label: { fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground3 },
  row: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' },
  grow: { flexGrow: 1 },
  log: { flexGrow: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px', minHeight: 0 },
  empty: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, lineHeight: '20px' },
  user: {
    alignSelf: 'flex-end',
    maxWidth: '90%',
    backgroundColor: tokens.colorBrandBackground2,
    borderRadius: tokens.borderRadiusLarge,
    padding: '6px 10px',
    fontSize: tokens.fontSizeBase200,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
  },
  model: { display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 },
  steps: { fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3, margin: 0, paddingLeft: '16px' },
  sql: {
    margin: 0,
    padding: '8px',
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusMedium,
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    maxHeight: '280px',
    overflowY: 'auto',
  },
  questions: { fontSize: tokens.fontSizeBase200, margin: 0, paddingLeft: '18px', color: tokens.colorPaletteMarigoldForeground2 },
  error: { fontSize: tokens.fontSizeBase200, color: tokens.colorPaletteRedForeground1, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
  input: { padding: '8px 12px', borderTop: `1px solid ${tokens.colorNeutralStroke2}`, display: 'flex', flexDirection: 'column', gap: '6px' },
  pre: { margin: 0, fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase200, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: '60vh', overflowY: 'auto' },
})

/** 会話の 1 つ(画面に出す形)。Gemini の返事は、返事・SQL・聞きたいこと・調べたことに分けて持つ */
interface Message {
  role: 'user' | 'model'
  text: string
  sql?: string
  questions?: string[]
  steps?: string[]
  error?: boolean
}

const OUTPUTS: { value: string; label: string }[] = [
  { value: '', label: '決めない(仕様は全部渡す)' },
  { value: 'spu', label: 'SPU' },
  { value: 'sku', label: 'SKU' },
  { value: 'sku_stock', label: 'SKU の在庫' },
  { value: 'weekly', label: '週ごとの実績' },
  { value: 'forecast', label: '天気予報' },
  { value: 'ranking', label: '販売チャネルごとの順位' },
]

// 会話は、この画面を開いている人のブラウザにだけ残す(閉じても続きから話せるように。作ったものは SQL として持ち出す)
const LOG_KEY = 'ccp-dev-chat'
const readLog = (): Message[] => {
  try {
    const v = JSON.parse(window.localStorage.getItem(LOG_KEY) ?? '[]') as unknown
    return Array.isArray(v) ? (v as Message[]) : []
  } catch {
    return []
  }
}
const writeLog = (m: Message[]) => {
  try {
    window.localStorage.setItem(LOG_KEY, JSON.stringify(m.slice(-80)))
  } catch {
    // 保存できない環境では、残さない
  }
}

/** Gemini に戻す会話の形。前の返事の SQL も本文に入れる(「さっきの SQL の…」が通じるように) */
const toTurn = (m: Message): ChatTurn => ({
  role: m.role,
  text: m.role === 'model' && m.sql ? `${m.text}\n\n\`\`\`sql\n${m.sql}\n\`\`\`` : m.text,
})

interface Props {
  dataset: string
  /** 左で開いている表(「この表を渡す」で足す) */
  selected: string | null
  sql: string
  /** いまの SQL を流した結果(エラー、または結果の先頭の Markdown) */
  last: string
  hasError: boolean
  notes: string
  onNotes: (notes: string) => void
  onUseSql: (sql: string) => void
}

/**
 * Gemini と会話しながら SQL を組み立てる(DEVTOOLS.md の 3.1 ④)。
 * Gemini は、BigQuery を調べる道具(表を探す・列を見る・確かめる・SELECT を流す)を使える。
 * 「A データセットの ctlg を含む表から、CCP で使えそうな列を…」のように頼めば、自分で表を探して答える
 */
export function ChatPanel({ dataset, selected, sql, last, hasError, notes, onNotes, onUseSql }: Props) {
  const s = useStyles()
  const [messages, setMessages] = useState<Message[]>(readLog)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [output, setOutput] = useState('')
  const [tables, setTables] = useState<string[]>([])
  const [sampleRows, setSampleRows] = useState(true)
  const [allowRun, setAllowRun] = useState(true)
  const [withSql, setWithSql] = useState(true)
  const [ctxOpen, setCtxOpen] = useState(false)
  const [draftNotes, setDraftNotes] = useState(notes)
  const [preview, setPreview] = useState<string | null>(null)
  const logEnd = useRef<HTMLDivElement>(null)

  useEffect(() => {
    logEnd.current?.scrollIntoView({ block: 'end' })
  }, [messages, busy])

  const ctx = (): ChatContext => ({
    output: output || null,
    dataset,
    tables,
    sample_rows: sampleRows,
    allow_run: allowRun,
    notes: draftNotes,
    sql: withSql ? sql : '',
    last: withSql ? last : '',
  })

  const update = (next: Message[]) => {
    setMessages(next)
    writeLog(next)
  }

  const send = async (text: string) => {
    const t = text.trim()
    if (!t || busy) return
    const next = [...messages, { role: 'user' as const, text: t }]
    update(next)
    setInput('')
    setBusy(true)
    // エラーになった発言は、会話に戻さない(Gemini が混乱しないように)
    const r = await DevApi.chat(next.filter((m) => !m.error).map(toTurn), ctx())
    setBusy(false)
    if (isFailure(r)) update([...next, { role: 'model', text: r.error, steps: r.steps, error: true }])
    else update([...next, { role: 'model', text: r.reply, sql: r.sql, questions: r.questions, steps: r.steps }])
  }

  const showContext = async () => {
    setPreview('')
    const r = await DevApi.context(ctx())
    setPreview(isFailure(r) ? r.error : r.context)
  }

  return (
    <div className={s.root}>
      <div className={s.head}>
        <span className={s.title}>
          <SparkleRegular /> Gemini と SQL を作る
        </span>
        <Button size="small" appearance="subtle" icon={<DocumentSearchRegular />} onClick={() => void showContext()} title="Gemini に渡す前提(仕様・手本・表・まとめ・いまの SQL)を見る">
          前提
        </Button>
        <Button size="small" appearance="subtle" icon={<DeleteRegular />} disabled={!messages.length || busy} onClick={() => update([])} title="会話を消して、最初から">
          消す
        </Button>
      </div>

      <div className={s.ctx}>
        <button type="button" className={s.ctxToggle} onClick={() => setCtxOpen((v) => !v)}>
          {ctxOpen ? <ChevronDownRegular /> : <ChevronRightRegular />}
          Gemini に渡すもの({output ? `${OUTPUTS.find((o) => o.value === output)?.label}・` : ''}表 {tables.length}・まとめ {draftNotes.trim() ? 'あり' : 'なし'})
        </button>
        {ctxOpen && (
          <>
            <div className={s.row}>
              <span className={s.label}>作る出力</span>
              <Dropdown size="small" value={OUTPUTS.find((o) => o.value === output)?.label} selectedOptions={[output]} onOptionSelect={(_, d) => setOutput(d.optionValue ?? '')}>
                {OUTPUTS.map((o) => (
                  <Option key={o.value} value={o.value}>
                    {o.label}
                  </Option>
                ))}
              </Dropdown>
            </div>
            <div className={s.row}>
              <span className={s.label}>表</span>
              <Button size="small" appearance="subtle" icon={<TableAddRegular />} disabled={!selected || tables.includes(selected)} onClick={() => selected && setTables((t) => [...t, selected])}>
                開いている表を足す
              </Button>
            </div>
            {tables.length > 0 && (
              <TagGroup size="small" onDismiss={(_, d) => setTables((t) => t.filter((x) => x !== d.value))}>
                {tables.map((t) => (
                  <Tag key={t} value={t} dismissible title={t}>
                    {t.split('.').pop()}
                  </Tag>
                ))}
              </TagGroup>
            )}
            <span className={s.label}>表を足さなくても、Gemini が自分で探して列を見ます。</span>
            <Checkbox size="medium" label="表の先頭の数行も渡す(名前・住所・レビューなどの列は外す)" checked={sampleRows} onChange={(_, d) => setSampleRows(!!d.checked)} />
            <Checkbox size="medium" label="Gemini に SELECT を流させる(値の確かめ。読む量の上限つき)" checked={allowRun} onChange={(_, d) => setAllowRun(!!d.checked)} />
            <Checkbox size="medium" label="いまの SQL と、流した結果・エラーを渡す" checked={withSql} onChange={(_, d) => setWithSql(!!d.checked)} />
            <span className={s.label}>仕様のまとめ(コンフルなどから。保存して次も使う)</span>
            <Textarea
              size="small"
              resize="vertical"
              rows={4}
              value={draftNotes}
              placeholder="利用先の Claude がまとめた Markdown を貼る"
              onChange={(_, d) => setDraftNotes(d.value)}
              onBlur={() => draftNotes !== notes && onNotes(draftNotes)}
            />
          </>
        )}
      </div>

      <div className={s.log}>
        {messages.length === 0 && (
          <div className={s.empty}>
            たとえば:
            <br />
            「接続しているプロジェクトの A データセットに、ctlg を含む表があると思います。CCP で使えそうな列を SELECT する SQL を書いてください。そのあと、どの列を CCP のどの列に当てるとよさそうか、一緒に考えてください」
          </div>
        )}
        {messages.map((m, i) =>
          m.role === 'user' ? (
            <div key={i} className={s.user}>
              {m.text}
            </div>
          ) : (
            <div key={i} className={s.model}>
              {m.steps && m.steps.length > 0 && (
                <ul className={s.steps}>
                  {m.steps.map((st, j) => (
                    <li key={j}>{st}</li>
                  ))}
                </ul>
              )}
              {m.error ? <div className={s.error}>{m.text}</div> : <MarkdownLite text={m.text} />}
              {m.questions && m.questions.length > 0 && (
                <ul className={s.questions}>
                  {m.questions.map((q, j) => (
                    <li key={j}>{q}</li>
                  ))}
                </ul>
              )}
              {m.sql && (
                <>
                  <pre className={s.sql}>{m.sql}</pre>
                  <div className={s.row}>
                    <Button size="small" appearance="primary" onClick={() => onUseSql(m.sql!)}>
                      SQL の欄に入れる
                    </Button>
                    <CopyButton text={() => m.sql!} />
                  </div>
                </>
              )}
              {!m.error && <CopyButton label="返事をコピー" text={() => toTurn(m).text} />}
            </div>
          ),
        )}
        {busy && <Spinner size="tiny" label="Gemini が考えています(表を調べるときは、少し時間がかかります)" />}
        <div ref={logEnd} />
      </div>

      <div className={s.input}>
        {hasError && withSql && (
          <div className={s.row}>
            <Button size="small" disabled={busy} onClick={() => void send('いまの SQL のエラーを直してください。')}>
              このエラーを直して
            </Button>
          </div>
        )}
        <Textarea
          resize="vertical"
          rows={3}
          value={input}
          disabled={busy}
          placeholder="Gemini に頼む(Ctrl + Enter で送る)"
          onChange={(_, d) => setInput(d.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault()
              void send(input)
            }
          }}
        />
        <div className={s.row}>
          <span className={mergeClasses(s.label, s.grow)}>
            Gemini が調べたこと・流した SQL は、返事の上に出ます
          </span>
          <Button size="small" appearance="primary" icon={<ArrowUpRegular />} disabled={busy || !input.trim()} onClick={() => void send(input)}>
            送る
          </Button>
        </div>
      </div>

      <Dialog open={preview !== null} onOpenChange={(_, d) => !d.open && setPreview(null)}>
        <DialogSurface style={{ maxWidth: '900px', width: '90vw' }}>
          <DialogBody>
            <DialogTitle>Gemini に渡す前提</DialogTitle>
            <DialogContent>{preview === '' ? <Spinner size="tiny" label="組み立てています" /> : <pre className={s.pre}>{preview}</pre>}</DialogContent>
            <DialogActions>
              <span className={s.label}>{preview ? `${preview.length.toLocaleString()} 文字` : ''}</span>
              <CopyButton label="前提をコピー" appearance="secondary" size="medium" text={() => preview ?? ''} />
              <Button onClick={() => setPreview(null)}>閉じる</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  )
}
