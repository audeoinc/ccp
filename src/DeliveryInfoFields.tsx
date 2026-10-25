import type { ReactNode } from 'react'
import { Field, Input, Select, ToggleButton, makeStyles, tokens } from '@fluentui/react-components'
import { optionLabel, useT } from './i18n'
import { AGE_BANDS, TARGET_GENDERS, ageLabel, formatAges, genderLabel, parseAges, type TargetGender } from './target'
import { statusColor, statusOptions } from './status'

/**
 * 配信の情報の入力欄(配信名・配信日時・選択肢・ステータス・配信の対象・担当)。
 * 詳しい配信カード(左のペイン)とシンプルな配信カード(PartPane の配信の情報)で、同じ部品を使う(整理 #6。見た目と振る舞いがずれていたため)。
 * 欄の値の持ち方は画面ごとに違うので、値と書き換えの関数だけを受け取る。field は data-field(シンプルで、押した項目の欄へ入るための目印)
 */

const useStyles = makeStyles({
  row: { display: 'flex', alignItems: 'center', columnGap: '6px' },
  dot: { width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0 },
  grow: { flexGrow: 1, minWidth: 0 },
  targetBox: { display: 'grid', rowGap: '6px', padding: '8px 10px', borderRadius: tokens.borderRadiusMedium, border: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: tokens.colorNeutralBackground2 },
  targetRow: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px' },
  targetLabel: { width: '44px', flexShrink: 0, fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  chip: { minWidth: 'auto', height: '24px', padding: '0 10px', fontWeight: tokens.fontWeightRegular },
})

type Size = 'small' | 'medium'

export function NameField({ value, onChange, size, field }: { value: string; onChange: (v: string) => void; size?: Size; field?: string }) {
  const t = useT()
  return (
    <Field label={t('配信名', 'Delivery name')} size={size} required data-field={field}>
      <Input size="small" required value={value} onChange={(_, d) => onChange(d.value)} />
    </Field>
  )
}

export function ScheduledAtField({ value, onChange, size, field }: { value: string; onChange: (v: string) => void; size?: Size; field?: string }) {
  const t = useT()
  return (
    <Field label={t('配信日時', 'Send date & time')} size={size} required data-field={field}>
      <Input size="small" required type="datetime-local" value={value} onChange={(_, d) => onChange(d.value)} />
    </Field>
  )
}

/** 選択肢の欄(国・チャネル・種類)。先頭は「未設定」 */
export function ChoiceField({ label, value, options, onChange, hint, size, field }: {
  label: string
  value: string
  options: { value: string | number; label: string }[]
  onChange: (v: string) => void
  hint?: string
  size?: Size
  field?: string
}) {
  const t = useT()
  return (
    <Field label={label} hint={hint} size={size} data-field={field}>
      <Select size="small" value={value} onChange={(_, d) => onChange(d.value)}>
        <option value="">{t('未設定', 'Not set')}</option>
        {options.map((o) => (
          <option key={o.value} value={String(o.value)}>{optionLabel(o.label)}</option>
        ))}
      </Select>
    </Field>
  )
}

export function StatusField({ value, onChange, size, field }: { value: string; onChange: (v: string) => void; size?: Size; field?: string }) {
  const t = useT()
  const s = useStyles()
  return (
    <Field label={t('ステータス', 'Status')} size={size} data-field={field}>
      <span className={s.row}>
        <span className={s.dot} style={{ backgroundColor: statusColor(value) }} />
        <Select size="small" className={s.grow} value={value} onChange={(_, d) => onChange(d.value)}>
          {statusOptions.map((o) => (
            <option key={o.value} value={String(o.value)}>{optionLabel(o.label)}</option>
          ))}
          {/* 確定した週の配信の値(confirmed)は、画面の選択肢にはない(確定は週の言葉)ので、その値のときだけ出す */}
          {value === 'confirmed' && <option value="confirmed">{t('承認済み(週が確定)', 'Approved (week confirmed)')}</option>}
        </Select>
      </span>
    </Field>
  )
}

/**
 * 配信の対象(X40): 性別と年代のチップ。AI の下書きと商品の候補が、これに合わせる。
 * children は、箱の中の続きの行(詳しい画面の、アプリの送る相手)
 */
export function TargetField({ gender, ages, onGender, onAges, size, field, children }: {
  gender: string
  ages: string
  onGender: (v: TargetGender) => void
  onAges: (v: string) => void
  size?: Size
  field?: string
  children?: ReactNode
}) {
  const t = useT()
  const s = useStyles()
  const now = parseAges(ages)
  return (
    <Field label={t('配信の対象', 'Target')} hint={t('AI の下書きと商品の候補が、これに合わせます', 'AI drafts and product candidates follow this')} size={size} data-field={field}>
      <div className={s.targetBox}>
        <div className={s.targetRow}>
          <span className={s.targetLabel}>{t('性別', 'Gender')}</span>
          {(['', ...TARGET_GENDERS] as TargetGender[]).map((g) => (
            <ToggleButton key={g || 'none'} className={s.chip} size="small" shape="circular" checked={gender === g} appearance={gender === g ? 'primary' : 'outline'} onClick={() => onGender(g)}>
              {genderLabel(g)}
            </ToggleButton>
          ))}
        </div>
        <div className={s.targetRow}>
          <span className={s.targetLabel}>{t('年代', 'Age')}</span>
          <ToggleButton className={s.chip} size="small" shape="circular" checked={!ages} appearance={!ages ? 'primary' : 'outline'} onClick={() => onAges('')}>
            {t('指定なし', 'Not specified')}
          </ToggleButton>
          {AGE_BANDS.map((a) => {
            const on = now.includes(a)
            return (
              <ToggleButton key={a} className={s.chip} size="small" shape="circular" checked={on} appearance={on ? 'primary' : 'outline'} onClick={() => onAges(formatAges(on ? now.filter((x) => x !== a) : [...now, a]))}>
                {ageLabel(a)}
              </ToggleButton>
            )
          })}
        </div>
        {children}
      </div>
    </Field>
  )
}

/** 担当者(これまでに使った名前から選べる。自由にも書ける) */
export function OwnerField({ value, onChange, owners, size, field }: { value: string; onChange: (v: string) => void; owners: string[]; size?: Size; field?: string }) {
  const t = useT()
  return (
    <Field label={t('担当者', 'Owner')} size={size} data-field={field}>
      <Input size="small" list="ccp-owners" value={value} onChange={(_, d) => onChange(d.value)} />
      <datalist id="ccp-owners">
        {owners.map((o) => <option key={o} value={o} />)}
      </datalist>
    </Field>
  )
}

