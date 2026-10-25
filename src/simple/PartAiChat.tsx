import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button, Spinner, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { CheckmarkRegular, SendRegular } from '@fluentui/react-icons'
import { AiIcon } from '../AiMark'
import { AutoTextarea } from '../AutoTextarea'
import { useT } from '../i18n'
import { requestSamples, type PartAnswer, type PartIdea, type PartTurn } from './partAi'

const useStyles = makeStyles({
  root: { display: 'grid', rowGap: '8px', paddingTop: '10px', borderTop: `1px solid ${tokens.colorNeutralStroke2}` },
  head: { display: 'flex', alignItems: 'center', columnGap: '6px', fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground2 },
  samples: { display: 'flex', flexWrap: 'wrap', gap: '6px' },
  sample: { minWidth: 'auto', height: '26px', padding: '0 10px', fontWeight: tokens.fontWeightRegular },
  log: { display: 'grid', rowGap: '8px' },
  me: { justifySelf: 'end', maxWidth: '85%', padding: '6px 10px', borderRadius: tokens.borderRadiusLarge, backgroundColor: tokens.colorBrandBackground2, fontSize: tokens.fontSizeBase200, whiteSpace: 'pre-wrap' },
  ai: { display: 'grid', rowGap: '6px', fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground2 },
  idea: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    columnGap: '8px',
    alignItems: 'center',
    padding: '8px 10px',
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    cursor: 'pointer',
    ':hover': { borderTopColor: tokens.colorBrandStroke1, borderRightColor: tokens.colorBrandStroke1, borderBottomColor: tokens.colorBrandStroke1, borderLeftColor: tokens.colorBrandStroke1, backgroundColor: tokens.colorBrandBackground2 },
  },
  ideaUsed: { borderTopColor: tokens.colorPaletteGreenBorder2, borderRightColor: tokens.colorPaletteGreenBorder2, borderBottomColor: tokens.colorPaletteGreenBorder2, borderLeftColor: tokens.colorPaletteGreenBorder2 },
  ideaWhy: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  input: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', columnGap: '6px', alignItems: 'end' },
  error: { fontSize: tokens.fontSizeBase200, color: tokens.colorPaletteRedForeground1 },
})

interface Props {
  /** 部品の種類(subject・headline・copy・hero・product・slot など。指示の例を選ぶ)と、名前 */
  kind: string
  label: string
  /** 頼む(history は、この部品のこれまでのやり取り) */
  ask: (request: string, history: PartTurn[]) => Promise<PartAnswer>
  /** 案の中身の見せ方(文言・画像の縮小・商品の行) */
  renderIdea: (idea: PartIdea) => ReactNode
  /** 案が、いまの中身と同じか(採用済みの印) */
  isCurrent: (idea: PartIdea) => boolean
  /** 案を仮にプレビューに写す(null で元に戻す) */
  onPreview: (idea: PartIdea | null) => void
  onAdopt: (idea: PartIdea) => void
  /** この部品のやり取り(部品を選び直しても残るよう、画面の側が持つ) */
  turns: PartTurn[]
  setTurns: (f: (prev: PartTurn[]) => PartTurn[]) => void
  placeholder?: string
}

/**
 * 選んだ部品を AI に頼む欄(SU1 ⑬・段階 b)。指示の例を札で出し、自由にも書ける。文言・メイン画像・商品で共通。
 * 案は 3 つ並べ、マウスを乗せるとプレビューに仮で写し、押すと採用する(採用は、ほかの編集と同じく、反映と元に戻すの対象)。AI の案そのものは保存しない
 */
export function PartAiChat({ kind, label, ask, renderIdea, isCurrent, onPreview, onAdopt, turns, setTurns, placeholder }: Props) {
  const t = useT()
  const s = useStyles()
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 仮に写している案(描画で「採用済み」の印を分けるため)
  const [hovering, setHovering] = useState<PartIdea | null>(null)
  // 仮に写したまま部品を離れたときも、元に戻す
  const previewRef = useRef(onPreview)
  useEffect(() => {
    previewRef.current = onPreview
  })
  const hoveringRef = useRef(false)
  useEffect(
    () => () => {
      if (hoveringRef.current) previewRef.current(null)
    },
    [],
  )

  const send = async (request: string) => {
    const req = request.trim()
    if (!req || busy) return
    setBusy(true)
    setError(null)
    setDraft('')
    const history = turns
    setTurns((prev) => [...prev, { role: 'user', text: req }])
    try {
      const res = await ask(req, history)
      setTurns((prev) => [...prev, { role: 'ai', text: res.reply, ideas: res.ideas }])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const preview = (idea: PartIdea | null) => {
    hoveringRef.current = idea !== null
    setHovering(idea)
    onPreview(idea)
  }
  const adopt = (idea: PartIdea) => {
    hoveringRef.current = false
    setHovering(null)
    onAdopt(idea)
  }

  return (
    <div className={s.root}>
      <span className={s.head}>
        <AiIcon size={14} />
        {t(`AI に頼む(${label})`, `Ask AI (${label})`)}
      </span>
      <div className={s.samples}>
        {requestSamples(kind).map((x) => (
          <Button key={x} size="small" shape="circular" className={s.sample} disabled={busy} onClick={() => void send(x)}>
            {x}
          </Button>
        ))}
      </div>
      {turns.length > 0 && (
        <div className={s.log}>
          {turns.map((x, i) =>
            x.role === 'user' ? (
              <span key={i} className={s.me}>{x.text}</span>
            ) : (
              <div key={i} className={s.ai}>
                {x.text && <span>{x.text}</span>}
                {x.ideas?.map((idea, j) => {
                  const used = isCurrent(idea) && hovering === null
                  return (
                    <div
                      key={j}
                      role="button"
                      tabIndex={0}
                      className={mergeClasses(s.idea, used && s.ideaUsed)}
                      onMouseEnter={() => preview(idea)}
                      onMouseLeave={() => preview(null)}
                      // キーボードで選んだときも写す(マウスだけだと、キーボードで使う人には見えないため)
                      onFocus={() => preview(idea)}
                      onBlur={() => preview(null)}
                      onClick={() => adopt(idea)}
                      onKeyDown={(ev) => {
                        if (ev.key === 'Enter') adopt(idea)
                      }}
                      title={t('マウスを乗せる・選ぶとプレビューに写します。押すと採用します', 'Hover or focus to preview; click to use')}
                    >
                      <span style={{ display: 'grid', rowGap: 2, minWidth: 0 }}>
                        {renderIdea(idea)}
                        {idea.why && <span className={s.ideaWhy}>{idea.why}</span>}
                      </span>
                      {used ? <CheckmarkRegular color={tokens.colorPaletteGreenForeground1} /> : <span className={s.ideaWhy}>{t('採用', 'Use')}</span>}
                    </div>
                  )
                })}
              </div>
            ),
          )}
        </div>
      )}
      {busy && <Spinner size="tiny" label={t('AI が案を考えています', 'AI is thinking')} labelPosition="after" />}
      {error && <span className={s.error}>{error}</span>}
      <div className={s.input}>
        <AutoTextarea heightKey="PartAiChat.draft"
          data-part-ai-input=""
          size="small"
          rows={1}
          value={draft}
          disabled={busy}
          placeholder={placeholder ?? t('例: 20 文字以内で、数字を入れて', 'e.g. Under 40 characters, include a number')}
          onChange={(_, d) => setDraft(d.value)}
          onKeyDown={(ev) => {
            // Enter で送る(Shift + Enter は改行。日本語の変換の確定では送らない)
            if (ev.key === 'Enter' && !ev.shiftKey && !ev.nativeEvent.isComposing) {
              ev.preventDefault()
              void send(draft)
            }
          }}
        />
        <Button size="small" appearance="primary" icon={<SendRegular />} disabled={busy || !draft.trim()} onClick={() => void send(draft)} aria-label={t('送る', 'Send')} />
      </div>
    </div>
  )
}
