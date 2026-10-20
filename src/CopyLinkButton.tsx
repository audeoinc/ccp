import { useState } from 'react'
import { Button } from '@fluentui/react-components'
import { CheckmarkRegular, LinkRegular } from '@fluentui/react-icons'
import { useT } from './i18n'

/** クリップボードに書く。使えない環境(古いブラウザ・権限がない)では、隠した入力欄から写す */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const el = document.createElement('textarea')
    el.value = text
    el.style.position = 'fixed'
    el.style.opacity = '0'
    document.body.appendChild(el)
    el.select()
    const ok = document.execCommand('copy')
    el.remove()
    return ok
  }
}

/**
 * 「リンクをコピー」(X36)。いま開いている画面(URL に持たせた状態)の URL を写す。
 * 送った相手が開くと、同じ配信カード・結果・アラートが開いた状態で始まる
 */
export function CopyLinkButton() {
  const t = useT()
  const [copied, setCopied] = useState(false)
  return (
      <Button
        type="button"
        size="small"
        appearance="subtle"
        // 説明は title で出す(フロートを開いたとき、最初の操作の部品に焦点が来て、吹き出しが勝手に開くため)
        title={t('この画面を開くリンクをコピーします。チャットやメールに貼ると、相手も同じ画面で開けます', 'Copy a link to this view. Anyone who opens it sees the same screen.')}
        icon={copied ? <CheckmarkRegular /> : <LinkRegular />}
        onClick={async () => {
          if (await copyText(window.location.href)) {
            setCopied(true)
            window.setTimeout(() => setCopied(false), 2000)
          }
        }}
      >
        {copied ? t('コピーしました', 'Copied') : t('リンクをコピー', 'Copy link')}
      </Button>
  )
}
