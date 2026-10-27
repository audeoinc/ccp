import { useState } from 'react'
import { Button, Spinner, Tab, TabList, ToggleButton, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { CheckmarkRegular, SendRegular } from '@fluentui/react-icons'
import { AiIcon } from '../AiMark'
import { AutoTextarea } from '../AutoTextarea'
import { useT } from '../i18n'
import { useTrial } from '../trial'
import { TrialBar } from '../TrialBar'
import { textRequestSamples, type PartAnswer, type PartIdea, type PartTurn } from './partAi'

// 文の部品(見出し・コピー・件名・プリヘッダー・通知の文・セクションの見出しとコピー)の AI(2026-10-27 利用者)。
// 入力欄に直接書くのがいちばん多いので、ふだんは「AI」のボタンだけにして、押したときだけペインの中でタブを開く(引き出しにしない)。
// 「案」= 候補をいくつか、「指示して直す」= 頼んだとおりに 1 つ。どちらも、押すとプレビューにだけ仮に写し、帯の「確定」で入れ替える(試す → 確定)
const useStyles = makeStyles({
  root: { display: 'grid', rowGap: '8px' },
  toggle: { justifySelf: 'start' },
  panel: { display: 'grid', rowGap: '8px', padding: '8px 10px 10px', borderRadius: tokens.borderRadiusMedium, border: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: tokens.colorNeutralBackground2 },
  row: { display: 'flex', alignItems: 'center', columnGap: '8px', flexWrap: 'wrap' },
  samples: { display: 'flex', flexWrap: 'wrap', gap: '6px' },
  sample: { minWidth: 'auto', height: '26px', padding: '0 10px', fontWeight: tokens.fontWeightRegular },
  input: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', columnGap: '6px', alignItems: 'end' },
  list: { display: 'grid', rowGap: '6px' },
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
    textAlign: 'left',
    fontFamily: 'inherit',
    ':hover': { borderTopColor: tokens.colorBrandStroke1, borderRightColor: tokens.colorBrandStroke1, borderBottomColor: tokens.colorBrandStroke1, borderLeftColor: tokens.colorBrandStroke1, backgroundColor: tokens.colorBrandBackground2 },
  },
  // 試している案(プレビューにだけ当てはめている)
  ideaTrying: { outline: `2px solid ${tokens.colorBrandStroke1}`, outlineOffset: '-1px', backgroundColor: tokens.colorBrandBackground2 },
  ideaText: { fontSize: tokens.fontSizeBase300, color: tokens.colorNeutralForeground1, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
  note: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  error: { fontSize: tokens.fontSizeBase200, color: tokens.colorPaletteRedForeground1 },
})

type TabId = 'ideas' | 'instruct'

interface Props {
  /** 部品の種類(headline・copy・subject など。指示の例を選ぶ)と、名前 */
  kind: string
  label: string
  /** いまの文言 */
  value: string
  /** 頼む(count = ほしい案の数。history は「指示して直す」のこれまでのやり取り) */
  ask: (request: string, count: number, history: PartTurn[]) => Promise<PartAnswer>
  /** 案を仮にプレビューに写す(null で元に戻す) */
  onPreview: (value: string | null) => void
  onAdopt: (idea: PartIdea) => void
}

/** 案のタブで頼むときの文(画面には出さない) */
const IDEAS_REQUEST = 'この部品の文言の候補を、テーマと切り口に合わせて、それぞれ違う方向で考えてください'
const IDEAS_COUNT = 4

export function TextAiPanel({ kind, label, value, ask, onPreview, onAdopt }: Props) {
  const t = useT()
  const s = useStyles()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<TabId>('ideas')
  const [ideas, setIdeas] = useState<PartIdea[] | null>(null)
  // 指示して直すのやり取り(続けて頼めるように。部品を選び直すと消える)
  const [turns, setTurns] = useState<PartTurn[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState<TabId | null>(null)
  const [error, setError] = useState<string | null>(null)
  const trial = useTrial()
  const last = [...turns].reverse().find((x) => x.role === 'ai')

  const keyOf = (idea: PartIdea) => `${idea.value}\n${idea.why}`
  const pick = (idea: PartIdea) =>
    trial.tryIt({
      key: keyOf(idea),
      from: value,
      to: idea.value,
      preview: () => onPreview(idea.value),
      unpreview: () => onPreview(null),
      apply: () => onAdopt(idea),
    })

  const run = async (which: TabId, request: string) => {
    if (busy) return
    trial.cancel()
    setBusy(which)
    setError(null)
    try {
      if (which === 'ideas') {
        const res = await ask(request, IDEAS_COUNT, [])
        setIdeas(res.ideas)
      } else {
        const history = turns
        const res = await ask(request, 1, history)
        setTurns([...history, { role: 'user', text: request }, { role: 'ai', text: res.reply, ideas: res.ideas.slice(0, 1) }])
        setDraft('')
        // 結果は 1 つなので、そのままプレビューに写して、確定 / やめるを聞く
        if (res.ideas[0]) pick(res.ideas[0])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  const openTab = (which: TabId) => {
    setTab(which)
    trial.cancel()
    setError(null)
    // 案のタブは、初めて開いたときに 1 回だけ頼む(押すたびに AI を呼ばないように)
    if (which === 'ideas' && ideas === null) void run('ideas', IDEAS_REQUEST)
  }

  const ideaRow = (idea: PartIdea) => {
    const trying = trial.trial?.key === keyOf(idea)
    const used = !trial.trial && idea.value === value
    return (
      <button key={keyOf(idea)} type="button" aria-pressed={trying} className={mergeClasses(s.idea, trying && s.ideaTrying)} onClick={() => pick(idea)} title={t('押すと、プレビューで試します(上の「確定」で入れ替え)', 'Click to try it in the preview (apply with "Apply" above)')}>
        <span style={{ display: 'grid', rowGap: 2, minWidth: 0 }}>
          <span className={s.ideaText}>{idea.value}</span>
          {idea.why && <span className={s.note}>{idea.why}</span>}
        </span>
        {used ? <CheckmarkRegular color={tokens.colorPaletteGreenForeground1} /> : <span className={s.note}>{trying ? t('試している', 'Trying') : t('試す', 'Try')}</span>}
      </button>
    )
  }

  return (
    <div className={s.root}>
      <ToggleButton
        className={s.toggle}
        size="small"
        icon={<AiIcon size={14} />}
        checked={open}
        onClick={() => {
          if (open) {
            trial.cancel()
            setOpen(false)
          } else {
            setOpen(true)
            openTab(tab)
          }
        }}
      >
        {t('AI', 'AI')}
      </ToggleButton>
      {open && (
        <div className={s.panel}>
          <TabList size="small" selectedValue={tab} onTabSelect={(_, d) => openTab(d.value as TabId)}>
            <Tab value="ideas">{t('案', 'Ideas')}</Tab>
            <Tab value="instruct">{t('指示して直す', 'Edit by instruction')}</Tab>
          </TabList>
          <TrialBar state={trial} />
          {tab === 'ideas' ? (
            <>
              <div className={s.row}>
                <span className={s.note}>{t('押すと、プレビューで試せます(上の「確定」で入れ替え)', 'Click one to try it in the preview (apply with "Apply" above)')}</span>
                {ideas !== null && (
                  <Button size="small" appearance="subtle" disabled={!!busy} onClick={() => void run('ideas', IDEAS_REQUEST)}>
                    {t('出し直す', 'More ideas')}
                  </Button>
                )}
              </div>
              {busy === 'ideas' && <Spinner size="tiny" label={t('AI が案を考えています', 'AI is thinking')} labelPosition="after" />}
              {ideas && ideas.length > 0 && busy !== 'ideas' && <div className={s.list}>{ideas.map(ideaRow)}</div>}
              {ideas && ideas.length === 0 && busy !== 'ideas' && <span className={s.note}>{t('案を出せませんでした。「出し直す」を押してください', 'No ideas came back. Click "More ideas" to try again')}</span>}
            </>
          ) : (
            <>
              <div className={s.samples}>
                {textRequestSamples(kind).map((x) => (
                  <Button key={x} size="small" shape="circular" className={s.sample} disabled={!!busy} onClick={() => void run('instruct', x)}>
                    {x}
                  </Button>
                ))}
              </div>
              <div className={s.input}>
                <AutoTextarea
                  heightKey="TextAiPanel.draft"
                  size="small"
                  rows={1}
                  value={draft}
                  disabled={!!busy}
                  placeholder={t('自分で書く(例: 20 文字以内で、数字を入れて)', 'Write your own (e.g. Under 40 characters, include a number)')}
                  aria-label={t(`AI への指示(${label})`, `Instruction for AI (${label})`)}
                  onChange={(_, d) => setDraft(d.value)}
                  onKeyDown={(ev) => {
                    // Enter で送る(Shift + Enter は改行。日本語の変換の確定では送らない)
                    if (ev.key === 'Enter' && !ev.shiftKey && !ev.nativeEvent.isComposing && draft.trim()) {
                      ev.preventDefault()
                      void run('instruct', draft.trim())
                    }
                  }}
                />
                <Button size="small" appearance="primary" icon={<SendRegular />} disabled={!!busy || !draft.trim()} onClick={() => void run('instruct', draft.trim())} aria-label={t('送る', 'Send')} />
              </div>
              {busy === 'instruct' && <Spinner size="tiny" label={t('AI が直しています', 'AI is editing')} labelPosition="after" />}
              {last && busy !== 'instruct' && (
                <>
                  {last.text && <span className={s.note}>{last.text}</span>}
                  {last.ideas?.[0] && <div className={s.list}>{ideaRow(last.ideas[0])}</div>}
                </>
              )}
            </>
          )}
          {error && <span className={s.error}>{error}</span>}
        </div>
      )}
    </div>
  )
}
