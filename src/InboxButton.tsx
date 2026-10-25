import { Badge, Button, Popover, PopoverSurface, PopoverTrigger, Tooltip, makeStyles, tokens } from '@fluentui/react-components'
import { MailInboxRegular } from '@fluentui/react-icons'
import { useT, when } from './i18n'
import type { ApprovalInbox } from './useApprovalInbox'

const useStyles = makeStyles({
  list: { display: 'grid', rowGap: '6px', width: '360px', maxHeight: '420px', overflowY: 'auto', fontSize: tokens.fontSizeBase200 },
  head: { display: 'flex', alignItems: 'center', columnGap: '8px', fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground1 },
  note: { color: tokens.colorNeutralForeground3 },
  row: { display: 'grid', rowGap: '1px', padding: '6px 8px', textAlign: 'left', border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground1, cursor: 'pointer', ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover } },
  name: { fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground1 },
  meta: { fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3 },
})

interface Props {
  inbox: ApprovalInbox
  /** 依頼の配信カードを開く */
  onOpenCard: (cardId: string) => void
}

/**
 * ヘッダーの「自分宛ての依頼」(バックログ U5)。自分(と自分のグループ)が決められる、依頼中の承認の一覧。
 * メールの通知が届かない段階でも、依頼に気づけるようにする。だれかが済ませた分は、一覧から自然に消える(依頼中の依頼から計算するため)
 */
export function InboxButton({ inbox, onOpenCard }: Props) {
  const s = useStyles()
  const t = useT()
  const n = inbox.mine.length
  return (
    <Popover withArrow positioning="below-end">
      <PopoverTrigger disableButtonEnhancement>
        <Tooltip content={t('自分宛ての承認の依頼', 'Approval requests addressed to you')} relationship="description">
          <Button appearance="subtle" size="small" icon={<MailInboxRegular />}>
            {t('依頼', 'Requests')}
            {n > 0 && (
              <Badge size="small" appearance="filled" color="brand" style={{ marginLeft: 6 }}>
                {n}
              </Badge>
            )}
          </Button>
        </Tooltip>
      </PopoverTrigger>
      <PopoverSurface>
        <div className={s.list}>
          <div className={s.head}>
            {t('自分宛ての依頼', 'Requests for you')}
          </div>
          {!inbox.meId && <span className={s.note}>{t('右上で、だれでログインするかを選ぶと、自分宛ての依頼が出ます', 'Choose who is signed in at the top right to see your requests')}</span>}
          {inbox.meId && n === 0 && <span className={s.note}>{t('いま、あなたが承認する依頼はありません', 'Nothing waiting for your approval right now')}</span>}
          {inbox.mine.map((m) => (
            <button key={m.request.id} type="button" className={s.row} onClick={() => m.request.delivery_card_id && onOpenCard(m.request.delivery_card_id)}>
              <span className={s.name}>{m.request.card_name}</span>
              <span className={s.meta}>{t(`${m.request.requested_by_name ?? ''} から ${when(m.request.requested_at)} ・ ${m.slot} として`, `From ${m.request.requested_by_name ?? ''} ${when(m.request.requested_at)} · as ${m.slot}`)}</span>
              {m.request.note && <span className={s.note}>{m.request.note}</span>}
            </button>
          ))}
        </div>
      </PopoverSurface>
    </Popover>
  )
}
