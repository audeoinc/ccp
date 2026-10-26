// キャンペーンの帯の 1 段目の「まとめて承認」(X79 段 ④ の 5)。子のカードをまとめて「承認を依頼する」「承認する」。
// 依頼の前に、送る前の確かめ(readinessOf)を子のカードごとに行い、通らないカードがあれば、名前と足りない所を見せて止める
// (まとめて出すと、1 枚ずつの確かめの一覧を見ないまま出てしまうため)。カードごとの承認は、いままでどおり各カードの承認から
import { useState } from 'react'
import { Button, MessageBar, MessageBarBody, Popover, PopoverSurface, PopoverTrigger, Spinner, makeStyles, tokens } from '@fluentui/react-components'
import { CheckmarkCircleRegular, ChevronDownRegular, SendRegular } from '@fluentui/react-icons'
import type { Campaign } from './models/campaigns'
import type { DeliveryCard } from './models/deliveryCards'
import type { CardAlert } from './cardAlerts'
import { approveCampaign, campaignRequestable, checkBeforeRequest, liveChildren, requestCampaign, type CampaignIssue } from './campaignOps'
import { cardDisplayName } from './campaigns'
import { myName, myUserId } from './history'
import { useT } from './i18n'
import { usePeople } from './people'
import { statusColor, statusLabel } from './status'
import { useApprovalInbox } from './useApprovalInbox'

const useStyles = makeStyles({
  surface: { width: '360px', display: 'grid', rowGap: '10px', fontSize: tokens.fontSizeBase200 },
  title: { fontSize: '13px', fontWeight: tokens.fontWeightSemibold },
  rows: { display: 'grid', rowGap: '4px' },
  row: { display: 'flex', alignItems: 'center', columnGap: '6px', minWidth: 0 },
  dot: { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0 },
  name: { flexGrow: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  state: { color: tokens.colorNeutralForeground3, whiteSpace: 'nowrap' },
  actions: { display: 'flex', flexWrap: 'wrap', gap: '6px' },
  issue: { display: 'grid', rowGap: '2px' },
  issueHead: { display: 'flex', alignItems: 'center', columnGap: '6px', fontWeight: tokens.fontWeightSemibold },
  issueList: { margin: 0, paddingLeft: '18px', color: tokens.colorNeutralForeground2 },
})

interface Props {
  campaign: Campaign
  /** すべての配信カード(子を、ここから選ぶ) */
  cards: DeliveryCard[]
  /** カードごとのアラート(在庫・画像の期限など。確かめに使う) */
  alertsOf?: (cardId: string) => CardAlert[] | undefined
  /** 依頼・承認の前に、開いているカードの保存していない変更を保存する(保存できなければ false) */
  beforeRun?: () => Promise<boolean>
  /** 依頼・承認のあと(カードを読み直す) */
  onChanged: () => Promise<void> | void
  /** 確かめに通らなかったカードを開く */
  onOpenCard: (cardId: string) => void
  busy?: boolean
}

export function CampaignApprove({ campaign, cards, alertsOf, beforeRun, onChanged, onOpenCard, busy }: Props) {
  const s = useStyles()
  const t = useT()
  const people = usePeople()
  const children = liveChildren(campaign.id, cards)
  const inbox = useApprovalInbox(cards)
  const toRequest = campaignRequestable(children, inbox.hasOpen)
  const mine = inbox.mineFor(children.map((c) => c.id))
  const [open, setOpen] = useState(false)
  const [running, setRunning] = useState<'request' | 'approve' | null>(null)
  const [issues, setIssues] = useState<CampaignIssue[] | null>(null)
  const [message, setMessage] = useState<{ intent: 'success' | 'warning' | 'error'; text: string } | null>(null)
  const actor = () => ({ id: myUserId(), name: myName() })

  const run = async (kind: 'request' | 'approve', body: () => Promise<void>) => {
    setRunning(kind)
    setMessage(null)
    setIssues(null)
    try {
      if (beforeRun && !(await beforeRun())) return
      await body()
      await inbox.reload()
      await onChanged()
    } catch (e) {
      setMessage({ intent: 'error', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setRunning(null)
    }
  }
  const request = () =>
    run('request', async () => {
      const found = await checkBeforeRequest(toRequest, campaign, alertsOf)
      if (found.length) {
        setIssues(found)
        return
      }
      const skipped = await requestCampaign(toRequest, campaign, people, actor())
      setMessage(
        skipped.length
          ? { intent: 'warning', text: t(`既定の承認者がいない配信は飛ばしました(配信カードから依頼してください): ${skipped.join(' / ')}`, `Skipped deliveries with no default approvers (request from the card): ${skipped.join(' / ')}`) }
          : { intent: 'success', text: t(`${toRequest.length} 本の承認を依頼しました`, `Requested approval for ${toRequest.length}`) },
      )
    })
  const approve = () =>
    run('approve', async () => {
      const done = await approveCampaign(mine, children, actor())
      setMessage({ intent: 'success', text: t(`${done.length} 本を承認しました`, `Approved ${done.length}`) })
    })

  return (
    <Popover open={open} onOpenChange={(_, d) => setOpen(d.open)} positioning="below-end" trapFocus>
      <PopoverTrigger disableButtonEnhancement>
        <Button type="button" size="small" appearance="subtle" icon={<CheckmarkCircleRegular />} iconPosition="before" disabled={busy || children.length === 0}>
          {t('まとめて承認', 'Approve all')}
          <ChevronDownRegular style={{ marginLeft: 4 }} />
        </Button>
      </PopoverTrigger>
      <PopoverSurface className={s.surface} aria-label={t('まとめて承認', 'Approve all')}>
        <span className={s.title}>{t(`このキャンペーンの配信(${children.length} 本)`, `Deliveries in this campaign (${children.length})`)}</span>
        <div className={s.rows}>
          {children.map((c) => (
            <span key={c.id} className={s.row}>
              <span className={s.dot} style={{ backgroundColor: statusColor(c.status) }} aria-hidden />
              <span className={s.name}>{cardDisplayName(c, [campaign])}</span>
              <span className={s.state}>{inbox.hasOpen(c.id) ? t('承認待ち', 'Awaiting approval') : statusLabel(c.status)}</span>
            </span>
          ))}
        </div>
        {issues && (
          <MessageBar intent="warning" layout="multiline">
            <MessageBarBody>
              <div className={s.rows}>
                <span>
                  {t(
                    '送る前の確かめに通らない配信があるので、依頼しませんでした。直してから依頼するか、配信カードごとに依頼してください',
                    'Some deliveries did not pass the pre-send checks, so nothing was requested. Fix them first, or request approval from each card.',
                  )}
                </span>
                {issues.map((x) => (
                  <div key={x.card.id} className={s.issue}>
                    <span className={s.issueHead}>
                      {x.name}
                      <Button
                        type="button"
                        size="small"
                        appearance="transparent"
                        onClick={() => {
                          setOpen(false)
                          onOpenCard(x.card.id)
                        }}
                      >
                        {t('開く', 'Open')}
                      </Button>
                    </span>
                    <ul className={s.issueList}>
                      {x.issues.map((i) => (
                        <li key={i.key}>{[i.label, i.detail].filter(Boolean).join(': ')}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </MessageBarBody>
          </MessageBar>
        )}
        {message && (
          <MessageBar intent={message.intent} layout="multiline">
            <MessageBarBody>{message.text}</MessageBarBody>
          </MessageBar>
        )}
        <div className={s.actions}>
          <Button type="button" size="small" appearance="primary" icon={running === 'request' ? <Spinner size="extra-tiny" /> : <SendRegular />} disabled={!!running || toRequest.length === 0} onClick={() => void request()}>
            {t(`承認を依頼する(${toRequest.length})`, `Request approval (${toRequest.length})`)}
          </Button>
          <Button type="button" size="small" icon={running === 'approve' ? <Spinner size="extra-tiny" /> : <CheckmarkCircleRegular />} disabled={!!running || mine.length === 0 || !inbox.meId} onClick={() => void approve()}>
            {t(`承認する(${mine.length})`, `Approve (${mine.length})`)}
          </Button>
        </div>
      </PopoverSurface>
    </Popover>
  )
}
