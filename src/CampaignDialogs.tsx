// キャンペーン(X79)を作る窓と、キャンペーンに配信カードを足す窓(段 ④ の 6)、キャンペーンの「⋯」とまとめての取りやめの窓((e))。
// どれも小さい確かめの窓なので、複製の窓・取りやめの窓(CardMenu)と同じ形で、大きさは固定
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
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  MessageBar,
  MessageBarBody,
  Option,
  Radio,
  RadioGroup,
  Textarea,
  Tooltip,
  makeStyles,
  tokens,
} from '@fluentui/react-components'
import { AddRegular, ArrowUndoRegular, MoreHorizontalRegular, ProhibitedRegular } from '@fluentui/react-icons'
import type { Campaign } from './models/campaigns'
import type { DeliveryCard } from './models/deliveryCards'
import type { WeekRow } from './data/weeks'
import { addCardToCampaign, cancelCampaign, createCampaignWithCard, lastCancelledBatch, liveChildren, nextChannel, undoCampaignCancel } from './campaignOps'
import { campaignDateOf, cardDisplayName, cardNameFor, cardsOfCampaign } from './campaigns'
import { isCancelled } from './cancel'
import { useFeature } from './featureFlags'
import { FeatureBadge } from './FeatureBadge'
import { toLocalInput } from './duplicate'
import { locale, optionLabel, useT } from './i18n'
import { CHANNEL_PUSH, countryOptions, statusRank } from './status'
import { STATUS_APPROVED } from './cardForm'
import { confirmedWeekOf } from './weekLock'
import { saveLastNewCountry } from './settings'

const useStyles = makeStyles({
  body: { display: 'grid', rowGap: '10px' },
  hint: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  copyFrom: { display: 'grid', rowGap: '4px', paddingLeft: '28px' },
  list: { margin: 0, paddingLeft: '20px' },
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

/**
 * キャンペーンの帯の「⋯」(X79 の (e)。2026-10-30 利用者): キャンペーンをまとめて取りやめる / まとめての取りやめを取り消す。
 * 言葉と窓は、カードの「⋯」の取りやめ(CardMenu)にそろえる。取りやめの公開・非公開も、カードと同じ card.cancel で決める。
 * 取り消すほうは、カードと同じく、非公開でも出す(取りやめたままで戻せなくならないように)
 */
export function CampaignMenu({ campaign, cards, weeks, beforeRun, onChanged, busy }: {
  campaign: Campaign
  /** すべての配信カード(取りやめたものも含む。子を、ここから選ぶ) */
  cards: DeliveryCard[]
  weeks: WeekRow[]
  /** 取りやめる前に、開いているカードの変更を保存する(保存できなければ false で止める) */
  beforeRun: () => Promise<boolean>
  /** 取りやめ・取り消しのあと(配信を読み直す) */
  onChanged: () => Promise<void>
  busy?: boolean
}) {
  const s = useStyles()
  const t = useT()
  const cancelOn = useFeature('card.cancel')
  const [dialog, setDialog] = useState<'cancel' | 'undo' | null>(null)
  const [reason, setReason] = useState('')
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const children = cardsOfCampaign(campaign.id, cards)
  const live = children.filter((c) => !isCancelled(c))
  const batch = lastCancelledBatch(children)
  const nameOf = (c: DeliveryCard) => cardDisplayName(c, [campaign])
  // 制作に渡した・承認した配信も止めない(カードの取りやめと同じ)。窓で名前を見せ、制作の担当に知らせてもらう
  const handedOff = live.filter((c) => !!c.handed_off_at)
  const approved = live.filter((c) => !c.handed_off_at && statusRank(c.status) >= statusRank(STATUS_APPROVED))
  if (!(live.length && cancelOn) && !batch.length) return null
  const open = (d: 'cancel' | 'undo') => {
    setReason('')
    setError(null)
    setDialog(d)
  }
  const run = async (fn: () => Promise<void>) => {
    setRunning(true)
    setError(null)
    try {
      if (!(await beforeRun())) return
      await fn()
      setDialog(null)
      await onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      // 途中で止まっても、そこまでに取りやめたカードを画面に出す
      await onChanged()
    } finally {
      setRunning(false)
    }
  }
  const names = (list: DeliveryCard[]) => (
    <ul className={s.list}>
      {list.map((c) => (
        <li key={c.id}>{nameOf(c)}</li>
      ))}
    </ul>
  )
  return (
    <>
      <Menu>
        <MenuTrigger disableButtonEnhancement>
          <Tooltip content={t('キャンペーンの操作', 'Campaign actions')} relationship="label">
            <Button type="button" size="small" appearance="subtle" icon={<MoreHorizontalRegular />} disabled={busy || running} />
          </Tooltip>
        </MenuTrigger>
        <MenuPopover>
          <MenuList>
            {live.length > 0 && cancelOn && (
              <MenuItem icon={<ProhibitedRegular />} onClick={() => open('cancel')}>
                {t('キャンペーンを取りやめにする…', 'Cancel the campaign…')}
                <FeatureBadge id="card.cancel" />
              </MenuItem>
            )}
            {batch.length > 0 && (
              <MenuItem icon={<ArrowUndoRegular />} onClick={() => open('undo')}>
                {t('キャンペーンの取りやめを取り消す…', 'Undo the campaign cancellation…')}
              </MenuItem>
            )}
          </MenuList>
        </MenuPopover>
      </Menu>

      <Dialog open={dialog === 'cancel'} onOpenChange={(_, d) => !d.open && setDialog(null)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{t(`「${campaign.name}」を取りやめにする`, `Cancel "${campaign.name}"`)}</DialogTitle>
            <DialogContent className={s.body}>
              <span>
                {t(
                  `このキャンペーンの配信 ${live.length} 本を、まとめて取りやめにします。取りやめた配信は、消さずに残ります(カレンダーに薄く出て、アラート・週の確認・件数からは外れます)。確定した週の配信なら、週の確定は解けます`,
                  `Cancels all ${live.length} deliveries in this campaign. They are kept (shown faded in the calendar, and left out of alerts, week checks and counts). If the week is confirmed, it goes back to review.`,
                )}
              </span>
              {names(live)}
              {(handedOff.length > 0 || approved.length > 0) && (
                <MessageBar intent="warning" layout="multiline">
                  <MessageBarBody>
                    {handedOff.length > 0 &&
                      t(
                        `制作に渡した配信があります(${handedOff.map(nameOf).join('、')})。取りやめても、制作の作業は止まりません。制作の担当にも知らせてください。`,
                        `Some deliveries were handed off to production (${handedOff.map(nameOf).join(', ')}). Cancelling does not stop the production work, so let the production owner know. `,
                      )}
                    {approved.length > 0 &&
                      t(`承認済みの配信があります(${approved.map(nameOf).join('、')})。`, `Some deliveries are already approved (${approved.map(nameOf).join(', ')}).`)}
                  </MessageBarBody>
                </MessageBar>
              )}
              <Field label={t('取りやめの理由', 'Reason')} required size="small">
                <Textarea value={reason} onChange={(_, d) => setReason(d.value)} rows={3} />
              </Field>
              <ErrorBar error={error} />
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setDialog(null)}>{t('やめる', 'Back')}</Button>
              <Button appearance="primary" disabled={running || !reason.trim()} onClick={() => void run(() => cancelCampaign(live, reason, weeks))}>
                {t('取りやめにする', 'Cancel campaign')}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog open={dialog === 'undo'} onOpenChange={(_, d) => !d.open && setDialog(null)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{t(`「${campaign.name}」の取りやめを取り消す`, `Undo cancelling "${campaign.name}"`)}</DialogTitle>
            <DialogContent className={s.body}>
              <span>{t('まとめて取りやめにした、次の配信を元に戻します', 'Restores these deliveries that were cancelled together')}</span>
              {names(batch)}
              {batch.length < children.length && (
                <span className={s.hint}>
                  {t(
                    'その前に 1 本ずつ取りやめにした配信は、取りやめのまま残ります(戻すときは、その配信カードの「⋯」から)',
                    'Deliveries cancelled one by one before that stay cancelled (restore them from "…" on each card).',
                  )}
                </span>
              )}
              <ErrorBar error={error} />
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setDialog(null)}>{t('やめる', 'Back')}</Button>
              <Button appearance="primary" icon={<ArrowUndoRegular />} disabled={running} onClick={() => void run(() => undoCampaignCancel(batch))}>
                {t('取りやめを取り消す', 'Undo cancellation')}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </>
  )
}
