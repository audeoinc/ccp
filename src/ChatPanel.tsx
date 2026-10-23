import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button, Spinner, Text, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { ChevronDownRegular, ChevronUpRegular, DeleteRegular, SendRegular } from '@fluentui/react-icons'
import { AiIcon } from './AiMark'
import { AutoTextarea } from './AutoTextarea'
import { Linkify } from './LinkText'
import { useT } from './i18n'
import { Splitter } from './Splitter'
import { viewHeight } from './uiScale'

export interface ChatMsg {
  role: 'user' | 'assistant'
  text: string
  /** 発言の下に出す操作(制作のページの「直す」のボタンなど) */
  extra?: ReactNode
}

interface Props {
  /** チャットの対象(開いているタブ)の名前。null のときは、対象がなく、送れない */
  title: string | null
  messages: ChatMsg[]
  busy: boolean
  /** 入力欄の近くに出す、よく使う頼み方(押すと、入力欄に入る) */
  suggestions: string[]
  /** 対象がないときの説明 */
  idleHint?: string
  /** 会話が空のときの説明(既定は、配信カードのタブ向けの文) */
  intro?: string
  /** よく使う頼み方を押したとき、入力欄に足す(いくつか選んで、まとめて頼めるように)。既定は置き換え */
  appendSuggestions?: boolean
  onSend: (text: string) => void
  onClear: () => void
}

const HEIGHT_KEY = 'chat.paneHeight'
const MIN_H = 140
const DEFAULT_H = 260

const clampHeight = (h: number) => Math.min(Math.round(viewHeight() * 0.65), Math.max(MIN_H, h))

function loadHeight(): number {
  try {
    const v = Number(localStorage.getItem(HEIGHT_KEY))
    if (Number.isFinite(v) && v >= MIN_H) return clampHeight(v)
  } catch {
    // 保存を読めないときは、既定の高さにする
  }
  return DEFAULT_H
}

const useStyles = makeStyles({
  // 中ペインの下半分を占める、AI チャットのペイン。上の内容とは、他のペインと同じ細い境界線で区切る
  dock: {
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    minHeight: 0,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  // 見出しの帯: ペインの見出しと同じ、平らな作り
  band: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    columnGap: '6px',
    minWidth: 0,
    padding: '4px 8px 4px 16px',
    backgroundColor: tokens.colorNeutralBackground2,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  title: { flexGrow: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: tokens.colorBrandForeground1, fontWeight: tokens.fontWeightSemibold },
  log: { flexGrow: 1, minHeight: 0, overflowY: 'auto', display: 'grid', alignContent: 'start' },
  // やり取りは、平らな行にする。発言者の印を左の列に置き、本文と同じ高さに並べて、縦幅を節約する。
  // あなた = 灰色の線と印、AI = ブランド色の線と印・薄い青みの背景
  msg: {
    display: 'grid',
    gridTemplateColumns: '40px minmax(0, 1fr)',
    columnGap: '8px',
    alignItems: 'start',
    padding: '4px 12px 4px 10px',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    borderLeft: `3px solid ${tokens.colorNeutralStroke1}`,
    fontSize: tokens.fontSizeBase200,
    lineHeight: '18px',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
  },
  msgAi: {
    backgroundColor: `color-mix(in srgb, ${tokens.colorBrandBackground} 5%, ${tokens.colorNeutralBackground1})`,
    borderLeft: `3px solid ${tokens.colorBrandStroke2}`,
  },
  who: {
    justifySelf: 'start',
    whiteSpace: 'nowrap',
    padding: '0 6px',
    borderRadius: tokens.borderRadiusSmall,
    fontSize: tokens.fontSizeBase100,
    lineHeight: '18px',
    fontWeight: tokens.fontWeightSemibold,
    backgroundColor: tokens.colorNeutralBackground3,
    color: tokens.colorNeutralForeground2,
  },
  whoAi: { backgroundColor: tokens.colorBrandBackground2, color: tokens.colorBrandForeground1 },
  thinking: { display: 'flex', alignItems: 'center', columnGap: '8px', padding: '6px 16px', color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  empty: { display: 'grid', rowGap: '8px', padding: '12px 16px' },
  hint: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  chips: { display: 'flex', flexWrap: 'wrap', gap: '6px' },
  chip: {
    cursor: 'pointer',
    padding: '2px 10px',
    borderRadius: tokens.borderRadiusCircular,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground2,
    fontFamily: 'inherit',
    fontSize: tokens.fontSizeBase200,
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  inputArea: { flexShrink: 0, display: 'grid', rowGap: '6px', padding: '8px 16px 12px', borderTop: `1px solid ${tokens.colorNeutralStroke2}` },
  inputRow: { display: 'flex', alignItems: 'flex-end', columnGap: '6px' },
  input: { flexGrow: 1, minWidth: 0 },
})

/** 中ペインの下に置く、AI へのチャットのペイン。開いているタブの案づくりに、指示を加える */
export function ChatPanel({ title, messages, busy, suggestions, idleHint, intro, appendSuggestions, onSend, onClear }: Props) {
  const t = useT()
  const s = useStyles()
  const [open, setOpen] = useState(true)
  const [height, setHeight] = useState<number>(loadHeight)
  const [text, setText] = useState('')
  const logRef = useRef<HTMLDivElement>(null)

  // 新しい発言が増えたら、いちばん下までスクロールする
  useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length, busy, open])

  // 境目は上にある。上へ動かす(dy が負)と、チャットが高くなる
  const dragHeight = (dy: number) => setHeight((h) => clampHeight(h - dy))
  const saveHeight = () =>
    setHeight((h) => {
      try {
        localStorage.setItem(HEIGHT_KEY, String(h))
      } catch {
        // 保存できなくても動作には影響しない
      }
      return h
    })

  const disabled = title === null
  const send = () => {
    const v = text.trim()
    if (!v || busy || disabled) return
    onSend(v)
    setText('')
  }
  const chips = !disabled && !busy && suggestions.length > 0 && (
    <div className={s.chips}>
      {suggestions.map((q) => (
        <button key={q} type="button" className={s.chip} onClick={() => setText((v) => (appendSuggestions && v.trim() ? (v.includes(q) ? v : `${v.trim()}${/[。.!?！？]$/.test(v.trim()) ? '' : '。'}${q}`) : q))}>
          {q}
        </button>
      ))}
    </div>
  )

  return (
    <div className={s.dock} style={open ? { height } : undefined}>
      <Splitter direction="row" onDrag={dragHeight} onDone={saveHeight} onStart={() => !open && setOpen(true)} label={t('上下にドラッグして、チャットの高さを変える', 'Drag up or down to resize the chat')} />
      <div className={s.band}>
        <AiIcon />
        <Text size={200} className={s.title}>
          {disabled ? t('AIチャット', 'AI chat') : t(`AIチャット — ${title}`, `AI chat — ${title}`)}
        </Text>
        {messages.length > 0 && !busy && (
          <Button size="small" appearance="subtle" icon={<DeleteRegular />} onClick={onClear} aria-label={t('この会話を消す', 'Clear this conversation')} />
        )}
        <Button
          size="small"
          appearance="subtle"
          icon={open ? <ChevronDownRegular /> : <ChevronUpRegular />}
          onClick={() => setOpen(!open)}
          aria-label={open ? t('閉じる', 'Collapse') : t('開く', 'Expand')}
        />
      </div>

      {open && (
        <div className={s.log} ref={logRef}>
          {messages.length === 0 && !busy && (
            <div className={s.empty}>
              <span className={s.hint}>
                {disabled
                  ? (idleHint ?? '')
                  : (intro ?? t('このタブの案づくりに、指示を加えられます。例えば、次のように頼めます。', 'Add your own instructions to this tab’s suggestions. For example:'))}
              </span>
              {chips}
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={mergeClasses(s.msg, m.role === 'assistant' && s.msgAi)}>
              <span className={mergeClasses(s.who, m.role === 'assistant' && s.whoAi)}>{m.role === 'user' ? 'You' : 'AI'}</span>
              <span>
                <Linkify text={m.text} />
                {m.extra}
              </span>
            </div>
          ))}
          {busy && (
            <div className={s.thinking}>
              <Spinner size="extra-tiny" />
              {t('考え中...', 'Thinking...')}
            </div>
          )}
        </div>
      )}

      <div className={s.inputArea}>
        {open && messages.length > 0 && chips}
        <div className={s.inputRow}>
          <AutoTextarea heightKey="ChatPanel.text"
            data-ai-chat-input=""
            className={s.input}
            size="small"
            rows={1}
            value={text}
            disabled={disabled || busy}
            placeholder={
              disabled ? t('このタブでは、AIチャットは使えません', 'AI chat is not available on this tab') : t('AIへの指示を入力(Enterで送信、Shift+Enterで改行)', 'Tell the AI what you want (Enter to send, Shift+Enter for a new line)')
            }
            onChange={(_, d) => setText(d.value)}
            textarea={{
              onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  send()
                }
              },
            }}
          />
          <Button
            type="button"
            appearance="primary"
            icon={<SendRegular />}
            disabled={disabled || busy || !text.trim()}
            onClick={send}
            aria-label={t('送信', 'Send')}
          />
        </div>
      </div>
    </div>
  )
}
