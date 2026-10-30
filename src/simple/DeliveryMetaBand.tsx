// 配信の情報の帯(プレビューの上の 1 行。配信日時・国・テーマ)。計画(配信カード)では押すと右のペインが配信の情報になり、
// 制作の画面では、同じ帯を見るだけで出す(2026-10-30 利用者: 配信の情報は制作でも見られたほうがよい)
import type { KeyboardEvent } from 'react'
import { makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { InfoRegular } from '@fluentui/react-icons'
import { LabeledValue } from '../LabeledValue'
import { countryOptions } from '../status'
import { locale, optionLabel, useT } from '../i18n'

const useStyles = makeStyles({
  // メールの中身ではないので、受信箱の見え方(白い札)と違う、薄い灰色の点線の帯にする
  band: {
    display: 'flex',
    alignItems: 'center',
    columnGap: '16px',
    width: '100%',
    minWidth: 0,
    boxSizing: 'border-box',
    padding: '5px 10px',
    borderRadius: tokens.borderRadiusMedium,
    border: `1px dashed ${tokens.colorNeutralStroke1}`,
    backgroundColor: tokens.colorNeutralBackground3,
    color: tokens.colorNeutralForeground2,
    fontFamily: 'inherit',
    textAlign: 'left',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
  },
  button: { cursor: 'pointer', ':hover': { backgroundColor: tokens.colorNeutralBackground3Hover } },
  on: { backgroundColor: tokens.colorBrandBackground2, borderTopColor: tokens.colorBrandStroke1, borderRightColor: tokens.colorBrandStroke1, borderBottomColor: tokens.colorBrandStroke1, borderLeftColor: tokens.colorBrandStroke1 },
  // 配信日時・国は短いので縮めない(テーマが長いときは、そちらを … にする)
  fixed: { flexShrink: 0 },
  // テーマは長くなりやすいので、1 行に収まらなければ …(全文はマウスを載せると出る)
  theme: { display: 'flex', minWidth: 0, flexShrink: 1, overflow: 'hidden' },
  // 受信者には見えないことの印(帯の中の左の端に)
  icon: { display: 'inline-flex', flexShrink: 0, color: tokens.colorNeutralForeground3, fontSize: '14px' },
})

export function DeliveryMetaBand({
  scheduledAt,
  country,
  theme,
  template,
  onClick,
  onKeyDown,
  selected = false,
  title,
}: {
  scheduledAt?: string | null
  country?: string | null
  theme?: string | null
  /** テンプレートの名前(制作の画面だけ。計画では、帯の上のテンプレートの札で出す) */
  template?: string
  /** ないときは、見るだけの帯 */
  onClick?: () => void
  onKeyDown?: (ev: KeyboardEvent<HTMLButtonElement>) => void
  selected?: boolean
  title?: string
}) {
  const s = useStyles()
  const t = useT()
  const body = (
    <>
      <span className={s.icon} aria-hidden>
        <InfoRegular />
      </span>
      <LabeledValue label={t('配信', 'Send')} className={s.fixed}>
        {scheduledAt ? new Date(scheduledAt).toLocaleString(locale(), { month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
      </LabeledValue>
      <LabeledValue label={t('国', 'Country')} className={s.fixed}>
        {optionLabel(countryOptions.find((o) => String(o.value) === (country ?? ''))?.label ?? '')}
      </LabeledValue>
      {/* テーマもここに並べる(テーマを直すのは、この帯から開く配信の情報だけなので、在りかが分かるように。2026-10-27 利用者)。… にした値の全文は、マウスを載せると出る(LabeledValue の truncate) */}
      <span className={s.theme}>
        <LabeledValue label={t('テーマ', 'Theme')} emptyText={t('テーマなし', 'No theme')} truncate>
          {theme}
        </LabeledValue>
      </span>
      {/* テンプレートの名前も長いので、テーマと同じく縮めて … に(テーマが押し出されないように) */}
      {template && (
        <span className={s.theme}>
          <LabeledValue label={t('テンプレート', 'Template')} truncate>
            {template}
          </LabeledValue>
        </span>
      )}
    </>
  )
  if (!onClick)
    return (
      <div className={s.band} title={title}>
        {body}
      </div>
    )
  return (
    <button type="button" className={mergeClasses(s.band, s.button, selected && s.on)} onClick={onClick} onKeyDown={onKeyDown} title={title}>
      {body}
    </button>
  )
}
