import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Badge, Button, Dialog, DialogBody, DialogSurface, DialogTitle, Field, Input, Spinner, Textarea, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { ArrowDownloadRegular, AttachRegular, DeleteRegular, DismissRegular, DocumentPdfRegular, DocumentRegular, EditRegular, LinkRegular, OpenRegular } from '@fluentui/react-icons'
import { CardAssetsService } from './data/cardAssets'
import { CardNotesService } from './data/cardNotes'
import { CreativeFiles } from './data/creativeFiles'
import { CREATIVE_EXTS, CREATIVE_MAX_BYTES, IMAGE_EXTS, extOf } from './creativeConst'
import { CommentsPanel } from './CommentsPanel'
import { myName, onMeChange } from './history'
import { locale, tr, useT } from './i18n'
import type { CardAsset } from './models/cardAssets'
import type { Product } from './models/products'

const useStyles = makeStyles({
  root: { display: 'grid', rowGap: '10px', alignContent: 'start' },
  head: { display: 'flex', alignItems: 'center', columnGap: '6px', fontWeight: tokens.fontWeightSemibold },
  caption: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  error: { fontSize: tokens.fontSizeBase200, color: tokens.colorPaletteRedForeground1 },
  drop: {
    display: 'grid',
    justifyItems: 'center',
    rowGap: '4px',
    padding: '12px',
    border: `1px dashed ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
    textAlign: 'center',
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
  },
  dropOn: { border: `1px dashed ${tokens.colorBrandStroke1}`, backgroundColor: tokens.colorBrandBackground2 },
  // 狭いペイン(配信カードの右端)でもはみ出さないよう、縦に積む
  urlRow: { display: 'grid', rowGap: '6px', justifyItems: 'stretch' },
  addBtn: { justifySelf: 'start' },
  list: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '8px' },
  tile: {
    display: 'grid',
    gridTemplateRows: '96px auto',
    textAlign: 'left',
    padding: 0,
    overflow: 'hidden',
    fontFamily: 'inherit',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    cursor: 'pointer',
    ':hover': { border: `1px solid ${tokens.colorBrandStroke1}` },
  },
  thumb: { width: '100%', height: '96px', objectFit: 'cover', backgroundColor: tokens.colorNeutralBackground3 },
  icon: { display: 'grid', placeItems: 'center', height: '96px', fontSize: '36px', color: tokens.colorNeutralForeground3, backgroundColor: tokens.colorNeutralBackground3 },
  tileBody: { display: 'grid', rowGap: '2px', padding: '6px 8px', minWidth: 0 },
  tileName: { fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  tileSub: { fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  // 素材のフロート
  surface: { width: 'min(1100px, 94vw)', maxWidth: 'none', height: '86vh' },
  body: { height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 },
  titleRow: { display: 'flex', alignItems: 'center', columnGap: '8px' },
  grow: { flexGrow: 1, minWidth: 0 },
  floatCols: { display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(300px, 2fr)', columnGap: '16px', minHeight: 0, flexGrow: 1, marginTop: '8px' },
  viewer: { display: 'grid', rowGap: '8px', alignContent: 'start', minHeight: 0, overflow: 'auto' },
  big: { maxWidth: '100%', maxHeight: '64vh', objectFit: 'contain', justifySelf: 'center', border: `1px solid ${tokens.colorNeutralStroke2}` },
  frame: { width: '100%', height: '64vh', border: `1px solid ${tokens.colorNeutralStroke2}` },
  side: { display: 'grid', rowGap: '10px', alignContent: 'start', minHeight: 0, overflow: 'auto' },
  meta: { display: 'grid', rowGap: '4px', fontSize: tokens.fontSizeBase200 },
  actions: { display: 'flex', flexWrap: 'wrap', columnGap: '6px', rowGap: '4px' },
  url: { overflowWrap: 'anywhere', fontSize: tokens.fontSizeBase200 },
})

const sizeText = (n?: number) => (!n ? '' : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`)
const when = (iso?: string) => (iso ? new Date(iso).toLocaleString(locale(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')
const isImage = (a: CardAsset) => a.kind === 'file' && IMAGE_EXTS.includes(extOf(a.file_name || a.stored))
const isPdf = (a: CardAsset) => a.kind === 'file' && extOf(a.file_name || a.stored) === 'pdf'
const hostOf = (u?: string) => {
  try {
    return new URL(u ?? '').host
  } catch {
    return u ?? ''
  }
}

interface Props {
  /** 保存済みの配信カードの ID(新規作成中は undefined。素材は、保存してから) */
  cardId?: string
  /** どこで開いているか(素材へのやり取りを、その段階の話として書く) */
  stage: 'plan' | 'production'
  /** 配信の担当者(入れた本人のほかに、素材を消せる人) */
  owner?: string
  people: string[]
  cardName: string
  productionOwner: string
  productionDue: string
  productIds: string[]
  products: Product[]
  /** 素材の数が変わったとき(タブの数を合わせる) */
  onCount?: (n: number) => void
}

/**
 * 素材(Creative Assets。X58。利用者の要望 2026-10-21: マーケ担当などから、制作に使ってほしい画像・ページのイメージを伝えたい)。
 * 配信ごとに、ファイル(画像・PDF・Office)と参考の URL を置き、素材ごとにやり取り(コメント)できる。配信カードと制作のページの両方で、同じものを出す。
 * だれでも足せて、コメントできる。消せるのは、入れた本人と配信の担当者。制作の依頼の写しには入れない(いつも最新を見る)
 */
export function CreativeAssets({ cardId, stage, owner, people, cardName, productionOwner, productionDue, productIds, products, onCount }: Props) {
  const s = useStyles()
  const t = useT()
  const me = useSyncExternalStore(onMeChange, myName).trim()
  const [assets, setAssets] = useState<CardAsset[] | null>(null)
  const [talk, setTalk] = useState<Map<string, number>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)
  const [url, setUrl] = useState('')
  const [urlName, setUrlName] = useState('')
  const [note, setNote] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    if (!cardId) return
    const res = await CardAssetsService.getAll({ filter: `delivery_card_id eq ${cardId}`, orderBy: ['created_on desc'] })
    if (!res.success) {
      setError(res.error?.message ?? tr('素材を読み込めませんでした', 'Could not load the assets'))
      return
    }
    setAssets(res.data ?? [])
    // 素材ごとの、未解決のやり取りの数
    const n = await CardNotesService.getAll({ filter: `delivery_card_id eq ${cardId}` })
    const m = new Map<string, number>()
    for (const x of n.success ? (n.data ?? []) : []) if (x.asset_id && x.kind === 'comment' && !x.resolved) m.set(x.asset_id, (m.get(x.asset_id) ?? 0) + 1)
    setTalk(m)
  }, [cardId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])
  useEffect(() => {
    if (assets) onCount?.(assets.length)
  }, [assets, onCount])

  const addFiles = async (files: FileList | File[]) => {
    if (!cardId) return
    const list = [...files]
    const bad = list.filter((f) => !CREATIVE_EXTS.includes(extOf(f.name)) || f.size > CREATIVE_MAX_BYTES)
    setError(bad.length ? tr(`添付できないファイルがあります(画像・PDF・Office、1 つ 20MB まで): ${bad.map((f) => f.name).join('、')}`, `Some files can't be attached (images, PDF, Office; up to 20 MB each): ${bad.map((f) => f.name).join(', ')}`) : null)
    setBusy(true)
    try {
      for (const f of list.filter((x) => !bad.includes(x))) {
        const up = await CreativeFiles.upload(f)
        const res = await CardAssetsService.create({
          name: f.name,
          kind: 'file',
          file_name: f.name,
          stored: up.stored,
          content_type: up.contentType,
          size: up.size,
          note: note.trim(),
          added_by: me,
          delivery_card_id: cardId,
        })
        if (!res.success) throw new Error(res.error?.message ?? tr('素材を保存できませんでした', 'Could not save the asset'))
      }
      setNote('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
      await load()
    }
  }

  const addUrl = async () => {
    if (!cardId) return
    const u = url.trim()
    if (!/^https?:\/\//i.test(u)) {
      setError(tr('URL は http:// か https:// から始めてください', 'The URL must start with http:// or https://'))
      return
    }
    setBusy(true)
    setError(null)
    const res = await CardAssetsService.create({ name: urlName.trim() || hostOf(u), kind: 'url', url: u, note: note.trim(), added_by: me, delivery_card_id: cardId })
    if (!res.success) setError(res.error?.message ?? tr('素材を保存できませんでした', 'Could not save the asset'))
    else {
      setUrl('')
      setUrlName('')
      setNote('')
    }
    setBusy(false)
    await load()
  }

  const opened = assets?.find((a) => a.id === openId) ?? null

  return (
    <div className={s.root}>
      <div>
        <div className={s.head}>
          <AttachRegular />
          {t('素材(Creative Assets)', 'Creative assets')}
          {assets && assets.length > 0 && <Badge appearance="tint" size="small">{assets.length}</Badge>}
        </div>
        <div className={s.caption}>
          {t(
            '制作に使ってほしい画像・資料(ファイル)や、参考のページ(URL)を置きます。素材を押すと大きく見られ、その素材についてやり取りできます。だれでも足せて、その場で保存します。',
            'Add images, documents or reference pages (URLs) for production. Click an asset to view it and discuss it. Anyone can add; saved right away.',
          )}
        </div>
      </div>
      {!cardId ? (
        <div className={s.caption}>{t('配信カードを保存すると、素材を置けます。', 'Save the delivery card to add assets.')}</div>
      ) : (
        <>
          <div
            className={mergeClasses(s.drop, over && s.dropOn)}
            onDragOver={(e) => {
              e.preventDefault()
              setOver(true)
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setOver(false)
              if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files)
            }}
          >
            {busy ? <Spinner size="tiny" /> : <AttachRegular fontSize={20} />}
            <span>{t('ここにファイルを置く(画像・PDF・Office、1 つ 20MB まで)', 'Drop files here (images, PDF, Office; up to 20 MB each)')}</span>
            <Button size="small" disabled={busy} onClick={() => fileRef.current?.click()}>
              {t('ファイルを選ぶ', 'Choose files')}
            </Button>
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              accept={CREATIVE_EXTS.map((x) => `.${x}`).join(',')}
              onChange={(e) => {
                const f = e.target.files
                if (f?.length) void addFiles(f)
                e.target.value = ''
              }}
            />
          </div>
          <div className={s.urlRow}>
            <Field label={t('参考のページ(URL)', 'Reference page (URL)')} size="small">
              <Input size="small" value={url} onChange={(_, d) => setUrl(d.value)} placeholder="https://" />
            </Field>
            <Field label={t('題名(任意)', 'Title (optional)')} size="small">
              <Input size="small" value={urlName} onChange={(_, d) => setUrlName(d.value)} placeholder={t('例: 競合の秋特集', 'e.g. Competitor fall feature')} />
            </Field>
            <Button size="small" className={s.addBtn} icon={<LinkRegular />} disabled={busy || !url.trim()} onClick={() => void addUrl()}>
              {t('URL を追加', 'Add URL')}
            </Button>
          </div>
          <Field label={t('ひとこと(次に足す素材に付けます。任意)', 'Note (added to the next asset; optional)')} size="small">
            <Input size="small" value={note} onChange={(_, d) => setNote(d.value)} placeholder={t('例: この雰囲気で、背景は明るめに', 'e.g. This mood, with a lighter background')} />
          </Field>
          {error && <div className={s.error}>{error}</div>}
          {assets === null ? (
            <Spinner size="tiny" />
          ) : assets.length === 0 ? (
            <div className={s.caption}>{t('まだ素材はありません。', 'No assets yet.')}</div>
          ) : (
            <div className={s.list}>
              {assets.map((a) => (
                <button key={a.id} type="button" className={s.tile} onClick={() => setOpenId(a.id)} title={a.note || a.name}>
                  {isImage(a) && a.stored ? (
                    <img className={s.thumb} src={CreativeFiles.url(a.stored)} alt="" loading="lazy" />
                  ) : (
                    <span className={s.icon}>{a.kind === 'url' ? <LinkRegular /> : isPdf(a) ? <DocumentPdfRegular /> : <DocumentRegular />}</span>
                  )}
                  <span className={s.tileBody}>
                    <span className={s.tileName}>{a.name}</span>
                    <span className={s.tileSub}>{a.kind === 'url' ? hostOf(a.url) : `${extOf(a.file_name).toUpperCase()} ${sizeText(a.size)}`}</span>
                    <span className={s.tileSub}>
                      {[a.added_by, when(a.created_on)].filter(Boolean).join(' ・ ')}
                      {(talk.get(a.id) ?? 0) > 0 && ` ・ ${t(`未解決 ${talk.get(a.id)}`, `${talk.get(a.id)} open`)}`}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {opened && cardId && (
        <AssetFloat
          asset={opened}
          canDelete={!!me && (me === (opened.added_by ?? '').trim() || me === (owner ?? '').trim())}
          canEdit={!!me}
          onChanged={load}
          onClose={() => {
            setOpenId(null)
            void load()
          }}
          comments={
            <CommentsPanel
              cardId={cardId}
              stage={stage}
              assetId={opened.id}
              assets={(assets ?? []).map((a) => ({ id: a.id, name: a.name }))}
              compact
              productIds={productIds}
              products={products}
              people={people}
              cardName={cardName}
              productionOwner={productionOwner}
              productionDue={productionDue}
            />
          }
        />
      )}
    </div>
  )
}

/** 素材 1 つを大きく見て、題名・ひとことを直し、やり取りする */
function AssetFloat({ asset: a, canDelete, canEdit, onChanged, onClose, comments }: { asset: CardAsset; canDelete: boolean; canEdit: boolean; onChanged: () => Promise<void>; onClose: () => void; comments: React.ReactNode }) {
  const s = useStyles()
  const t = useT()
  const [edit, setEdit] = useState<{ name: string; note: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileUrl = a.stored ? CreativeFiles.url(a.stored) : ''

  const save = async () => {
    if (!edit) return
    setBusy(true)
    const res = await CardAssetsService.update(a.id, { name: edit.name.trim() || a.name, note: edit.note.trim() })
    setBusy(false)
    if (!res.success) setError(res.error?.message ?? tr('保存できませんでした', 'Could not save'))
    else {
      setEdit(null)
      await onChanged()
    }
  }
  const remove = async () => {
    if (!window.confirm(tr(`素材「${a.name}」を消します(この素材へのやり取りも消えます)。よろしいですか?`, `Delete "${a.name}"? Its conversation is deleted too.`))) return
    setBusy(true)
    try {
      await CardAssetsService.delete(a.id)
      if (a.stored) await CreativeFiles.remove(a.stored)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : tr('消せませんでした', 'Could not delete'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface className={s.surface}>
        <DialogBody className={s.body}>
          <div className={s.titleRow}>
            <DialogTitle className={s.grow}>{a.name}</DialogTitle>
            <Button appearance="subtle" icon={<DismissRegular />} onClick={onClose} aria-label={t('閉じる', 'Close')} />
          </div>
          <div className={s.floatCols}>
            <div className={s.viewer}>
              {isImage(a) ? (
                <img className={s.big} src={fileUrl} alt={a.name} />
              ) : isPdf(a) ? (
                <iframe className={s.frame} src={fileUrl} title={a.name} />
              ) : a.kind === 'url' ? (
                <div className={s.meta}>
                  <span className={s.url}>{a.url}</span>
                  <span className={s.caption}>{t('参考のページは、新しいタブで開きます(外のページは、ここには埋め込めないことが多いため)。', 'Reference pages open in a new tab (most sites cannot be embedded here).')}</span>
                </div>
              ) : (
                <div className={s.meta}>
                  <span>{a.file_name}</span>
                  <span className={s.caption}>{t('この種類のファイルは、ダウンロードして開きます。', 'Download this file to open it.')}</span>
                </div>
              )}
              <div className={s.actions}>
                {a.kind === 'url' ? (
                  <Button size="small" icon={<OpenRegular />} as="a" href={a.url} target="_blank" rel="noreferrer">
                    {t('ページを開く', 'Open page')}
                  </Button>
                ) : (
                  <>
                    <Button size="small" icon={<OpenRegular />} as="a" href={fileUrl} target="_blank" rel="noreferrer">
                      {t('新しいタブで開く', 'Open in new tab')}
                    </Button>
                    <Button size="small" icon={<ArrowDownloadRegular />} as="a" href={a.stored ? CreativeFiles.url(a.stored, a.file_name) : ''}>
                      {t('ダウンロード', 'Download')}
                    </Button>
                  </>
                )}
              </div>
            </div>
            <div className={s.side}>
              {edit ? (
                <div className={s.meta}>
                  <Field label={t('題名', 'Title')} size="small">
                    <Input size="small" value={edit.name} onChange={(_, d) => setEdit({ ...edit, name: d.value })} />
                  </Field>
                  <Field label={t('ひとこと', 'Note')} size="small">
                    <Textarea size="small" value={edit.note} onChange={(_, d) => setEdit({ ...edit, note: d.value })} />
                  </Field>
                  <div className={s.actions}>
                    <Button size="small" appearance="primary" disabled={busy} onClick={() => void save()}>
                      {t('保存', 'Save')}
                    </Button>
                    <Button size="small" onClick={() => setEdit(null)}>
                      {t('やめる', 'Cancel')}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className={s.meta}>
                  {a.note ? <span>{a.note}</span> : <span className={s.caption}>{t('(ひとことなし)', '(no note)')}</span>}
                  <span className={s.caption}>
                    {[a.added_by, when(a.created_on), a.kind === 'file' ? `${a.file_name} ${sizeText(a.size)}` : ''].filter(Boolean).join(' ・ ')}
                  </span>
                  <div className={s.actions}>
                    {canEdit && (
                      <Button size="small" appearance="subtle" icon={<EditRegular />} onClick={() => setEdit({ name: a.name, note: a.note ?? '' })}>
                        {t('題名・ひとことを直す', 'Edit title and note')}
                      </Button>
                    )}
                    {canDelete && (
                      <Button size="small" appearance="subtle" icon={<DeleteRegular />} disabled={busy} onClick={() => void remove()}>
                        {t('消す', 'Delete')}
                      </Button>
                    )}
                  </div>
                </div>
              )}
              {error && <div className={s.error}>{error}</div>}
              {comments}
            </div>
          </div>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
