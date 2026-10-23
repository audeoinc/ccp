import { useEffect, useState } from 'react'
import { Button, Input, Popover, PopoverSurface, PopoverTrigger, Spinner, makeStyles, tokens } from '@fluentui/react-components'
import { ImageRegular } from '@fluentui/react-icons'
import { PartImagesService } from './data/partImages'
import { isUsablePart } from './heroRights'
import { partImage } from './images'
import { optionLabel, useT } from './i18n'
import { PartImageKind, type PartImage } from './models/partImages'

const useStyles = makeStyles({
  surface: { width: '320px', display: 'grid', rowGap: '8px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '6px', maxHeight: '260px', overflowY: 'auto' },
  item: {
    display: 'grid',
    rowGap: '2px',
    padding: '4px',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    cursor: 'pointer',
    textAlign: 'left',
    minWidth: 0,
    ':hover': { border: `1px solid ${tokens.colorBrandStroke1}` },
  },
  // 透過の部品(ロゴ・アイコン)も見えるように、薄い市松の上に置く
  img: { width: '100%', height: '52px', objectFit: 'contain', backgroundColor: '#f4f4f5' },
  name: { fontSize: '10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  kind: { fontSize: '10px', color: tokens.colorNeutralForeground3 },
  note: { fontSize: '12px', color: tokens.colorNeutralForeground3 },
})

/**
 * 部品の画像のライブラリ(バナー・ボタン・ロゴ・アイコン。X59)から 1 枚選ぶ(テンプレートの画像・動画の部品で使う)。
 * 選んだ画像の URL を返す(メールのプレビューは、ライブラリを読まずに、その URL で描ける)。期限の切れた画像は出さない
 */
export function PartImagePick({ onPick }: { onPick: (img: { id: string; url: string; alt?: string }) => void }) {
  const s = useStyles()
  const t = useT()
  const [open, setOpen] = useState(false)
  const [list, setList] = useState<PartImage[] | null>(null)
  const [q, setQ] = useState('')
  useEffect(() => {
    if (!open || list) return
    let alive = true
    void PartImagesService.getAll().then((r) => {
      if (alive) setList(r.success ? (r.data ?? []).filter((p) => isUsablePart(p) && !!partImage(p)) : [])
    })
    return () => {
      alive = false
    }
  }, [open, list])
  const shown = (list ?? []).filter((p) => !q.trim() || `${p.name} ${p.alt_text ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()))
  return (
    <Popover open={open} onOpenChange={(_, d) => setOpen(d.open)} positioning="below-start" withArrow>
      <PopoverTrigger disableButtonEnhancement>
        <Button size="small" icon={<ImageRegular />}>
          {t('ライブラリから選ぶ', 'Pick from the library')}
        </Button>
      </PopoverTrigger>
      <PopoverSurface className={s.surface}>
        <Input size="small" value={q} placeholder={t('名前で探す', 'Search by name')} onChange={(_, d) => setQ(d.value)} />
        {!list ? (
          <Spinner size="tiny" />
        ) : shown.length === 0 ? (
          <span className={s.note}>{t('使える部品の画像がありません(制作のページの「部品の画像」で足せます)', 'No usable part images (add them under "Part images" on the production page)')}</span>
        ) : (
          <div className={s.grid}>
            {shown.map((p) => (
              <button
                key={p.id}
                type="button"
                className={s.item}
                title={p.name}
                onClick={() => {
                  onPick({ id: p.id, url: partImage(p)!, alt: p.alt_text || undefined })
                  setOpen(false)
                }}
              >
                <img className={s.img} src={partImage(p)} alt={p.alt_text ?? p.name} />
                <span className={s.name}>{p.name}</span>
                <span className={s.kind}>{optionLabel(p.kind_name ?? (p.kind ? PartImageKind[p.kind] : ''))}</span>
              </button>
            ))}
          </div>
        )}
      </PopoverSurface>
    </Popover>
  )
}
