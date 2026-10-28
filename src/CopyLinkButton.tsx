import { useState } from 'react'
import { Button } from '@fluentui/react-components'
import { CheckmarkRegular, LinkRegular } from '@fluentui/react-icons'
import { useT } from './i18n'
import { copyText } from './clipboard'
import { useFeature } from './featureFlags'
import { FeatureBadge } from './FeatureBadge'

/**
 * 「リンクをコピー」(X36)。いま開いている画面(URL に持たせた状態)の URL を写す。
 * 送った相手が開くと、同じ配信カード・結果・アラートが開いた状態で始まる
 */
export function CopyLinkButton({ iconOnly = false }: { /** 文字を出さず、印だけ(詰めた題の行。コピーしたあとだけ「コピーしました」と出す) */ iconOnly?: boolean } = {}) {
  const t = useT()
  const on = useFeature('common.deeplink')
  const [copied, setCopied] = useState(false)
  // 機能の公開・非公開(X87)
  if (!on) return null
  return (
      <Button
        type="button"
        size="small"
        appearance="subtle"
        // 説明は title で出す(フロートを開いたとき、最初の操作の部品に焦点が来て、吹き出しが勝手に開くため)
        title={t('この画面を開くリンクをコピーします。チャットやメールに貼ると、相手も同じ画面で開けます', 'Copy a link to this view. Anyone who opens it sees the same screen.')}
        aria-label={t('リンクをコピー', 'Copy link')}
        icon={copied ? <CheckmarkRegular /> : <LinkRegular />}
        onClick={async () => {
          if (await copyText(window.location.href)) {
            setCopied(true)
            window.setTimeout(() => setCopied(false), 2000)
          }
        }}
      >
        {copied ? t('コピーしました', 'Copied') : iconOnly ? undefined : t('リンクをコピー', 'Copy link')}
        <FeatureBadge id="common.deeplink" />
      </Button>
  )
}
