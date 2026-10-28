import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button, Spinner, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { ChooseDrawer } from '../ChoosePanel'
import { CheckmarkRegular, SendRegular } from '@fluentui/react-icons'
import { AiIcon } from '../AiMark'
import { AutoTextarea } from '../AutoTextarea'
import { useT } from '../i18n'
import { useTrial } from '../trial'
import { TrialBar } from '../TrialBar'
import { requestSamples, textRequestSamples, type PartAnswer, type PartIdea, type PartTurn } from './partAi'

// 文の部品(見出し・コピー・件名・プリヘッダー・通知の文・セクションの見出しとコピー)の AI(2026-10-27 利用者)。
// 入力欄に直接書くのがいちばん多いので、ふだんは「AI で変える」のボタンだけにして、押したときだけ、その真下から引き出しを開く
// (商品の「入れ替える」と同じ ChooseDrawer。2026-10-28 利用者: ボタンと開く所の関係を、入れ替えと同じ動き・見た目に)。
// 「案」= 候補をいくつか、「指示して直す」= 頼んだとおりに 1 つ。どちらも、押すとプレビューにだけ仮に写し、帯の「確定」で入れ替える(試す → 確定)
const useStyles = makeStyles({
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
  /**
   * 長い文の部品(渡す文章など)のための差し替え。案の見せ方(既定は文のまま)・帯に出す短い形(既定は文のまま)・
   * 案のタブで頼む文と数・指示の例(既定は文の部品の例)
   */
  renderIdea?: (idea: PartIdea) => ReactNode
  short?: (value: string) => string
  ideasRequest?: string
  ideasCount?: number
  samplesKind?: 'text' | 'part'
  placeholder?: string
}

/** 案のタブで頼むときの文(画面には出さない) */
const IDEAS_REQUEST = 'この部品の文言の候補を、テーマと切り口に合わせて、それぞれ違う方向で考えてください'
const IDEAS_COUNT = 4

export function TextAiPanel({ kind, label, value, ask, onPreview, onAdopt, renderIdea, short = (v) => v, ideasRequest = IDEAS_REQUEST, ideasCount = IDEAS_COUNT, samplesKind = 'text', placeholder }: Props) {
  const t = useT()
  const s = useStyles()
  const [open, setOpen] = useState(false)
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
      from: short(value),
      to: short(idea.value),
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
        const res = await ask(request, ideasCount, [])
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

  // 案のタブは、初めて開いたときに 1 回だけ頼む(開くたびに AI を呼ばないように。開発の StrictMode の 2 回の描画でも 1 回)
  const asked = useRef(false)
  const askIdeasOnce = () => {
    if (asked.current) return
    asked.current = true
    void run('ideas', ideasRequest)
  }

  const ideaRow = (idea: PartIdea) => {
    const trying = trial.trial?.key === keyOf(idea)
    const used = !trial.trial && idea.value === value
    return (
      <button key={keyOf(idea)} type="button" aria-pressed={trying} className={mergeClasses(s.idea, trying && s.ideaTrying)} onClick={() => pick(idea)} title={t('押すと、プレビューで試します(上の「確定」で入れ替え)', 'Click to try it in the preview (apply with "Apply" above)')}>
        <span style={{ display: 'grid', rowGap: 2, minWidth: 0 }}>
          {renderIdea ? renderIdea(idea) : <span className={s.ideaText}>{idea.value}</span>}
          {idea.why && <span className={s.note}>{idea.why}</span>}
        </span>
        {used ? <CheckmarkRegular color={tokens.colorPaletteGreenForeground1} /> : <span className={s.note}>{trying ? t('試している', 'Trying') : t('試す', 'Try')}</span>}
      </button>
    )
  }

  const ideasTab = (
    <>
      <OnShow run={askIdeasOnce} />
      <div className={s.row}>
        <span className={s.note}>{t('押すと、プレビューで試せます(上の「確定」で入れ替え)', 'Click one to try it in the preview (apply with "Apply" above)')}</span>
        {ideas !== null && (
          <Button size="small" appearance="subtle" disabled={!!busy} onClick={() => void run('ideas', ideasRequest)}>
            {t('出し直す', 'More ideas')}
          </Button>
        )}
      </div>
      {busy === 'ideas' && <Spinner size="tiny" label={t('AI が案を考えています', 'AI is thinking')} labelPosition="after" />}
      {ideas && ideas.length > 0 && busy !== 'ideas' && <div className={s.list}>{ideas.map(ideaRow)}</div>}
      {ideas && ideas.length === 0 && busy !== 'ideas' && <span className={s.note}>{t('案を出せませんでした。「出し直す」を押してください', 'No ideas came back. Click "More ideas" to try again')}</span>}
      {error && <span className={s.error}>{error}</span>}
    </>
  )
  const instructTab = (
    <>
      <div className={s.samples}>
        {(samplesKind === 'part' ? requestSamples(kind) : textRequestSamples(kind)).map((x) => (
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
          placeholder={placeholder ?? t('自分で書く(例: 20 文字以内で、数字を入れて)', 'Write your own (e.g. Under 40 characters, include a number)')}
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
      {error && <span className={s.error}>{error}</span>}
    </>
  )

  // 開くボタンと引き出しは、商品の「入れ替える」と同じ部品(ChooseDrawer)。見た目・開き方・閉じ方・開いている間のボタンをそろえる(2026-10-28 利用者)
  return (
    <ChooseDrawer<TabId>
      open={open}
      onOpenChange={(o) => {
        // 閉じたら、試していた案はやめたことにする(プレビューを元に戻す)
        if (!o) trial.cancel()
        setOpen(o)
      }}
      label={t('AI で変える', 'Change with AI')}
      icon={<AiIcon size={14} tone="white" />}
      title={t('AI で変える', 'Change with AI')}
      top={<TrialBar state={trial} />}
      tabs={[
        { value: 'ideas', label: t('案', 'Ideas'), content: ideasTab },
        { value: 'instruct', label: t('指示して直す', 'Edit by instruction'), content: instructTab },
      ]}
    />
  )
}

/** タブを開いたとき(中身が描かれたとき)に 1 回だけ呼ぶ */
function OnShow({ run }: { run: () => void }) {
  useEffect(() => {
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 開いたときの 1 回だけ
  }, [])
  return null
}
