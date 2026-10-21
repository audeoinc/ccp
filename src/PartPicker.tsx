import { useEffect, useState } from 'react'
import { Button, Tooltip, makeStyles, tokens } from '@fluentui/react-components'
import { CodeRegular, LinkRegular } from '@fluentui/react-icons'
import { PartImagesService } from './data/partImages'
import { isUsablePart } from './heroRights'
import { partImage } from './images'
import { optionLabel, useT } from './i18n'
import { PartImageKind, type PartImage } from './models/partImages'

const useStyles = makeStyles({
  list: { display: 'grid', rowGap: '6px' },
  row: { display: 'grid', gridTemplateColumns: '72px minmax(0, 1fr) auto', columnGap: '8px', alignItems: 'center' },
  thumb: {
    width: '72px',
    height: '40px',
    objectFit: 'contain',
    borderRadius: tokens.borderRadiusSmall,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: '#ffffff',
    backgroundImage: 'linear-gradient(45deg, #eee 25%, transparent 25%), linear-gradient(-45deg, #eee 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #eee 75%), linear-gradient(-45deg, transparent 75%, #eee 75%)',
    backgroundSize: '10px 10px',
    backgroundPosition: '0 0, 0 5px, 5px -5px, -5px 0',
  },
  name: { fontSize: tokens.fontSizeBase200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  meta: { fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  info: { display: 'grid', minWidth: 0 },
  tools: { display: 'flex' },
  note: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
})

const abs = (p: PartImage) => new URL(partImage(p) ?? '', location.href).href
const escapeAttr = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
/** メールに貼る <img> のタグ。幅は、高精細の画面でくっきり見えるように、元の大きさの半分(目安) */
const partImgTag = (p: PartImage) => {
  const w = p.width ? Math.round(p.width / 2) : undefined
  return `<img src="${escapeAttr(abs(p))}" alt="${escapeAttr(p.alt_text ?? '')}"${w ? ` width="${w}"` : ''} style="display:block;border:0;height:auto;${w ? `max-width:${w}px;` : ''}" />`
}

/**
 * 制作のページの左の「部品の画像」(X59 ③)。配信の国のライブラリにある、期限内の部品の画像(ボタン・バナー・ロゴ・アイコン)。
 * URL か <img> のタグをコピーして、隣の HTML のエディタに貼る。上げる・直すのは ⚙ の「画像のライブラリ」
 */
export function PartPicker({ market }: { market: 'US' | 'JP' | null }) {
  const s = useStyles()
  const t = useT()
  const [parts, setParts] = useState<PartImage[] | null>(null)
  const [done, setDone] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    void PartImagesService.getAll().then((r) => alive && setParts(r.success ? (r.data ?? []) : []))
    return () => {
      alive = false
    }
  }, [])
  const list = (parts ?? []).filter((p) => (!market || p.market === market) && isUsablePart(p))
  const copy = async (key: string, text: string) => {
    await navigator.clipboard?.writeText(text).catch(() => undefined)
    setDone(key)
    setTimeout(() => setDone((d) => (d === key ? null : d)), 1500)
  }
  if (parts === null) return null
  if (!list.length) return <span className={s.note}>{t('この国の部品の画像はまだありません(⚙ の「画像のライブラリ」で上げられます)', 'No part images for this country yet (upload them in ⚙ Image library)')}</span>
  return (
    <div className={s.list}>
      {list.map((p) => (
        <div key={p.id} className={s.row}>
          <img className={s.thumb} src={partImage(p)} alt={p.alt_text ?? ''} />
          <span className={s.info}>
            <span className={s.name} title={p.name}>{p.name}</span>
            <span className={s.meta}>{[optionLabel(p.kind ? PartImageKind[p.kind] : ''), p.width && p.height ? `${p.width}×${p.height}` : '', p.alt_text ? `alt: ${p.alt_text}` : ''].filter(Boolean).join(' ・ ')}</span>
          </span>
          <span className={s.tools}>
            <Tooltip content={done === `${p.id}:url` ? t('コピーしました', 'Copied') : t('画像の URL をコピー', 'Copy image URL')} relationship="label">
              <Button size="small" appearance="subtle" icon={<LinkRegular />} onClick={() => void copy(`${p.id}:url`, abs(p))} />
            </Tooltip>
            <Tooltip content={done === `${p.id}:tag` ? t('コピーしました', 'Copied') : t('<img> のタグをコピー(代替テキスト・幅つき)', 'Copy <img> tag (with alt and width)')} relationship="label">
              <Button size="small" appearance="subtle" icon={<CodeRegular />} onClick={() => void copy(`${p.id}:tag`, partImgTag(p))} />
            </Tooltip>
          </span>
        </div>
      ))}
    </div>
  )
}
