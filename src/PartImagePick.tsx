import { useEffect, useState } from 'react'
import { Button, Spinner, makeStyles, tokens } from '@fluentui/react-components'
import { ArrowUploadRegular, ImageMultipleRegular, ImageRegular } from '@fluentui/react-icons'
import { ChoosePanel } from './ChoosePanel'
import { DropZone } from './DropZone'
import { myName } from './history'
import { PartUploadDialog } from './PartUploadDialog'
import { PartImagesService } from './data/partImages'
import { isUsablePart } from './heroRights'
import { partImage } from './images'
import { FilterChips, SearchField } from './SearchField'
import { optionLabel, useT } from './i18n'
import { PartImageKind, type PartImage } from './models/partImages'

const useStyles = makeStyles({
  root: { display: 'grid', rowGap: '6px', minWidth: 0 },
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
 * 部品の画像のライブラリ(バナー・ボタン・ロゴ・アイコン。X59)から 1 枚選ぶ(テンプレートの画像・動画・ボタンの部品で使う)。
 * メイン画像の入れ替えと同じ「選び直す」の枠(ChoosePanel。SU3)で、ライブラリから選ぶか、持っている画像を上げる。
 * 選んだ画像の URL を返す(メールのプレビューは、ライブラリを読まずに、その URL で描ける)。期限の切れた画像は出さない
 */
export function PartImagePick({ onPick }: { onPick: (img: { id: string; url: string; alt?: string }) => void }) {
  const s = useStyles()
  const t = useT()
  const [open, setOpen] = useState(false)
  const [list, setList] = useState<PartImage[] | null>(null)
  const [q, setQ] = useState('')
  const [kind, setKind] = useState<keyof typeof PartImageKind | ''>('')
  // アップロードのタブに落としたファイル(上げる窓を開いて、すぐ上げる)
  const [uploading, setUploading] = useState<File | null>(null)
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
  const kinds = [...new Set((list ?? []).map((p) => p.kind).filter(Boolean))] as (keyof typeof PartImageKind)[]
  const shown = (list ?? []).filter((p) => (!kind || p.kind === kind) && (!q.trim() || `${p.name} ${p.alt_text ?? ''} ${p.tags ?? ''}`.toLowerCase().includes(q.trim().toLowerCase())))
  const choose = (p: PartImage) => {
    onPick({ id: p.id, url: partImage(p)!, alt: p.alt_text || undefined })
    setOpen(false)
  }
  return (
    <div className={s.root}>
      {!open && (
        <span>
          <Button size="small" icon={<ImageRegular />} onClick={() => setOpen(true)}>
            {t('ライブラリから選ぶ', 'Pick from the library')}
          </Button>
        </span>
      )}
      {open && (
        <ChoosePanel
          title={t('部品の画像を選ぶ', 'Choose a part image')}
          onClose={() => setOpen(false)}
          tabs={[
            {
              value: 'library',
              label: t('ライブラリから', 'From the library'),
              icon: <ImageMultipleRegular />,
              content: (
                <>
                  <SearchField value={q} placeholder={t('名前・代替テキスト・タグで探す', 'Search name, alt text, tags')} onChange={setQ} count={list ? shown.length : undefined} autoFocus />
                  {kinds.length > 1 && (
                    <FilterChips
                      allLabel={t('すべて', 'All')}
                      toggle
                      options={kinds.map((k) => ({ value: k, label: optionLabel(PartImageKind[k]) }))}
                      value={kind}
                      onChange={setKind}
                    />
                  )}
                  {!list ? (
                    <Spinner size="tiny" />
                  ) : shown.length === 0 ? (
                    <span className={s.note}>{t('使える部品の画像がありません(「アップロード」のタブで上げられます)', 'No usable part images (upload one in the Upload tab)')}</span>
                  ) : (
                    <div className={s.grid}>
                      {shown.map((p) => (
                        <button key={p.id} type="button" className={s.item} title={p.name} onClick={() => choose(p)}>
                          <img className={s.img} src={partImage(p)} alt={p.alt_text ?? p.name} />
                          <span className={s.name}>{p.name}</span>
                          <span className={s.kind}>{optionLabel(p.kind_name ?? (p.kind ? PartImageKind[p.kind] : ''))}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ),
            },
            {
              value: 'upload',
              label: t('アップロード', 'Upload'),
              icon: <ArrowUploadRegular />,
              content: (
                <>
                  <DropZone accept=".png,.jpg,.jpeg,.webp,.avif" hint={t('持っている画像をここに落とす(PNG・JPEG・WebP・AVIF)', 'Drop your own image here (PNG, JPEG, WebP, AVIF)')} onFile={setUploading} />
                  <span className={s.note}>{t('上げた画像は部品の画像のライブラリに入り、ここで選んだことになります。名前・代替テキストは AI が下書きします', 'The image goes into the part library and is picked here. AI drafts its name and alt text')}</span>
                </>
              ),
            },
          ]}
        />
      )}
      {uploading && (
        <PartUploadDialog
          market={null}
          me={myName()}
          file={uploading}
          onClose={() => setUploading(null)}
          onDone={(p) => {
            setUploading(null)
            setList(null)
            if (partImage(p)) choose(p)
          }}
        />
      )}
    </div>
  )
}
