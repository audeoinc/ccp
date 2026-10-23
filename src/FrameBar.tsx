import { Button, Field, MessageBar, MessageBarBody, Radio, RadioGroup, Select, Spinner, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { CalendarAddRegular, DismissRegular } from '@fluentui/react-icons'
import { locale, optionLabel, useT } from './i18n'
import { AiIcon } from './AiMark'
import { channelOptions, countryOptions } from './status'
import { lockedWeekOf } from './bulkDraft'
import type { WeekRow } from './data/weeks'
import type { WeekFrames } from './useWeekFrames'

// 週の枠の帯。週の表示の上に、スクロールしても見える位置に固定する(枠に入力しながら、いつでも「作る」を押せるように)
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
  // 国・チャネルの欄と「作る」を、下の線でそろえる
  setupRow: { alignItems: 'end' },
  title: { display: 'inline-flex', alignItems: 'center', columnGap: '6px', fontSize: '13px', fontWeight: tokens.fontWeightSemibold },
  field: { minWidth: '220px' },
  radios: { '& label': { whiteSpace: 'nowrap' } },
  hint: { fontSize: '12px', color: tokens.colorNeutralForeground2 },
  spacer: { flexGrow: 1 },
  count: { fontSize: '12px', color: tokens.colorNeutralForeground2 },
})

interface Props {
  frames: WeekFrames
  weekStart: Date
  weeks: WeekRow[]
  /** 週の表示に出ている配信(画面の絞り込みのあと)。枠の数・操作は、見えている枠だけにする(絞り込みで隠れた枠を数えると、見えない「枠 n 本」の帯だけが出るため) */
  visibleIds: Set<string>
}

/**
 * 週の枠(W14)の帯。
 * 「週の枠を作る」を押すと、国・チャネルを 1 回だけ選ぶステップ。枠ができたら、配信名の案・中身を作る(そろった枠をまとめて / 選んだ枠だけ)
 */
export function FrameBar({ frames, weekStart, weeks, visibleIds }: Props) {
  const s = useStyles()
  const t = useT()
  const f = (d: Date) => d.toLocaleDateString(locale(), { month: 'short', day: 'numeric' })
  const weekText = `${f(weekStart)} – ${f(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6))}`
  const dayText = (d: string) => new Date(`${d}T00:00`).toLocaleDateString(locale(), { month: 'numeric', day: 'numeric', weekday: 'short' })
  const optionText = (opts: { value: string; label: string }[], v: string) => optionLabel(opts.find((o) => String(o.value) === v)?.label)
  const error = frames.error && (
    <MessageBar intent="error" layout="multiline">
      <MessageBarBody>{frames.error}</MessageBarBody>
    </MessageBar>
  )

  // 最初のステップ: 国・チャネル
  if (frames.setupOpen) {
    const lock = lockedWeekOf(weeks, weekStart.toISOString(), { country: frames.pickCountry, channel: frames.pickChannel })
    const days = frames.freeDays()
    const channelName = optionText(channelOptions, frames.pickChannel)
    return (
      <div className={s.root}>
        <div className={s.row}>
          <span className={s.title}>
            <CalendarAddRegular />
            {t(`${weekText} の枠を作る配信の、国とチャネルを選んでください`, `Choose the country and channel of the slots for ${weekText}`)}
          </span>
          <span className={s.spacer} />
          <Button size="small" appearance="subtle" icon={<DismissRegular />} onClick={frames.closeSetup}>
            {t('やめる', 'Cancel')}
          </Button>
        </div>
        <div className={mergeClasses(s.row, s.setupRow)}>
          <Field label={t('国', 'Country')} className={s.field}>
            <Select size="small" value={frames.pickCountry} onChange={(_, v) => frames.setPickCountry(v.value)}>
              <option value="">{t('未設定(すべての市場の商品を使う)', 'Not set (use products of all markets)')}</option>
              {countryOptions.map((o) => (
                <option key={o.value} value={String(o.value)}>{optionLabel(o.label)}</option>
              ))}
            </Select>
          </Field>
          <Field label={t('チャネル', 'Channel')} className={s.radios}>
            <RadioGroup layout="horizontal" value={frames.pickChannel} onChange={(_, v) => frames.setPickChannel(v.value)}>
              {channelOptions.map((o) => (
                <Radio key={o.value} value={String(o.value)} label={optionLabel(o.label)} />
              ))}
            </RadioGroup>
          </Field>
          <Button appearance="primary" size="small" icon={frames.creating ? <Spinner size="extra-tiny" /> : <CalendarAddRegular />} disabled={!!lock || days.length === 0 || frames.creating} onClick={() => void frames.makeFrames()}>
            {t(`${days.length} 本の枠を作る`, `Create ${days.length} slot(s)`)}
          </Button>
        </div>
        <div className={s.hint}>
          {lock
            ? t('この週は確定しています。‹ › で、別の週を選んでください。', 'This week is confirmed. Use ‹ › to pick another week.')
            : days.length > 0
              ? t(
                  `この週の、${channelName}のない日(今日以降): ${days.map(dayText).join('、')}。この日に、中身のない配信カード(未起案)を 1 本ずつ作ります。いらない枠は、あとで消せます。`,
                  `Days this week without ${channelName} (from today): ${days.map(dayText).join(', ')}. One empty delivery card (Not started) is created per day. You can delete slots you don't need.`,
                )
              : t('この週には、空いている日がありません。‹ › で別の週を選ぶか、日の「＋」で配信カードを作ってください。', 'No empty days this week. Pick another week with ‹ ›, or use “+” on a day.')}
        </div>
        {error}
      </div>
    )
  }

  const shown = frames.frames.filter((c) => visibleIds.has(c.id))
  const ready = frames.ready.filter((c) => visibleIds.has(c.id))
  const chosen = frames.chosen.filter((c) => visibleIds.has(c.id))
  const n = shown.length
  if (n === 0 && !frames.running && !frames.error) return null
  const unnamed = shown.filter((c) => !c.name?.trim() && !frames.isLocked(c))
  return (
    <div className={s.root}>
      <div className={s.row}>
        <span className={s.title}>
          <AiIcon />
          {t(`この週の枠 ${n} 本`, `${n} slot(s) this week`)}
        </span>
        <span className={s.count}>{t(`中身を作れる ${ready.length} 本・選んだ ${chosen.length} 本`, `${ready.length} ready · ${chosen.length} selected`)}</span>
        <Button size="small" appearance="subtle" icon={<AiIcon />} disabled={unnamed.length === 0 || frames.naming.size > 0} onClick={() => void frames.nameFrames(unnamed)}>
          {t(`名前のない ${unnamed.length} 本に、配信名の案を入れる`, `Suggest names for ${unnamed.length} unnamed slot(s)`)}
        </Button>
        <span className={s.spacer} />
        {frames.running ? (
          <Button size="small" appearance="secondary" icon={<Spinner size="extra-tiny" />} onClick={frames.stop}>
            {t('作るのをやめる', 'Stop')}
          </Button>
        ) : (
          <>
            <Button size="small" disabled={chosen.length === 0} onClick={() => void frames.generate(chosen)}>
              {t(`選んだ ${chosen.length} 本の中身を作る`, `Create ${chosen.length} selected`)}
            </Button>
            <Button size="small" appearance="primary" icon={<AiIcon tone="white" />} disabled={ready.length === 0} onClick={() => void frames.generate(ready)}>
              {t(`そろった ${ready.length} 本の中身を作る`, `Create all ${ready.length} ready`)}
            </Button>
          </>
        )}
      </div>
      <div className={s.hint}>
        {t(
          '枠に配信名と種類を入れると、中身を作れます(AI は、配信名と種類に沿って作ります)。作った中身は保存され、「AI 下書き・未確認」の印が付きます。',
          'Enter a name and a type in a slot to create its content (AI follows them). The content is saved with an “AI draft, unchecked” mark.',
        )}
      </div>
      {error}
    </div>
  )
}
