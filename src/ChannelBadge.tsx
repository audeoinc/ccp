import { makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { MailFilled, PhoneFilled } from '@fluentui/react-icons'
import { useT } from './i18n'
import { CHANNEL_PUSH } from './status'

const useStyles = makeStyles({
  root: {
    display: 'inline-flex',
    alignItems: 'center',
    flexShrink: 0,
    borderRadius: tokens.borderRadiusCircular,
    fontWeight: tokens.fontWeightSemibold,
    whiteSpace: 'nowrap',
    // 塗りつぶしの地に、白抜きのアイコンと文字(小さくても形が読めるように。利用者と決めた案 A)
    color: '#ffffff',
  },
  // 配信カードの題名の左
  card: { columnGap: '6px', height: '30px', padding: '0 12px 0 10px', fontSize: tokens.fontSizeBase300 },
  cardIcon: { fontSize: '20px' },
  // 一覧の列・週の配信の箱など
  small: { columnGap: '4px', height: '20px', padding: '0 8px 0 6px', fontSize: tokens.fontSizeBase100 },
  smallIcon: { fontSize: '13px' },
  // 月の配信の箱の、名前の前(文字なし。幅が狭いため)
  icon: { justifyContent: 'center', width: '16px', height: '16px', borderRadius: tokens.borderRadiusSmall, verticalAlign: '-3px', marginRight: '4px' },
  iconIcon: { fontSize: '11px' },
  email: { backgroundColor: tokens.colorPaletteBlueBorderActive },
  app: { backgroundColor: tokens.colorPaletteBerryBorderActive },
})

interface Props {
  channel?: string | null
  /** card: 配信カードの題名の左 / small: 一覧・週の箱 / icon: 月の箱(アイコンだけ) */
  size?: 'card' | 'small' | 'icon'
}

/**
 * 配信のチャネル(メール / アプリ)の札。メール = 青の地に白い封筒、アプリ = ベリー色の地に白いスマートフォン。
 * 配信カード・月・週・一覧で同じ形にし、どこでも、ぱっと見でどちらの配信かが分かるようにする。見るだけ(変えるのは、配信カードの「チャネル」の欄)
 */
export function ChannelBadge({ channel, size = 'card' }: Props) {
  const s = useStyles()
  const t = useT()
  if (!channel) return null
  const app = channel === CHANNEL_PUSH
  const name = app ? t('アプリ', 'App') : t('メール', 'Email')
  const iconClass = size === 'card' ? s.cardIcon : size === 'small' ? s.smallIcon : s.iconIcon
  return (
    <span className={mergeClasses(s.root, s[size], app ? s.app : s.email)} role="img" aria-label={app ? t('アプリの配信', 'App delivery') : t('メールの配信', 'Email delivery')} title={size === 'icon' ? name : undefined}>
      {app ? <PhoneFilled className={iconClass} /> : <MailFilled className={iconClass} />}
      {size !== 'icon' && name}
    </span>
  )
}
