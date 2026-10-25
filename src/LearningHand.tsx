// 結果の面の見せ方「学び」(X78 の手札)。すべての学びを、カードで並べる。
// 学びの元は配信の結果なので、結果の面に置く(利用者と決めた 2026-10-25)。国を選んでいれば、その国での状態・強さで並べる
import { useMemo, useState } from 'react'
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Dropdown,
  Field,
  Input,
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  Option,
  SearchBox,
  Spinner,
  Switch,
  makeStyles,
  tokens,
} from '@fluentui/react-components'
import { MoreHorizontalRegular } from '@fluentui/react-icons'
import type { DeliveryCard } from './models/deliveryCards'
import { DeliveryResultsService } from './data/deliveryResults'
import { LearningReviewsService } from './data/learningReviews'
import { optionLabel, tr, useT } from './i18n'
import { channelOptions, countryOptions } from './status'
import { THEME_TYPES, themeTypeLabel } from './themeTypes'
import { myName } from './history'
import { confirmDialog } from './confirm'
import { LearningCard } from './LearningCard'
import { useLearningCards } from './useLearningCards'
import { sortLearningCards, stateLabel, type LearningCardData, type LearningSort, type LearningState } from './learningCards'

const useStyles = makeStyles({
  root: { display: 'grid', rowGap: '12px' },
  bar: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' },
  filter: { minWidth: '140px' },
  count: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '12px', alignItems: 'start' },
  empty: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200, padding: '24px 0' },
})

interface Props {
  allCards: DeliveryCard[]
  /** ヘッダーで選んでいる国(空 = すべての国) */
  country: string
  /** 根拠の配信の結果を開く(配信カードの id) */
  onOpenResult: (cardId: string) => void
}

const countryName = (code: string) => optionLabel(countryOptions.find((o) => String(o.value) === code)?.label) || code
// 状態を、学びの判定の値に(使う = 残す。様子を見るも「使う」と数える。利用者と決めた 2026-10-25)
const STATUS_OF = { use: 'keep', resting: 'resting', retired: 'retired' } as const

export function LearningHand({ allCards, country, onOpenResult }: Props) {
  const s = useStyles()
  const t = useT()
  const { cards, loading, error, reload } = useLearningCards(allCards, country)
  const [query, setQuery] = useState('')
  const [channel, setChannel] = useState('')
  const [type, setType] = useState('')
  const [state, setState] = useState<LearningState | ''>('')
  const [deckOnly, setDeckOnly] = useState(false)
  const [sort, setSort] = useState<LearningSort>('strength')
  const [busy, setBusy] = useState<string | null>(null)
  const [naming, setNaming] = useState<{ card: LearningCardData; title: string } | null>(null)

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = cards.filter(
      (l) =>
        (!q || `${l.title}\n${l.notes}\n${l.source.name ?? ''}`.toLowerCase().includes(q)) &&
        (!channel || l.channel === channel) &&
        (!type || l.themeType === type) &&
        (!state || l.state === state) &&
        (!deckOnly || l.inDeck),
    )
    return sortLearningCards(list, sort)
  }, [cards, query, channel, type, state, deckOnly, sort])

  const changeState = async (l: LearningCardData, next: LearningState) => {
    // 状態は学びと国の組ごと。国を選んでいなければ、出元の国の状態を変える
    const at = country && l.inDeck ? country : l.origin
    if (
      !(await confirmDialog(
        tr(
          `「${l.title}」を${countryName(at)}で「${stateLabel(next)}」にします。${countryName(at)}の全員の配信に効きます。よろしいですか?`,
          `Set "${l.title}" to "${stateLabel(next)}" in ${countryName(at)}. This affects everyone's deliveries in ${countryName(at)}. Continue?`,
        ),
      ))
    )
      return
    setBusy(l.id)
    const fields = { learning_id: l.id, status: STATUS_OF[next], reason: tr('学びのカードで変えた', 'Changed on the learning card'), decided_at: new Date().toISOString(), country: at, decided_by: myName() || undefined }
    try {
      // その国の行があれば直し、なければ作る(結果の面の「効果」の ④ と同じ)
      if (l.review && l.review.country === at) await LearningReviewsService.update(l.review.id, fields)
      else await LearningReviewsService.create(fields)
    } finally {
      setBusy(null)
      reload()
    }
  }

  const saveTitle = async () => {
    if (!naming) return
    setBusy(naming.card.id)
    try {
      await DeliveryResultsService.update(naming.card.id, { learning_title: naming.title.trim() })
    } finally {
      setBusy(null)
      setNaming(null)
      reload()
    }
  }

  if (error) return <div className={s.empty}>{t(`学びを読めませんでした: ${error}`, `Could not load learnings: ${error}`)}</div>
  if (loading) return <Spinner size="small" />

  const sortName = (v: LearningSort) => (v === 'strength' ? t('強い順', 'Strongest') : v === 'newest' ? t('新しい順', 'Newest') : t('よく使われた順', 'Most used'))
  const channelName = (v: string) => (v ? optionLabel(channelOptions.find((o) => String(o.value) === v)?.label) || v : t('すべてのチャネル', 'All channels'))
  const typeName = (v: string) => (v ? themeTypeLabel(v as (typeof THEME_TYPES)[number]) : t('すべての種類', 'All types'))
  const stateName = (v: string) => (v ? stateLabel(v as LearningState) : t('すべての状態', 'All states'))

  return (
    <div className={s.root}>
      <div className={s.bar}>
        <SearchBox size="small" placeholder={t('名前・メモ・配信名で探す', 'Search name, note or delivery')} value={query} onChange={(_, d) => setQuery(d.value)} />
        <Dropdown size="small" className={s.filter} value={channelName(channel)} selectedOptions={[channel]} onOptionSelect={(_, d) => setChannel(d.optionValue ?? '')} aria-label={t('チャネル', 'Channel')}>
          <Option value="">{channelName('')}</Option>
          {channelOptions.map((o) => (
            <Option key={o.value} value={String(o.value)}>
              {channelName(String(o.value))}
            </Option>
          ))}
        </Dropdown>
        <Dropdown size="small" className={s.filter} value={typeName(type)} selectedOptions={[type]} onOptionSelect={(_, d) => setType(d.optionValue ?? '')} aria-label={t('テーマの種類', 'Theme type')}>
          <Option value="">{typeName('')}</Option>
          {THEME_TYPES.map((v) => (
            <Option key={v} value={v}>
              {themeTypeLabel(v)}
            </Option>
          ))}
        </Dropdown>
        <Dropdown size="small" className={s.filter} value={stateName(state)} selectedOptions={[state]} onOptionSelect={(_, d) => setState((d.optionValue ?? '') as LearningState | '')} aria-label={t('状態', 'State')}>
          {(['', 'use', 'resting', 'retired'] as const).map((v) => (
            <Option key={v} value={v}>
              {stateName(v)}
            </Option>
          ))}
        </Dropdown>
        <Dropdown size="small" className={s.filter} value={sortName(sort)} selectedOptions={[sort]} onOptionSelect={(_, d) => setSort((d.optionValue ?? 'strength') as LearningSort)} aria-label={t('並べ替え', 'Sort')}>
          {(['strength', 'newest', 'uses'] as const).map((v) => (
            <Option key={v} value={v}>
              {sortName(v)}
            </Option>
          ))}
        </Dropdown>
        {/* 国のデッキ(この国で使う学び。ST5)だけに絞る。国を選んでいないときは、すべての学びが出元の国のデッキにある */}
        {country && <Switch checked={deckOnly} onChange={(_, d) => setDeckOnly(d.checked)} label={t(`${countryName(country)}のデッキだけ`, `${countryName(country)} deck only`)} />}
        <span className={s.count}>{t(`${shown.length} 枚 / ${cards.length} 枚`, `${shown.length} of ${cards.length}`)}</span>
      </div>
      {shown.length === 0 ? (
        <div className={s.empty}>
          {cards.length === 0
            ? t('学びはまだありません。結果の「次に生かすメモ」を書くと、学びのカードになります', 'No learnings yet. Notes for next time on results become learning cards.')
            : t('条件に合う学びはありません', 'No learnings match')}
        </div>
      ) : (
        <div className={s.grid}>
          {shown.map((l) => (
            <LearningCard
              key={l.id}
              data={l}
              onOpenSource={onOpenResult}
              actions={
                <Menu>
                  <MenuTrigger disableButtonEnhancement>
                    <Button size="small" appearance="subtle" icon={<MoreHorizontalRegular />} disabled={busy === l.id} aria-label={t('学びの操作', 'Learning actions')} />
                  </MenuTrigger>
                  <MenuPopover>
                    <MenuList>
                      <MenuItem onClick={() => setNaming({ card: l, title: l.customTitle })}>{t('名前を直す', 'Rename')}</MenuItem>
                      {(['use', 'resting', 'retired'] as const)
                        .filter((v) => v !== l.state)
                        .map((v) => (
                          <MenuItem key={v} onClick={() => void changeState(l, v)}>
                            {v === 'use' ? t('使う', 'Use') : v === 'resting' ? t('休ませる', 'Rest') : t('外す', 'Retire')}
                          </MenuItem>
                        ))}
                    </MenuList>
                  </MenuPopover>
                </Menu>
              }
            />
          ))}
        </div>
      )}
      {/* 名前を直す(小さい確かめの窓なので、大きさは固定) */}
      <Dialog open={!!naming} onOpenChange={(_, d) => !d.open && setNaming(null)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{t('学びの名前', 'Learning name')}</DialogTitle>
            <DialogContent>
              <Field label={t('一言の見出し(空にすると、メモの 1 行目を出します)', 'A short title (leave empty to show the first line of the note)')}>
                <Input value={naming?.title ?? ''} onChange={(_, d) => naming && setNaming({ ...naming, title: d.value })} onKeyDown={(e) => e.key === 'Enter' && void saveTitle()} />
              </Field>
            </DialogContent>
            <DialogActions>
              <Button appearance="primary" disabled={busy != null} onClick={() => void saveTitle()}>
                {t('保存', 'Save')}
              </Button>
              <Button onClick={() => setNaming(null)}>{t('やめる', 'Cancel')}</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  )
}
