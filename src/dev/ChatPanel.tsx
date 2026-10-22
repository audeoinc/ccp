import { useEffect, useRef, useState } from 'react'
import {
  Button,
  Checkbox,
  Combobox,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Dropdown,
  Input,
  Option,
  Spinner,
  Tag,
  TagGroup,
  Textarea,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components'
import {
  ArrowUpRegular,
  BrainCircuitRegular,
  ChevronDownRegular,
  ChevronRightRegular,
  DeleteRegular,
  DocumentSearchRegular,
  PlayRegular,
  ArrowLeftRegular,
  AddRegular,
  HistoryRegular,
  RenameRegular,
  PanelRightContractRegular,
  SparkleRegular,
  StopRegular,
  TableAddRegular,
} from '@fluentui/react-icons'
import { ChatMarkdown } from './ChatMarkdown'
import { ChatApi, DevApi, isFailure, type ChatContext, type ChatEvent, type ChatMeta, type ChatTurn, type SqlBlock } from './api'
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
  head: { flexShrink: 0, display: 'flex', alignItems: 'center', gap: '4px', padding: '8px 12px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, flexWrap: 'wrap' },
  title: { fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold, display: 'flex', alignItems: 'center', gap: '6px', flexGrow: 1 },
  model: { minWidth: '200px', maxWidth: '100%' },
  ctx: { flexShrink: 0, padding: '8px 12px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '45vh', overflowY: 'auto' },
  toggle: { display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', border: 'none', background: 'none', padding: 0, color: tokens.colorNeutralForeground2, fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, textAlign: 'left' },
  label: { fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground3 },
  row: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' },
  grow: { flexGrow: 1 },
  history: { flexShrink: 0, maxHeight: '40vh', overflowY: 'auto', borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, padding: '4px 8px', display: 'flex', flexDirection: 'column', gap: '2px' },
  historyItem: { display: 'flex', alignItems: 'center', gap: '2px', borderRadius: tokens.borderRadiusMedium, ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover } },
  historyOn: { backgroundColor: tokens.colorBrandBackground2 },
  historyOpen: { flexGrow: 1, minWidth: 0, border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer', padding: '4px', display: 'flex', flexDirection: 'column', color: tokens.colorNeutralForeground1 },
  historyTitle: { fontSize: tokens.fontSizeBase200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  historyMeta: { fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3 },
  chatName: { flexShrink: 0, padding: '4px 12px 0', fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  log: { flexGrow: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px', minHeight: 0 },
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
  answer: { display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 },
  meta: { fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3, display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' },
  thoughts: {
    margin: 0,
    padding: '6px 8px',
    borderLeft: `3px solid ${tokens.colorNeutralStroke1}`,
    backgroundColor: tokens.colorNeutralBackground2,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
    overflowWrap: 'anywhere',
    maxHeight: '320px',
    overflowY: 'auto',
  },
  steps: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, margin: 0, paddingLeft: '18px' },
  sqlBox: { border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, overflow: 'hidden' },
  sqlHead: { display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 6px', backgroundColor: tokens.colorNeutralBackground3, flexWrap: 'wrap' },
  sqlTitle: { fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, flexGrow: 1, minWidth: '80px' },
  sql: {
    margin: 0,
    padding: '8px',
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    maxHeight: '320px',
    overflowY: 'auto',
  },
  questions: { fontSize: tokens.fontSizeBase200, margin: 0, paddingLeft: '18px', color: tokens.colorPaletteMarigoldForeground2 },
  error: { fontSize: tokens.fontSizeBase200, color: tokens.colorPaletteRedForeground1, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
  input: { flexShrink: 0, padding: '8px 12px', borderTop: `1px solid ${tokens.colorNeutralStroke2}`, display: 'flex', flexDirection: 'column', gap: '6px' },
  pre: { margin: 0, fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase200, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: '60vh', overflowY: 'auto' },
})

/** 会話の 1 つ(画面に出す形)。返事は、思考・調べたこと・返事・SQL・聞きたいことに分けて持つ */
interface Message {
  role: 'user' | 'model'
  text: string
  sqls?: SqlBlock[]
  questions?: string[]
  steps?: string[]
  thoughts?: string
  model?: string
  seconds?: number
  error?: boolean
  /** 届いている途中 */
  live?: boolean
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

// 上の帯(見出し・渡すもの)と下の入力欄は縮めない(会話の欄だけがスクロールする)
// 会話と選んだモデルは、この画面を開いている人のブラウザにだけ残す(閉じても続きから話せるように)
// (以前は会話をブラウザだけに残していた。初めて開いたときに、1 つの会話としてサーバーに移す)
const LOG_KEY = 'ccp-dev-chat.v2'
// いま開いている会話の ID(会話そのものは server/devwork/chats/ に残す。別のブラウザ・PC からも続きを話せるように)
const CHAT_KEY = 'ccp-dev-chat-id'
const newId = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
const MODEL_KEY = 'ccp-dev-model'
const load = <T,>(key: string, fallback: T): T => {
  try {
    const v = window.localStorage.getItem(key)
    return v ? (JSON.parse(v) as T) : fallback
  } catch {
    return fallback
  }
}
const save = (key: string, v: unknown) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(v))
  } catch {
    // 保存できない環境では、残さない
  }
}

/** Gemini に戻す会話の形。前の返事の SQL も本文に入れる(「さっきの 2 つめの SQL の…」が通じるように) */
const toTurn = (m: Message): ChatTurn => ({
  role: m.role,
  text: m.role === 'model' && m.sqls?.length ? `${m.text}\n\n${m.sqls.map((b, i) => `-- SQL ${i + 1}${b.title ? `: ${b.title}` : ''}\n\`\`\`sql\n${b.sql}\n\`\`\``).join('\n\n')}` : m.text,
})

interface Props {
  dataset: string
  /** 左で開いている表(「開いている表を足す」で足す) */
  selected: string | null
  sql: string
  /** いまの SQL を流した結果(エラー、または結果の先頭の Markdown) */
  last: string
  hasError: boolean
  notes: string
  onNotes: (notes: string) => void
  /** SQL の欄に入れる(run なら、入れてすぐ流す) */
  onUseSql: (sql: string, run: boolean) => void
  /** ペインを畳む */
  onFold?: () => void
  /** 作る出力(SQL の欄の「作る出力」と同じもの) */
  output: string
  onOutput: (output: string) => void
  /** 外から頼む(答え合わせの「AI に直してもらう」)。id が変わったら送る */
  ask?: { id: number; text: string } | null
}

/**
 * Gemini と会話しながら SQL を組み立てる(DEVTOOLS.md の 3.1 ④)。
 * Gemini は、BigQuery を調べる道具(表を探す・列を見る・ビューの参照先をたどる・確かめる・SELECT を流す)を使える。
 * 思考の要約・調べたこと・返事は、届いたそばから出す(止まっているのか考えているのかが分かるように)
 */
export function ChatPanel({ dataset, selected, sql, last, hasError, notes, onNotes, onUseSql, onFold, output, onOutput, ask }: Props) {
  const s = useStyles()
  const [messages, setMessages] = useState<Message[]>([])
  const [chatId, setChatId] = useState<string>(() => load<string>(CHAT_KEY, '') || newId())
  const [title, setTitle] = useState('')
  const [chats, setChats] = useState<ChatMeta[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [models, setModels] = useState<string[]>([])
  const [model, setModel] = useState<string>(() => load<string>(MODEL_KEY, ''))
  const [defaultModel, setDefaultModel] = useState('')
  // モデルの欄に打っている途中の文字(確定するまで、選んだモデルは変えない)
  const [modelDraft, setModelDraft] = useState<string | null>(null)
  const [tables, setTables] = useState<string[]>([])
  const [sampleRows, setSampleRows] = useState(true)
  const [allowRun, setAllowRun] = useState(true)
  const [withSql, setWithSql] = useState(true)
  const [ctxOpen, setCtxOpen] = useState(false)
  const [draftNotes, setDraftNotes] = useState(notes)
  const [preview, setPreview] = useState<string | null>(null)
  // 開いている思考(既定は、届いている途中だけ開く)
  const [openThoughts, setOpenThoughts] = useState<Record<number, boolean>>({})
  const logEnd = useRef<HTMLDivElement>(null)
  const abort = useRef<AbortController | null>(null)

  useEffect(() => {
    void (async () => {
      const r = await DevApi.models()
      if (isFailure(r)) return
      setModels(r.models)
      setDefaultModel(r.default)
    })()
  }, [])

  useEffect(() => {
    logEnd.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  // 考えている間は、経過の秒数を出す(止まっていないことが分かるように)
  useEffect(() => {
    if (!busy) return
    const t0 = Date.now()
    const id = window.setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 1000)
    return () => {
      window.clearInterval(id)
      setElapsed(0)
    }
  }, [busy])

  const ctx = (): ChatContext => ({
    model: model || null,
    output: output || null,
    dataset,
    tables,
    sample_rows: sampleRows,
    allow_run: allowRun,
    notes: draftNotes,
    sql: withSql ? sql : '',
    last: withSql ? last : '',
  })

  const refreshChats = async () => {
    const r = await ChatApi.list()
    if (!isFailure(r)) setChats(r.chats)
  }

  // 開いたとき: 前に開いていた会話を読む。以前のブラウザだけの会話があれば、サーバーに移す
  // (開発中は effect が 2 回走るので、移すのは 1 回だけにする。2 つの会話に分かれないように)
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    void (async () => {
      const legacy = load<Message[]>(LOG_KEY, [])
      if (legacy.length) {
        const id = newId()
        const r = await ChatApi.save(id, { output: '', messages: legacy.map((m) => ({ ...m, live: false })) })
        if (!isFailure(r)) {
          try {
            window.localStorage.removeItem(LOG_KEY)
          } catch {
            // 消せなくても、次に開いたときにもう一度移すだけ
          }
          save(CHAT_KEY, id)
          setChatId(id)
          setMessages(legacy.map((m) => ({ ...m, live: false })))
        }
      } else {
        const r = await ChatApi.get(chatId)
        if (!isFailure(r)) {
          setMessages((r.messages as Message[]).map((m) => ({ ...m, live: false })))
          setTitle(r.title)
        }
      }
      await refreshChats()
    })()
    // 最初の 1 回だけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** 会話を残す(返事が届き終わったとき)。名前は、付け直していなければ最初の発言から付く */
  const commit = (next: Message[], id = chatId) => {
    setMessages(next)
    void ChatApi.save(id, { output, messages: next.slice(-200) }).then(() => refreshChats())
  }

  const openChat = async (id: string) => {
    if (busy) return
    const r = await ChatApi.get(id)
    if (isFailure(r)) return
    setChatId(id)
    save(CHAT_KEY, id)
    setMessages((r.messages as Message[]).map((m) => ({ ...m, live: false })))
    setTitle(r.title)
    if (r.output) onOutput(r.output)
    setHistoryOpen(false)
  }

  const newChat = () => {
    if (busy) return
    const id = newId()
    setChatId(id)
    save(CHAT_KEY, id)
    setMessages([])
    setTitle('')
    setHistoryOpen(false)
  }

  const removeChat = async (id: string) => {
    if (!window.confirm('この会話を消します(元に戻せません)。よいですか?')) return
    await ChatApi.remove(id)
    if (id === chatId) newChat()
    await refreshChats()
  }

  const rename = async (id: string, name: string) => {
    setRenaming(null)
    const r = await ChatApi.get(id)
    if (isFailure(r)) return
    await ChatApi.save(id, { title: name, output: r.output, messages: r.messages })
    if (id === chatId) setTitle(name)
    await refreshChats()
  }

  const send = async (text: string) => {
    const t = text.trim()
    if (!t || busy) return
    // エラーになった返事は、会話に戻さない(Gemini が混乱しないように)
    const history = [...messages.filter((m) => !m.error), { role: 'user' as const, text: t }]
    const base = [...messages, { role: 'user' as const, text: t }]
    let answer: Message = { role: 'model', text: '', steps: [], thoughts: '', live: true }
    const at = base.length
    setMessages([...base, answer])
    setInput('')
    setBusy(true)
    const t0 = Date.now()
    const ac = new AbortController()
    abort.current = ac
    const apply = (patch: Partial<Message>) => {
      answer = { ...answer, ...patch }
      setMessages((ms) => [...ms.slice(0, at), answer])
    }
    await DevApi.chatStream(
      history.map(toTurn),
      ctx(),
      (ev: ChatEvent) => {
        if (ev.type === 'start') apply({ model: ev.model })
        else if (ev.type === 'thought') apply({ thoughts: (answer.thoughts ?? '') + ev.text })
        else if (ev.type === 'step') apply({ steps: [...(answer.steps ?? []), ev.text] })
        else if (ev.type === 'final') apply({ text: ev.reply, sqls: ev.sqls, questions: ev.questions })
        else if (ev.type === 'error') apply({ text: ev.error, error: true })
      },
      ac.signal,
    )
    if (ac.signal.aborted) apply({ text: '止めました', error: true })
    answer = { ...answer, live: false, seconds: Math.round((Date.now() - t0) / 1000) }
    abort.current = null
    setBusy(false)
    commit([...base, answer])
  }

  const asked = useRef<number | null>(null)
  useEffect(() => {
    if (!ask || asked.current === ask.id) return
    asked.current = ask.id
    const id = window.setTimeout(() => void send(ask.text))
    return () => window.clearTimeout(id)
    // send は毎回作り直されるが、頼みの id が変わったときだけ送る
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ask])

  const showContext = async () => {
    setPreview('')
    const r = await DevApi.context(ctx())
    setPreview(isFailure(r) ? r.error : r.context)
  }

  const shownModel = model || defaultModel

  return (
    <div className={s.root}>
      <div className={s.head}>
        <span className={s.title}>
          <SparkleRegular /> AI と SQL を作る
        </span>
        <Button size="small" appearance="subtle" icon={<DocumentSearchRegular />} onClick={() => void showContext()} title="AI に渡す前提(仕様・手本・表・まとめ・いまの SQL)を見る">
          前提
        </Button>
        <Button size="small" appearance="subtle" icon={<AddRegular />} disabled={busy} onClick={newChat} title="新しい会話を始める(いまの会話は履歴に残る)">
          新しい会話
        </Button>
        <Button size="small" appearance={historyOpen ? 'secondary' : 'subtle'} icon={<HistoryRegular />} disabled={busy} onClick={() => setHistoryOpen((v) => !v)} title="前の会話を開く">
          履歴 {chats.length || ''}
        </Button>
        {onFold && <Button size="small" appearance="subtle" icon={<PanelRightContractRegular />} onClick={onFold} title="畳む(会話は続きます)" />}
        <div className={s.row} style={{ width: '100%' }}>
          <span className={s.label}>モデル</span>
          <Combobox
            className={s.model}
            size="small"
            freeform
            value={modelDraft ?? shownModel}
            selectedOptions={shownModel ? [shownModel] : []}
            placeholder="読んでいます…"
            onChange={(e) => setModelDraft((e.target as HTMLInputElement).value)}
            onOptionSelect={(_, d) => {
              const v = d.optionValue ?? ''
              setModelDraft(null)
              if (!v) return
              setModel(v === defaultModel ? '' : v)
              save(MODEL_KEY, v === defaultModel ? '' : v)
            }}
            onBlur={() => {
              // 一覧にないモデルも、名前を打てば使える(Vertex AI で有効なもの)。空にすれば既定に戻る
              if (modelDraft === null) return
              const v = modelDraft.trim()
              setModelDraft(null)
              setModel(v === defaultModel ? '' : v)
              save(MODEL_KEY, v === defaultModel ? '' : v)
            }}
          >
            {models.map((m) => (
              <Option key={m} value={m}>
                {m === defaultModel ? `${m}(既定)` : m}
              </Option>
            ))}
          </Combobox>
        </div>
      </div>

      {historyOpen && (
        <div className={s.history}>
          {chats.length === 0 && <span className={s.label}>まだ残っている会話はありません</span>}
          {chats.map((c) => (
            <div key={c.id} className={mergeClasses(s.historyItem, c.id === chatId && s.historyOn)}>
              {renaming === c.id ? (
                <Input
                  size="small"
                  className={s.grow}
                  defaultValue={c.title}
                  autoFocus
                  onBlur={(e) => void rename(c.id, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) void rename(c.id, (e.target as HTMLInputElement).value)
                    if (e.key === 'Escape') setRenaming(null)
                  }}
                />
              ) : (
                <button type="button" className={s.historyOpen} onClick={() => void openChat(c.id)} title={c.title}>
                  <span className={s.historyTitle}>{c.title}</span>
                  <span className={s.historyMeta}>
                    {new Date(c.updated).toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' })}・{c.count} 件
                  </span>
                </button>
              )}
              <Button size="small" appearance="subtle" icon={<RenameRegular />} onClick={() => setRenaming(c.id)} title="名前を付け直す" />
              <Button size="small" appearance="subtle" icon={<DeleteRegular />} onClick={() => void removeChat(c.id)} title="消す" />
            </div>
          ))}
        </div>
      )}
      <div className={s.chatName}>{title || (messages.length ? '' : '新しい会話')}</div>

      <div className={s.ctx}>
        <button type="button" className={s.toggle} onClick={() => setCtxOpen((v) => !v)}>
          {ctxOpen ? <ChevronDownRegular /> : <ChevronRightRegular />}
          AI に渡すもの({output ? `${OUTPUTS.find((o) => o.value === output)?.label}・` : ''}表 {tables.length}・まとめ {draftNotes.trim() ? 'あり' : 'なし'})
        </button>
        {ctxOpen && (
          <>
            <div className={s.row}>
              <span className={s.label}>作る出力</span>
              <Dropdown size="small" value={OUTPUTS.find((o) => o.value === output)?.label} selectedOptions={[output]} onOptionSelect={(_, d) => onOutput(d.optionValue ?? '')}>
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
            <span className={s.label}>表を足さなくても、AI が自分で探して列を見ます(ビューは参照先の表までたどります)。</span>
            <Checkbox label="表の先頭の数行も渡す(名前・住所・レビューなどの列は外す)" checked={sampleRows} onChange={(_, d) => setSampleRows(!!d.checked)} />
            <Checkbox label="AI に SELECT を流させる(値の確かめ。読む量の上限つき)" checked={allowRun} onChange={(_, d) => setAllowRun(!!d.checked)} />
            <Checkbox label="いまの SQL と、流した結果・エラーを渡す" checked={withSql} onChange={(_, d) => setWithSql(!!d.checked)} />
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
        {messages.map((m, i) => {
          if (m.role === 'user')
            return (
              <div key={i} className={s.user}>
                {m.text}
              </div>
            )
          const thoughtsOpen = openThoughts[i] ?? !!m.live
          return (
            <div key={i} className={s.answer}>
              <div className={s.meta}>
                {m.model ?? '…'}
                {m.live ? <Spinner size="extra-tiny" label={`考えています ${elapsed} 秒`} /> : m.seconds != null ? <span>{m.seconds} 秒</span> : null}
              </div>
              {!!m.thoughts && (
                <>
                  <button type="button" className={s.toggle} onClick={() => setOpenThoughts((o) => ({ ...o, [i]: !thoughtsOpen }))}>
                    {thoughtsOpen ? <ChevronDownRegular /> : <ChevronRightRegular />}
                    <BrainCircuitRegular /> 思考({m.thoughts.length.toLocaleString()} 文字)
                  </button>
                  {thoughtsOpen && (
                    <div className={s.thoughts}>
                      <ChatMarkdown text={m.thoughts} />
                    </div>
                  )}
                </>
              )}
              {m.steps && m.steps.length > 0 && (
                <ul className={s.steps}>
                  {m.steps.map((st, j) => (
                    <li key={j}>{st}</li>
                  ))}
                </ul>
              )}
              {m.error ? <div className={s.error}>{m.text}</div> : m.text ? <ChatMarkdown text={m.text} onUseSql={onUseSql} /> : null}
              {m.questions && m.questions.length > 0 && (
                <ul className={s.questions}>
                  {m.questions.map((q, j) => (
                    <li key={j}>{q}</li>
                  ))}
                </ul>
              )}
              {m.sqls?.map((b, j) => (
                <div key={j} className={s.sqlBox}>
                  <div className={s.sqlHead}>
                    <span className={s.sqlTitle}>{b.title || `SQL ${j + 1}`}</span>
                    <Button size="small" appearance="primary" icon={<PlayRegular />} onClick={() => onUseSql(b.sql, true)} title="SQL の欄に入れて、すぐ流す(SELECT だけ)">
                      入れて流す
                    </Button>
                    <Button size="small" icon={<ArrowLeftRegular />} onClick={() => onUseSql(b.sql, false)} title="SQL の欄に入れる(流さない)">
                      欄に入れる
                    </Button>
                    <CopyButton text={() => b.sql} />
                  </div>
                  <pre className={s.sql}>{b.sql}</pre>
                </div>
              ))}
              {!m.error && !m.live && m.text && <CopyButton label="返事をコピー" text={() => toTurn(m).text} />}
            </div>
          )
        })}
        <div ref={logEnd} />
      </div>

      <div className={s.input}>
        {hasError && withSql && !busy && (
          <div className={s.row}>
            <Button size="small" onClick={() => void send('いまの SQL のエラーを直してください。')}>
              このエラーを直して
            </Button>
          </div>
        )}
        <Textarea
          resize="vertical"
          // 長い頼みごと(表の名前・条件・考えてほしいこと)を見渡せるように、高めにする。足りなければ右下で伸ばせる
          rows={8}
          value={input}
          placeholder="AI に頼む(Enter で送る・Shift + Enter で改行)"
          onChange={(_, d) => setInput(d.value)}
          onKeyDown={(e) => {
            // 日本語の変換を確定する Enter では送らない
            if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing || e.keyCode === 229) return
            e.preventDefault()
            void send(input)
          }}
        />
        <div className={s.row}>
          <span className={mergeClasses(s.label, s.grow)}>{busy ? `考えています(${elapsed} 秒)。思考と調べたことは、上に出ます` : `${shownModel || 'モデル'} に送ります`}</span>
          {busy ? (
            <Button size="small" icon={<StopRegular />} onClick={() => abort.current?.abort()}>
              止める
            </Button>
          ) : (
            <Button size="small" appearance="primary" icon={<ArrowUpRegular />} disabled={!input.trim()} onClick={() => void send(input)}>
              送る
            </Button>
          )}
        </div>
      </div>

      <Dialog open={preview !== null} onOpenChange={(_, d) => !d.open && setPreview(null)}>
        <DialogSurface style={{ maxWidth: '900px', width: '90vw' }}>
          <DialogBody>
            <DialogTitle>AI に渡す前提</DialogTitle>
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
