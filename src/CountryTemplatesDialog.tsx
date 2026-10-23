// テンプレートの「使える国」(ST1)。⚙ →「国」→「この国で使うテンプレート」で開く。
// テンプレートは共通で 1 つ持ち(国ごとに写しを作らない)、どの国で使うかだけを国の適用の表(ST7)に持つ。
// テンプレートの編集の画面には手を入れず、国の設定の側に置く(見た目の中身ではないので、変えても新しい版を作らない)。
// 使わないにしても、その国ですでに使った配信は、版の中身で描くので崩れない。選択肢から消えるだけ
import { useState } from 'react'
import { Dialog, DialogActions, DialogBody, DialogContent, DialogTitle, Button, Select, makeStyles, tokens } from '@fluentui/react-components'
import { CountryApplyList } from './CountryApplyList'
import { ResizableSurface } from './ResizableSurface'
import { countryOptions } from './status'
import { templateOptions, useTemplates } from './templates'
import { optionLabel, useT } from './i18n'

const useStyles = makeStyles({
  body: { display: 'grid', rowGap: '14px' },
  row: { display: 'flex', alignItems: 'center', gap: '8px' },
  label: { fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground3 },
  note: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
})

interface Props {
  open: boolean
  onClose: () => void
  /** ヘッダーで選んでいる国(「すべての国」のときは空。画面の中で選ぶ) */
  country: string
}

export function CountryTemplatesDialog({ open, onClose, country: headerCountry }: Props) {
  const s = useStyles()
  const t = useT()
  useTemplates()
  const [picked, setPicked] = useState(String(countryOptions[0]?.value ?? ''))
  const country = headerCountry || picked
  const countryName = optionLabel(countryOptions.find((o) => String(o.value) === country)?.label)
  // 使わない(無効)のテンプレートは、どの国でも出ないので並べない
  const items = [
    ...templateOptions('email').map((o) => ({ id: o.id, label: o.label, description: o.description, group: t('メール', 'Email') })),
    ...templateOptions('push').map((o) => ({ id: o.id, label: o.label, description: o.description, group: t('アプリ', 'App') })),
  ]

  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && onClose()}>
      <ResizableSurface sizeKey="countryTemplates">
        <DialogBody>
          <DialogTitle>{t('この国で使うテンプレート', 'Templates used in this country')}</DialogTitle>
          <DialogContent className={s.body}>
            <div className={s.row}>
              <span className={s.label}>{t('国', 'Country')}</span>
              {headerCountry ? (
                <span>{countryName}</span>
              ) : (
                <Select size="small" value={country} onChange={(_, d) => setPicked(d.value)}>
                  {countryOptions.map((o) => (
                    <option key={o.value} value={String(o.value)}>
                      {optionLabel(o.label)}
                    </option>
                  ))}
                </Select>
              )}
            </div>
            <span className={s.note}>
              {t(
                'テンプレートは全部の国で共通です。印を外すと、この国の配信・まとめて作る・配信の型・AI の選定の選択肢に出なくなります(この国の全員に効きます)。すでにこのテンプレートを使った配信は、そのまま描けます。まだ決めていないものは、使います。',
                'Templates are shared across countries. Unchecking hides a template from this country’s deliveries, bulk creation, delivery patterns and AI choices (applies to everyone on this country). Deliveries that already use it still render. Undecided templates are used.',
              )}
            </span>
            <CountryApplyList kind="template" country={country} countryName={countryName} items={items} />
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose}>
              {t('閉じる', 'Close')}
            </Button>
          </DialogActions>
        </DialogBody>
      </ResizableSurface>
    </Dialog>
  )
}
