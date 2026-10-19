import { makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { MailFilled, PhoneFilled } from '@fluentui/react-icons'
import { useT } from './i18n'
import { CHANNEL_PUSH } from './status'

const useStyles = makeStyles({
  // 題名の左に置く札。週の表示の配信の帯と同じ色(メール = 青、アプリ = ベリー)
  root: {
    display: 'inline-flex',
    alignItems: 'center',
    columnGap: '6px',
    flexShrink: 0,
    height: '30px',
    padding: '0 12px 0 10px',
    borderRadius: tokens.borderRadiusCircular,
    fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightSemibold,
    whiteSpace: 'nowrap',
  },
  email: { backgroundColor: tokens.colorPaletteBlueBackground2, color: tokens.colorPaletteBlueForeground2, border: `1px solid ${tokens.colorPaletteBlueBorderActive}` },
  app: { backgroundColor: tokens.colorPaletteBerryBackground2, color: tokens.colorPaletteBerryForeground2, border: `1px solid ${tokens.colorPaletteBerryBorderActive}` },
  icon: { fontSize: '20px' },
})

/**
 * 配信のチャネル(メール / アプリ)の札。配信カードの題名の左に置き、開いた瞬間に、どちらの配信かが分かるようにする。
 * アイコン(封筒 / スマートフォン)と文字を並べる(アイコンだけだと見落としやすいため)。見るだけ(変えるのは、左の「チャネル」の欄)
 */
export function ChannelBadge({ channel }: { channel?: string | null }) {
  const s = useStyles()
  const t = useT()
  if (!channel) return null
  const app = channel === CHANNEL_PUSH
  return (
    <span className={mergeClasses(s.root, app ? s.app : s.email)} role="img" aria-label={app ? t('アプリの配信', 'App delivery') : t('メールの配信', 'Email delivery')}>
      {app ? <PhoneFilled className={s.icon} /> : <MailFilled className={s.icon} />}
      {app ? t('アプリ', 'App') : t('メール', 'Email')}
    </span>
  )
}
