// テンプレートの部品の、配信ごとの中身を直す欄(T8 段階 6。src/partContent.ts)。
// シンプルな配信カードの部品のペインと、詳しい配信カードのタブ(③ ヒーロー・④ セクション)の両方で、この部品を使う(処理を複製しない)。
// 直せるのは、テンプレートで許した所だけ: テキストの文・ボタンの文言(canRewrite)、画像・動画と画像のボタンの画像(canSwapImage)
import type { ReactNode } from 'react'
import { Button, Field, Input, makeStyles, tokens } from '@fluentui/react-components'
import { AutoTextarea } from './AutoTextarea'
import { PartImagePick } from './PartImagePick'
import { useT } from './i18n'
import { typo } from './typo'
import { defaultButtonLabel, type TablePart } from './templates'
import { canRewrite, canSwapImage, hasPartFields, partImageOf, setPartValue, templateText, type PartContent, type PartValue } from './partContent'

const useStyles = makeStyles({
  root: { display: 'grid', rowGap: '8px', minWidth: 0 },
  caption: typo.caption,
  label: typo.label,
  row: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' },
  // 差し替えた画像の見本(部品の画像は透過のものもあるので、薄い地の上に)
  img: { width: '100%', maxHeight: '160px', objectFit: 'contain', backgroundColor: tokens.colorNeutralBackground3, borderRadius: tokens.borderRadiusMedium },
  item: { display: 'grid', rowGap: '6px', paddingTop: '8px', borderTop: `1px solid ${tokens.colorNeutralStroke2}`, ':first-child': { borderTop: 'none', paddingTop: 0 } },
})

interface Props {
  /** テンプレートの部品(書き換える前の形) */
  part: TablePart
  value: PartContent
  /** 中身を変える(配信カードの setPartContent) */
  onChange: (fn: (pc: PartContent) => PartContent) => void
  /** AB テストの配信(案ごとに替えられると添える) */
  variants?: boolean
  autoFocus?: boolean
}

/** 1 つの部品の、文の書き換えと画像の差し替え。許していない部品には何も出さない */
export function PartContentFields({ part: p, value, onChange, variants, autoFocus }: Props) {
  const s = useStyles()
  const t = useT()
  if (!hasPartFields(p)) return null
  const mine = value[p.id]
  const set = (patch: Partial<PartValue>) => onChange((pc) => setPartValue(pc, p.id, patch))
  const button = p.type === 'button'
  // ボタンの文言が空のテンプレートは、メールでは既定の文言(商品を見る)になる
  const tplText = templateText(p) || (button ? defaultButtonLabel(0) : '')
  const text = mine?.text ?? ''
  const img = partImageOf(p, value)
  return (
    <div className={s.root}>
      {canRewrite(p) && (
        <>
          <Field label={button ? t('この配信の文言', 'Label for this delivery') : t('この配信の文', 'Text for this delivery')} hint={t('空にすると、テンプレートの文(薄い文字)のまま出ます。', 'Leave empty to use the template text (shown in light text).') + (variants ? t(' 案ごとに書き換えられます。', ' Each variant can differ.') : '')} size="small">
            {button ? (
              <Input size="small" autoFocus={autoFocus} value={text} placeholder={tplText} maxLength={30} onChange={(_, d) => set({ text: d.value })} />
            ) : (
              <AutoTextarea heightKey="PartContentFields.text" size="small" rows={3} autoFocus={autoFocus} value={text} placeholder={tplText} maxLength={2000} onChange={(_, d) => set({ text: d.value })} />
            )}
          </Field>
          <span className={s.row}>
            {!text && tplText && (
              <Button size="small" appearance="subtle" onClick={() => set({ text: tplText })}>
                {t('テンプレートの文を写して直す', 'Copy the template text to edit')}
              </Button>
            )}
            {text && (
              <Button size="small" appearance="subtle" onClick={() => set({ text: '' })}>
                {t('テンプレートの文に戻す', 'Back to the template text')}
              </Button>
            )}
          </span>
        </>
      )}
      {canSwapImage(p) && (
        <>
          <span className={s.caption}>
            {mine?.src ? t('この配信の画像に差し替えています。', 'Swapped to an image for this delivery.') : t('テンプレートの画像です。この配信の画像に差し替えられます。', 'This is the template image. You can swap it for this delivery.')}
            {variants && t(' 案ごとに替えられます。', ' Each variant can differ.')}
          </span>
          {img.src && <img className={s.img} src={img.src} alt={img.alt ?? ''} />}
          <PartImagePick onPick={(x) => set({ src: x.url, imageId: x.id, alt: x.alt ?? mine?.alt })} />
          <Field label={t('代わりの文(画像が出ないときの文)', 'Alt text (shown if the image does not load)')} size="small">
            <Input size="small" value={mine?.alt ?? ''} placeholder={p.alt} maxLength={200} onChange={(_, d) => set({ alt: d.value })} />
          </Field>
          {(mine?.src || mine?.alt) && (
            <span className={s.row}>
              {/* 画像と代わりの文だけを外す(画像の上に文字のボタンの、書き換えた文言は残す) */}
              <Button size="small" appearance="subtle" onClick={() => set({ src: '', imageId: '', alt: '' })}>
                {t('テンプレートの画像に戻す', 'Back to the template image')}
              </Button>
            </span>
          )}
        </>
      )}
    </div>
  )
}

/**
 * 詳しい配信カードのタブに置く、テンプレートの部品の一覧(書き換え・差し替えを許した部品だけ)。部品ごとに、説明(S1 テキスト など)と欄。
 * 許した部品がなければ何も出さない
 */
export function TemplatePartsList({ parts, label, value, onChange, variants }: { parts: TablePart[]; label: (p: TablePart) => ReactNode; value: PartContent; onChange: Props['onChange']; variants?: boolean }) {
  const s = useStyles()
  const list = parts.filter(hasPartFields)
  if (list.length === 0) return null
  return (
    <div className={s.root}>
      {list.map((p) => (
        <div key={p.id} className={s.item}>
          <span className={s.label}>{label(p)}</span>
          <PartContentFields part={p} value={value} onChange={onChange} variants={variants} />
        </div>
      ))}
    </div>
  )
}
