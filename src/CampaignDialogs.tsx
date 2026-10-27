// キャンペーン(X79)を作る窓と、キャンペーンに配信カードを足す窓(段 ④ の 6)。
// どちらも小さい確かめの窓なので、複製の窓(CardMenu の DuplicateDialog)と同じ形で、大きさは固定
import { useState } from 'react'
import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Dropdown,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  Option,
  Radio,
  RadioGroup,
  makeStyles,
  tokens,
} from '@fluentui/react-components'
import { AddRegular } from '@fluentui/react-icons'
import type { Campaign } from './models/campaigns'
import type { DeliveryCard } from './models/deliveryCards'
import type { WeekRow } from './data/weeks'
import { addCardToCampaign, createCampaignWithCard, liveChildren, nextChannel } from './campaignOps'
import { campaignDateOf, cardDisplayName, cardNameFor } from './campaigns'
import { toLocalInput } from './duplicate'
import { locale, optionLabel, useT } from './i18n'
import { CHANNEL_PUSH, countryOptions } from './status'
import { confirmedWeekOf } from './weekLock'
import { saveLastNewCountry } from './settings'

const useStyles = makeStyles({
  body: { display: 'grid', rowGap: '10px' },
  hint: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  copyFrom: { display: 'grid', rowGap: '4px', paddingLeft: '28px' },
})

/** チャネルの選び方(メール / アプリ)。横に並べる */
function ChannelPick({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useT()
  return (
    <Field label={t('チャネル', 'Channel')} required size="small">
      <RadioGroup layout="horizontal" value={value} onChange={(_, d) => onChange(d.value)}>
        <Radio value="email" label={t('メール', 'Email')} />
        <Radio value={CHANNEL_PUSH} label={t('アプリ', 'App')} />
      </RadioGroup>
    </Field>
  )
}

const ErrorBar = ({ error }: { error: string | null }) =>
  error ? (
    <MessageBar intent="error" layout="multiline">
      <MessageBarBody>{error}</MessageBarBody>
    </MessageBar>
  ) : null

/** 初めの値(新規作成の初期値。絞り込み中の国・チャネル・種別と、押した日) */
export interface NewCampaignDefaults {
  scheduledAt?: string
  country?: string
  channel?: string
  themeType?: string
}

/** 確定した週には作らない(確定した計画に、黙って配信が増えるため。複製と同じ) */
const lockedMessage = (t: ReturnType<typeof useT>) =>
  t('この週は確定しています。ほかの日にするか、週の確定を解いてから作ってください', 'This week is confirmed. Pick another date, or undo the week confirmation first.')

/**
 * 新規作成: キャンペーンと、最初の配信カード 1 枚を作る。チャネルは、ここで選ぶ(きょうだいは、カードの上の帯の「＋ 配信カードを足す」で足す)。
 * 作ったら、そのカードを開く
 */
export function NewCampaignDialog({ defaults, weeks, onClose, onCreated }: { defaults?: NewCampaignDefaults; weeks: WeekRow[]; onClose: () => void; onCreated: (cardId: string) => void }) {
  const s = useStyles()
  const t = useT()
  const [name, setName] = useState('')
  const [country, setCountry] = useState(defaults?.country ?? '')
  const [channel, setChannel] = useState(defaults?.channel || 'email')
  const [at, setAt] = useState(() => defaults?.scheduledAt ?? toLocalInput(new Date(new Date().setHours(10, 0, 0, 0) + 86400000)))
  const [purpose, setPurpose] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const locked = !!country && !!at && !!confirmedWeekOf(weeks, at, { country, channel })
  const create = async () => {
    setBusy(true)
    setError(null)
    try {
      const { cardId } = await createCampaignWithCard({ name, country, channel, scheduledAt: at, purpose, themeType: defaults?.themeType })
      saveLastNewCountry(country)
      onClose()
      onCreated(cardId)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>{t('新しいキャンペーン', 'New campaign')}</DialogTitle>
          <DialogContent className={s.body}>
            <span>
              {t(
                'キャンペーンと、最初の配信カードを 1 枚作ります。同じ日のほかのチャネルの配信は、作ったカードの上の帯の「＋ 配信カードを足す」で足します',
                'Creates a campaign and its first delivery card. Add deliveries for other channels on the same day with "+ Add a delivery card" at the top of the card.',
              )}
            </span>
            <Field label={t('キャンペーン名', 'Campaign name')} required size="small" hint={name.trim() ? t(`配信カードの名前: ${cardNameFor(name, channel)}`, `Delivery card name: ${cardNameFor(name, channel)}`) : undefined}>
              <Input value={name} onChange={(_, d) => setName(d.value)} autoFocus />
            </Field>
            <Field label={t('国', 'Country')} required size="small">
              <Dropdown
                value={country ? optionLabel(countryOptions.find((o) => o.value === country)?.label ?? country) : ''}
                selectedOptions={country ? [country] : []}
                placeholder={t('国を選ぶ', 'Choose a country')}
                onOptionSelect={(_, d) => setCountry(d.optionValue ?? '')}
              >
                {countryOptions.map((o) => (
                  <Option key={o.value} value={o.value}>
                    {optionLabel(o.label)}
                  </Option>
                ))}
              </Dropdown>
            </Field>
            <ChannelPick value={channel} onChange={setChannel} />
            <Field label={t('配信日時', 'Send date and time')} required size="small" validationState={locked ? 'error' : 'none'} validationMessage={locked ? lockedMessage(t) : undefined}>
              <Input type="datetime-local" value={at} onChange={(_, d) => setAt(d.value)} />
            </Field>
            <Field label={t('目的', 'Goal')} size="small">
              <Input value={purpose} onChange={(_, d) => setPurpose(d.value)} placeholder={t('例: 冬物の立ち上がりを作る', 'e.g. Kick off winter sales')} />
            </Field>
            <ErrorBar error={error} />
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose}>{t('やめる', 'Back')}</Button>
            <Button appearance="primary" icon={<AddRegular />} disabled={busy || !name.trim() || !country || !at || locked} onClick={() => void create()}>
              {t('作って開く', 'Create and open')}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}

/**
 * キャンペーンに配信カードを足す(帯の「＋ 配信カードを足す」)。国・配信日・テーマはキャンペーンから入る。
 * チャネルの初めは、きょうだいにないもの(メール → アプリ、アプリ → メール のどちらからでも足せる)。
 * 「中身を写す」を選ぶと、きょうだいの中身(テーマ・コピー・商品・AB の案など)を写す(複製と同じ写し方)
 */
export function AddCampaignCardDialog({ campaign, cards, weeks, onClose, onCreated }: { campaign: Campaign; cards: DeliveryCard[]; weeks: WeekRow[]; onClose: () => void; onCreated: (cardId: string) => void }) {
  const s = useStyles()
  const t = useT()
  const siblings = liveChildren(campaign.id, cards)
  const day = campaignDateOf(siblings)
  const [channel, setChannel] = useState(() => nextChannel(siblings))
  const [time, setTime] = useState(() => (channel === CHANNEL_PUSH ? '19:00' : '10:00'))
  const [copy, setCopy] = useState(false)
  // 写す元: 初めは、時刻のいちばん早いきょうだい(ふつうは先に作った方)
  const [fromId, setFromId] = useState<string>(() => siblings[0]?.id ?? '')
  const from = siblings.find((c) => c.id === fromId)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const locked = !!day && !!confirmedWeekOf(weeks, `${day}T${time}`, { country: campaign.country ?? '', channel })
  const dayText = day ? new Date(`${day}T00:00:00`).toLocaleDateString(locale(), { month: 'short', day: 'numeric', weekday: 'short' }) : ''
  const add = async () => {
    setBusy(true)
    setError(null)
    try {
      const id = await addCardToCampaign(campaign, cards, { channel, time, copyFrom: copy ? from : undefined })
      onClose()
      onCreated(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>{t(`「${campaign.name}」に配信カードを足す`, `Add a delivery card to "${campaign.name}"`)}</DialogTitle>
          <DialogContent className={s.body}>
            <span>
              {t(
                `国・配信日(${dayText})・テーマは、キャンペーンと同じです。配信カードの名前は「${cardNameFor(campaign.name, channel)}」になります`,
                `Country, send date (${dayText}) and theme come from the campaign. The card will be named "${cardNameFor(campaign.name, channel)}".`,
              )}
            </span>
            <ChannelPick
              value={channel}
              onChange={(v) => {
                setChannel(v)
                setTime(v === CHANNEL_PUSH ? '19:00' : '10:00')
              }}
            />
            <Field label={t('時刻', 'Time')} required size="small" validationState={locked ? 'error' : 'none'} validationMessage={locked ? lockedMessage(t) : undefined}>
              <Input type="time" value={time} onChange={(_, d) => setTime(d.value)} />
            </Field>
            <Checkbox
              checked={copy}
              disabled={siblings.length === 0}
              onChange={(_, d) => setCopy(!!d.checked)}
              // 「きょうだい」は伝わらない(2026-10-27 利用者)。1 枚なら写す元の名前、2 枚以上なら「同じキャンペーンの配信カード」と言って、下で選ぶ
              label={
                siblings.length === 1
                  ? t(`「${cardDisplayName(siblings[0], [campaign])}」の中身を写す(テーマ・コピー・商品・AB の案)`, `Copy content from "${cardDisplayName(siblings[0], [campaign])}" (theme, copy, products, A/B variants)`)
                  : t('同じキャンペーンの配信カードの中身を写す(テーマ・コピー・商品・AB の案)', 'Copy content from another delivery card in this campaign (theme, copy, products, A/B variants)')
              }
            />
            {copy && siblings.length > 1 && (
              <div className={s.copyFrom}>
                <Field label={t('写す元の配信カード', 'Copy from')} size="small">
                <Dropdown value={from ? cardDisplayName(from, [campaign]) : ''} selectedOptions={fromId ? [fromId] : []} onOptionSelect={(_, d) => setFromId(d.optionValue ?? '')}>
                  {siblings.map((c) => (
                    <Option key={c.id} value={c.id}>
                      {cardDisplayName(c, [campaign])}
                    </Option>
                  ))}
                </Dropdown>
                </Field>
              </div>
            )}
            {copy && from && from.channel !== channel && (
              <span className={s.hint}>
                {t('チャネルが違うので、テンプレートは写しません(足したカードで、そのチャネルのテンプレートを選びます)', 'The channel differs, so the template is not copied (choose one for the new channel on the card).')}
              </span>
            )}
            <ErrorBar error={error} />
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose}>{t('やめる', 'Back')}</Button>
            <Button appearance="primary" icon={<AddRegular />} disabled={busy || !time || !day || locked} onClick={() => void add()}>
              {t('足して開く', 'Add and open')}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
