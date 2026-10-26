import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Dialog, DialogBody, DialogContent, DialogTitle, InfoLabel, SearchBox, Tooltip, makeStyles, tokens } from '@fluentui/react-components'
import { AddRegular, ChevronDownRegular, ChevronUpRegular, DismissRegular, LightbulbRegular } from '@fluentui/react-icons'
import type { DeliveryCard } from './models/deliveryCards'
import { DeliveryCardsService } from './data/deliveryCards'
import { applyDecided, saveApply, useCountryApply } from './countryApply'
import { myName } from './history'
import { setActiveLearnings } from './aiSelect'
import { day, optionLabel, useT } from './i18n'
import { countryOptions } from './status'
import { guessThemeType, themeTypeLabel, themeTypeOf, type ThemeType } from './themeTypes'
import { confirmDialog } from './confirm'
import { useLearningCards } from './useLearningCards'
import { equippedIds, loadCardLearnings, saveCardLearning, type EquipOverrides } from './learningEquip'
import { sortLearningCards, type LearningCardData } from './learningCards'
import { LearningCard } from './LearningCard'
import { ListHeader } from './ListHeader'
import { ResizableSurface } from './ResizableSurface'
import { PaneSpinner } from './PaneSpinner'
import { typo } from './typo'
import { useJustAdded } from './useJustAdded'

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
  muted: { color: tokens.colorNeutralForeground3 },
  caption: typo.caption,
  label: typo.label,
  heading: typo.heading,
  // 「見る / 閉じる」は、件数のすぐ右(アラートの帯と同じ。右端だと遠い。X45)
  toggle: { minWidth: 'auto' },
  // 装備中の学び(X78)。小さなカードを並べる(帯の中は横に、左のバーのパネルの中は縦に 1 列)
  equipped: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '8px', maxHeight: '260px', overflowY: 'auto', paddingBottom: '4px' },
  equippedPanel: { display: 'grid', rowGap: '8px' },
  item: { display: 'grid', gridTemplateColumns: '150px minmax(0, 1fr)', columnGap: '12px', fontSize: tokens.fontSizeBase200 },
  itemHead: { display: 'grid', rowGap: '2px', color: tokens.colorNeutralForeground2 },
  itemNotes: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
  // ほかの国の学び(使えるかもしれない。ST5)。この国で使うかを、ここで決める
  otherHead: { ...typo.label, paddingTop: '4px' },
  otherActions: { display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', paddingTop: '2px' },
  // 左のバーのパネルの中(SU6): 枠なし・いつも開く。狭いので、日付と名前を本文の上に。余白は左のバーのほかのパネルと同じ(simple-ui-review-2 の 20)
  panel: { display: 'grid', rowGap: '12px', padding: '12px 14px', alignContent: 'start' },
  panelList: { display: 'grid', rowGap: '10px' },
  panelItem: { display: 'grid', rowGap: '4px', paddingBottom: '10px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, fontSize: tokens.fontSizeBase200 },
  // 学びを足す窓(手札から選ぶ。大きさを変えられる)
  surface: { width: 'min(980px, (92vw / var(--ui-zoom, 1)))', maxWidth: 'none', height: 'calc(80vh / var(--ui-zoom, 1))', display: 'flex', flexDirection: 'column' },
  pickBody: { display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 },
  pickHead: { display: 'flex', alignItems: 'center', gap: '8px' },
  grow: { flex: 1 },
  pickContent: { display: 'grid', rowGap: '10px', alignContent: 'start', overflowY: 'auto', minHeight: 0, flex: 1 },
  pickGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '10px', alignItems: 'start' },
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
  /** 学びの元の配信の結果を開く(パネルのカードの「根拠 1 本」) */
  onOpenSource?: (cardId: string) => void
  /** 学びの効き目(結果の面の「効果」の「学び」のタブで、その学び)を開く(パネルのカードの「効き目を見る」) */
  onOpenImpact?: (learningId: string) => void
}

// 自動で付ける学びの数の上限(人が付けた学びは、上限に数えない)
const MAX = 8

const countryName = (code: string) => optionLabel(countryOptions.find((o) => String(o.value) === code)?.label) || code

/**
 * 配信カードの「この配信に使う学び」(X78 で、装備中の学びのカードに。2026-10-26 に「これまでの学び」から改めた)。
 * 同じチャネルで、同じテンプレートか同じテーマの種類の、過去の配信の学び(新しい順に最大 8 件)を、自動で装備する。
 * 人は、外す(この配信の AI に渡さない)・手札から付ける(渡す)ができ、表 card_learnings に残す。
 * 装備中の学びは、AI の下書きの依頼に渡す(setActiveLearnings)。テーマの種類も、ここで直せる。
 * 学びは共通で 1 つ持ち、国ごとに使うかを決める(ST5)。この国で休ませた・外した学びは自動では付けない。
 * ほかの国の学びは「使えるかもしれない学び」として並べて、人が使うかを決める
 */
export function LearningsBar({ card, templateId, country, channel, name, theme, headline, themeType, onCount, panel = false, onOpenSource, onOpenImpact }: Props) {
  const styles = useStyles()
  const t = useT()
  const [cards, setCards] = useState<DeliveryCard[]>([])
  // 読み込み中は、空の案内ではなく読み込み中の印を出す(simple-ui-review-2 の 24)
  const [loaded, setLoaded] = useState(false)
  const justAdded = useJustAdded()
  const [open, setOpen] = useState(false)
  const [deciding, setDeciding] = useState<string | null>(null)
  const [overrides, setOverrides] = useState<EquipOverrides>(new Map())
  const [busy, setBusy] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const [query, setQuery] = useState('')
  useCountryApply()
  // テーマの種類: 配信情報の Type(書きかけの値)。なければ、いま画面にある言葉から推し量る(X41。直すのは配信情報)
  const type: { type: ThemeType; guessed: boolean } = themeType
    ? themeTypeOf({ ...card, theme_type: themeType })
    : { type: guessThemeType({ name: name, theme: theme, headline: headline }), guessed: true }

  useEffect(() => {
    DeliveryCardsService.getAll()
      .then((res) => res.success && setCards(res.data ?? []))
      .catch(() => undefined)
      .finally(() => setLoaded(true))
  }, [])
  const loadOverrides = useCallback(() => {
    loadCardLearnings(card.id)
      .then(setOverrides)
      .catch(() => undefined)
  }, [card.id])
  useEffect(loadOverrides, [loadOverrides])

  // すべての学び(この国での状態・強さつき)。この配信の学びは、自分には付けない
  const { cards: all, canonical } = useLearningCards(cards, country)
  const others = useMemo(() => all.filter((l) => l.source.id !== card.id), [all, card.id])
  const byId = useMemo(() => new Map(others.map((l) => [l.id, l])), [others])
  // 同じチャネルで、同じテンプレートか同じテーマの種類の学び(新しい順)
  const matching = useMemo(
    () => sortLearningCards(others.filter((l) => l.channel === channel && (l.templateId === templateId || l.themeType === type.type)), 'newest'),
    [others, channel, templateId, type.type],
  )
  // 自動で付ける学び: この国で使う学びのうち、休ませた・外したもの以外
  const auto = matching.filter((l) => l.inDeck && l.state === 'use').slice(0, MAX)
  // 装備中: 自動 − 外したもの + 付けたもの(外した学び・この国で使わない学びは、付けていても渡さない)
  // 付け外しの行が、まとめた元の学びのものなら、まとめた先の学びのものとして読む(X78 の似た学びのまとめ)
  const ownOverrides: EquipOverrides = new Map([...overrides].map(([id, mode]) => [canonical(id), mode]))
  const learnings = equippedIds(
    auto.map((l) => l.id),
    ownOverrides,
  )
    .map((id) => byId.get(id))
    .filter((l): l is LearningCardData => !!l && l.inDeck && l.state !== 'retired')
  // 使えるかもしれない学び: ほかの国の学びで、この国ではまだ決めていないもの(出元の国で外したものは勧めない)
  const candidates = country ? matching.filter((l) => l.origin !== country && !applyDecided('learning', l.id, country) && l.state !== 'retired').slice(0, MAX) : []
  // 付けられる学び(手札): この国で使う学びで、外していない・まだ付けていないもの
  const pickable = useMemo(() => {
    const on = new Set(learnings.map((l) => l.id))
    const q = query.trim().toLowerCase()
    return sortLearningCards(
      others.filter((l) => l.inDeck && l.state !== 'retired' && !on.has(l.id) && (!q || `${l.title}\n${l.notes}\n${l.source.name ?? ''}`.toLowerCase().includes(q))),
      'strength',
    )
  }, [others, learnings, query])

  const decide = async (l: LearningCardData, use: boolean) => {
    if (
      !(await confirmDialog(
        t(
          `${countryName(country)}の全員に効きます(⚙ →「国」→「使う学び」でも直せます)。よろしいですか?`,
          `This applies to everyone working on ${countryName(country)} (you can change it in ⚙ → Country → Learnings used). Continue?`,
        ),
      ))
    )
      return
    setDeciding(l.id)
    try {
      await saveApply('learning', country, [{ id: l.id, use }], myName() || t('(名前なし)', '(no name)'))
    } finally {
      setDeciding(null)
    }
  }
  // 付ける・外す(この配信だけ。ほかの配信・国には効かないので、確かめない)
  const equip = async (l: LearningCardData, on: boolean) => {
    setBusy(l.id)
    try {
      await saveCardLearning(card.id, l.id, on ? 'equip' : 'unequip', myName() || t('(名前なし)', '(no name)'))
      // 足した学びは、装備中のいちばん上に出し、少しのあいだ印を付ける(画面の部品の決まり 1)
      if (on) justAdded.mark(l.id)
    } finally {
      setBusy(null)
      loadOverrides()
    }
  }
  // 学びの並び(描くたびに配列を作るので、AI に渡し直すかは id の並びで見る)
  const learnKey = learnings.map((l) => l.id).join(',')

  // AI の下書きに、装備中の学びを渡す(この帯が出ている間だけ)
  useEffect(() => {
    setActiveLearnings(
      learnings.map((l) => `${l.sentAt.slice(0, 10)} ${l.source.name ?? ''}: ${l.notes.replace(/\n/g, ' / ')}`),
      learnings.map((l) => l.id),
      card.id,
    )
    return () => setActiveLearnings([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [learnKey, card.id])

  useEffect(() => {
    onCount?.(learnings.length)
  }, [learnings.length, onCount])


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
  const decideButtons = (l: LearningCardData) => (
    <span className={styles.otherActions}>
      <Button size="small" disabled={deciding === l.id} onClick={() => void decide(l, true)}>
        {t(`${countryName(country)}で使う`, `Use in ${countryName(country)}`)}
      </Button>
      <Button size="small" appearance="subtle" disabled={deciding === l.id} onClick={() => void decide(l, false)}>
        {t('使わない', 'Don’t use')}
      </Button>
    </span>
  )
  // 見出しの下に長い説明を並べない。説明は見出しの横の ⓘ に(X72。simple-ui-review-2 の 21)
  const info = t(
    '同じチャネルで、同じテンプレートか同じテーマの種類の、過去の配信の学びを自動で足します。足した学びは、この配信の AI の下書きに渡します。× で外すと、この配信だけ渡しません',
    'Learnings from past deliveries on the same channel with the same template or theme type are added automatically and passed to AI drafts for this delivery. × removes one for this delivery only.',
  )
  // パネルでは、パネルの題(「この配信に使う学び」)と重なるので、見出しの代わりに件数だけ(2026-10-26 利用者)
  const title = (
    <InfoLabel label={{ className: panel ? styles.label : styles.heading }} info={info}>
      {panel ? t(`${learnings.length} 件`, `${learnings.length}`) : t('この配信に使う学び', 'Learnings for this delivery')}
    </InfoLabel>
  )
  const empty = (
    <span className={styles.caption}>{t('同じテンプレートか同じテーマの種類の、過去の配信の学びは、まだありません', 'No learnings yet from past deliveries with the same template or theme type')}</span>
  )
  const equippedCards = (
    <div className={panel ? styles.equippedPanel : styles.equipped}>
      {justAdded.order(learnings, (l) => l.id).map((l) => (
        <LearningCard
          key={l.id}
          data={l}
          className={justAdded.freshClass(l.id)}
          // パネルでは、中身(メモ)と効き目(強さ・リフト率の差)を出し、結果の詳しい所へ行けるように。帯は狭いので小さいまま(2026-10-26 利用者: 学びの中身が分からないのは不便)
          compact={!panel}
          onOpenSource={panel ? onOpenSource : undefined}
          onOpenImpact={panel ? onOpenImpact : undefined}
          actions={
            <Button size="small" appearance="subtle" icon={<DismissRegular />} disabled={busy === l.id} onClick={() => void equip(l, false)} aria-label={t(`「${l.title}」を外す`, `Remove "${l.title}"`)} title={t('この配信では外す(AI に渡さない)', 'Remove for this delivery (not passed to AI)')} />
          }
        />
      ))}
    </div>
  )
  const candidateList = candidates.length > 0 && (
    <>
      <InfoLabel
        className={styles.otherHead}
        size="small"
        info={t(
          `国で客層が違うので、${countryName(country)}で使うかを決めてください。使うと決めたものだけ、AI に渡します`,
          `Audiences differ by country, so decide whether to use each in ${countryName(country)}. Only the ones you use are passed to AI.`,
        )}
      >
        {t('ほかの国の学び(使えるかもしれない)', 'Learnings from other countries (may apply)')}
      </InfoLabel>
      {candidates.map((l) =>
        panel ? (
          <div key={l.id} className={styles.panelItem}>
            <span className={styles.muted}>{[day(l.sentAt), l.source.name ?? '', t(`${countryName(l.origin)}の学び`, `From ${countryName(l.origin)}`)].join(' · ')}</span>
            <span className={styles.itemNotes}>{l.notes}</span>
            {decideButtons(l)}
          </div>
        ) : (
          <div key={l.id} className={styles.item}>
            <span className={styles.itemHead}>
              <span>{day(l.sentAt)}</span>
              <span>{l.source.name ?? ''}</span>
              <span className={styles.muted}>{t(`${countryName(l.origin)}の学び`, `From ${countryName(l.origin)}`)}</span>
            </span>
            <span>
              <span className={styles.itemNotes}>{l.notes}</span>
              {decideButtons(l)}
            </span>
          </div>
        ),
      )}
    </>
  )
  // 手札から付ける窓
  const picker = (
    <Dialog open={picking} onOpenChange={(_, d) => !d.open && setPicking(false)}>
      <ResizableSurface sizeKey="learningPick" className={styles.surface} aria-label={t('学びを足す', 'Add a learning')}>
        <DialogBody className={styles.pickBody}>
          <div className={styles.pickHead}>
            <DialogTitle className={styles.grow}>
              <InfoLabel
                size="large"
                weight="semibold"
                info={t(`${countryName(country)}で使う学びから選びます(強い順)。足すと、この配信の AI の下書きに渡します`, `Choose from learnings used in ${countryName(country)} (strongest first). Added learnings are passed to AI drafts for this delivery.`)}
              >
                {t('学びを足す', 'Add a learning')}
              </InfoLabel>
            </DialogTitle>
            <Button appearance="subtle" icon={<DismissRegular />} onClick={() => setPicking(false)} aria-label={t('閉じる', 'Close')} />
          </div>
          <DialogContent className={styles.pickContent}>
            <SearchBox size="small" placeholder={t('名前・メモ・配信名で探す', 'Search name, note or delivery')} value={query} onChange={(_, d) => setQuery(d.value)} />
            {pickable.length === 0 ? (
              <span className={styles.caption}>{t('足せる学びはありません', 'No learnings to add')}</span>
            ) : (
              <div className={styles.pickGrid}>
                {pickable.map((l) => (
                  <LearningCard
                    key={l.id}
                    data={l}
                    actions={
                      <Button size="small" icon={<AddRegular />} disabled={busy === l.id} onClick={() => void equip(l, true)}>
                        {t('足す', 'Add')}
                      </Button>
                    }
                  />
                ))}
              </div>
            )}
          </DialogContent>
        </DialogBody>
      </ResizableSurface>
    </Dialog>
  )
  const header = (
    <ListHeader
      icon={panel ? undefined : <LightbulbRegular />}
      title={title}
      count={panel ? undefined : learnings.length}
      addLabel={t('学びを足す', 'Add a learning')}
      onAdd={() => setPicking(true)}
      actions={
        !panel &&
        learnings.length + candidates.length > 0 && (
          <Button size="small" appearance="subtle" className={styles.toggle} icon={open ? <ChevronUpRegular /> : <ChevronDownRegular />} onClick={() => setOpen(!open)}>
            {open ? t('閉じる', 'Hide') : t('見る', 'Show')}
          </Button>
        )
      }
    />
  )

  if (panel)
    return (
      <div className={styles.panel}>
        {/* パネルでも、足すボタンは見出しの右(ListHeader。画面の部品の決まり 1。simple-ui-review-2 の 29) */}
        {header}
        {typeLine}
        {!loaded ? (
          <PaneSpinner />
        ) : (
          <>
            {learnings.length === 0 && empty}
            {equippedCards}
            <div className={styles.panelList}>{candidateList}</div>
          </>
        )}
        {picker}
      </div>
    )

  return (
    <div className={styles.root}>
      {header}
      <div className={styles.head}>
        {loaded && learnings.length === 0 && empty}
        {candidates.length > 0 && <span className={styles.caption}>{t(`ほかの国の、使えるかもしれない学びが ${candidates.length} 件`, `${candidates.length} learning(s) from other countries may apply`)}</span>}
        {typeLine}
      </div>
      {open && (
        <>
          {equippedCards}
          {candidateList}
        </>
      )}
      {picker}
    </div>
  )
}
