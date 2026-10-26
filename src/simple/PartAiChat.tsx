import { useState, type ReactNode } from 'react'
import { Button, Spinner, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { CheckmarkRegular, SendRegular } from '@fluentui/react-icons'
import { AiIcon } from '../AiMark'
import { AutoTextarea } from '../AutoTextarea'
import { useT } from '../i18n'
import { useTrial } from '../trial'
import { TrialBar } from '../TrialBar'
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
  // 試している案(プレビューにだけ当てはめている)
  ideaTrying: { outline: `2px solid ${tokens.colorBrandStroke1}`, outlineOffset: '-1px', backgroundColor: tokens.colorBrandBackground2 },
  ideaUsed: { borderTopColor: tokens.colorPaletteGreenBorder2, borderRightColor: tokens.colorPaletteGreenBorder2, borderBottomColor: tokens.colorPaletteGreenBorder2, borderLeftColor: tokens.colorPaletteGreenBorder2 },
  ideaWhy: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  input: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', columnGap: '6px', alignItems: 'end' },
  // たたんでいるときの 1 行(AI の印 + 入力欄 + 送る)
  inputFolded: { display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', columnGap: '6px', alignItems: 'center' },
  rootFolded: { paddingTop: '8px' },
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
  /** 試す・確定の帯の「いま」の文(いまの値の名前) */
  nowText?: string
  /** 帯の「試している」の文(案の名前。渡さなければ、案の値) */
  ideaText?: (idea: PartIdea) => string
  /**
   * 案を押したとき、この欄の中で試さずに、呼ぶ側に渡す(商品を選び直す枠のように、ほかの選び方と 1 つの帯で試すとき)。
   * 渡さなければ、この欄の上に帯を出して試す
   */
  onTry?: (idea: PartIdea) => void
  /** この部品のやり取り(部品を選び直しても残るよう、画面の側が持つ) */
  turns: PartTurn[]
  setTurns: (f: (prev: PartTurn[]) => PartTurn[]) => void
  placeholder?: string
}

/**
 * 選んだ部品を AI に頼む欄(SU1 ⑬・段階 b)。指示の例を札で出し、自由にも書ける。文言・メイン画像・商品で共通。
 * 案は 3 つ並べ、マウスを乗せるとプレビューに仮で写し、押すと採用する(採用は、ほかの編集と同じく、反映と元に戻すの対象)。AI の案そのものは保存しない
 */
export function PartAiChat({ kind, label, ask, renderIdea, isCurrent, onPreview, onAdopt, nowText, ideaText, onTry, turns, setTurns, placeholder }: Props) {
  const t = useT()
  const s = useStyles()
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 広げているか(ふだんは 1 行。部品のペインを短くして、主役の入力欄を埋もれさせないため。レビューの 11)
  const [opened, setOpened] = useState(false)
  const open = opened || turns.length > 0 || busy
  // 試す → 確定(2026-10-26 利用者と決めた): 押すとプレビューにだけ当てはめ、帯の「確定」で採用する。部品を離れると、やめたことになる
  const trial = useTrial()

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

  const keyOf = (idea: PartIdea) => `${idea.value}\n${idea.why ?? ''}`
  const pick = (idea: PartIdea) => {
    if (onTry) return onTry(idea)
    trial.tryIt({
      key: keyOf(idea),
      from: nowText ?? '',
      to: ideaText ? ideaText(idea) : idea.value,
      preview: () => onPreview(idea),
      unpreview: () => onPreview(null),
      apply: () => onAdopt(idea),
    })
  }

  return (
    <div className={mergeClasses(s.root, !open && s.rootFolded)}>
      {open && (
      <span className={s.head}>
        <AiIcon size={14} />
        {t(`AI に頼む(${label})`, `Ask AI (${label})`)}
      </span>
      )}
      {open && (
      <div className={s.samples}>
        {requestSamples(kind).map((x) => (
          <Button key={x} size="small" shape="circular" className={s.sample} disabled={busy} onClick={() => void send(x)}>
            {x}
          </Button>
        ))}
      </div>
      )}
      {!onTry && <TrialBar state={trial} />}
      {turns.length > 0 && (
        <div className={s.log}>
          {turns.map((x, i) =>
            x.role === 'user' ? (
              <span key={i} className={s.me}>{x.text}</span>
            ) : (
              <div key={i} className={s.ai}>
                {x.text && <span>{x.text}</span>}
                {x.ideas?.map((idea, j) => {
                  const trying = trial.trial?.key === keyOf(idea)
                  const used = isCurrent(idea) && !trial.trial
                  return (
                    <div
                      key={j}
                      role="button"
                      tabIndex={0}
                      aria-pressed={trying}
                      className={mergeClasses(s.idea, used && s.ideaUsed, trying && s.ideaTrying)}
                      onClick={() => pick(idea)}
                      onKeyDown={(ev) => {
                        if (ev.key === 'Enter' || ev.key === ' ') {
                          ev.preventDefault()
                          ev.stopPropagation()
                          pick(idea)
                        }
                      }}
                      title={t('押すと、プレビューで試します(上の「確定」で採用)', 'Click to try it in the preview (apply with "Apply" above)')}
                    >
                      <span style={{ display: 'grid', rowGap: 2, minWidth: 0 }}>
                        {renderIdea(idea)}
                        {idea.why && <span className={s.ideaWhy}>{idea.why}</span>}
                      </span>
                      {used ? <CheckmarkRegular color={tokens.colorPaletteGreenForeground1} /> : <span className={s.ideaWhy}>{trying ? t('試している', 'Trying') : t('試す', 'Try')}</span>}
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
      <div className={open ? s.input : s.inputFolded}>
        {!open && <AiIcon size={14} />}
        <AutoTextarea heightKey="PartAiChat.draft"
          data-part-ai-input=""
          size="small"
          rows={1}
          value={draft}
          disabled={busy}
          placeholder={open ? (placeholder ?? t('例: 20 文字以内で、数字を入れて', 'e.g. Under 40 characters, include a number')) : t(`AI に頼む(${label})`, `Ask AI (${label})`)}
          aria-label={t(`AI に頼む(${label})`, `Ask AI (${label})`)}
          onFocus={() => setOpened(true)}
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
