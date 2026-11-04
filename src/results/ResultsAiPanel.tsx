// シンプルな結果の窓(X89)の「AI の読み」の欄。配信 1 本の結果(主な数字・AB の案ごとの数字・押された部品の順)を AI に渡し、
// 「どう読めるか」と「次に試すこと」を 2〜3 行で出す。押したときだけ AI を呼ぶ(開くたびに呼ばない)。
// AI の答えは保存しない。「メモに入れる」を押したものだけを、次に生かすメモ(結果の notes)に入れる(入れるのは呼ぶ側。onAdopt)。
// 公開・非公開は results.ai(v2)。非公開なら何も出さない
import { useState } from 'react'
import { Button, InfoLabel, MessageBar, MessageBarBody, makeStyles, tokens } from '@fluentui/react-components'
import { ArrowClockwiseRegular, NoteAddRegular } from '@fluentui/react-icons'
import { AiButton } from '../AiButton'
import { FeatureBadge } from '../FeatureBadge'
import { useFeature } from '../featureFlags'
import { LabeledValue } from '../LabeledValue'
import { useT } from '../i18n'
import type { Product } from '../models/products'
import type { ResultRow } from '../results'
import { typo } from '../typo'
import { readResult, type AbForAi, type ResultReading } from './resultsAi'

const useStyles = makeStyles({
  root: { display: 'grid', rowGap: '8px', minWidth: 0 },
  head: { display: 'flex', alignItems: 'center', columnGap: '6px' },
  title: typo.heading,
  box: { display: 'grid', rowGap: '8px', padding: '8px 10px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground2 },
  lines: { margin: 0, paddingLeft: '18px', display: 'grid', rowGap: '2px' },
  actions: { display: 'flex', columnGap: '6px', flexWrap: 'wrap' },
  note: typo.caption,
})

interface Props {
  /** 配信 1 本と、その結果 */
  row: ResultRow
  /** AB テストのとき、案ごとの結果(abVerdict の戻り値をそのまま渡せる)。AB でなければ null */
  ab?: AbForAi | null
  /** 商品名を引くため(押された商品の名前に使う。なくても読める) */
  products?: Product[]
  /** 「メモに入れる」を押したとき(次に生かすメモに足す文)。渡さなければ、ボタンを出さない */
  onAdopt?: (text: string) => void
}

export function ResultsAiPanel({ row, ab = null, products = [], onAdopt }: Props) {
  const s = useStyles()
  const t = useT()
  const on = useFeature('results.ai')
  const [busy, setBusy] = useState(false)
  const [got, setGot] = useState<ResultReading | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (!on) return null

  const run = async () => {
    setBusy(true)
    setError(null)
    try {
      setGot(await readResult(row, ab, products))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  const adoptText = got ? [...got.reading, ...got.next.map((x) => t(`次に試す: ${x}`, `Try next: ${x}`))].join('\n') : ''

  return (
    <div className={s.root}>
      <div className={s.head}>
        <InfoLabel
          className={s.title}
          info={t(
            'この配信の主な数字・AB の案ごとの数字・押された部品の順を AI に渡して、短く読んでもらいます。過去の配信とは比べません(比べるのは「前の配信と比べる」)。答えは保存しません。残したいときは「メモに入れる」で、次に生かすメモに足します。',
            'Sends this delivery’s main numbers, per-variant numbers and the order of clicked parts to AI for a short reading. It does not compare with past deliveries (use “Compare with earlier deliveries”). Nothing is saved; use “Add to notes” to keep it in the notes for next time.',
          )}
        >
          {t('AI の読み', 'AI reading')}
        </InfoLabel>
        <FeatureBadge id="results.ai" />
      </div>
      {error && (
        <MessageBar intent="error" layout="multiline">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}
      {!got ? (
        <div className={s.actions}>
          <AiButton busy={busy} onClick={() => void run()}>
            {t('AI で読む', 'Read with AI')}
          </AiButton>
        </div>
      ) : (
        <div className={s.box}>
          {got.reading.length > 0 && (
            <LabeledValue label={t('どう読めるか', 'What it shows')} layout="stacked">
              <ul className={s.lines}>
                {got.reading.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </LabeledValue>
          )}
          {got.next.length > 0 && (
            <LabeledValue label={t('次に試すこと', 'Try next')} layout="stacked">
              <ul className={s.lines}>
                {got.next.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </LabeledValue>
          )}
          <div className={s.actions}>
            {onAdopt && (
              <Button size="small" icon={<NoteAddRegular />} onClick={() => onAdopt(adoptText)}>
                {t('メモに入れる', 'Add to notes')}
              </Button>
            )}
            <Button size="small" appearance="subtle" icon={<ArrowClockwiseRegular />} disabled={busy} onClick={() => void run()}>
              {busy ? t('読んでいます…', 'Reading…') : t('もう一度読む', 'Read again')}
            </Button>
          </div>
        </div>
      )}
      {!got && !busy && <span className={s.note}>{t('押したときだけ AI を呼びます', 'AI runs only when you press the button')}</span>}
    </div>
  )
}
