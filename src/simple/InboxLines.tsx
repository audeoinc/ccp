// 受信箱・通知での見え方の行(SU5。差出人 / 件名 / プリヘッダー、アプリは通知のタイトル ― 本文)。
// プレビューに写らない件名・プリヘッダーを、押して選べるように、プレビューの上に置く。
// 制作の画面にも同じ行を出す(2026-11-02 利用者: Plan と Production の差の 30「出す」。制作も件名をコピー・直したい)ので、配信カードの行と同じ見た目の部品にした
import { makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { AlertRegular, MailRegular } from '@fluentui/react-icons'
import { useT } from '../i18n'
import { SenderName } from '../SenderName'

const useStyles = makeStyles({
  wrap: { display: 'grid', rowGap: '2px', minWidth: 0 },
  head: { display: 'inline-flex', alignItems: 'center', columnGap: '4px', fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground3 },
  push: { display: 'flex', alignItems: 'center', columnGap: '6px', padding: '6px 10px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground1, border: `1px solid ${tokens.colorNeutralStroke2}`, boxShadow: tokens.shadow2, minWidth: 0 },
  sender: { fontWeight: tokens.fontWeightBold, fontSize: tokens.fontSizeBase300, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  dash: { color: tokens.colorNeutralForeground4, flexShrink: 0 },
  missing: { color: tokens.colorPaletteDarkOrangeForeground1, fontWeight: tokens.fontWeightSemibold, textDecorationLine: 'underline', textDecorationStyle: 'dashed', textUnderlineOffset: '3px' },
  pushIcon: { width: '20px', height: '20px', borderRadius: '5px', display: 'grid', placeItems: 'center', flexShrink: 0, color: tokens.colorNeutralForegroundOnBrand, backgroundColor: tokens.colorBrandBackground, fontSize: '12px' },
  part: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '2px 6px', borderRadius: tokens.borderRadiusSmall, border: '1px solid transparent', backgroundColor: 'transparent', fontFamily: 'inherit', fontSize: tokens.fontSizeBase300, cursor: 'pointer', textAlign: 'left', color: tokens.colorNeutralForeground1, ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover } },
  on: { backgroundColor: tokens.colorBrandBackground2, borderTopColor: tokens.colorBrandStroke1, borderRightColor: tokens.colorBrandStroke1, borderBottomColor: tokens.colorBrandStroke1, borderLeftColor: tokens.colorBrandStroke1 },
  sub: { color: tokens.colorNeutralForeground3, flexShrink: 1 },
  // スマホのメールのアプリの 3 行: 差出人(太字)/ 件名 / プリヘッダー(うすく)
  mail: { display: 'grid', justifyItems: 'start', rowGap: '1px', padding: '6px 4px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground1, border: `1px solid ${tokens.colorNeutralStroke2}`, boxShadow: tokens.shadow2, minWidth: 0 },
  mailSender: { padding: '0 6px', fontWeight: tokens.fontWeightBold, fontSize: tokens.fontSizeBase300, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  mailLine: { maxWidth: '100%', whiteSpace: 'normal', overflowWrap: 'anywhere', overflow: 'visible' },
  mailPre: { fontSize: tokens.fontSizeBase200 },
  // AB の B・C 案で、A と違う所の下線(配信カードの部品の印と同じ)
  diff: { boxShadow: `inset 0 -2px 0 ${tokens.colorPaletteDarkOrangeBorder2}` },
})

export type InboxPart = 'subject' | 'preheader' | 'pushTitle' | 'pushBody'

interface Props {
  channel: string | null | undefined
  country: string | null | undefined
  subject: string
  preheader: string
  pushTitle: string
  pushBody: string
  /** 件名が空のときに出すもの(配信名など。受信箱では件名の代わりに出る) */
  subjectFallback?: string
  /** 選んでいる行 */
  selected?: InboxPart | null
  /** A と違う行(AB の B・C 案を開いているとき) */
  diff?: InboxPart[]
  onSelect: (p: InboxPart) => void
  /** 行の上に出す説明(押すと何が起きるか)。面ごとに言葉が違う */
  tips: Record<InboxPart, string>
}

export function InboxLines({ channel, country, subject, preheader, pushTitle, pushBody, subjectFallback, selected, diff, onSelect, tips }: Props) {
  const s = useStyles()
  const t = useT()
  if (channel === 'email') {
    const subj = subject || subjectFallback || ''
    return (
      <div className={s.wrap}>
        <span className={s.head}>
          <MailRegular />
          {t('受信箱での見え方', 'How it looks in the inbox')}
        </span>
        <div className={s.mail}>
          <span className={s.mailSender} title={t('差出人の名前(設定の画面で決める)', 'Sender name (set in Settings)')}>
            <SenderName country={country} />
          </span>
          <button type="button" className={mergeClasses(s.part, s.mailLine, selected === 'subject' && s.on, diff?.includes('subject') && s.diff, !subj && s.missing)} onClick={() => onSelect('subject')} title={tips.subject}>
            {subj || t('件名未入力', 'No subject')}
          </button>
          <button type="button" className={mergeClasses(s.part, s.mailLine, s.mailPre, preheader ? s.sub : s.missing, selected === 'preheader' && s.on, diff?.includes('preheader') && s.diff)} onClick={() => onSelect('preheader')} title={tips.preheader}>
            {preheader || t('プリヘッダー未入力', 'No preheader')}
          </button>
        </div>
      </div>
    )
  }
  return (
    <div className={s.wrap}>
      <span className={s.head}>
        <AlertRegular />
        {t('スマホの通知での見え方', 'How it looks as a phone notification')}
      </span>
      <div className={s.push}>
        <span className={s.pushIcon} aria-hidden>
          <SenderName country={country} initial />
        </span>
        <span className={s.sender}>
          <SenderName country={country} />
        </span>
        <button type="button" className={mergeClasses(s.part, selected === 'pushTitle' && s.on, !pushTitle && s.missing)} style={{ flexShrink: 0, maxWidth: '50%', fontWeight: 600 }} onClick={() => onSelect('pushTitle')} title={tips.pushTitle}>
          {pushTitle || t('タイトル未入力', 'No title')}
        </button>
        <span className={s.dash}>―</span>
        <button type="button" className={mergeClasses(s.part, pushBody ? s.sub : s.missing, selected === 'pushBody' && s.on)} onClick={() => onSelect('pushBody')} title={tips.pushBody}>
          {pushBody || t('本文未入力', 'No body')}
        </button>
      </div>
    </div>
  )
}
