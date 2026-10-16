import { Button, Field, MessageBar, MessageBarBody, Radio, RadioGroup, Select, Spinner, Tooltip, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { DeleteRegular, DismissRegular, MailRegular, PhoneRegular, SaveRegular, CalendarAddRegular } from '@fluentui/react-icons'
import { locale, optionLabel, useT } from './i18n'
import { AiIcon } from './AiMark'
import { CHANNEL_PUSH, channelOptions, countryOptions } from './status'
import { BULK_MAX, lockedWeekOf } from './bulkDraft'
import type { WeekRow } from './data/weeks'
import type { BulkDrafts } from './useBulkDrafts'

// 下書きモードの帯。週の表示の上に、スクロールしても見える位置に固定する(保存・破棄を決めるまで、いつでも押せるように)
const useStyles = makeStyles({
  root: {
    position: 'sticky',
    top: 0,
    zIndex: 5,
    display: 'grid',
    rowGap: '8px',
    padding: '10px 14px',
    marginBottom: '10px',
    borderRadius: tokens.borderRadiusLarge,
    border: `1.5px dashed ${tokens.colorBrandStroke1}`,
    backgroundColor: tokens.colorBrandBackground2,
    boxShadow: tokens.shadow4,
  },
  row: { display: 'flex', alignItems: 'center', columnGap: '10px', rowGap: '6px', flexWrap: 'wrap' },
  title: { display: 'inline-flex', alignItems: 'center', columnGap: '6px', fontSize: '13px', fontWeight: tokens.fontWeightSemibold },
  setup: { display: 'inline-flex', alignItems: 'center', columnGap: '6px', fontSize: '13px', fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground1 },
  field: { minWidth: '220px' },
  radios: { '& label': { whiteSpace: 'nowrap' } },
  // 国・チャネルの欄と「次へ」を、下の線でそろえる
  setupRow: { alignItems: 'end' },
  hint: { fontSize: '12px', color: tokens.colorNeutralForeground2 },
  spacer: { flexGrow: 1 },
  count: { fontSize: '12px', color: tokens.colorNeutralForeground2 },
})

interface Props {
  bulk: BulkDrafts
  weekStart: Date
  weeks: WeekRow[]
  /** 下書きモードを終える(保存していない下書きがあれば、App が確かめる) */
  onExit: () => void
}

/**
 * まとめて AI で下書き(W14)の帯。
 * 最初は、国・チャネルを 1 回だけ選ぶステップ。決めると、週の列に下書きが並び、この帯で、作る・保存・破棄・終わるを行う
 */
export function BulkDraftBar({ bulk, weekStart, weeks, onExit }: Props) {
  const s = useStyles()
  const t = useT()
  const optionText = (opts: { value: string; label: string }[], v: string) => optionLabel(opts.find((o) => String(o.value) === v)?.label)
  const f = (d: Date) => d.toLocaleDateString(locale(), { month: 'short', day: 'numeric' })
  const weekText = `${f(weekStart)} – ${f(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6))}`
  const dayText = (d: string) => new Date(`${d}T00:00`).toLocaleDateString(locale(), { month: 'numeric', day: 'numeric', weekday: 'short' })
  const lock = lockedWeekOf(weeks, { scheduledAt: weekStart.toISOString() })
  const notes = (
    <>
      {bulk.restored > 0 && (
        <MessageBar intent="info" layout="multiline">
          <MessageBarBody>{t(`前回、保存しないまま閉じた下書きを ${bulk.restored} 本、戻しました。`, `Restored ${bulk.restored} draft(s) that were not saved last time.`)}</MessageBarBody>
        </MessageBar>
      )}
      {bulk.error && (
        <MessageBar intent="error" layout="multiline">
          <MessageBarBody>{bulk.error}</MessageBarBody>
        </MessageBar>
      )}
    </>
  )

  // 最初のステップ: 国・チャネル
  if (!bulk.setup) {
    const days = bulk.freeDays({ country: bulk.pickCountry, channel: bulk.pickChannel })
    const channelName = optionText(channelOptions, bulk.pickChannel)
    return (
      <div className={s.root}>
        <div className={s.row}>
          <span className={s.title}>
            <AiIcon />
            {t(`${weekText} にまとめて作る配信の、国とチャネルを選んでください`, `Choose the country and channel for the deliveries to create for ${weekText}`)}
          </span>
          <span className={s.spacer} />
          <Button size="small" appearance="subtle" icon={<DismissRegular />} onClick={onExit}>
            {t('やめる', 'Cancel')}
          </Button>
        </div>
        <div className={mergeClasses(s.row, s.setupRow)}>
          <Field label={t('国', 'Country')} className={s.field}>
            <Select size="small" value={bulk.pickCountry} onChange={(_, v) => bulk.setPickCountry(v.value)}>
              <option value="">{t('未設定(すべての市場の商品を使う)', 'Not set (use products of all markets)')}</option>
              {countryOptions.map((o) => (
                <option key={o.value} value={String(o.value)}>{optionLabel(o.label)}</option>
              ))}
            </Select>
          </Field>
          <Field label={t('チャネル', 'Channel')} className={s.radios}>
            <RadioGroup layout="horizontal" value={bulk.pickChannel} onChange={(_, v) => bulk.setPickChannel(v.value)}>
              {channelOptions.map((o) => (
                <Radio key={o.value} value={String(o.value)} label={optionLabel(o.label)} />
              ))}
            </RadioGroup>
          </Field>
          <Button appearance="primary" size="small" disabled={!!lock} onClick={bulk.confirmSetup}>
            {days.length > 0 && !lock ? t(`次へ(${Math.min(days.length, BULK_MAX)} 本の下書きを並べる)`, `Next (place ${Math.min(days.length, BULK_MAX)} drafts)`) : t('次へ', 'Next')}
          </Button>
        </div>
        <div className={s.hint}>
          {lock
            ? t('この週は確定しています。‹ › で、別の週を選んでください。', 'This week is confirmed. Use ‹ › to pick another week.')
            : days.length > 0
              ? t(
                  `この週の、${channelName}のない日(今日以降): ${days.map(dayText).join('、')}。次へ進むと、この日に 1 本ずつ下書きを並べます。`,
                  `Days this week without ${channelName} (from today): ${days.map(dayText).join(', ')}. Next places one draft per day.`,
                )
              : t('この週には、空いている日がありません。次へ進んで、日の「＋」で下書きを足すか、‹ › で別の週を選んでください。', 'No empty days this week. Go next and use “+” on a day, or use ‹ › to pick another week.')}
        </div>
        {notes}
      </div>
    )
  }

  const c = bulk.setup
  const saved = bulk.drafts.filter((d) => d.state === 'saved').length
  return (
    <div className={s.root}>
      <div className={s.row}>
        <span className={s.title}>
          <AiIcon />
          {t('下書きモード', 'Draft mode')}
        </span>
        <span className={s.setup}>
          {c.channel === CHANNEL_PUSH ? <PhoneRegular /> : <MailRegular />}
          {`${c.country ? optionText(countryOptions, c.country) : t('国: 未設定', 'Country: not set')} ・ ${optionText(channelOptions, c.channel)}`}
        </span>
        <Button size="small" appearance="subtle" disabled={bulk.running || bulk.saving} onClick={bulk.resetSetup}>
          {t('変える', 'Change')}
        </Button>
        {bulk.running ? (
          <Button size="small" appearance="secondary" icon={<Spinner size="extra-tiny" />} onClick={bulk.stop}>
            {t('作るのをやめる', 'Stop')}
          </Button>
        ) : (
          <Button size="small" appearance="primary" icon={<AiIcon tone="white" />} disabled={bulk.ready.length === 0 || bulk.saving} onClick={() => void bulk.generate(bulk.ready.map((d) => d.key))}>
            {t(`AI で作る(${bulk.ready.length} 本)`, `Create with AI (${bulk.ready.length})`)}
          </Button>
        )}
        <Tooltip content={bulk.full ? t(`1 回に作れるのは ${BULK_MAX} 本までです`, `You can create up to ${BULK_MAX} at a time`) : t('見ている週の、空いている日に下書きを足します(日の「＋」でも足せます)', 'Adds drafts on the empty days of the shown week (or use “+” on a day)')} relationship="description">
          <Button size="small" appearance="subtle" icon={<CalendarAddRegular />} disabledFocusable={bulk.full || bulk.running} onClick={bulk.fillEmpty}>
            {t('空いている日で埋める', 'Fill empty days')}
          </Button>
        </Tooltip>
        <span className={s.spacer} />
        <span className={s.count}>
          {t(`下書き ${bulk.live.length} 本(保存に選んだもの ${bulk.checked.length} 本)・保存済み ${saved} 本`, `${bulk.live.length} draft(s), ${bulk.checked.length} selected · ${saved} saved`)}
        </span>
        <Button size="small" icon={<DeleteRegular />} disabled={bulk.checked.length === 0 || bulk.saving || bulk.running} onClick={() => bulk.discard(bulk.checked)}>
          {t('選んだ下書きを破棄', 'Discard selected')}
        </Button>
        <Button size="small" appearance="primary" icon={bulk.saving ? <Spinner size="extra-tiny" /> : <SaveRegular />} disabled={bulk.checked.length === 0 || bulk.saving || bulk.running} onClick={() => void bulk.saveDrafts(bulk.checked)}>
          {t(`選んだ ${bulk.checked.length} 本を保存`, `Save ${bulk.checked.length} selected`)}
        </Button>
        <Button size="small" disabled={bulk.saving} onClick={onExit}>
          {t('終わる', 'Finish')}
        </Button>
      </div>
      {notes}
    </div>
  )
}
