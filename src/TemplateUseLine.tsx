// テンプレートを選ぶ所の、使われ方の行と、版・無効・国で使わないの知らせ。
// 詳しい画面(ContentPane の ② テンプレート)とシンプルな配信カード(テンプレートの選び直し)で同じ見た目・同じ言葉にするため、ここに置く(X81 の 7)
import { Badge, Button } from '@fluentui/react-components'
import { useContentPaneStyles } from './contentPaneStyles'
import { useT } from './i18n'
import type { EmailTemplateId } from './templates'
import type { TemplateKeyState, TemplateUse } from './templateUse'

/** 最近 4 週で何本・同じ週に何本・最後に使った配信日 */
export function TemplateUseLine({ u }: { u?: TemplateUse }) {
  const s = useContentPaneStyles()
  const t = useT()
  const recent = u?.recent ?? 0
  const week = u?.sameWeek ?? 0
  const last = u?.last ? u.last.slice(5).replace('-', '/') : ''
  return (
    <span className={s.flexRowTight}>
      <Badge size="small" appearance={recent ? 'tint' : 'outline'} color={recent >= 4 ? 'warning' : 'informative'}>
        {t(`最近 4 週で ${recent} 本`, `${recent} in last 4 wks`)}
      </Badge>
      {week > 0 && <Badge size="small" appearance="tint" color="warning">{t(`同じ週に ${week} 本`, `${week} in same week`)}</Badge>}
      <span className={s.caption}>{last ? t(`最後に使った配信日 ${last}`, `Last used ${last}`) : t('この配信日より前の使用なし', 'Not used before this date')}</span>
    </span>
  )
}

/** 知らせの文と「いまの版にする」(押すと、いまの版のテンプレートに替える) */
export function TemplateKeyNote({ state: k, onUpdate }: { state: TemplateKeyState; onUpdate: (id: EmailTemplateId) => void }) {
  const s = useContentPaneStyles()
  const t = useT()
  return (
    <>
      <span className={s.caption}>
        {k.old
          ? t(
              `このテンプレートは、この配信のあとに編集されました(この配信は版 ${k.version}、いまは版 ${k.latest})。この配信は、版 ${k.version} の形のままです。`,
              `This template was edited after this delivery was made (this delivery uses v${k.version}; the latest is v${k.latest}). It keeps the v${k.version} layout.`,
            )
          : k.cur.hidden
            ? t('このテンプレートは、使わない(無効)になっています。この配信は、そのまま使えます。', 'This template is inactive. This delivery can keep using it.')
            : t('このテンプレートは、この国では使わないことになっています(⚙ →「国」)。この配信は、そのまま使えます。', 'This template is not used in this country (⚙ → Country). This delivery can keep using it.')}
      </span>
      {k.canUpdate && (
        <div>
          <Button size="small" appearance="outline" onClick={() => onUpdate(k.base)}>
            {t(`いまの版(版 ${k.latest})にする`, `Use the latest (v${k.latest})`)}
          </Button>
        </div>
      )}
    </>
  )
}
