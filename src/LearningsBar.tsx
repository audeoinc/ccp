import { useEffect, useMemo, useState } from 'react'
import { Badge, Button, Select, Tooltip, makeStyles, tokens } from '@fluentui/react-components'
import { ChevronDownRegular, ChevronUpRegular, LightbulbRegular } from '@fluentui/react-icons'
import type { Cr854_deliverycards } from './generated/models/Cr854_deliverycardsModel'
import { Cr854_deliverycardsService } from './generated/services/Cr854_deliverycardsService'
import { Cr854_deliveryresultsService, type Cr854_deliveryresults } from './gcpdata/Cr854_deliveryresultsService'
import { setActiveLearnings } from './aiSelect'
import { locale, useT } from './i18n'
import { templateIdOf } from './results'
import { THEME_TYPES, guessThemeType, themeTypeLabel, themeTypeOf, type ThemeType } from './themeTypes'

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
  toggle: { marginLeft: 'auto' },
  list: { display: 'grid', rowGap: '6px', maxHeight: '220px', overflowY: 'auto', paddingBottom: '4px' },
  item: { display: 'grid', gridTemplateColumns: '150px minmax(0, 1fr)', columnGap: '12px', fontSize: tokens.fontSizeBase200 },
  itemHead: { display: 'grid', rowGap: '2px', color: tokens.colorNeutralForeground2 },
  itemNotes: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
})

interface Props {
  /** 開いている配信(保存済みのもの) */
  card: Cr854_deliverycards
  /** 画面で選んでいる値(保存前でも、選んだテンプレート・国・チャネル・言葉で探す) */
  templateId: string
  country: string
  channel: string
  name: string
  theme: string
  headline: string
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
export function LearningsBar({ card, templateId, country, channel, name, theme, headline }: Props) {
  const styles = useStyles()
  const t = useT()
  const [cards, setCards] = useState<Cr854_deliverycards[]>([])
  const [results, setResults] = useState<Cr854_deliveryresults[]>([])
  const [open, setOpen] = useState(false)
  // テーマの種類: 保存済みの値(ここで直したら、その値)。なければ、いま画面にある言葉から推し量る
  const [savedType, setSavedType] = useState<string | undefined>(card.cr854_themetype)
  const type: { type: ThemeType; guessed: boolean } = savedType
    ? themeTypeOf({ ...card, cr854_themetype: savedType })
    : { type: guessThemeType({ cr854_name: name, cr854_theme: theme, cr854_headline: headline }), guessed: true }

  useEffect(() => {
    Cr854_deliveryresultsService.getAll()
      .then((res) => res.success && setResults(res.data ?? []))
      .catch(() => undefined)
    Cr854_deliverycardsService.getAll()
      .then((res) => res.success && setCards(res.data ?? []))
      .catch(() => undefined)
  }, [])

  const learnings: Learning[] = useMemo(() => {
    const byId = new Map(cards.map((c) => [c.cr854_deliverycardid, c]))
    return results
      .filter((r) => r.cr854_notes?.trim() && r._cr854_deliverycard_value && r._cr854_deliverycard_value !== card.cr854_deliverycardid)
      .flatMap((r): Learning[] => {
        const c = byId.get(r._cr854_deliverycard_value!)
        if (!c || String(c.cr854_country ?? '') !== country || String(c.cr854_channel ?? '') !== channel) return []
        const sameTemplate = templateIdOf(c) === templateId
        const sameType = themeTypeOf(c).type === type.type
        if (!sameTemplate && !sameType) return []
        return [{ id: r.cr854_deliveryresultid, at: r.cr854_sentat ?? c.cr854_scheduledat ?? '', name: c.cr854_name ?? '', notes: r.cr854_notes!.trim(), sameTemplate, sameType }]
      })
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, MAX)
  }, [cards, results, card.cr854_deliverycardid, country, channel, templateId, type.type])

  // AI の下書きに、学びを渡す(この帯が出ている間だけ)
  useEffect(() => {
    setActiveLearnings(learnings.map((l) => `${l.at.slice(0, 10)} ${l.name}: ${l.notes.replace(/\n/g, ' / ')}`))
    return () => setActiveLearnings([])
  }, [learnings])

  const saveType = async (v: ThemeType) => {
    const res = await Cr854_deliverycardsService.update(card.cr854_deliverycardid, { cr854_themetype: v })
    if (res.success) setSavedType(v)
  }
  const dateText = (iso: string) => (iso ? new Date(iso).toLocaleDateString(locale(), { year: 'numeric', month: 'numeric', day: 'numeric' }) : '')

  return (
    <div className={styles.root}>
      <div className={styles.head}>
        <span className={styles.title}>
          <LightbulbRegular />
          {t('これまでの学び', 'Learnings so far')}
          <Badge appearance="tint" color={learnings.length > 0 ? 'brand' : 'informative'} size="small">
            {learnings.length}
          </Badge>
        </span>
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
            <Select size="small" aria-label={t('テーマの種類', 'Theme type')} value={type.guessed ? '' : type.type} onChange={(_, d) => d.value && void saveType(d.value as ThemeType)}>
              {type.guessed && <option value="">{t(`${themeTypeLabel(type.type)}(推定)`, `${themeTypeLabel(type.type)} (guessed)`)}</option>}
              {THEME_TYPES.map((v) => (
                <option key={v} value={v}>{themeTypeLabel(v)}</option>
              ))}
            </Select>
          </span>
        </Tooltip>
        {learnings.length > 0 && (
          <Button size="small" appearance="subtle" className={styles.toggle} icon={open ? <ChevronUpRegular /> : <ChevronDownRegular />} onClick={() => setOpen(!open)}>
            {open ? t('閉じる', 'Hide') : t('見る', 'Show')}
          </Button>
        )}
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
