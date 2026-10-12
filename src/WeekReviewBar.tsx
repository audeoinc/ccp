import { useState } from 'react'
import { Badge, Button, Spinner, Tooltip, makeStyles, tokens } from '@fluentui/react-components'
import { ArrowUndoRegular, CheckmarkCircleRegular, SendRegular } from '@fluentui/react-icons'
import type { Cr854_deliverycards } from './generated/models/Cr854_deliverycardsModel'
import type { Cr854_weeks, WeekStatus } from './gcpdata/Cr854_weeksService'
import { locale, optionLabel, useT } from './i18n'
import { statusColor, statusOptions } from './status'

const useStyles = makeStyles({
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
  label: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  when: { fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3 },
  counts: { display: 'flex', alignItems: 'center', columnGap: '10px', fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground2 },
  count: { display: 'inline-flex', alignItems: 'center', columnGap: '4px' },
  dot: { width: '8px', height: '8px', borderRadius: tokens.borderRadiusCircular },
  actions: { display: 'flex', columnGap: '8px', marginLeft: 'auto' },
})

interface Props {
  /** この週の行(まだ行がなければ undefined = 下書き) */
  week?: Cr854_weeks
  /** この週の配信(絞り込みを反映しない、すべての配信) */
  cards: Cr854_deliverycards[]
  /** 状態を変える(週の配信のステータスも、まとめて進める。App 側で行う) */
  onChange: (status: WeekStatus) => Promise<void>
}

const STATUS_NOT_STARTED = 588230000
const STATUS_APPROVED = 588230002

/**
 * 週の状態(下書き → レビュー中 → 確定)と、その操作。週の計画を、1 本ずつではなく、週単位でレビューに出し、確定する。
 * 確定は、週のすべての配信を「確定」にする(承認されていない配信があれば、件数を出して確かめる)
 */
export function WeekReviewBar({ week, cards, onChange }: Props) {
  const styles = useStyles()
  const t = useT()
  const [busy, setBusy] = useState(false)
  const status: WeekStatus = week?.cr854_status ?? 'draft'
  const when = (iso?: string) => (iso ? new Date(iso).toLocaleString(locale(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')
  const counts = statusOptions.map((o) => ({ ...o, n: cards.filter((c) => (c.cr854_status ?? STATUS_NOT_STARTED) === o.value).length }))
  const notApproved = cards.filter((c) => (c.cr854_status ?? STATUS_NOT_STARTED) < STATUS_APPROVED).length

  const run = async (next: WeekStatus, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return
    setBusy(true)
    try {
      await onChange(next)
    } finally {
      setBusy(false)
    }
  }

  const badge =
    status === 'confirmed' ? (
      <Badge appearance="filled" color="success" icon={<CheckmarkCircleRegular />}>{t('確定', 'Confirmed')}</Badge>
    ) : status === 'review' ? (
      <Badge appearance="filled" color="warning">{t('レビュー中', 'In review')}</Badge>
    ) : (
      <Badge appearance="outline" color="informative">{t('下書き', 'Draft')}</Badge>
    )

  return (
    <div className={styles.root}>
      <span className={styles.label}>{t('週の状態', 'Week status')}</span>
      {badge}
      {status !== 'draft' && (
        <span className={styles.when}>
          {status === 'confirmed' ? t(`確定 ${when(week?.cr854_confirmedat)}`, `Confirmed ${when(week?.cr854_confirmedat)}`) : t(`レビューに出した日時 ${when(week?.cr854_submittedat)}`, `Submitted ${when(week?.cr854_submittedat)}`)}
        </span>
      )}
      <span className={styles.counts}>
        {counts.map((c) => (
          <span key={c.value} className={styles.count} title={optionLabel(c.label)}>
            <span className={styles.dot} style={{ backgroundColor: statusColor(c.value) }} />
            {`${optionLabel(c.label)} ${c.n}`}
          </span>
        ))}
      </span>
      <span className={styles.actions}>
        {busy && <Spinner size="extra-tiny" />}
        {status === 'draft' && (
          <Tooltip content={t('週をレビュー中にします。未起案の配信は「検討中」にします', 'Puts the week in review. Not-started deliveries become In review.')} relationship="description">
            <Button size="small" appearance="primary" icon={<SendRegular />} disabled={busy || cards.length === 0} onClick={() => void run('review')}>
              {t('レビューに出す', 'Submit for review')}
            </Button>
          </Tooltip>
        )}
        {status === 'review' && (
          <>
            <Button size="small" appearance="subtle" icon={<ArrowUndoRegular />} disabled={busy} onClick={() => void run('draft')}>
              {t('下書きに戻す', 'Back to draft')}
            </Button>
            <Tooltip content={t('週のすべての配信を「確定」にします', 'Sets every delivery in this week to Confirmed.')} relationship="description">
              <Button
                size="small"
                appearance="primary"
                icon={<CheckmarkCircleRegular />}
                disabled={busy || cards.length === 0}
                onClick={() =>
                  void run(
                    'confirmed',
                    notApproved > 0
                      ? t(`承認されていない配信が ${notApproved} 件あります。週を確定すると、すべて「確定」になります。よろしいですか?`, `${notApproved} deliveries are not approved yet. Confirming the week sets all of them to Confirmed. Continue?`)
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
    </div>
  )
}
