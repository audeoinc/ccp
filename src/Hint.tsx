// 慣れたら邪魔な案内(X72 の案内の置き方 3。2026-10-24 利用者と決めた)。× で閉じると、次から出さない。
// 閉じたかどうかは人ごとに覚え(ブラウザ)、自分の設定(ST10)の「ヒントをもう一度出す」(resetHints)で戻せる。
// その場の一言(空の状態の案内)と、詳しい説明(見出しの横の InfoLabel)は、この部品を使わない(ARCHITECTURE の 7 章)
import { useState, useSyncExternalStore, type ReactNode } from 'react'
import { Button, MessageBar, MessageBarActions, MessageBarBody } from '@fluentui/react-components'
import { DismissRegular } from '@fluentui/react-icons'
import { dismissHint, dismissedHints, getHintsVersion, subscribeHints } from './hints'
import { useT } from './i18n'

/** hintKey: ヒントの種類ごとの名前(閉じたことを覚える鍵。文言を変えても同じ鍵なら、閉じたまま) */
export function Hint({ hintKey, children }: { hintKey: string; children: ReactNode }) {
  const t = useT()
  // 設定の画面で戻したら(版が上がる)、出し直す
  const v = useSyncExternalStore(subscribeHints, getHintsVersion)
  const [closedAt, setClosedAt] = useState<number | null>(null)
  if (closedAt === v || dismissedHints().includes(hintKey)) return null
  return (
    <MessageBar intent="info" layout="multiline">
      <MessageBarBody>{children}</MessageBarBody>
      <MessageBarActions
        containerAction={
          <Button
            appearance="transparent"
            size="small"
            icon={<DismissRegular />}
            aria-label={t('このヒントを閉じる(次から出しません)', 'Dismiss this hint (won’t show again)')}
            title={t('閉じる(次から出しません。自分の設定で戻せます)', 'Dismiss (won’t show again; restore it in your settings)')}
            onClick={() => {
              dismissHint(hintKey)
              setClosedAt(v)
            }}
          />
        }
      />
    </MessageBar>
  )
}
