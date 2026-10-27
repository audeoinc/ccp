// キャンペーンの帯(X79 の段 ③)。配信カードのいちばん上に、親・子・孫を 3 段で見せる(Braze の形)。
//   1 段目: キャンペーン(名前・配信日・国・テーマ・目的)。畳める(中身を広く使えるように。畳んだかは人ごとに覚える)
//   2 段目: そのキャンペーンの配信カードのタブ(チャネル・時刻・状態)。押すと、そのカードに切り替わる
//   3 段目: 開いているカードの AB の案(中身は、それぞれの配信カードの AB の切り替えをそのまま渡す)
// 下の段ほど字下げし、左の線でつないで、親子孫が見て分かるようにする。シンプル・詳しい、どちらの配信カードでも同じものを使う
import { useState, type ReactNode } from 'react'
import { Button, InfoLabel, Tab, TabList, Tooltip, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { AddRegular, ChevronDownRegular, ChevronRightRegular } from '@fluentui/react-icons'
import type { Campaign } from './models/campaigns'
import type { DeliveryCard } from './models/deliveryCards'
import { ChannelBadge } from './ChannelBadge'
import { campaignDateOf, cardDisplayName, cardsOfCampaign } from './campaigns'
import { isCancelled } from './cancel'
import { statusColor, statusLabel, countryOptions } from './status'
import { themeTypeLabel, type ThemeType } from './themeTypes'
import { locale, optionLabel, useT } from './i18n'
import { LabeledValue } from './LabeledValue'
import { typo } from './typo'
import { loadPref, savePref } from './settings'
import { PREF } from './prefKeys'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    padding: '6px 16px 4px 12px',
    backgroundColor: tokens.colorNeutralBackground2,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    fontSize: '12px',
  },
  tier: { display: 'flex', alignItems: 'center', columnGap: '8px', minHeight: '30px', minWidth: 0 },
  // 2 段目・3 段目の字下げと、上の段からつなぐ線(└)
  child: { paddingLeft: '22px', position: 'relative' },
  // 3 段目は、詳しい画面の AB の帯のように高いものも入るので、上にそろえる(段の名前が、帯の真ん中に浮かないように)
  grandchild: { paddingLeft: '44px', position: 'relative', alignItems: 'flex-start' },
  variants: { display: 'flex', alignItems: 'center', minHeight: '30px', flexGrow: 1, minWidth: 0 },
  labelTop: { lineHeight: '30px' },
  elbow: {
    position: 'absolute',
    top: '-4px',
    width: '12px',
    height: '19px',
    borderLeft: `1px solid ${tokens.colorNeutralStroke1}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
    borderBottomLeftRadius: '4px',
  },
  elbowChild: { left: '8px' },
  elbowGrandchild: { left: '30px' },
  // 段の名前(ラベル 11px・薄いグレー。値と見分けられるように。src/typo.ts)
  label: { ...typo.label, whiteSpace: 'nowrap', flexShrink: 0, minWidth: '64px' },
  // キャンペーンの名前は、いちばん大事な値なので太く
  name: { ...typo.valueStrong, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 },
  meta: { ...typo.value, whiteSpace: 'nowrap', flexShrink: 0 },
  sep: { color: tokens.colorNeutralForeground4, flexShrink: 0 },
  // 畳んでいないときの 2 行目(テーマ・目的)
  detail: { display: 'flex', alignItems: 'baseline', columnGap: '16px', paddingLeft: '96px', paddingBottom: '4px', minWidth: 0 },
  pairValue: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 },
  actions: { marginLeft: 'auto', display: 'flex', alignItems: 'center', columnGap: '4px', flexShrink: 0 },
  tabs: { minWidth: 0, overflowX: 'auto' },
  tab: { display: 'inline-flex', alignItems: 'center', columnGap: '6px', whiteSpace: 'nowrap' },
  dot: { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0 },
  state: { color: tokens.colorNeutralForeground3 },
  cancelled: { textDecorationLine: 'line-through', color: tokens.colorNeutralForeground4 },
})

interface Props {
  campaign: Campaign
  /** いま開いている配信カード(保存した行。名前・状態は、ほかのきょうだいと同じく、保存した中身で出す) */
  card: DeliveryCard
  /** すべての配信カード(きょうだいを、ここから選ぶ) */
  allCards: DeliveryCard[]
  /** きょうだいのカードに切り替える(保存していない変更は、呼ぶ側が先に保存する) */
  onSwitch: (id: string) => void
  /** 3 段目: 開いているカードの AB の案の切り替え(それぞれの配信カードの部品をそのまま) */
  variants: ReactNode
  /** 1 段目の右の端(まとめて承認など。X79 の段 ④) */
  actions?: ReactNode
  /** 「＋ 配信カード」(このキャンペーンにカードを足す。X79 の段 ④)。ないときは、押せないボタンで置き場所だけ見せる */
  onAddCard?: () => void
  /** 切り替えを止める(保存中など) */
  busy?: boolean
}

const time = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }) : '')
const dateText = (ymd: string) => (ymd ? new Date(`${ymd}T00:00:00`).toLocaleDateString(locale(), { month: 'short', day: 'numeric', weekday: 'short' }) : '')

export function CampaignBand({ campaign, card, allCards, onSwitch, variants, actions, onAddCard, busy }: Props) {
  const s = useStyles()
  const t = useT()
  const [open, setOpen] = useState(() => loadPref<boolean>(PREF.campaignBandOpen, true))
  const toggle = () => {
    setOpen(!open)
    savePref(PREF.campaignBandOpen, !open)
  }
  // きょうだいは、時刻の順(メール → アプリの順とは限らない)。開いているカードは、一覧が読み直される前でも必ず出す
  const siblings = cardsOfCampaign(campaign.id, allCards.some((c) => c.id === card.id) ? allCards : [...allCards, card])
    .map((c) => (c.id === card.id ? { ...c, ...card } : c))
    .sort((a, b) => String(a.scheduled_at ?? '').localeCompare(String(b.scheduled_at ?? '')))
  const day = campaignDateOf(siblings.filter((c) => !isCancelled(c)))
  const country = optionLabel(countryOptions.find((o) => o.value === campaign.country)?.label ?? campaign.country ?? '')
  const theme = [campaign.theme_type ? themeTypeLabel(campaign.theme_type as ThemeType) : '', campaign.theme ?? ''].filter(Boolean).join(' · ')
  const channelText = (ch?: string) => (ch === 'app' ? t('アプリ', 'App') : t('メール', 'Email'))
  return (
    <div className={s.root} role="group" aria-label={t('キャンペーン', 'Campaign')}>
      <div className={s.tier}>
        <Button
          type="button"
          size="small"
          appearance="transparent"
          icon={open ? <ChevronDownRegular /> : <ChevronRightRegular />}
          onClick={toggle}
          aria-expanded={open}
          aria-label={open ? t('キャンペーンの情報を畳む', 'Collapse campaign details') : t('キャンペーンの情報を開く', 'Expand campaign details')}
        />
        <InfoLabel
          size="small"
          className={s.label}
          info={t(
            'いくつかの配信(メール・アプリ)をまとめる親です。同じ国・同じ配信日の配信が入ります。下の段で配信を切り替え、その下の段で配信の AB の案を切り替えます',
            'The parent that groups deliveries (email and app). Deliveries in it share the country and send date. Switch deliveries on the row below, and their A/B variants on the row under that.',
          )}
        >
          {t('キャンペーン', 'Campaign')}
        </InfoLabel>
        <span className={s.name}>{campaign.name}</span>
        {day && <span className={s.meta}>{dateText(day)}</span>}
        {country && (
          <>
            <span className={s.sep}>·</span>
            <span className={s.meta}>{country}</span>
          </>
        )}
        {!open && theme && (
          <>
            <span className={s.sep}>·</span>
            <span className={mergeClasses(s.meta, s.pairValue)}>{theme}</span>
          </>
        )}
        <span className={s.actions}>{actions}</span>
      </div>
      {open && (
        <div className={s.detail}>
          <LabeledValue label={t('テーマ', 'Theme')} truncate>
            {theme && (
              <Tooltip content={campaign.theme_reason || theme} relationship="description">
                <span>{theme}</span>
              </Tooltip>
            )}
          </LabeledValue>
          <LabeledValue label={t('目的', 'Goal')} truncate>
            {campaign.purpose}
          </LabeledValue>
        </div>
      )}
      <div className={mergeClasses(s.tier, s.child)}>
        <span className={mergeClasses(s.elbow, s.elbowChild)} aria-hidden />
        <span className={s.label}>{t('配信', 'Deliveries')}</span>
        <TabList className={s.tabs} size="small" selectedValue={card.id} disabled={busy} onTabSelect={(_, d) => d.value !== card.id && onSwitch(String(d.value))}>
          {siblings.map((c) => (
            <Tab key={c.id} value={c.id} aria-label={cardDisplayName(c, [campaign])}>
              <span className={mergeClasses(s.tab, isCancelled(c) && s.cancelled)}>
                <ChannelBadge channel={c.channel} size="icon" />
                {channelText(c.channel)}
                <span>{time(c.scheduled_at)}</span>
                <span className={s.dot} style={{ backgroundColor: statusColor(c.status) }} aria-hidden />
                <span className={s.state}>{isCancelled(c) ? t('取りやめ', 'Cancelled') : statusLabel(c.status)}</span>
              </span>
            </Tab>
          ))}
        </TabList>
        <Tooltip content={onAddCard ? t('このキャンペーンに配信を足す', 'Add a delivery to this campaign') : t('準備中です', 'Coming soon')} relationship="description">
          <Button type="button" size="small" appearance="subtle" icon={<AddRegular />} disabled={!onAddCard || busy} onClick={onAddCard}>
            {t('配信カードを足す', 'Add a delivery card')}
          </Button>
        </Tooltip>
      </div>
      <div className={mergeClasses(s.tier, s.grandchild)}>
        <span className={mergeClasses(s.elbow, s.elbowGrandchild)} aria-hidden />
        <span className={mergeClasses(s.label, s.labelTop)}>{t('案', 'Variants')}</span>
        <div className={s.variants}>{variants}</div>
      </div>
    </div>
  )
}
