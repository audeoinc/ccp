import { useEffect, useMemo, useState } from 'react'
import { Badge, Button, Tooltip, makeStyles, tokens } from '@fluentui/react-components'
import { ChevronDownRegular, ChevronUpRegular, LightbulbRegular } from '@fluentui/react-icons'
import type { DeliveryCard } from './models/deliveryCards'
import { DeliveryCardsService } from './data/deliveryCards'
import { DeliveryResultsService, type DeliveryResult } from './data/deliveryResults'
import { LearningReviewsService, type LearningReview } from './data/learningReviews'
import { retiredLearningIds } from './impact'
import { setActiveLearnings } from './aiSelect'
import { locale, useT } from './i18n'
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
}

interface Learning {
  id: string
  at: string
  name: string
  notes: string
  sameTemplate: boolean
  sameType: boolean
}

const MAX = 8

/**
 * 配信カードの「これまでの学び」。同じテンプレートか同じテーマの種類の、過去の配信の「次に生かすメモ」を出す(新しい順)。
 * 出している間は、AI の下書きの依頼にも、学びを渡す(setActiveLearnings)。テーマの種類も、ここで直せる
 */
export function LearningsBar({ card, templateId, country, channel, name, theme, headline, themeType }: Props) {
  const styles = useStyles()
  const t = useT()
  const [cards, setCards] = useState<DeliveryCard[]>([])
  const [results, setResults] = useState<DeliveryResult[]>([])
  // 学びの判定(結果の面の「効果」で、外した学びは、ここにも AI にも出さない)
  const [reviews, setReviews] = useState<LearningReview[]>([])
  const [open, setOpen] = useState(false)
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

  const retired = useMemo(() => retiredLearningIds(reviews), [reviews])
  const learnings: Learning[] = useMemo(() => {
    const byId = new Map(cards.map((c) => [c.id, c]))
    return results
      .filter((r) => r.notes?.trim() && r.delivery_card_id && r.delivery_card_id !== card.id && !retired.has(r.id))
      .flatMap((r): Learning[] => {
        const c = byId.get(r.delivery_card_id!)
        if (!c || String(c.country ?? '') !== country || String(c.channel ?? '') !== channel) return []
        const sameTemplate = templateIdOf(c) === templateId
        const sameType = themeTypeOf(c).type === type.type
        if (!sameTemplate && !sameType) return []
        return [{ id: r.id, at: r.sent_at ?? c.scheduled_at ?? '', name: c.name ?? '', notes: r.notes!.trim(), sameTemplate, sameType }]
      })
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, MAX)
  }, [cards, results, retired, card.id, country, channel, templateId, type.type])

  // AI の下書きに、学びを渡す(この帯が出ている間だけ)
  useEffect(() => {
    setActiveLearnings(
      learnings.map((l) => `${l.at.slice(0, 10)} ${l.name}: ${l.notes.replace(/\n/g, ' / ')}`),
      learnings.map((l) => l.id),
      card.id,
    )
    return () => setActiveLearnings([])
  }, [learnings, card.id])

  const dateText = (iso: string) => (iso ? new Date(iso).toLocaleDateString(locale(), { year: 'numeric', month: 'numeric', day: 'numeric' }) : '')

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
        {learnings.length > 0 && (
          <Button size="small" appearance="subtle" className={styles.toggle} icon={open ? <ChevronUpRegular /> : <ChevronDownRegular />} onClick={() => setOpen(!open)}>
            {open ? t('閉じる', 'Hide') : t('見る', 'Show')}
          </Button>
        )}
        <span className={styles.muted}>
          {learnings.length > 0
            ? t('同じテンプレートか同じテーマの種類の、過去の配信の「次に生かすメモ」。AI の下書きにも渡します', 'Notes for next time from past deliveries with the same template or theme type. Also passed to AI drafts.')
            : t('同じテンプレートか同じテーマの種類の、過去の配信の「次に生かすメモ」は、まだありません', 'No notes yet from past deliveries with the same template or theme type.')}
        </span>
        <Tooltip
          content={t('テーマの種類。同じ種類の過去の配信の学びを集めるのに使います。「推定」は、言葉から推し量った仮の種類です', 'Theme type, used to find learnings from past deliveries of the same type. "guessed" is inferred from the wording.')}
          relationship="description"
        >
          <span className={styles.head}>
            <span className={styles.label}>{t('テーマの種類', 'Theme type')}</span>
            <span>{type.guessed ? t(`${themeTypeLabel(type.type)}(推定)`, `${themeTypeLabel(type.type)} (guessed)`) : themeTypeLabel(type.type)}</span>
          </span>
        </Tooltip>
      </div>
      {open && (
        <div className={styles.list}>
          {learnings.map((l) => (
            <div key={l.id} className={styles.item}>
              <span className={styles.itemHead}>
                <span>{dateText(l.at)}</span>
                <span>{l.name}</span>
                <span className={styles.muted}>
                  {[l.sameTemplate ? t('同じテンプレート', 'Same template') : '', l.sameType ? t('同じ種類', 'Same type') : ''].filter(Boolean).join(' / ')}
                </span>
              </span>
              <span className={styles.itemNotes}>{l.notes}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
