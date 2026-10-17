import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { Badge, Button, Checkbox, Dropdown, Field, MessageBar, MessageBarBody, Option, Radio, RadioGroup, Spinner, Tooltip, makeStyles, tokens } from '@fluentui/react-components'
import { ArrowUndoRegular, CheckmarkCircleFilled, CircleRegular, DeleteRegular, DismissCircleFilled, PeopleTeamRegular, PersonRegular, SendRegular } from '@fluentui/react-icons'
import type { DeliveryCard } from './models/deliveryCards'
import { ApprovalRequestStatus, type ApprovalRequest, type ApprovalRequestRule } from './models/approvalRequests'
import type { ApprovalReviewer } from './models/approvalReviewers'
import { ApprovalRequestsService } from './data/approvalRequests'
import { ApprovalReviewersService } from './data/approvalReviewers'
import { ApprovalsService } from './data/approvals'
import { eligibleReviewers, parseIds } from './approvals'
import { myName, myUserId, onMeChange } from './history'
import { activeUsers, groupsOf, ruleFor, usePeople } from './people'
import { locale, optionLabel, tr, useT } from './i18n'
import { weekKeyOf } from './weekLock'
import { AutoTextarea } from './AutoTextarea'
import { MePicker } from './MePicker'

const useStyles = makeStyles({
  root: { display: 'grid', rowGap: '8px', padding: '8px 24px 0', borderTop: `1px solid ${tokens.colorNeutralStroke2}` },
  row: { display: 'flex', alignItems: 'center', columnGap: '12px', rowGap: '6px', flexWrap: 'wrap' },
  label: { fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground3 },
  note: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  // 依頼の相手ごとの状態(グループ名 / 人の名前と、だれが・いつ決めたか)
  chips: { display: 'flex', alignItems: 'center', columnGap: '8px', rowGap: '4px', flexWrap: 'wrap' },
  chip: { display: 'inline-flex', alignItems: 'center', columnGap: '4px', padding: '2px 8px', borderRadius: tokens.borderRadiusCircular, border: `1px solid ${tokens.colorNeutralStroke2}`, fontSize: tokens.fontSizeBase200 },
  chipMeta: { color: tokens.colorNeutralForeground3 },
  ok: { color: tokens.colorPaletteGreenForeground1 },
  ng: { color: tokens.colorPaletteRedForeground1 },
  pending: { color: tokens.colorNeutralForeground4 },
  actions: { display: 'flex', alignItems: 'center', columnGap: '8px', marginLeft: 'auto' },
  me: { width: '160px' },
  // 依頼・差し戻しの入力(配信カードの「理由を入力して保存」と同じ、枠つきの段)
  box: { display: 'grid', rowGap: '8px', padding: '10px 12px', borderRadius: tokens.borderRadiusMedium, border: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: tokens.colorNeutralBackground2 },
  boxRow: { display: 'flex', alignItems: 'flex-start', columnGap: '16px', rowGap: '8px', flexWrap: 'wrap' },
  boxActions: { display: 'flex', justifyContent: 'flex-end', columnGap: '8px' },
  groups: { display: 'grid', rowGap: '2px' },
  users: { minWidth: '220px' },
})

interface Props {
  /** 保存済みの配信カード */
  card: DeliveryCard
  /** 開いた時点から、内容が変わっているか(変わっていると、承認・依頼の前に保存してもらう) */
  isDirty: () => boolean
  /** 配信カードが保存中(そのあいだは操作しない) */
  busy: boolean
  /** 依頼・承認のあとに、配信カードを読み直す(ステータスが変わるため) */
  onChanged: () => Promise<void>
}

const LIVE = new Set<string>(['open', 'approved', 'changes_requested'])
const subscribeMe = (f: () => void) => onMeChange(f)

/**
 * 配信カードの承認(バックログ U4。docs/APPROVAL.md)。GitHub のプルリクエストのように、承認を依頼し、相手(承認グループ・人)ごとの状態を出す。
 * 依頼・承認・差し戻し・取り下げは、サーバーの窓口(ApprovalsService)で行う(本人の確かめと、まとめての更新のため)
 */
export function ApprovalBar({ card, isDirty, busy, onChanged }: Props) {
  const s = useStyles()
  const t = useT()
  const people = usePeople()
  const meId = useSyncExternalStore(subscribeMe, myUserId)
  const meName = useSyncExternalStore(subscribeMe, myName)
  const [requests, setRequests] = useState<ApprovalRequest[] | null>(null)
  const [reviewers, setReviewers] = useState<ApprovalReviewer[]>([])
  const [mode, setMode] = useState<'idle' | 'request' | 'reject'>('idle')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 依頼の入力
  const [rule, setRule] = useState<ApprovalRequestRule>('all')
  const [groupIds, setGroupIds] = useState<string[]>([])
  const [userIds, setUserIds] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [reason, setReason] = useState('')

  const live = requests?.find((r) => LIVE.has(r.status ?? '')) ?? null
  const dirty = isDirty()

  const load = useCallback(async () => {
    const r = await ApprovalRequestsService.getAll({ filter: `delivery_card_id eq '${card.id}'`, orderBy: ['requested_at desc'] })
    const list = r.success ? (r.data ?? []) : []
    const cur = list.find((x) => LIVE.has(x.status ?? ''))
    const v = cur ? await ApprovalReviewersService.getAll({ filter: `approval_request_id eq '${cur.id}'`, orderBy: ['created_on'] }) : null
    setRequests(list)
    setReviewers(v?.success ? (v.data ?? []) : [])
  }, [card.id])
  // 開いたとき と、配信のステータスが変わったとき(週の帯の操作など、ほかの場所で変わることがある)に読み直す
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load, card.status])

  const actor = { id: meId, name: meName }
  const weekStart = card.scheduled_at ? weekKeyOf(new Date(card.scheduled_at)) : undefined
  const myGroups = groupsOf(people, meId)
  const eligible = live?.status === 'open' ? eligibleReviewers(reviewers, meId, myGroups, live.requested_by) : []
  const isRequester = !!live && !!meId && live.requested_by === meId
  const usersOk = people.loaded && activeUsers(people).length > 0
  const when = (iso?: string) => (iso ? new Date(iso).toLocaleString(locale(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')

  const run = async (f: () => Promise<{ success: boolean; error?: { message: string } }>) => {
    setWorking(true)
    setError(null)
    try {
      const r = await f()
      if (!r.success) throw new Error(r.error?.message ?? tr('うまくいきませんでした', 'Something went wrong'))
      setMode('idle')
      await load()
      await onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setWorking(false)
    }
  }

  // 「承認を依頼」を開くとき、種別の既定の相手と決まりを入れる(依頼のときに足し引きできる)
  const openRequest = () => {
    const def = ruleFor(people, card.department)
    const activeGroups = new Set(people.groups.filter((g) => (g.status ?? 'active') === 'active').map((g) => g.id))
    setRule(def?.rule ?? 'all')
    setGroupIds(parseIds(def?.group_ids).filter((id) => activeGroups.has(id)))
    setUserIds(parseIds(def?.user_ids).filter((id) => id !== meId && activeUsers(people).some((u) => u.id === id)))
    setNote('')
    setError(null)
    setMode('request')
  }

  const disabled = busy || working
  const needMe = usersOk && !meId
  const blockedBy = !usersOk
    ? t('ユーザーが登録されていないので、承認の依頼は使えません(⚙ →「ユーザーと承認グループ」)', 'No users are registered, so approval requests are not available (⚙ → Users and approval groups)')
    : needMe
      ? t('「あなた」を選んでください', 'Choose who you are first')
      : dirty
        ? t('変更があります。先に保存してください', 'There are unsaved changes. Save first.')
        : null

  const decisionIcon = (d?: string | null) =>
    d === 'approved' ? <CheckmarkCircleFilled className={s.ok} /> : d === 'changes_requested' ? <DismissCircleFilled className={s.ng} /> : <CircleRegular className={s.pending} />
  const statusColor = (st?: string): 'success' | 'warning' | 'danger' | 'informative' => (st === 'approved' ? 'success' : st === 'open' ? 'warning' : st === 'changes_requested' ? 'danger' : 'informative')

  const requestButton = (
    <Tooltip content={blockedBy ?? t('承認グループ・承認者を指名して、承認を依頼します', 'Choose approval groups or approvers and request approval')} relationship="description">
      <Button type="button" size="small" appearance="primary" icon={<SendRegular />} disabled={disabled || !!blockedBy} onClick={openRequest}>
        {live?.status === 'changes_requested' || card.status === 'reviewing' ? t('もう一度依頼', 'Request again') : t('承認を依頼', 'Request approval')}
      </Button>
    </Tooltip>
  )

  return (
    <div className={s.root}>
      <div className={s.row}>
        <span className={s.label}>{t('承認', 'Approval')}</span>
        {requests === null ? (
          <Spinner size="extra-tiny" />
        ) : live ? (
          <>
            <Badge appearance="filled" color={statusColor(live.status)}>{optionLabel(ApprovalRequestStatus[live.status ?? 'open'])}</Badge>
            <span className={s.note}>{t(`依頼: ${live.requested_by_name ?? ''} ${when(live.requested_at)} ・ ${live.rule === 'any' ? '1 人' : '全員'}`, `Requested by ${live.requested_by_name ?? ''} ${when(live.requested_at)} · ${live.rule === 'any' ? 'any one' : 'everyone'}`)}</span>
            <span className={s.chips}>
              {reviewers.map((r) => (
                <span key={r.id} className={s.chip} title={r.note ?? ''}>
                  {decisionIcon(r.decision)}
                  {r.approval_group_id ? <PeopleTeamRegular /> : <PersonRegular />}
                  {r.reviewer_name}
                  <span className={s.chipMeta}>{r.decided_by_name ? `${r.decided_by_name} ${when(r.decided_at)}` : t('未定', 'Pending')}</span>
                </span>
              ))}
            </span>
          </>
        ) : (
          <span className={s.note}>
            {card.status === 'reviewing'
              ? t('承認の依頼がありません(内容が変わったか、取り下げられました)。依頼し直してください', 'No open approval request (the content changed or it was withdrawn). Request again.')
              : t('承認の依頼は、まだありません', 'No approval request yet')}
          </span>
        )}
        <span className={s.actions}>
          <MePicker className={s.me} ariaLabel={t('承認の記録に残す、あなた', 'You (for the approval record)')} />
          {live?.status === 'open' ? (
            <>
              {isRequester && (
                <Button type="button" size="small" icon={<DeleteRegular />} disabled={disabled} onClick={() => void run(() => ApprovalsService.withdraw(live.id, { actor, week_start: weekStart }))}>
                  {t('取り下げ', 'Withdraw')}
                </Button>
              )}
              {eligible.length > 0 && (
                <>
                  <Tooltip content={blockedBy ?? t(`${reviewers.find((r) => r.id === eligible[0])?.reviewer_name ?? ''} として承認します`, `Approve as ${reviewers.find((r) => r.id === eligible[0])?.reviewer_name ?? ''}`)} relationship="description">
                    <Button type="button" size="small" appearance="primary" icon={<CheckmarkCircleFilled />} disabled={disabled || !!blockedBy || mode === 'reject'} onClick={() => void run(() => ApprovalsService.decide(live.id, { actor, decision: 'approved', reviewer_id: eligible[0], week_start: weekStart }))}>
                      {t('承認', 'Approve')}
                    </Button>
                  </Tooltip>
                  <Button type="button" size="small" icon={<ArrowUndoRegular />} disabled={disabled || mode === 'reject'} onClick={() => { setReason(''); setError(null); setMode('reject') }}>
                    {t('差し戻す', 'Send back')}
                  </Button>
                </>
              )}
              {!isRequester && eligible.length === 0 && <span className={s.note}>{needMe ? t('「あなた」を選ぶと、承認できるか分かります', 'Choose who you are to see if you can approve') : t('あなたは、この配信の承認者ではありません', 'You are not an approver for this delivery')}</span>}
            </>
          ) : live?.status === 'approved' ? (
            <span className={s.note}>{t('内容を変えて保存すると、承認はやり直しになります', 'Changing the content and saving will require approval again')}</span>
          ) : (
            requestButton
          )}
        </span>
      </div>
      {error && (
        <MessageBar intent="error" layout="multiline">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}
      {mode === 'request' && (
        <div className={s.box}>
          <div className={s.boxRow}>
            <Field label={t('決まり', 'Rule')} size="small">
              <RadioGroup layout="horizontal" value={rule} onChange={(_, d) => setRule(d.value as ApprovalRequestRule)}>
                <Radio value="all" label={t('全員(指名したそれぞれから 1 人ずつ)', 'Everyone (one from each)')} />
                <Radio value="any" label={t('1 人(だれか 1 人でよい)', 'Any one')} />
              </RadioGroup>
            </Field>
            <Field label={t('承認グループ', 'Approval groups')} size="small">
              <div className={s.groups}>
                {people.groups.filter((g) => (g.status ?? 'active') === 'active').map((g) => (
                  <Checkbox key={g.id} size="medium" label={g.description ? `${g.name} — ${g.description}` : g.name} checked={groupIds.includes(g.id)} onChange={(_, d) => setGroupIds((x) => (d.checked ? [...x, g.id] : x.filter((id) => id !== g.id)))} />
                ))}
                {people.groups.length === 0 && <span className={s.note}>{t('承認グループがありません', 'No approval groups')}</span>}
              </div>
            </Field>
            <Field label={t('承認者(人を直接指名)', 'Approvers (named people)')} size="small">
              <Dropdown
                size="small"
                multiselect
                className={s.users}
                placeholder={t('選ぶ', 'Choose')}
                value={activeUsers(people).filter((u) => userIds.includes(u.id)).map((u) => u.name).join(', ')}
                selectedOptions={userIds}
                onOptionSelect={(_, d) => setUserIds(d.selectedOptions)}
              >
                {activeUsers(people)
                  .filter((u) => u.id !== meId)
                  .map((u) => (
                    <Option key={u.id} value={u.id} text={u.name}>{u.name}</Option>
                  ))}
              </Dropdown>
            </Field>
          </div>
          <Field label={t('ひとこと(任意)', 'Note (optional)')} size="small">
            <AutoTextarea rows={1} size="small" value={note} onChange={(_, d) => setNote(d.value)} placeholder={t('例: 金曜の配信なので、木曜までにお願いします', 'e.g. Goes out Friday, please review by Thursday')} />
          </Field>
          <div className={s.boxActions}>
            <Button type="button" size="small" onClick={() => setMode('idle')} disabled={working}>{t('やめる', 'Back')}</Button>
            <Button
              type="button"
              size="small"
              appearance="primary"
              icon={<SendRegular />}
              disabled={disabled || (groupIds.length === 0 && userIds.length === 0)}
              onClick={() => void run(() => ApprovalsService.request({ delivery_card_id: card.id, actor, rule, group_ids: groupIds, user_ids: userIds, note: note.trim() || undefined, week_start: weekStart }))}
            >
              {t('依頼する', 'Send request')}
            </Button>
          </div>
        </div>
      )}
      {mode === 'reject' && live && (
        <div className={s.box}>
          <Field label={t('差し戻しの理由(コメントにも残ります。1 人でも差し戻すと、この依頼は止まります)', 'Reason for sending back (also saved as a comment; one send-back stops this request)')} required size="small">
            <AutoTextarea rows={2} size="small" autoFocus value={reason} onChange={(_, d) => setReason(d.value)} placeholder={t('例: 前日のメールと商品がかぶっているので、入れ替えてください', 'e.g. Same products as the previous day. Please swap some.')} />
          </Field>
          <div className={s.boxActions}>
            <Button type="button" size="small" onClick={() => setMode('idle')} disabled={working}>{t('やめる', 'Back')}</Button>
            <Button
              type="button"
              size="small"
              appearance="primary"
              icon={<ArrowUndoRegular />}
              disabled={disabled || !reason.trim()}
              onClick={() => void run(() => ApprovalsService.decide(live.id, { actor, decision: 'changes_requested', reviewer_id: eligible[0], note: reason.trim(), week_start: weekStart }))}
            >
              {t('差し戻す', 'Send back')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
