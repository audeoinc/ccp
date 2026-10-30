import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Badge,
  Button,
  Checkbox,
  Input,
  MessageBar,
  MessageBarBody,
  SearchBox,
  Spinner,
  Tab,
  TabList,
  Textarea,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components'
import {
  ArrowDownloadRegular,
  ArrowUpRegular,
  BrainCircuitRegular,
  CheckmarkCircleRegular,
  ChevronDownRegular,
  ChevronRightRegular,
  CloudArrowDownRegular,
  DocumentRegular,
  DocumentTextRegular,
  FolderRegular,
  SparkleRegular,
  StopRegular,
} from '@fluentui/react-icons'
import { PolicyApi, isFailure, type ChatTurn, type GcsFile, type PolicyDraft, type PolicyPreview, type Settings } from './api'
import { ChatMarkdown } from './ChatMarkdown'
import { CopyButton } from './CopyButton'
import { bytesLabel } from './api'

const useStyles = makeStyles({
  root: { display: 'grid', gridTemplateColumns: '320px minmax(0, 1fr)', gap: '12px', alignItems: 'start' },
  card: {
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusLarge,
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    minWidth: 0,
  },
  side: { position: 'sticky', top: '12px' },
  main: { display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 0 },
  heading: { fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold, display: 'flex', alignItems: 'center', gap: '6px' },
  label: { fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground3 },
  muted: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  row: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' },
  grow: { flexGrow: 1, minWidth: 0 },
  crumbs: { display: 'flex', flexWrap: 'wrap', gap: '2px', alignItems: 'center', fontSize: tokens.fontSizeBase200 },
  crumb: { border: 'none', background: 'none', padding: '0 2px', cursor: 'pointer', color: tokens.colorBrandForeground1, fontSize: tokens.fontSizeBase200 },
  list: { display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 360px)', overflowY: 'auto' },
  item: { display: 'flex', alignItems: 'center', gap: '6px', padding: '2px 4px', borderRadius: tokens.borderRadiusMedium, fontSize: tokens.fontSizeBase200, ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover } },
  folder: { border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', padding: '4px', color: tokens.colorNeutralForeground1, fontSize: tokens.fontSizeBase200, width: '100%' },
  fname: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexGrow: 1 },
  fmeta: { fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3, whiteSpace: 'nowrap' },
  text: { margin: 0, fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase200, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', height: '240px', minHeight: '80px', resize: 'vertical', overflowY: 'auto', padding: '8px', backgroundColor: tokens.colorNeutralBackground3, borderRadius: tokens.borderRadiusMedium },
  toggle: { display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', border: 'none', background: 'none', padding: 0, color: tokens.colorNeutralForeground2, fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold },
  thoughts: { padding: '6px 8px', borderLeft: `3px solid ${tokens.colorNeutralStroke1}`, backgroundColor: tokens.colorNeutralBackground2, maxHeight: '280px', overflowY: 'auto' },
  steps: { margin: 0, paddingLeft: '18px', fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  questions: { margin: 0, paddingLeft: '18px', fontSize: tokens.fontSizeBase200, color: tokens.colorPaletteMarigoldForeground2 },
  draft: { border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px' },
  editor: { fontFamily: tokens.fontFamilyMonospace },
  ng: { color: tokens.colorPaletteRedForeground1, fontSize: tokens.fontSizeBase200, margin: 0, paddingLeft: '18px' },
  rules: { margin: 0, paddingLeft: '18px', fontSize: tokens.fontSizeBase200, maxHeight: '200px', overflowY: 'auto' },
})

/** 会話の 1 回分(書き直しの返事)。続けて頼むときに、前の返事として AI に戻す */
interface Answer {
  model?: string
  thoughts: string
  steps: string[]
  reply: string
  questions: string[]
  error?: string
  seconds?: number
}

interface DraftState extends PolicyDraft {
  preview?: PolicyPreview
  previewError?: string
  imported?: string
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

const isDoc = (n: string) => /\.(xlsx|xlsm|pdf|csv|tsv|md|txt|json)$/i.test(n)

/**
 * ポリシーの文書(DEVTOOLS.md の 3.2): GCS の文書を選び → 文字にして確かめ → AI で CCP の決まりの形に書き直し
 * → CCP の取り込みと同じ読み分けで確かめ → 取り込む。GCS は読むだけ
 */
export function PolicyTab({ settings, onSettings, model }: { settings: Settings; onSettings: (s: Settings) => void; model: string | null }) {
  const s = useStyles()
  const [bucket, setBucket] = useState(settings.gcs?.bucket ?? '')
  const [prefix, setPrefix] = useState(settings.gcs?.prefix ?? '')
  const [listing, setListing] = useState<{ folders: string[]; files: GcsFile[] } | null>(null)
  const [listError, setListError] = useState('')
  const [listBusy, setListBusy] = useState(false)
  const [filter, setFilter] = useState('')
  const [picked, setPicked] = useState<string[]>([])

  const [docs, setDocs] = useState<{ name: string; kind: string; text?: string; chars?: number; size?: number; truncated?: boolean; error?: string }[] | null>(null)
  const [docTab, setDocTab] = useState('')
  const [docsBusy, setDocsBusy] = useState(false)

  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [answers, setAnswers] = useState<Answer[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [thoughtsOpen, setThoughtsOpen] = useState(true)
  const abort = useRef<AbortController | null>(null)

  const [drafts, setDrafts] = useState<DraftState[]>([])

  const open = async (p = prefix, b = bucket) => {
    const bk = b.trim().replace(/^gs:\/\//, '').replace(/\/+$/, '')
    if (!bk) return
    setListBusy(true)
    setListError('')
    const r = await PolicyApi.list(bk, p)
    setListBusy(false)
    if (isFailure(r)) {
      setListing(null)
      return setListError(r.error)
    }
    setBucket(r.bucket)
    setPrefix(p)
    setListing({ folders: r.folders, files: r.files })
    if (r.bucket !== settings.gcs?.bucket || p !== settings.gcs?.prefix) onSettings({ ...settings, gcs: { bucket: r.bucket, prefix: p } })
  }

  // 前に見たフォルダは、開いたときに読む
  useEffect(() => {
    if (!bucket) return
    const id = window.setTimeout(() => void open())
    return () => window.clearTimeout(id)
    // 最初の 1 回だけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 考えている間は、経過の秒数を出す
  useEffect(() => {
    if (!busy) return
    const t0 = Date.now()
    const id = window.setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 1000)
    return () => {
      window.clearInterval(id)
      setElapsed(0)
    }
  }, [busy])

  const shownFiles = useMemo(() => {
    const f = filter.trim().toLowerCase()
    return (listing?.files ?? []).filter((x) => !f || x.name.toLowerCase().includes(f))
  }, [listing, filter])

  const togglePick = (name: string) => setPicked((p) => (p.includes(name) ? p.filter((x) => x !== name) : [...p, name]))

  const extract = async () => {
    if (!picked.length) return
    setDocsBusy(true)
    const r = await PolicyApi.extract(bucket, picked)
    setDocsBusy(false)
    if (isFailure(r)) return setDocs([{ name: '', kind: '', error: r.error }])
    setDocs(r.docs)
    setDocTab(r.docs[0]?.name ?? '')
  }

  /** AI に書き直してもらう(最初は文書だけ。続けて頼むときは、これまでの会話も) */
  const send = async (text: string) => {
    const t = text.trim() || (turns.length ? '' : 'これらの文書を、取り込める形に書き直してください。')
    if (!t || busy || !picked.length) return
    const next = [...turns, { role: 'user' as const, text: t }]
    setTurns(next)
    setInput('')
    setBusy(true)
    setThoughtsOpen(true)
    const t0 = Date.now()
    let a: Answer = { thoughts: '', steps: [], reply: '', questions: [] }
    const at = answers.length
    const apply = (patch: Partial<Answer>) => {
      a = { ...a, ...patch }
      setAnswers((as) => [...as.slice(0, at), a])
    }
    apply({})
    const ac = new AbortController()
    abort.current = ac
    let files: PolicyDraft[] = []
    await PolicyApi.convert(
      { bucket, names: picked, messages: next, model },
      (ev) => {
        if (ev.type === 'start') apply({ model: ev.model })
        else if (ev.type === 'thought') apply({ thoughts: a.thoughts + ev.text })
        else if (ev.type === 'step') apply({ steps: [...a.steps, ev.text] })
        else if (ev.type === 'final') {
          files = ev.files
          apply({ reply: ev.reply, questions: ev.questions })
        } else if (ev.type === 'error') apply({ error: ev.error })
      },
      ac.signal,
    )
    if (ac.signal.aborted) apply({ error: '止めました' })
    apply({ seconds: Math.round((Date.now() - t0) / 1000) })
    abort.current = null
    setBusy(false)
    setThoughtsOpen(false)
    if (files.length) {
      setDrafts(files.map((f) => ({ ...f })))
      // 続けて頼むときに、前の返事(書き直したファイル)を AI に戻す
      setTurns([...next, { role: 'model', text: JSON.stringify({ reply: a.reply, files }) }])
    } else if (!a.error) setTurns([...next, { role: 'model', text: a.reply }])
    else setTurns(turns)
  }

  const updateDraft = (i: number, patch: Partial<DraftState>) => setDrafts((ds) => ds.map((d, j) => (j === i ? { ...d, ...patch } : d)))

  const check = async (i: number) => {
    const d = drafts[i]
    const r = await PolicyApi.preview(d)
    if (isFailure(r)) updateDraft(i, { preview: undefined, previewError: r.error })
    else updateDraft(i, { preview: r, previewError: undefined })
  }

  const importDraft = async (i: number) => {
    const d = drafts[i]
    const what = d.kind === 'rules' ? `ルール系の決まり(ファイル名「${d.filename}」の決まりを、まるごと置き換えます)` : '販売系の方針(ファイルに入っている週 × 市場の行を置き換えます)'
    if (!window.confirm(`CCP に取り込みます: ${what}。よいですか?`)) return
    const r = await PolicyApi.import(d)
    if (isFailure(r)) updateDraft(i, { previewError: r.error })
    else updateDraft(i, { preview: r, imported: `取り込みました(${r.count} 件)` })
  }

  const askFix = () => {
    const lines = drafts
      .filter((d) => d.preview?.problems.length || d.previewError)
      .map((d) => `### ${d.filename}\n${d.previewError ? `- ${d.previewError}` : d.preview!.problems.map((p) => `- ${p.line} 行め${p.where ? `(${p.where})` : ''}: ${p.message}`).join('\n')}`)
    if (lines.length) void send(`CCP の取り込みの確認で、次の決まり・行が読めませんでした。直した全文をください。\n\n${lines.join('\n\n')}`)
  }

  const crumbs = prefix.split('/').filter(Boolean)
  const last = answers[answers.length - 1]
  const hasProblems = drafts.some((d) => d.preview?.problems.length || d.previewError)

  return (
    <div className={s.root}>
      <div className={mergeClasses(s.card, s.side)}>
        <div className={s.heading}>
          <FolderRegular /> GCS の文書
        </div>
        <div className={s.row}>
          <Input
            className={s.grow}
            size="small"
            value={bucket}
            placeholder="バケット名(gs:// は不要)"
            onChange={(_, d) => setBucket(d.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void open('')
            }}
          />
          <Button size="small" appearance="primary" disabled={!bucket.trim() || listBusy} onClick={() => void open('')}>
            開く
          </Button>
        </div>
        {listing && (
          <div className={s.crumbs}>
            <button type="button" className={s.crumb} onClick={() => void open('')}>
              {bucket}
            </button>
            {crumbs.map((c, i) => (
              <span key={i}>
                /
                <button type="button" className={s.crumb} onClick={() => void open(`${crumbs.slice(0, i + 1).join('/')}/`)}>
                  {c}
                </button>
              </span>
            ))}
          </div>
        )}
        {listError && (
          <MessageBar intent="error" layout="multiline">
            <MessageBarBody>{listError}</MessageBarBody>
          </MessageBar>
        )}
        {listBusy && <Spinner size="tiny" label="一覧を読んでいます" />}
        {listing && (
          <>
            <SearchBox size="small" placeholder={`ファイルを絞り込む(${listing.files.length} 件)`} value={filter} onChange={(_, d) => setFilter(d.value)} />
            <div className={s.list}>
              {listing.folders.map((f) => (
                <button key={f} type="button" className={s.folder} onClick={() => void open(f)}>
                  <FolderRegular />
                  <span className={s.fname}>{f.slice(prefix.length)}</span>
                </button>
              ))}
              {shownFiles.map((f) => (
                <div key={f.name} className={s.item} title={f.name}>
                  <Checkbox size="medium" checked={picked.includes(f.name)} disabled={!isDoc(f.name)} onChange={() => togglePick(f.name)} />
                  {/\.pdf$/i.test(f.name) ? <DocumentRegular /> : <DocumentTextRegular />}
                  <span className={s.fname}>{f.name.slice(prefix.length)}</span>
                  <span className={s.fmeta}>{bytesLabel(f.size)}</span>
                </div>
              ))}
              {!listing.folders.length && !shownFiles.length && <span className={s.muted}>ファイルがありません</span>}
            </div>
          </>
        )}
        <span className={s.muted}>読めるのは Excel・PDF・CSV・テキスト(Word は PDF に書き出してください)。GCS には書き込みません。</span>
      </div>

      <div className={s.main}>
        <div className={s.card}>
          <div className={s.row}>
            <span className={mergeClasses(s.heading, s.grow)}>
              <DocumentTextRegular /> 選んだ文書({picked.length})
            </span>
            <Button size="small" icon={<CloudArrowDownRegular />} disabled={!picked.length || docsBusy} onClick={() => void extract()} title="中身を文字にして見る(AI に渡すものを確認する)">
              中身を見る
            </Button>
            <Button size="small" appearance="primary" icon={<SparkleRegular />} disabled={!picked.length || busy} onClick={() => void send(input)} title="POLICY_FORMAT の形(ルールは Markdown、販売系は CSV)に書き直す">
              AI で書き直す
            </Button>
          </div>
          {picked.length === 0 && <span className={s.muted}>左で文書を選んでください(複数選べます。1 つの決まりの集まりに当たる文書をまとめて選ぶ)。</span>}
          {picked.length > 0 && <span className={s.muted}>{picked.map((p) => p.split('/').pop()).join('・')}</span>}
          {docsBusy && <Spinner size="tiny" label="文字にしています" />}
          {docs && (
            <>
              <TabList size="small" selectedValue={docTab} onTabSelect={(_, d) => setDocTab(String(d.value))}>
                {docs.map((d) => (
                  <Tab key={d.name} value={d.name}>
                    {d.name.split('/').pop() || 'エラー'}
                  </Tab>
                ))}
              </TabList>
              {docs
                .filter((d) => d.name === docTab)
                .map((d) =>
                  d.error ? (
                    <MessageBar key={d.name} intent="error" layout="multiline">
                      <MessageBarBody>{d.error}</MessageBarBody>
                    </MessageBar>
                  ) : d.kind === 'pdf' ? (
                    <span key={d.name} className={s.muted}>
                      PDF は文字にせず、AI にそのまま渡します({bytesLabel(d.size)})。
                    </span>
                  ) : (
                    <div key={d.name} className={s.row} style={{ alignItems: 'flex-start' }}>
                      <pre className={mergeClasses(s.text, s.grow)}>{d.text}</pre>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span className={s.fmeta}>
                          {d.chars?.toLocaleString()} 文字{d.truncated ? '(長いので途中まで)' : ''}
                        </span>
                        <CopyButton text={() => d.text ?? ''} />
                      </div>
                    </div>
                  ),
                )}
            </>
          )}
        </div>

        {(answers.length > 0 || busy) && (
          <div className={s.card}>
            <div className={s.row}>
              <span className={mergeClasses(s.heading, s.grow)}>
                <SparkleRegular /> AI の書き直し
              </span>
              <span className={s.muted}>{last?.model ?? ''}</span>
              {busy ? (
                <>
                  <Spinner size="extra-tiny" label={`考えています ${elapsed} 秒`} />
                  <Button size="small" icon={<StopRegular />} onClick={() => abort.current?.abort()}>
                    止める
                  </Button>
                </>
              ) : last?.seconds != null ? (
                <span className={s.muted}>{last.seconds} 秒</span>
              ) : null}
            </div>
            {last && (
              <>
                {!!last.thoughts && (
                  <>
                    <button type="button" className={s.toggle} onClick={() => setThoughtsOpen((v) => !v)}>
                      {thoughtsOpen ? <ChevronDownRegular /> : <ChevronRightRegular />}
                      <BrainCircuitRegular /> 思考({last.thoughts.length.toLocaleString()} 文字)
                    </button>
                    {thoughtsOpen && (
                      <div className={s.thoughts}>
                        <ChatMarkdown text={last.thoughts} />
                      </div>
                    )}
                  </>
                )}
                {last.steps.length > 0 && (
                  <ul className={s.steps}>
                    {last.steps.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                )}
                {last.error && (
                  <MessageBar intent="error" layout="multiline">
                    <MessageBarBody>{last.error}</MessageBarBody>
                  </MessageBar>
                )}
                {last.reply && <ChatMarkdown text={last.reply} />}
                {last.questions.length > 0 && (
                  <ul className={s.questions}>
                    {last.questions.map((q, i) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ul>
                )}
              </>
            )}
            <Textarea
              resize="vertical"
              rows={4}
              value={input}
              placeholder="続けて頼む(例: 市場は JP だけ。2 枚めのシートは使わない)。Enter で送る・Shift + Enter で改行"
              onChange={(_, d) => setInput(d.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing || e.keyCode === 229) return
                e.preventDefault()
                void send(input)
              }}
            />
            <div className={s.row}>
              <span className={mergeClasses(s.muted, s.grow)}>文書は毎回 AI に渡し直します(前の書き直しも一緒に)</span>
              <Button size="small" appearance="primary" icon={<ArrowUpRegular />} disabled={busy || !input.trim()} onClick={() => void send(input)}>
                送る
              </Button>
            </div>
          </div>
        )}

        {drafts.length > 0 && (
          <div className={s.card}>
            <div className={s.row}>
              <span className={mergeClasses(s.heading, s.grow)}>取り込むファイル({drafts.length})</span>
              <Button size="small" icon={<CheckmarkCircleRegular />} onClick={() => drafts.forEach((_, i) => void check(i))}>
                すべて確認する
              </Button>
              {hasProblems && (
                <Button size="small" disabled={busy} onClick={askFix}>
                  読めなかった分を AI に直してもらう
                </Button>
              )}
            </div>
            <span className={s.muted}>直接直してもかまいません。「確認する」は CCP の取り込みと同じ読み分けで、何も変えません。</span>
            {drafts.map((d, i) => (
              <div key={i} className={s.draft}>
                <div className={s.row}>
                  <Badge appearance="tint" color={d.kind === 'rules' ? 'brand' : 'informative'}>
                    {d.kind === 'rules' ? 'ルール系(Markdown)' : '販売系(CSV)'}
                  </Badge>
                  <Input size="small" className={s.grow} value={d.filename} onChange={(_, v) => updateDraft(i, { filename: v.value, preview: undefined, imported: undefined })} />
                  <Button size="small" icon={<CheckmarkCircleRegular />} onClick={() => void check(i)}>
                    確認する
                  </Button>
                  <Button size="small" appearance="primary" disabled={!d.preview || d.preview.count === 0} onClick={() => void importDraft(i)} title={!d.preview ? '先に確認してください' : ''}>
                    取り込む
                  </Button>
                  <CopyButton text={() => d.content} />
                  <Button size="small" appearance="subtle" icon={<ArrowDownloadRegular />} onClick={() => download(d.filename, d.content)} title="ファイルで保存" />
                </div>
                <Textarea
                  className={s.editor}
                  resize="vertical"
                  rows={12}
                  value={d.content}
                  onChange={(_, v) => updateDraft(i, { content: v.value, preview: undefined, imported: undefined })}
                />
                {d.previewError && (
                  <MessageBar intent="error" layout="multiline">
                    <MessageBarBody>{d.previewError}</MessageBarBody>
                  </MessageBar>
                )}
                {d.preview && (
                  <>
                    <div className={s.row}>
                      <Badge appearance="filled" color={d.preview.problems.length ? 'warning' : 'success'}>
                        読めた {d.preview.count} 件
                      </Badge>
                      {d.preview.problems.length > 0 && (
                        <Badge appearance="filled" color="danger">
                          読めなかった {d.preview.problems.length} 件
                        </Badge>
                      )}
                      {d.imported && <Badge appearance="tint" color="success">{d.imported}</Badge>}
                      {!!d.preview.edited_on_screen?.length && (
                        <span className={s.muted}>画面で直した決まり({d.preview.edited_on_screen.join(', ')})は、取り込むとファイルの内容に戻ります</span>
                      )}
                    </div>
                    {d.preview.problems.length > 0 && (
                      <ul className={s.ng}>
                        {d.preview.problems.map((p, j) => (
                          <li key={j}>
                            {p.line} 行め{p.where ? `(${p.where})` : ''}: {p.message}
                          </li>
                        ))}
                      </ul>
                    )}
                    {d.preview.rules && (
                      <ul className={s.rules}>
                        {d.preview.rules.map((r) => (
                          <li key={r.rule_id}>
                            {r.rule_id} {r.title}({r.strength}
                            {r.market ? `・${r.market}` : ''}
                            {r.channel ? `・${r.channel}` : ''})
                          </li>
                        ))}
                      </ul>
                    )}
                    {d.preview.weeks && (
                      <ul className={s.rules}>
                        {d.preview.weeks.map((w) => (
                          <li key={`${w.week_start}-${w.market}`}>
                            {w.week_start} {w.market}: {w.rows} 行
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
