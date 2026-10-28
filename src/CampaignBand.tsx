// キャンペーンの帯(X79 の段 ③。2026-10-28 利用者: プレビューを広く見せるため 1 行に詰めた)。配信カードのいちばん上に、親・子・孫を見せる(Braze の形)。
//   1 行目: キャンペーン(名前・配信日・国)と、そのキャンペーンの配信カードのタブ(チャネル・時刻・状態。押すと、そのカードに切り替わる)。
//           テーマ・目的は、名前にマウスを乗せたとき・∨ で開いたときだけ(開いたかは人ごとに覚える)。＋ のメニューで、配信カード・AB テストを足す
//   案の段: 開いているカードの AB の案(AB テストをしているときだけ。中身は、それぞれの配信カードの AB の切り替えをそのまま渡す)
// シンプル・詳しい、どちらの配信カードでも同じものを使う
import { useState, type ReactNode } from 'react'
import { Button, InfoLabel, Menu, MenuDivider, MenuGroup, MenuGroupHeader, MenuItem, MenuList, MenuPopover, MenuTrigger, Tab, TabList, Tooltip, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
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
    padding: '0 12px 0 8px',
    backgroundColor: tokens.colorNeutralBackground2,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    fontSize: '12px',
  },
  tier: { display: 'flex', alignItems: 'center', columnGap: '8px', minHeight: '40px', minWidth: 0 },
  // 案の段は字下げし、上の行からつなぐ線(└)で、配信の子だと見て分かるようにする。詳しい画面の AB の帯のように高いものも入るので、上にそろえる
  grandchild: { paddingLeft: '40px', position: 'relative', alignItems: 'flex-start', minHeight: '32px' },
  variants: { display: 'flex', alignItems: 'center', minHeight: '30px', flexGrow: 1, minWidth: 0 },
  labelTop: { lineHeight: '30px' },
  elbow: {
    position: 'absolute',
    top: '-6px',
    left: '28px',
    width: '8px',
    height: '21px',
    borderLeft: `1px solid ${tokens.colorNeutralStroke1}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
    borderBottomLeftRadius: '4px',
  },
  // 段の名前(ラベル・薄いグレー。値と見分けられるように。src/typo.ts)
  label: { ...typo.label, whiteSpace: 'nowrap', flexShrink: 0 },
  // キャンペーンの名前は、いちばん大事な値なので太く
  name: { ...typo.valueStrong, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: '40px', maxWidth: '280px', flexShrink: 1 },
  meta: { ...typo.value, whiteSpace: 'nowrap', flexShrink: 0 },
  sep: { color: tokens.colorNeutralForeground4, flexShrink: 0 },
  // キャンペーンと配信のタブの間の区切り
  divider: { width: '1px', height: '20px', backgroundColor: tokens.colorNeutralStroke2, flexShrink: 0, marginLeft: '4px' },
  // 開いたときの 2 行目(テーマ・目的)
  detail: { display: 'flex', alignItems: 'baseline', columnGap: '24px', paddingLeft: '40px', paddingBottom: '6px', minWidth: 0 },
  hoverDetail: { display: 'grid', rowGap: '4px' },
  actions: { marginLeft: 'auto', display: 'flex', alignItems: 'center', columnGap: '4px', flexShrink: 0 },
  tabs: { minWidth: 0, overflowX: 'auto', flexShrink: 1 },
  tab: { display: 'inline-flex', alignItems: 'center', columnGap: '6px', whiteSpace: 'nowrap' },
  dot: { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0 },
  state: { color: tokens.colorNeutralForeground3 },
  cancelled: { textDecorationLine: 'line-through', color: tokens.colorNeutralForeground4 },
})

/** 配信カードの側から帯に渡すもの */
export interface CampaignBandSlots {
  /** 案の段: 開いているカードの AB の案の切り替え(AB テストをしているとき・案に決めたあとだけ。ないときは段ごと出さない) */
  variants?: ReactNode
  /** ＋ のメニューに入れる「AB テストを足す」(MenuItem。AB テストをしていないときだけ) */
  addVariantItems?: ReactNode
}

interface Props {
  campaign: Campaign
  /** いま開いている配信カード(保存した行。名前・状態は、ほかのきょうだいと同じく、保存した中身で出す) */
  card: DeliveryCard
  /** すべての配信カード(きょうだいを、ここから選ぶ) */
  allCards: DeliveryCard[]
  /** きょうだいのカードに切り替える(保存していない変更は、呼ぶ側が先に保存する) */
  onSwitch: (id: string) => void
  /** 案の段と、＋ のメニューの AB テスト(CampaignBandSlots) */
  slots: CampaignBandSlots
  /** 右の端(まとめて承認・閉じる など。X79 の段 ④) */
  actions?: ReactNode
  /** ＋ のメニューの「配信カードを足す」(このキャンペーンにカードを足す。X79 の段 ④)。ないときは、押せない項目で置き場所だけ見せる */
  onAddCard?: () => void
  /** 切り替えを止める(保存中など) */
  busy?: boolean
}

const time = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }) : '')
const dateText = (ymd: string) => (ymd ? new Date(`${ymd}T00:00:00`).toLocaleDateString(locale(), { month: 'short', day: 'numeric', weekday: 'short' }) : '')

export function CampaignBand({ campaign, card, allCards, onSwitch, slots, actions, onAddCard, busy }: Props) {
  const s = useStyles()
  const t = useT()
  // 既定は畳む(テーマ・目的は、名前にマウスを乗せれば見える。2026-10-28 利用者)
  const [open, setOpen] = useState(() => loadPref<boolean>(PREF.campaignBandOpen, false))
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
  const themeAndGoal = (
    <>
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
    </>
  )
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
            'いくつかの配信(メール・アプリ)をまとめる親です。同じ国・同じ配信日の配信が入ります。右のタブで配信を切り替え、＋ で配信や AB テストを足します',
            'The parent that groups deliveries (email and app). Deliveries in it share the country and send date. Switch deliveries with the tabs on the right, and add deliveries or A/B tests with +.',
          )}
        >
          {t('キャンペーン', 'Campaign')}
        </InfoLabel>
        {/* テーマ・目的は、畳んでいるときは名前にマウスを乗せたときだけ(開いているときは下の行にあるので出さない) */}
        {open ? (
          <span className={s.name}>{campaign.name}</span>
        ) : (
          <Tooltip relationship="description" content={<div className={s.hoverDetail}>{themeAndGoal}</div>}>
            <span className={s.name} tabIndex={0}>{campaign.name}</span>
          </Tooltip>
        )}
        {day && <span className={s.meta}>{dateText(day)}</span>}
        {country && (
          <>
            <span className={s.sep}>·</span>
            <span className={s.meta}>{country}</span>
          </>
        )}
        <span className={s.divider} aria-hidden />
        <TabList className={s.tabs} size="small" selectedValue={card.id} disabled={busy} onTabSelect={(_, d) => d.value !== card.id && onSwitch(String(d.value))} aria-label={t('配信', 'Deliveries')}>
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
        <Menu>
          <MenuTrigger disableButtonEnhancement>
            <Tooltip content={t('配信カード・AB テストを足す', 'Add a delivery card or an A/B test')} relationship="label">
              <Button type="button" size="small" appearance="subtle" icon={<AddRegular />} disabled={busy} />
            </Tooltip>
          </MenuTrigger>
          <MenuPopover>
            <MenuList>
              <MenuItem icon={<AddRegular />} disabled={!onAddCard} onClick={onAddCard}>
                {onAddCard ? t('配信カードを足す', 'Add a delivery card') : t('配信カードを足す(準備中)', 'Add a delivery card (coming soon)')}
              </MenuItem>
              {slots.addVariantItems && (
                <>
                  <MenuDivider />
                  <MenuGroup>
                    <MenuGroupHeader>{t('この配信の AB テスト', 'A/B test for this delivery')}</MenuGroupHeader>
                    {slots.addVariantItems}
                  </MenuGroup>
                </>
              )}
            </MenuList>
          </MenuPopover>
        </Menu>
        <span className={s.actions}>{actions}</span>
      </div>
      {open && <div className={s.detail}>{themeAndGoal}</div>}
      {slots.variants && (
        <div className={mergeClasses(s.tier, s.grandchild)}>
          <span className={s.elbow} aria-hidden />
          <span className={mergeClasses(s.label, s.labelTop)}>{t('案', 'Variants')}</span>
          <div className={s.variants}>{slots.variants}</div>
        </div>
      )}
    </div>
  )
}
