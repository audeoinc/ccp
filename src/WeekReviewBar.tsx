import { useState, type ReactNode } from 'react'
import { Badge, Button, Popover, PopoverSurface, PopoverTrigger, Spinner, Tooltip, makeStyles, tokens } from '@fluentui/react-components'
import { ArrowUndoRegular, CheckmarkCircleRegular, DocumentPdfRegular, HistoryRegular, SendRegular } from '@fluentui/react-icons'
import type { DeliveryCard } from './models/deliveryCards'
import type { WeekRow, WeekStatus } from './data/weeks'
import type { CardNote } from './data/cardNotes'
import type { CardEvent } from './data/events'
import { actionText } from './weekLabels'
import { myName } from './history'
import { MePicker } from './MePicker'
import { AiIcon } from './AiMark'
import { locale, optionLabel, useT } from './i18n'
import { statusOptions, statusRank } from './status'

const useStyles = makeStyles({
  // 記録・資料(名前・履歴・PDF)と、週を進める操作の間の区切り
  divider: { alignSelf: 'stretch', width: '1px', margin: '2px 4px', backgroundColor: tokens.colorNeutralStroke2 },
  root: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    columnGap: '12px',
    rowGap: '6px',
    padding: '8px 12px',
    marginBottom: '8px',
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  actions: { display: 'flex', alignItems: 'center', columnGap: '8px', marginLeft: 'auto' },
  // 確定後の変更(理由つき)の一覧。帯の下の行に出す
  changes: { flexBasis: '100%', display: 'grid', rowGap: '2px', paddingTop: '6px', borderTop: `1px solid ${tokens.colorNeutralStroke2}`, fontSize: tokens.fontSizeBase200 },
  changesHead: { color: tokens.colorPaletteDarkOrangeForeground1, fontWeight: tokens.fontWeightSemibold },
  changeRow: { color: tokens.colorNeutralForeground2, overflowWrap: 'anywhere' },
  name: { width: '140px' },
  // 承認の履歴(新しい順)
  history: { display: 'grid', rowGap: '8px', width: '420px', maxHeight: '360px', overflowY: 'auto', fontSize: tokens.fontSizeBase200 },
  historyHead: { fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground1 },
  historyRow: { display: 'grid', rowGap: '1px', paddingBottom: '6px', borderBottom: `1px solid ${tokens.colorNeutralStroke3}` },
  historyMeta: { fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3 },
  historyText: { color: tokens.colorNeutralForeground1, overflowWrap: 'anywhere' },
  historyNote: { color: tokens.colorNeutralForeground2, overflowWrap: 'anywhere' },
})

interface Props {
  /** この週の行(まだ行がなければ undefined = 下書き) */
  week?: WeekRow
  /** この週の配信(絞り込みを反映しない、すべての配信) */
  cards: DeliveryCard[]
  /** 確定した週の配信を変えたときの理由(すべての配信の分。この週の、最後の確定より後のものだけを出す) */
  changes?: CardNote[]
  /** この週の承認の履歴(新しい順) */
  events?: CardEvent[]
  /** 週の資料(PDF)を書き出す(App 側で、資料を描いて印刷の画面を開く) */
  onExportPdf?: () => void
  /** この週の配信を、まとめて AI で下書きする(W14。App 側で下書きモードに入る。下書きモードのあいだは undefined で、ボタンを出さない) */
  onBulkCreate?: () => void
  /** 週の「検討中」の配信を、まとめて承認する(App 側で行う) */
  onApproveAll?: () => Promise<void>
  /** 状態を変える(週の配信のステータスも、まとめて進める。App 側で行う) */
  onChange: (status: WeekStatus) => Promise<void>
  /** 確定の前に直すことの数(確認の一覧で、問題のある項目の数)。確定の確認に使う */
  toFix?: number
  /** 確定の前に直すことのボタン(WeekChecklist)。週を進める操作の、すぐ左に置く */
  fix?: ReactNode
  /** 選んでいる確定の前に直すことの札(WeekCheckChip)。出たり消えたりするので、左側に置く */
  fixChip?: ReactNode
}

const STATUS_REVIEW = 'reviewing'
const STATUS_APPROVED = 'approved'

/**
 * 週の状態(下書き → レビュー中 → 確定)と、その操作。週の計画を、1 本ずつではなく、週単位でレビューに出し、確定する。
 * 確定は、週のすべての配信を「確定」にする(承認されていない配信があれば、件数を出して確かめる)
 */
export function WeekReviewBar({ week, cards, changes = [], events = [], onApproveAll, onExportPdf, onBulkCreate, onChange, toFix = 0, fix, fixChip }: Props) {
  const styles = useStyles()
  const t = useT()
  const [busy, setBusy] = useState(false)
  // 履歴に残す名前(ログインで人を見分けないため。ブラウザごとに覚え、コメントを書く人と共通)
  const [name, setName] = useState(myName)
  const status: WeekStatus = week?.status ?? 'draft'
  const when = (iso?: string) => (iso ? new Date(iso).toLocaleString(locale(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')
  const notApproved = cards.filter((c) => statusRank(c.status) < statusRank(STATUS_APPROVED)).length
  const inReview = cards.filter((c) => c.status === STATUS_REVIEW).length
  // 確定後の変更: この週の配信の、最後に確定した日時より後の理由。もう一度確定すると、それより前のものは出なくなる
  const cardName = new Map(cards.map((c) => [c.id, c.name]))
  // 日時は、文字列ではなく時刻で比べる(サーバーとブラウザで、ISO の書き方が違うことがあるため)
  const ms = (iso?: string) => (iso ? new Date(iso).getTime() : 0)
  const since = ms(week?.confirmed_at)
  const reopened =
    status !== 'confirmed' && since > 0
      ? changes
          .filter((n) => n.delivery_card_id && cardName.has(n.delivery_card_id) && ms(n.created_on) > since)
          .sort((a, b) => ms(a.created_on) - ms(b.created_on))
      : []

  const run = async (next: WeekStatus, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return
    setBusy(true)
    try {
      await onChange(next)
    } finally {
      setBusy(false)
    }
  }

  const statusName = (v?: string | null) => (v === undefined || v === null ? '' : optionLabel(statusOptions.find((o) => o.value === v)?.label))
  const history = (
    <Popover withArrow positioning="below-end">
      <PopoverTrigger disableButtonEnhancement>
        <Button size="small" appearance="subtle" icon={<HistoryRegular />}>
          {t(`履歴 ${events.length}`, `History ${events.length}`)}
        </Button>
      </PopoverTrigger>
      <PopoverSurface>
        <div className={styles.history}>
          <span className={styles.historyHead}>{t('承認の履歴', 'Approval history')}</span>
          {events.length === 0 && <span className={styles.historyMeta}>{t('まだ記録はありません', 'Nothing recorded yet')}</span>}
          {events.map((e) => (
            <div key={e.id} className={styles.historyRow}>
              <span className={styles.historyMeta}>{`${when(e.created_on)} · ${e.actor || t('(名前なし)', '(no name)')}`}</span>
              <span className={styles.historyText}>
                {e.card_name ? `${e.card_name}: ` : ''}
                {actionText(t, e.action)}
                {e.to_status !== undefined && e.to_status !== null && e.to_status !== e.from_status ? `(${statusName(e.from_status) ? `${statusName(e.from_status)} ` : ''}→ ${statusName(e.to_status)})` : ''}
              </span>
              {e.note && <span className={styles.historyNote}>{e.note}</span>}
            </div>
          ))}
        </div>
      </PopoverSurface>
    </Popover>
  )

  return (
    <div className={styles.root}>
      {/* まとめて AI で下書き(W14)は、週の計画を作り始める操作なので、帯のいちばん左に置く(利用者の判断 2026-10-16) */}
      {onBulkCreate && (
        <Tooltip
          content={
            status === 'confirmed'
              ? t('確定した週には作れません(確定を取り消すと作れます)', 'Cannot create in a confirmed week (undo the confirmation first)')
              : t('この週の配信を、国・チャネルを決めて、まとめて AI で下書きします(最大 10 本)', 'Choose a country and channel, then draft this week’s deliveries with AI in bulk (up to 10)')
          }
          relationship="description"
        >
          <Button size="small" icon={<AiIcon />} disabledFocusable={busy || status === 'confirmed'} onClick={onBulkCreate}>
            {t('まとめて AI で下書き', 'Bulk AI drafts')}
          </Button>
        </Tooltip>
      )}
      {fixChip}
      <span className={styles.actions}>
        {busy && <Spinner size="extra-tiny" />}
        <Tooltip content={t('履歴に残す、あなたの名前(このブラウザで覚えます)', 'Your name for the history (remembered in this browser)')} relationship="description">
          <span>
            <MePicker className={styles.name} onChange={setName} />
          </span>
        </Tooltip>
        {history}
        {onExportPdf && (
          <Tooltip content={t('レビューの会議で配る、週の資料を作ります(印刷の画面で「PDF に保存」を選びます)', 'Creates the week handout for the review meeting (choose "Save as PDF" in the print dialog)')} relationship="description">
            <Button size="small" appearance="subtle" icon={<DocumentPdfRegular />} disabled={busy || cards.length === 0} onClick={onExportPdf}>
              PDF
            </Button>
          </Tooltip>
        )}
        <span className={styles.divider} aria-hidden />
        {status !== 'review' && fix}
        {status === 'draft' && (
          <Tooltip content={t('週をレビュー中にします。未起案の配信は「検討中」にします', 'Puts the week in review. Not-started deliveries become In review.')} relationship="description">
            <Button size="small" appearance="primary" icon={<SendRegular />} disabled={busy || cards.length === 0} onClick={() => void run('review')}>
              {t('レビューに出す', 'Submit for review')}
            </Button>
          </Tooltip>
        )}
        {status === 'review' && (
          <>
            {onApproveAll && (
              <Tooltip content={t('この週の「検討中」の配信を、まとめて「承認済み」にします', 'Sets every In review delivery in this week to Approved.')} relationship="description">
                <Button
                  size="small"
                  icon={<CheckmarkCircleRegular />}
                  disabled={busy || inReview === 0 || !name.trim()}
                  onClick={() => {
                    if (!window.confirm(t(`検討中の配信 ${inReview} 件を、まとめて承認します。よろしいですか?`, `Approve ${inReview} delivery(ies) in review?`))) return
                    setBusy(true)
                    void onApproveAll().finally(() => setBusy(false))
                  }}
                >
                  {t(`まとめて承認(${inReview})`, `Approve all (${inReview})`)}
                </Button>
              </Tooltip>
            )}
            <Button size="small" appearance="subtle" icon={<ArrowUndoRegular />} disabled={busy} onClick={() => void run('draft')}>
              {t('下書きに戻す', 'Back to draft')}
            </Button>
            {fix}
            <Tooltip content={t('週のすべての配信を「確定」にします', 'Sets every delivery in this week to Confirmed.')} relationship="description">
              <Button
                size="small"
                appearance="primary"
                icon={<CheckmarkCircleRegular />}
                disabled={busy || cards.length === 0}
                onClick={() =>
                  void run(
                    'confirmed',
                    notApproved > 0 || toFix > 0
                      ? [
                          toFix > 0 ? t(`確定の前に直すことが ${toFix} 件残っています(「週を確定」の左の印)。`, `${toFix} item(s) to fix before confirming are left (see the mark next to Confirm week).`) : '',
                          notApproved > 0 ? t(`承認されていない配信が ${notApproved} 件あります。週を確定すると、すべて「確定」になります。`, `${notApproved} deliveries are not approved yet. Confirming the week sets all of them to Confirmed.`) : '',
                          t('よろしいですか?', 'Continue?'),
                        ].filter(Boolean).join(' ')
                      : undefined,
                  )
                }
              >
                {t('週を確定', 'Confirm week')}
              </Button>
            </Tooltip>
          </>
        )}
        {status === 'confirmed' && (
          <Button
            size="small"
            appearance="subtle"
            icon={<ArrowUndoRegular />}
            disabled={busy}
            onClick={() => void run('review', t('確定を取り消して、レビュー中に戻します。配信のステータスは「承認済み」に戻します。よろしいですか?', 'Undo the confirmation and go back to review? Deliveries go back to Approved.'))}
          >
            {t('確定を取り消す', 'Undo confirmation')}
          </Button>
        )}
      </span>
      {reopened.length > 0 && (
        <div className={styles.changes}>
          <span className={styles.changesHead}>{t(`確定後の変更 ${reopened.length} 件(もう一度確定してください)`, `${reopened.length} change(s) after confirmation (confirm the week again)`)}</span>
          {reopened.map((n) => (
            <span key={n.id} className={styles.changeRow}>
              {`${when(n.created_on)} ・ ${cardName.get(n.delivery_card_id!) ?? ''}${n.author ? `(${n.author})` : ''}: ${n.body ?? ''}`}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * 週の状態(下書き / レビュー中 / 確定)の印。週そのものの状態なので、ツールバーの期間の横に置く(週の帯は、操作だけにする)。
 * レビューに出した日時・確定した日時は、マウスを重ねると出す
 */
export function WeekStatusBadge({ week }: { week?: WeekRow }) {
  const t = useT()
  const status: WeekStatus = week?.status ?? 'draft'
  const when = (iso?: string) => (iso ? new Date(iso).toLocaleString(locale(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')
  const tip =
    status === 'confirmed'
      ? t(`週の状態: 確定(${when(week?.confirmed_at)})`, `Week status: Confirmed (${when(week?.confirmed_at)})`)
      : status === 'review'
        ? t(`週の状態: レビュー中(レビューに出した日時 ${when(week?.submitted_at)})`, `Week status: In review (submitted ${when(week?.submitted_at)})`)
        : t('週の状態: 下書き(まだレビューに出していない)', 'Week status: Draft (not submitted for review yet)')
  return (
    <Tooltip content={tip} relationship="description">
      {status === 'confirmed' ? (
        <Badge appearance="filled" color="success" icon={<CheckmarkCircleRegular />} tabIndex={0}>{t('確定', 'Confirmed')}</Badge>
      ) : status === 'review' ? (
        <Badge appearance="filled" color="warning" tabIndex={0}>{t('レビュー中', 'In review')}</Badge>
      ) : (
        <Badge appearance="outline" color="informative" tabIndex={0}>{t('下書き', 'Draft')}</Badge>
      )}
    </Tooltip>
  )
}
