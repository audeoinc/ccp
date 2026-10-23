import { Button, Tooltip, makeStyles, tokens } from '@fluentui/react-components'
import { OpenRegular } from '@fluentui/react-icons'
import { useT } from './i18n'

/**
 * URL を開く部品(2026-10-23 利用者: URL が書いてある所は、そのページをすぐ開けるようにしたい。素材の URL・商品・ボタンのリンク先など)。
 * どれも新しいタブで開く。押しても、まわりの行・カードを押したことにはしない(行を押すとフロートが開く所があるため)
 */

const useStyles = makeStyles({
  link: { color: tokens.colorBrandForegroundLink, textDecorationLine: 'underline', overflowWrap: 'anywhere', ':hover': { color: tokens.colorBrandForegroundLinkHover } },
})

// 文の中の http(s) の URL(末尾の句読点・かっこは URL に含めない)
const URL_RE = /(https?:\/\/[^\s<>"'、。「」()()]+[^\s<>"'、。「」()().,;:!?])/g

/** 「開く」のアイコンのボタン(URL が http(s) でないときは押せない)。title に URL を出す */
export function OpenLink({ url, label }: { url?: string; label?: string }) {
  const t = useT()
  const ok = !!url && /^https?:\/\//i.test(url.trim())
  return (
    <Tooltip content={ok ? url! : t('開ける URL がありません', 'No URL to open')} relationship="label">
      <Button
        size="small"
        appearance="subtle"
        icon={<OpenRegular />}
        disabled={!ok}
        as="a"
        href={ok ? url!.trim() : undefined}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {label}
      </Button>
    </Tooltip>
  )
}

/** 文を、中の URL だけ押せるようにして描く(コメント・メッセージ・制作指示など) */
export function Linkify({ text }: { text?: string }) {
  const s = useStyles()
  if (!text) return null
  return (
    <>
      {text.split(URL_RE).map((part, i) =>
        i % 2 === 1 ? (
          <a key={i} className={s.link} href={part} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
            {part}
          </a>
        ) : (
          part
        ),
      )}
    </>
  )
}
