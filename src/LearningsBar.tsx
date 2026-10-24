import { useEffect, useMemo, useState } from 'react'
import { Badge, Button, Tooltip, makeStyles, tokens } from '@fluentui/react-components'
import { ChevronDownRegular, ChevronUpRegular, LightbulbRegular } from '@fluentui/react-icons'
import type { DeliveryCard } from './models/deliveryCards'
import { DeliveryCardsService } from './data/deliveryCards'
import { DeliveryResultsService, type DeliveryResult } from './data/deliveryResults'
import { LearningReviewsService, type LearningReview } from './data/learningReviews'
import { retiredLearningIds } from './impact'
import { applyDecided, learningUsableIn, saveApply, useCountryApply } from './countryApply'
import { myName } from './history'
import { setActiveLearnings } from './aiSelect'
import { locale, optionLabel, useT } from './i18n'
import { countryOptions } from './status'
import { templateIdOf } from './results'
import { guessThemeType, themeTypeLabel, themeTypeOf, type ThemeType } from './themeTypes'

const useStyles = makeStyles({
  root: {
    display: 'grid',
    rowGap: '6px',
    padding: '6px 12px',
    marginBottom: '8px',
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  head: { display: 'flex', alignItems: 'center', columnGap: '10px', flexWrap: 'wrap', fontSize: tokens.fontSizeBase200 },
  title: { display: 'inline-flex', alignItems: 'center', columnGap: '6px', fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase300 },
  muted: { color: tokens.colorNeutralForeground3 },
  label: { color: tokens.colorNeutralForeground3 },
  // 「見る / 閉じる」は、件数のすぐ右(アラートの帯と同じ。右端だと遠い。X45)
  toggle: { minWidth: 'auto' },
  countBtn: { border: 'none', background: 'none', padding: 0, cursor: 'pointer', display: 'inline-flex' },
  list: { display: 'grid', rowGap: '6px', maxHeight: '220px', overflowY: 'auto', paddingBottom: '4px' },
  item: { display: 'grid', gridTemplateColumns: '150px minmax(0, 1fr)', columnGap: '12px', fontSize: tokens.fontSizeBase200 },
  itemHead: { display: 'grid', rowGap: '2px', color: tokens.colorNeutralForeground2 },
  itemNotes: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
  // ほかの国の学び(使えるかもしれない。ST5)。この国で使うかを、ここで決める
  otherHead: { fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground3, paddingTop: '4px' },
  otherActions: { display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', paddingTop: '2px' },
  // 左のバーのパネルの中(SU6): 枠なし・いつも開く。狭いので、日付と名前を本文の上に
  panel: { display: 'grid', rowGap: '8px', padding: '10px 12px', alignContent: 'start' },
  panelList: { display: 'grid', rowGap: '10px' },
  panelItem: { display: 'grid', rowGap: '4px', paddingBottom: '10px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, fontSize: tokens.fontSizeBase200 },
})

interface Props {
  /** 開いている配信(保存済みのもの) */
  card: DeliveryCard
  /** 画面で選んでいる値(保存前でも、選んだテンプレート・国・チャネル・言葉で探す) */
  templateId: string
  country: string
  channel: string
  name: string
  theme: string
  headline: string
  /** 配信情報の Type(テーマの種類。書きかけの値) */
  themeType?: string
  /** 学びの件数が変わったとき(シンプルな配信カードの左のバーの「学び」に出す) */
  onCount?: (n: number) => void
  /** シンプルな配信カードの左のバーのパネルの中に出す(SU6。枠なし・いつも開く) */
  panel?: boolean
}

interface Learning {
  id: string
  /** 出元の国(この配信の国と違えば、ほかの国の学び) */
  origin: string
  at: string
  name: string
  notes: string
  sameTemplate: boolean
  sameType: boolean
}

const MAX = 8

const countryName = (code: string) => optionLabel(countryOptions.find((o) => String(o.value) === code)?.label) || code

/**
 * 配信カードの「これまでの学び」。同じテンプレートか同じテーマの種類の、過去の配信の「次に生かすメモ」を出す(新しい順)。
 * 出している間は、AI の下書きの依頼にも、学びを渡す(setActiveLearnings)。テーマの種類も、ここで直せる。
 * 学びは共通で 1 つ持ち、国ごとに使うかを決める(ST5)。この国の学びは使い、ほかの国の学びは「使えるかもしれない学び」として並べて、人が使うかを決める
 */
export function LearningsBar({ card, templateId, country, channel, name, theme, headline, themeType, onCount, panel = false }: Props) {
  const styles = useStyles()
  const t = useT()
  const [cards, setCards] = useState<DeliveryCard[]>([])
  const [results, setResults] = useState<DeliveryResult[]>([])
  // 学びの判定(結果の面の「効果」で、外した学びは、ここにも AI にも出さない)
  const [reviews, setReviews] = useState<LearningReview[]>([])
  const [open, setOpen] = useState(false)
  const [deciding, setDeciding] = useState<string | null>(null)
  useCountryApply()
  // テーマの種類: 配信情報の Type(書きかけの値)。なければ、いま画面にある言葉から推し量る(X41。直すのは配信情報)
  const type: { type: ThemeType; guessed: boolean } = themeType
    ? themeTypeOf({ ...card, theme_type: themeType })
    : { type: guessThemeType({ name: name, theme: theme, headline: headline }), guessed: true }

  useEffect(() => {
    DeliveryResultsService.getAll()
      .then((res) => res.success && setResults(res.data ?? []))
      .catch(() => undefined)
    LearningReviewsService.getAll()
      .then((res) => res.success && setReviews(res.data ?? []))
      .catch(() => undefined)
    DeliveryCardsService.getAll()
      .then((res) => res.success && setCards(res.data ?? []))
      .catch(() => undefined)
  }, [])

  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards])
  // 学び(配信結果の id)の出元の国
  const originOf = useMemo(() => {
    const m = new Map(results.map((r) => [r.id, String(byId.get(r.delivery_card_id ?? '')?.country ?? '')]))
    return (id: string) => m.get(id) ?? ''
  }, [results, byId])
  // この国で外した学び(ほかの国の学びは、出元の国で外したものも勧めない)
  const retired = useMemo(() => retiredLearningIds(reviews, country, originOf), [reviews, country, originOf])
  const retiredAtOrigin = useMemo(() => retiredLearningIds(reviews, '', originOf), [reviews, originOf])
  // 同じチャネルで、同じテンプレートか同じテーマの種類の、過去の配信の学び(国はまだ見ない)
  const matching: Learning[] = useMemo(
    () =>
      results
        .filter((r) => r.notes?.trim() && r.delivery_card_id && r.delivery_card_id !== card.id)
        .flatMap((r): Learning[] => {
          const c = byId.get(r.delivery_card_id!)
          if (!c || String(c.channel ?? '') !== channel) return []
          const sameTemplate = templateIdOf(c) === templateId
          const sameType = themeTypeOf(c).type === type.type
          if (!sameTemplate && !sameType) return []
          return [{ id: r.id, origin: String(c.country ?? ''), at: r.sent_at ?? c.scheduled_at ?? '', name: c.name ?? '', notes: r.notes!.trim(), sameTemplate, sameType }]
        })
        .sort((a, b) => b.at.localeCompare(a.at)),
    [byId, results, card.id, channel, templateId, type.type],
  )
  // 使う学び: この国の学び(外していなければ)と、この国で使うと決めたほかの国の学び
  const learnings = matching
    .filter((l) => !retired.has(l.id) && (l.origin === country ? learningUsableIn(l.id, l.origin, country) || !country : !!country && learningUsableIn(l.id, l.origin, country)))
    .slice(0, MAX)
  // 使えるかもしれない学び: ほかの国の学びで、この国ではまだ決めていないもの
  const candidates = country ? matching.filter((l) => l.origin !== country && !applyDecided('learning', l.id, country) && !retiredAtOrigin.has(l.id)).slice(0, MAX) : []
  const decide = async (l: Learning, use: boolean) => {
    if (
      !window.confirm(
        t(
          `${countryName(country)}の全員に効きます(⚙ →「国」→「使う学び」でも直せます)。よろしいですか?`,
          `This applies to everyone working on ${countryName(country)} (you can change it in ⚙ → Country → Learnings used). Continue?`,
        ),
      )
    )
      return
    setDeciding(l.id)
    try {
      await saveApply('learning', country, [{ id: l.id, use }], myName() || t('(名前なし)', '(no name)'))
    } finally {
      setDeciding(null)
    }
  }
  // 学びの並び(描くたびに配列を作るので、AI に渡し直すかは id の並びで見る)
  const learnKey = learnings.map((l) => l.id).join(',')

  // AI の下書きに、学びを渡す(この帯が出ている間だけ)
  useEffect(() => {
    setActiveLearnings(
      learnings.map((l) => `${l.at.slice(0, 10)} ${l.name}: ${l.notes.replace(/\n/g, ' / ')}`),
      learnings.map((l) => l.id),
      card.id,
    )
    return () => setActiveLearnings([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [learnKey, card.id])

  useEffect(() => {
    onCount?.(learnings.length)
  }, [learnings.length, onCount])

  const dateText = (iso: string) => (iso ? new Date(iso).toLocaleDateString(locale(), { year: 'numeric', month: 'numeric', day: 'numeric' }) : '')

  const itemMeta = (l: Learning) =>
    [l.sameTemplate ? t('同じテンプレート', 'Same template') : '', l.sameType ? t('同じ種類', 'Same type') : '', l.origin !== country ? t(`${countryName(l.origin)}の学び`, `From ${countryName(l.origin)}`) : ''].filter(Boolean).join(' / ')
  const typeLine = (
    <Tooltip
      content={t('テーマの種類。同じ種類の過去の配信の学びを集めるのに使います。「推定」は、言葉から推し量った仮の種類です', 'Theme type, used to find learnings from past deliveries of the same type. "guessed" is inferred from the wording.')}
      relationship="description"
    >
      <span className={styles.head}>
        <span className={styles.label}>{t('テーマの種類', 'Theme type')}</span>
        <span>{type.guessed ? t(`${themeTypeLabel(type.type)}(推定)`, `${themeTypeLabel(type.type)} (guessed)`) : themeTypeLabel(type.type)}</span>
      </span>
    </Tooltip>
  )
  const decideButtons = (l: Learning) => (
    <span className={styles.otherActions}>
      <Button size="small" disabled={deciding === l.id} onClick={() => void decide(l, true)}>
        {t(`${countryName(country)}で使う`, `Use in ${countryName(country)}`)}
      </Button>
      <Button size="small" appearance="subtle" disabled={deciding === l.id} onClick={() => void decide(l, false)}>
        {t('使わない', 'Don’t use')}
      </Button>
    </span>
  )

  if (panel)
    return (
      <div className={styles.panel}>
        <span className={styles.muted} style={{ fontSize: tokens.fontSizeBase200 }}>
          {learnings.length > 0
            ? t('同じテンプレートか同じテーマの種類の、過去の配信の「次に生かすメモ」。AI の下書きにも渡します', 'Notes for next time from past deliveries with the same template or theme type. Also passed to AI drafts.')
            : t('同じテンプレートか同じテーマの種類の、過去の配信の「次に生かすメモ」は、まだありません', 'No notes yet from past deliveries with the same template or theme type.')}
        </span>
        <span style={{ fontSize: tokens.fontSizeBase200 }}>{typeLine}</span>
        <div className={styles.panelList}>
          {learnings.map((l) => (
            <div key={l.id} className={styles.panelItem}>
              <span className={styles.muted}>{[dateText(l.at), l.name, itemMeta(l)].filter(Boolean).join(' · ')}</span>
              <span className={styles.itemNotes}>{l.notes}</span>
            </div>
          ))}
          {candidates.length > 0 && (
            <>
              <span className={styles.otherHead}>
                {t(
                  `ほかの国の学び(使えるかもしれない)。国で客層が違うので、${countryName(country)}で使うかを決めてください。使うと決めたものだけ、AI に渡します`,
                  `Learnings from other countries (may apply). Audiences differ by country, so decide whether to use each in ${countryName(country)}. Only the ones you use are passed to AI.`,
                )}
              </span>
              {candidates.map((l) => (
                <div key={l.id} className={styles.panelItem}>
                  <span className={styles.muted}>{[dateText(l.at), l.name, t(`${countryName(l.origin)}の学び`, `From ${countryName(l.origin)}`)].join(' · ')}</span>
                  <span className={styles.itemNotes}>{l.notes}</span>
                  {decideButtons(l)}
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    )

  return (
    <div className={styles.root}>
      <div className={styles.head}>
        <span className={styles.title}>
          <LightbulbRegular />
          {t('これまでの学び', 'Learnings so far')}
          {/* 件数を押しても開く */}
          {learnings.length > 0 ? (
            <button type="button" className={styles.countBtn} onClick={() => setOpen(!open)} aria-label={open ? t('学びを閉じる', 'Hide learnings') : t('学びを見る', 'Show learnings')}>
              <Badge appearance="tint" color="brand" size="small">
                {learnings.length}
              </Badge>
            </button>
          ) : (
            <Badge appearance="tint" color="informative" size="small">
              0
            </Badge>
          )}
        </span>
        {learnings.length + candidates.length > 0 && (
          <Button size="small" appearance="subtle" className={styles.toggle} icon={open ? <ChevronUpRegular /> : <ChevronDownRegular />} onClick={() => setOpen(!open)}>
            {open ? t('閉じる', 'Hide') : t('見る', 'Show')}
          </Button>
        )}
        <span className={styles.muted}>
          {learnings.length > 0
            ? t('同じテンプレートか同じテーマの種類の、過去の配信の「次に生かすメモ」。AI の下書きにも渡します', 'Notes for next time from past deliveries with the same template or theme type. Also passed to AI drafts.')
            : t('同じテンプレートか同じテーマの種類の、過去の配信の「次に生かすメモ」は、まだありません', 'No notes yet from past deliveries with the same template or theme type.')}
          {candidates.length > 0 && t(`(ほかの国の、使えるかもしれない学びが ${candidates.length} 件)`, ` (${candidates.length} learning(s) from other countries may apply)`)}
        </span>
        {typeLine}
      </div>
      {open && (
        <div className={styles.list}>
          {learnings.map((l) => (
            <div key={l.id} className={styles.item}>
              <span className={styles.itemHead}>
                <span>{dateText(l.at)}</span>
                <span>{l.name}</span>
                <span className={styles.muted}>{itemMeta(l)}</span>
              </span>
              <span className={styles.itemNotes}>{l.notes}</span>
            </div>
          ))}
          {candidates.length > 0 && (
            <>
              <span className={styles.otherHead}>
                {t(
                  `ほかの国の学び(使えるかもしれない)。国で客層が違うので、${countryName(country)}で使うかを決めてください。使うと決めたものだけ、AI に渡します`,
                  `Learnings from other countries (may apply). Audiences differ by country, so decide whether to use each in ${countryName(country)}. Only the ones you use are passed to AI.`,
                )}
              </span>
              {candidates.map((l) => (
                <div key={l.id} className={styles.item}>
                  <span className={styles.itemHead}>
                    <span>{dateText(l.at)}</span>
                    <span>{l.name}</span>
                    <span className={styles.muted}>{t(`${countryName(l.origin)}の学び`, `From ${countryName(l.origin)}`)}</span>
                  </span>
                  <span>
                    <span className={styles.itemNotes}>{l.notes}</span>
                    {decideButtons(l)}
                  </span>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
