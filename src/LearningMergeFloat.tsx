// 似た学びをまとめるフロート(X78)。AI が「似ている」組を挙げ、人が組ごとに「まとめる」を押す。AI の案は保存しない(まとめたときだけ書く)。
// まとめると、まとめる元の学びは、まとめた先のカードの根拠になる(付け外し・国のデッキ・効き目も先に付け替わる。learningMerge)。元に戻せる
import { useEffect, useRef, useState } from 'react'
import { Button, Dialog, DialogBody, DialogContent, DialogTitle, MessageBar, MessageBarBody, Spinner, makeStyles, tokens } from '@fluentui/react-components'
import { typo } from './typo'
import { ArrowLeftRegular, ArrowUndoRegular, DismissRegular, MergeRegular, SparkleRegular } from '@fluentui/react-icons'
import { ResizableSurface } from './ResizableSurface'
import { LearningCard } from './LearningCard'
import { mergeLearning, suggestSimilarLearnings, unmergeLearning, type SimilarPair } from './learningMerge'
import type { LearningCardData } from './learningCards'
import { myName } from './history'
import { useT } from './i18n'

const useStyles = makeStyles({
  surface: { width: 'min(820px, (96vw / var(--ui-zoom, 1)))', maxWidth: 'none', height: 'min(720px, calc(88vh / var(--ui-zoom, 1)))', display: 'flex', flexDirection: 'column' },
  body: { display: 'flex', flexDirection: 'column', minHeight: 0, flexGrow: 1, rowGap: '10px' },
  head: { display: 'flex', alignItems: 'center', columnGap: '8px' },
  title: { flexGrow: 1 },
  content: { display: 'grid', alignContent: 'start', rowGap: '12px', overflowY: 'auto', minHeight: 0, flexGrow: 1, paddingRight: '4px' },
  hint: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  pair: { display: 'grid', rowGap: '8px', padding: '10px 12px', borderRadius: tokens.borderRadiusMedium, border: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: tokens.colorNeutralBackground2 },
  // まとめた先(残す) ← まとめる元。2 枚を並べて見比べる
  cards: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)', columnGap: '8px', alignItems: 'start' },
  arrow: { alignSelf: 'center', color: tokens.colorNeutralForeground3 },
  label: { ...typo.label, marginBottom: '4px' },
  why: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground2 },
  actions: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' },
  done: { fontSize: tokens.fontSizeBase200, color: tokens.colorPaletteGreenForeground1 },
})

interface Props {
  /** まとめる候補にする学び(手札の、いま見えている学び) */
  cards: LearningCardData[]
  onClose: () => void
  /** まとめた・戻したあと(手札を読み直す) */
  onChanged: () => void
}

export function LearningMergeFloat({ cards, onClose, onChanged }: Props) {
  const s = useStyles()
  const t = useT()
  const [pairs, setPairs] = useState<SimilarPair[] | null>(null)
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 組ごとの様子(まとめた / 見送った / 処理中)
  const [done, setDone] = useState<Record<string, 'merged' | 'skipped' | 'busy'>>({})
  // 開いたときに覚えた学び(まとめると手札から元が消えるので、並べる中身は、開いたときのものを使う)
  const [byId] = useState(() => new Map(cards.map((l) => [l.id, l])))
  const ask = async () => {
    setAsking(true)
    setError(null)
    setDone({})
    try {
      // 使わない学び(外した)は、まとめる前に整理されているので、比べない
      setPairs(await suggestSimilarLearnings(cards.filter((l) => l.state !== 'retired')))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setAsking(false)
    }
  }
  // 開いたら、1 回だけ AI に頼む
  const asked = useRef(false)
  useEffect(() => {
    if (asked.current) return
    asked.current = true
    void Promise.resolve().then(ask)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 開いたときの 1 回だけ
  }, [])
  const keyOf = (p: SimilarPair) => `${p.into}<${p.from}`
  const run = async (p: SimilarPair, kind: 'merge' | 'undo') => {
    const k = keyOf(p)
    setDone((d) => ({ ...d, [k]: 'busy' }))
    setError(null)
    try {
      if (kind === 'merge') await mergeLearning(p.from, p.into, myName() || t('(名前なし)', '(no name)'))
      else await unmergeLearning(p.from)
      setDone((d) => {
        const next = { ...d }
        if (kind === 'merge') next[k] = 'merged'
        else delete next[k]
        return next
      })
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setDone((d) => {
        const next = { ...d }
        delete next[k]
        return next
      })
    }
  }

  return (
    <Dialog open modalType="non-modal" onOpenChange={(_, d) => !d.open && onClose()}>
      <ResizableSurface sizeKey="learningMerge" className={s.surface} aria-label={t('似た学びをまとめる', 'Merge similar learnings')}>
        <DialogBody className={s.body}>
          <div className={s.head}>
            <DialogTitle className={s.title} action={null}>{t('似た学びをまとめる', 'Merge similar learnings')}</DialogTitle>
            <Button size="small" icon={<SparkleRegular />} disabled={asking} onClick={() => void ask()}>
              {t('AI にもう一度探してもらう', 'Ask AI again')}
            </Button>
            <Button appearance="subtle" icon={<DismissRegular />} aria-label={t('閉じる', 'Close')} onClick={onClose} />
          </div>
          <DialogContent className={s.content}>
            <span className={s.hint}>
              {t(
                '同じことを言っている学びの組を、AI が挙げます。まとめると、右の学びは左の学びの根拠になり(根拠が 2 本以上に)、配信カードで付けた学び・国のデッキ・効き目も、左の学びに付け替わります。あとから元に戻せます',
                'AI lists pairs of learnings that say the same thing. Merging makes the right one a source of the left one (2+ sources); learnings added to deliveries, country decks and impact move to the left one. You can undo it later.',
              )}
            </span>
            {error && (
              <MessageBar intent="error" layout="multiline">
                <MessageBarBody>{error}</MessageBarBody>
              </MessageBar>
            )}
            {asking ? (
              <Spinner size="small" label={t('AI が似た学びを探しています…', 'AI is looking for similar learnings…')} />
            ) : pairs && pairs.length === 0 ? (
              <span className={s.hint}>{t('似ている学びは見つかりませんでした', 'No similar learnings found')}</span>
            ) : (
              pairs?.map((p) => {
                const into = byId.get(p.into)
                const from = byId.get(p.from)
                if (!into || !from) return null
                const state = done[keyOf(p)]
                if (state === 'skipped') return null
                return (
                  <div key={keyOf(p)} className={s.pair}>
                    <div className={s.cards}>
                      <div>
                        <div className={s.label}>{t('残す学び', 'Keep')}</div>
                        <LearningCard data={into} />
                      </div>
                      <ArrowLeftRegular className={s.arrow} fontSize={20} aria-hidden />
                      <div>
                        <div className={s.label}>{t('まとめる学び(根拠になる)', 'Merge in (becomes a source)')}</div>
                        <LearningCard data={from} />
                      </div>
                    </div>
                    {p.why && <span className={s.why}>{t(`AI: ${p.why}`, `AI: ${p.why}`)}</span>}
                    <div className={s.actions}>
                      {state === 'merged' ? (
                        <>
                          <span className={s.done}>{t('まとめました', 'Merged')}</span>
                          <Button size="small" icon={<ArrowUndoRegular />} onClick={() => void run(p, 'undo')}>
                            {t('元に戻す', 'Undo')}
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button size="small" appearance="primary" icon={<MergeRegular />} disabled={state === 'busy'} onClick={() => void run(p, 'merge')}>
                            {t('まとめる', 'Merge')}
                          </Button>
                          <Button size="small" disabled={state === 'busy'} onClick={() => setDone((d) => ({ ...d, [keyOf(p)]: 'skipped' }))}>
                            {t('まとめない', 'Skip')}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </DialogContent>
        </DialogBody>
      </ResizableSurface>
    </Dialog>
  )
}
