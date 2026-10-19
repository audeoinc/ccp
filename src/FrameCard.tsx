import { useState } from 'react'
import { Button, Checkbox, Input, ProgressBar, Select, Spinner, Tooltip, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { DeleteRegular, LockClosedRegular, MailRegular, OpenRegular, PhoneRegular } from '@fluentui/react-icons'
import type { DeliveryCard } from './models/deliveryCards'
import { locale, useT } from './i18n'
import { AiIcon } from './AiMark'
import { CHANNEL_PUSH } from './status'
import { THEME_TYPES, themeTypeLabel } from './themeTypes'
import { frameReady } from './bulkDraft'
import type { WeekFrames } from './useWeekFrames'

// 週の列に並べる、中身のない配信(枠)。ふつうの配信(実線)と形で見分けられるように、破線の枠と「枠」の印を付ける
// (色はステータスの意味を持つので、新しい色は足さない)。配信名と種類は、その場で入れて、すぐ保存する
const useStyles = makeStyles({
  card: {
    flexShrink: 0,
    display: 'grid',
    rowGap: '5px',
    padding: '6px 8px 8px',
    borderRadius: tokens.borderRadiusMedium,
    border: `1.5px dashed ${tokens.colorBrandStroke1}`,
    backgroundColor: tokens.colorBrandBackground2,
    minWidth: 0,
  },
  cardPush: { borderRadius: '16px' },
  head: { display: 'flex', alignItems: 'center', columnGap: '4px', minWidth: 0, fontSize: tokens.fontSizeBase100, color: tokens.colorBrandForeground1 },
  tag: { flexShrink: 0, padding: '0 4px', borderRadius: tokens.borderRadiusSmall, border: `1px dashed ${tokens.colorBrandStroke1}`, fontSize: '10px', lineHeight: '14px' },
  time: { flexGrow: 1, minWidth: 0 },
  line: { display: 'flex', alignItems: 'center', columnGap: '2px', minWidth: 0 },
  input: { minWidth: 0, flexGrow: 1 },
  full: { minWidth: 0, width: '100%' },
  status: { display: 'flex', alignItems: 'center', columnGap: '4px', fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground2, minWidth: 0 },
  text: { flexGrow: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  error: { color: tokens.colorPaletteRedForeground1 },
  lock: { color: tokens.colorPaletteDarkOrangeForeground1 },
})

interface Props {
  card: DeliveryCard
  frames: WeekFrames
  /** 配信カードで開く(時刻・担当などを入れるとき) */
  onOpen: (id: string) => void
}

/**
 * 枠 1 本。配信名(AI の案も出せる)と種類を入れると、中身を作れるようになる。
 * 中身を作ると、ふつうの配信として並び、「AI 下書き・未確認」の印が付く
 */
export function FrameCard({ card: c, frames, onOpen }: Props) {
  const s = useStyles()
  const t = useT()
  const isPush = c.channel === CHANNEL_PUSH
  const prog = frames.progress.get(c.id)
  const fail = frames.failed.get(c.id)
  const naming = frames.naming.has(c.id)
  const locked = frames.isLocked(c)
  const busy = !!prog || naming || locked
  // 配信名は、入力のたびに保存せず、入力欄を離れたとき(Enter でも)に保存する
  const [name, setName] = useState(c.name ?? '')
  const commitName = () => {
    if (name.trim() !== (c.name ?? '').trim()) void frames.saveField(c, { name: name.trim() })
  }
  const time = c.scheduled_at ? new Date(c.scheduled_at).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }) : ''
  const ready = frameReady(c)

  return (
    <div className={mergeClasses(s.card, isPush && s.cardPush)}>
      <div className={s.head}>
        {isPush ? <PhoneRegular /> : <MailRegular />}
        <span className={s.tag}>{t('枠', 'Slot')}</span>
        <span className={s.time}>{time}</span>
        <Tooltip content={t('配信カードで開く(時刻・担当などを入れる)', 'Open the delivery card (time, owner, etc.)')} relationship="label">
          <Button size="small" appearance="subtle" icon={<OpenRegular />} onClick={() => onOpen(c.id)} />
        </Tooltip>
        <Tooltip content={t('この枠を消す', 'Delete this slot')} relationship="label">
          <Button size="small" appearance="subtle" icon={<DeleteRegular />} disabled={!!prog} onClick={() => void frames.remove(c)} />
        </Tooltip>
      </div>
      <div className={s.line}>
        <Input
          size="small"
          className={s.input}
          value={name}
          disabled={busy}
          placeholder={t('配信名', 'Delivery name')}
          onChange={(_, v) => setName(v.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }}
          aria-label={t('配信名', 'Delivery name')}
        />
        <Tooltip content={t('配信名の案を AI で出す(日付・種類・前後の配信から)', 'Suggest a name with AI (from the date, type and nearby deliveries)')} relationship="label">
          <Button size="small" appearance="subtle" icon={naming ? <Spinner size="extra-tiny" /> : <AiIcon />} disabled={busy} onClick={() => void frames.nameFrames([c])} />
        </Tooltip>
      </div>
      <Select size="small" className={s.full} value={c.theme_type ?? ''} disabled={busy} onChange={(_, v) => void frames.saveField(c, { theme_type: v.value })} aria-label={t('種類', 'Type')}>
        <option value="">{t('種類: 未設定', 'Type: not set')}</option>
        {THEME_TYPES.map((k) => (
          <option key={k} value={k}>{themeTypeLabel(k)}</option>
        ))}
      </Select>
      {locked ? (
        <div className={mergeClasses(s.status, s.lock)}>
          <LockClosedRegular />
          {t('確定した週には作れません', 'Cannot create in a confirmed week')}
        </div>
      ) : prog ? (
        <>
          <div className={s.status}>
            <Spinner size="extra-tiny" />
            <span className={s.text}>{prog.step}</span>
          </div>
          <ProgressBar value={prog.total ? prog.done / prog.total : 0} thickness="medium" />
        </>
      ) : (
        <div className={mergeClasses(s.status, fail && s.error)}>
          <Checkbox
            checked={frames.selected.has(c.id)}
            disabled={!ready}
            onChange={(_, v) => frames.toggle(c.id, !!v.checked)}
            aria-label={t('中身を作る対象に選ぶ', 'Select to create the content')}
          />
          <span className={s.text} title={fail}>
            {fail ? t(`失敗: ${fail}`, `Failed: ${fail}`) : ready ? t('中身を作れます', 'Ready to create') : t('配信名と種類を入れてください', 'Enter a name and a type')}
          </span>
          <Tooltip content={t('この枠の中身を AI で作る', 'Create this slot’s content with AI')} relationship="label">
            <Button size="small" appearance="subtle" icon={<AiIcon />} disabled={!ready || frames.running} onClick={() => void frames.generate([c])}>
              {fail ? t('やり直す', 'Retry') : t('作る', 'Create')}
            </Button>
          </Tooltip>
        </div>
      )}
    </div>
  )
}
