// 「？ 聞く」のフロート(X82 の段 ②)。使い方を、いまのコードと文書を材料に、AI に聞ける(チャットの形)。
// 答えは ① 手順(画面にある実際の名前で)② 「ここを開く」(ディープリンク)③ 根拠(どの機能の説明か。ファイル名は畳む)。
// 質問と答えは、よく聞かれる質問(FAQ)を作るために段 ④ が保存する(setHelpRecorder。だれが聞いたかは残さない)。画面のやり取りは、閉じると消える
import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogTitle,
  MessageBar,
  MessageBarBody,
  Spinner,
  Tag,
  TagGroup,
  Text,
  Tooltip,
  makeStyles,
  tokens,
} from '@fluentui/react-components'
import { DismissRegular, LightbulbRegular, OpenRegular, SendRegular, TargetArrowRegular } from '@fluentui/react-icons'
import { ResizableSurface } from '../ResizableSurface'
import { AutoTextarea } from '../AutoTextarea'
import { useT } from '../i18n'
import { startDevRequestAt } from '../devRequestPlace'
import { useFeature } from '../featureFlags'
import { focusSoon } from '../ContextMenu'
import { HelpFaqList } from './HelpFaqList'
import { namesInAnswer, setSpotlight } from './spotlight'
import { askHelp, labelChecker, loadMaterial, openAnswer, recordTellDev, tellDevDraft, type HelpPart, type HelpTurn } from './helpAsk'

const useStyles = makeStyles({
  surface: { width: '520px', height: '640px', display: 'flex', flexDirection: 'column', padding: 0 },
  body: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, rowGap: 0, padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}` },
  head: { display: 'flex', alignItems: 'center', columnGap: '8px' },
  grow: { flexGrow: 1, minWidth: 0 },
  content: { display: 'flex', flexDirection: 'column', minHeight: 0, flexGrow: 1, rowGap: '10px', paddingTop: '8px' },
  log: { flexGrow: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', rowGap: '12px', paddingRight: '4px' },
  intro: { display: 'grid', rowGap: '8px', color: tokens.colorNeutralForeground2 },
  samples: { display: 'flex', flexWrap: 'wrap', gap: '6px' },
  question: {
    alignSelf: 'flex-end',
    maxWidth: '85%',
    padding: '6px 10px',
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorBrandBackground2,
    color: tokens.colorNeutralForeground1,
    whiteSpace: 'pre-wrap',
  },
  answer: {
    display: 'grid',
    rowGap: '8px',
    padding: '10px 12px',
    borderRadius: tokens.borderRadiusLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  steps: { margin: 0, paddingLeft: '20px', display: 'grid', rowGap: '4px' },
  name: { fontWeight: tokens.fontWeightSemibold },
  // 画面の文言の一覧にない名前(作り話かもしれない)。太字にせず、点線を引く
  unknownName: { textDecorationLine: 'underline', textDecorationStyle: 'dotted', textDecorationColor: tokens.colorPaletteMarigoldBorderActive },
  caption: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  basis: { margin: 0, paddingLeft: '18px', fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground2 },
  files: { fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3, overflowWrap: 'anywhere' },
  inputRow: { display: 'flex', alignItems: 'flex-end', columnGap: '6px' },
  actions: { display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' },
  // 右クリックの「ここについて聞く」から始めたときの、どの部品のことかの札
  partTag: { alignSelf: 'flex-start', maxWidth: '100%' },
  partOn: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
})

interface Props {
  open: boolean
  onClose: () => void
  /** 右クリックの「ここについて聞く」で押した所(段 ③)。あれば、その部品について聞く */
  part?: HelpPart | null
  /** 部品の札を外す(ふつうの質問に戻す) */
  onClearPart?: () => void
}

export function HelpAskFloat({ open, onClose, part, onClearPart }: Props) {
  const s = useStyles()
  const t = useT()
  const [turns, setTurns] = useState<HelpTurn[]>([])
  const [text, setText] = useState('')
  const [asking, setAsking] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [isLabel, setIsLabel] = useState<((name: string) => boolean) | null>(null)
  // 答えの「開発に伝える」は、開発へのリクエストを公開しているときだけ(X87)
  const devRequestsOn = useFeature('dev.requests')
  const logRef = useRef<HTMLDivElement>(null)

  // 開いたら、材料を先に読み込んでおく(最初の質問を待たせないように)
  useEffect(() => {
    if (!open) return
    void loadMaterial().then((m) => setIsLabel(() => labelChecker(m)))
  }, [open])
  // 開いたら、すぐ書けるよう入力欄へ(右クリックの「ここについて聞く」で、開いているフロートに札が付いたときも。2026-10-28 利用者)
  useEffect(() => {
    if (open) window.setTimeout(() => focusSoon('[data-help-input] textarea'), 0)
  }, [open, part])
  // 新しい答え・考えている途中を、見える所までスクロール
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' })
  }, [turns.length, asking])

  const ask = async (q: string) => {
    const question = q.trim()
    if (!question || asking) return
    setText('')
    setError('')
    setAsking(question)
    try {
      const { answer, at } = await askHelp(question, turns, part ?? undefined)
      setTurns((list) => [...list, { question, answer, part: part ?? undefined, at }])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setText(question)
    } finally {
      setAsking(null)
    }
  }

  /** [[名前]] を、画面の名前として太字に(一覧にない名前は点線) */
  const withNames = (line: string): ReactNode[] =>
    line.split(/(\[\[[^\]]+\]\])/g).map((part, i) => {
      const m = /^\[\[([^\]]+)\]\]$/.exec(part)
      if (!m) return part
      const known = !isLabel || isLabel(m[1])
      return known ? (
        <span key={i} className={s.name}>
          {m[1]}
        </span>
      ) : (
        <Tooltip key={i} relationship="description" content={t('画面の文言の一覧にない名前です。画面では違う名前かもしれません', 'This name is not in the list of on-screen labels. It may be different on screen')}>
          <span className={s.unknownName}>{m[1]}</span>
        </Tooltip>
      )
    })

  /** 答えの下の「開発に伝える」: 質問と答えを書きかけにして、開発へのリクエストを書き始める(右クリックから聞いたなら、その点にピン) */
  const tellDev = (turn: HelpTurn) => {
    recordTellDev(turn)
    const x = turn.part?.x ?? Math.round(window.innerWidth / 2)
    const y = turn.part?.y ?? Math.round(window.innerHeight / 2)
    // ピンのフロートを書けるように、こちらは閉じる(開いたままだと重なる)
    onClose()
    window.setTimeout(() => startDevRequestAt(x, y, tellDevDraft(turn.question, turn.answer)), 0)
  }

  const answerBox = (turn: HelpTurn, key: number) => {
    const a = turn.answer
    // 光らせる名前: 答えと手順の [[名前]] のうち、画面の文言の一覧にあるもの
    const names = namesInAnswer([a.reply, ...a.steps]).filter((n) => !isLabel || isLabel(n))
    return (
    <div key={key} className={s.answer}>
      {turn.part && <span className={s.partOn}>{t(`この部品について: ${turn.part.label}`, `About: ${turn.part.label}`)}</span>}
      {a.reply && <Text>{withNames(a.reply)}</Text>}
      {a.steps.length > 0 && (
        <ol className={s.steps}>
          {a.steps.map((step, i) => (
            <li key={i}>{withNames(step)}</li>
          ))}
        </ol>
      )}
      <div className={s.actions}>
        {a.open && (
          <Button
            size="small"
            appearance="primary"
            icon={<OpenRegular />}
            onClick={() => {
              openAnswer(a.open!)
              // 開いた画面の中の、手順にあるボタン・欄を光らせる(X83)
              setSpotlight(names)
            }}
          >
            {a.openLabel ? t(`ここを開く: ${a.openLabel}`, `Open: ${a.openLabel}`) : t('ここを開く', 'Open this')}
          </Button>
        )}
        {/* いまの画面の中で、手順にあるボタン・欄を光らせる(画面を移らずに場所だけ知りたいとき。X83) */}
        {names.length > 0 && (
          <Tooltip content={t('手順にあるボタン・欄を、いまの画面の中で光らせます', 'Highlight the buttons and fields from the steps on the current screen')} relationship="description">
            <Button size="small" appearance="outline" icon={<TargetArrowRegular />} onClick={() => setSpotlight(names)}>
              {t('画面で示す', 'Show on screen')}
            </Button>
          </Tooltip>
        )}
        {/* 答えで足りない・画面を変えてほしいときは、そのまま開発へのリクエストに(質問と答えを添える) */}
        {devRequestsOn && (
        <Tooltip content={t('質問と答えを添えて、開発へのリクエストを書き始めます', 'Start a request to developers with this question and answer')} relationship="description">
          <Button size="small" appearance="subtle" icon={<LightbulbRegular />} onClick={() => tellDev(turn)}>
            {t('開発に伝える', 'Tell the developers')}
          </Button>
        </Tooltip>
        )}
      </div>
      {(a.basis.length > 0 || a.files.length > 0) && (
        // 根拠は畳んでおく(ふだんは手順とボタンだけで足りる。確かめたい人・開発する人が開く)
        <Accordion collapsible>
          <AccordionItem value="basis">
            <AccordionHeader size="small">{t('根拠', 'Sources')}</AccordionHeader>
            <AccordionPanel>
              {a.basis.length > 0 && (
                <ul className={s.basis}>
                  {a.basis.map((b, i) => (
                    <li key={i}>{[b.doc, b.title].filter(Boolean).join(': ')}</li>
                  ))}
                </ul>
              )}
              {a.files.length > 0 && <div className={s.files}>{a.files.join('  ')}</div>}
            </AccordionPanel>
          </AccordionItem>
        </Accordion>
      )}
    </div>
    )
  }

  const samples = part
    ? [t('これは何?', 'What is this?'), t('ここで何ができる?', 'What can I do here?'), t('ここを変えたい', 'I want to change this')]
    : [
    t('承認を依頼するには?', 'How do I request approval?'),
    t('商品を入れ替えるには?', 'How do I swap a product?'),
    t('テンプレートを直すには?', 'How do I edit a template?'),
      ]

  return (
    // 手順を見ながら画面を触れるよう、ほかの所を押せる形(non-modal)にする
    <Dialog open={open} modalType="non-modal" onOpenChange={(_, d) => !d.open && onClose()}>
      <ResizableSurface sizeKey="helpAsk" className={s.surface} aria-label={t('使い方を聞く', 'Ask how to use')} data-help-float>
        <DialogBody className={s.body}>
          <div className={s.head}>
            {/* non-modal のフロートでは、DialogTitle が閉じる × を自分で足すので、出さない(右の × と 2 つ並んでいた。ほかの non-modal のフロートと同じ) */}
            <DialogTitle className={s.grow} action={null}>
              {t('使い方を聞く', 'Ask how to use')}
            </DialogTitle>
            <Button appearance="subtle" size="small" icon={<DismissRegular />} aria-label={t('閉じる', 'Close')} onClick={onClose} />
          </div>
          <DialogContent className={s.content}>
            <div ref={logRef} className={s.log}>
              {turns.length === 0 && !asking && (
                <div className={s.intro}>
                  <Text>{t('やりたいことや、分からないことを書いてください。画面の機能の説明と、画面にある文言をもとに、手順と開く場所を答えます。', 'Describe what you want to do or what is unclear. Answers come from the feature docs and the on-screen labels, with steps and a link to open the place.')}</Text>
                  <div className={s.samples}>
                    {samples.map((q) => (
                      <Button key={q} size="small" shape="circular" onClick={() => void ask(q)}>
                        {q}
                      </Button>
                    ))}
                  </div>
                  {/* よく聞かれる質問(段 ④。回数の多い順)。押すと、その答えを、聞いたときと同じ形で出す */}
                  <HelpFaqList onPick={(turn) => setTurns([turn])} />
                  <span className={s.caption}>{t('質問と答えは、よく聞かれる質問を作るために保存します(だれが聞いたかは残しません)。', 'Questions and answers are saved to build frequently asked questions (who asked is not kept).')}</span>
                </div>
              )}
              {turns.map((turn, i) => [
                <div key={`q${i}`} className={s.question}>
                  {turn.question}
                </div>,
                answerBox(turn, i),
              ])}
              {asking && (
                <>
                  <div className={s.question}>{asking}</div>
                  <Spinner size="tiny" labelPosition="after" label={t('調べています…', 'Looking it up…')} />
                </>
              )}
            </div>
            {part && (
              <Tooltip content={t('右クリックした所について聞きます。✕ で外すと、ふつうの質問に戻ります', 'You are asking about the spot you right-clicked. Remove it with ✕ to ask in general')} relationship="description">
                <TagGroup className={s.partTag} onDismiss={() => onClearPart?.()}>
                  <Tag size="small" shape="circular" dismissible dismissIcon={{ 'aria-label': t('外す', 'Remove') }} value="part">
                    {t(`この部品について: ${part.label || '(名前なし)'}`, `About: ${part.label || '(no name)'}`)}
                  </Tag>
                </TagGroup>
              </Tooltip>
            )}
            {error && (
              <MessageBar intent="error" layout="multiline">
                <MessageBarBody>{error}</MessageBarBody>
              </MessageBar>
            )}
            <div className={s.inputRow} data-help-input>
              <AutoTextarea
                className={s.grow}
                heightKey="helpAsk.question"
                rows={2}
                value={text}
                placeholder={t('例: 週の配信をまとめて作るには?', 'e.g. How do I create a week of deliveries at once?')}
                onChange={(_, d) => setText(d.value)}
                onKeyDown={(e) => {
                  // Enter で送る(Shift + Enter で改行。日本語の変換中は送らない)
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault()
                    void ask(text)
                  }
                }}
              />
              <Button appearance="primary" icon={<SendRegular />} disabled={!text.trim() || !!asking} onClick={() => void ask(text)} aria-label={t('送る', 'Send')} />
            </div>
          </DialogContent>
        </DialogBody>
      </ResizableSurface>
    </Dialog>
  )
}
