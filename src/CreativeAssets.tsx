import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Badge, Button, Dialog, DialogBody, DialogSurface, DialogTitle, Field, Input, Menu, MenuItem, MenuList, MenuPopover, MenuTrigger, Spinner, Textarea, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { AddRegular, ArrowDownloadRegular, ArrowSyncRegular, AttachRegular, DeleteRegular, DismissRegular, DocumentPdfRegular, DocumentRegular, EditRegular, LinkRegular, OpenRegular } from '@fluentui/react-icons'
import { CardAssetsService } from './data/cardAssets'
import { CardNotesService } from './data/cardNotes'
import { CreativeFiles } from './data/creativeFiles'
import { CREATIVE_EXTS, CREATIVE_MAX_BYTES, IMAGE_EXTS, extOf } from './creativeConst'
import { CommentsPanel } from './CommentsPanel'
import { refreshPreview } from './creativePreview'
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
  // 足す欄を「＋」だけにしたとき(ファイルを落とせる所も兼ねる)
  compactDrop: { display: 'grid', padding: '4px', borderRadius: tokens.borderRadiusMedium, border: '1px dashed transparent' },
  addBtn: { justifySelf: 'start' },
  list: { display: 'grid', rowGap: '6px' },
  // 行と、その右上に重ねる「消す」(行そのものがボタンなので、中に入れずに重ねる)
  rowWrap: { position: 'relative', ':hover > .ccp-asset-del': { opacity: 1 }, ':focus-within > .ccp-asset-del': { opacity: 1 } },
  rowDel: { position: 'absolute', top: '4px', right: '4px', opacity: 0.55, backgroundColor: tokens.colorNeutralBackground1 },
  // 1 行: 左に小さな画像、右に題名・制作へのメッセージ(全文)・だれがいつ・未解決のコメント(利用者と決めた: メッセージが主役)
  row: {
    display: 'grid',
    gridTemplateColumns: '72px minmax(0, 1fr)',
    columnGap: '10px',
    alignItems: 'start',
    padding: '8px',
    textAlign: 'left',
    fontFamily: 'inherit',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    cursor: 'pointer',
    ':hover': { border: `1px solid ${tokens.colorBrandStroke1}` },
  },
  // 右上の「消す」に題名が隠れないように
  rowPad: { paddingRight: '36px' },
  rowThumb: { width: '72px', height: '72px', objectFit: 'cover', borderRadius: tokens.borderRadiusSmall, backgroundColor: tokens.colorNeutralBackground3 },
  rowIcon: { display: 'grid', placeItems: 'center', width: '72px', height: '72px', fontSize: '28px', color: tokens.colorNeutralForeground3, borderRadius: tokens.borderRadiusSmall, backgroundColor: tokens.colorNeutralBackground3 },
  rowBody: { display: 'grid', rowGap: '3px', minWidth: 0 },
  rowTitle: { fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  rowMessage: { fontSize: tokens.fontSizeBase300, color: tokens.colorNeutralForeground1, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
  rowMeta: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: '6px', fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3 },
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
  // 素材のフロート
  surface: { width: 'min(1100px, (94vw / var(--ui-zoom, 1)))', maxWidth: 'none', height: 'calc(86vh / var(--ui-zoom, 1))' },
  body: { height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 },
  titleRow: { display: 'flex', alignItems: 'center', columnGap: '8px' },
  grow: { flexGrow: 1, minWidth: 0 },
  floatCols: { display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(300px, 2fr)', columnGap: '16px', minHeight: 0, flexGrow: 1, marginTop: '8px' },
  viewer: { display: 'grid', rowGap: '8px', alignContent: 'start', minHeight: 0, overflow: 'auto' },
  big: { maxWidth: '100%', maxHeight: 'calc(64vh / var(--ui-zoom, 1))', objectFit: 'contain', justifySelf: 'center', border: `1px solid ${tokens.colorNeutralStroke2}` },
  frame: { width: '100%', height: 'calc(64vh / var(--ui-zoom, 1))', border: `1px solid ${tokens.colorNeutralStroke2}` },
  side: { display: 'grid', rowGap: '10px', alignContent: 'start', minHeight: 0, overflow: 'auto' },
  meta: { display: 'grid', rowGap: '4px', fontSize: tokens.fontSizeBase200 },
  actions: { display: 'flex', flexWrap: 'wrap', columnGap: '6px', rowGap: '4px' },
  url: { overflowWrap: 'anywhere', fontSize: tokens.fontSizeBase200 },
  message: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: tokens.fontSizeBase300 },
  // URL の見本カード
  linkCard: { display: 'grid', border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusLarge, overflow: 'hidden', backgroundColor: tokens.colorNeutralBackground1 },
  linkImage: { width: '100%', maxHeight: 'calc(52vh / var(--ui-zoom, 1))', objectFit: 'contain', backgroundColor: tokens.colorNeutralBackground3 },
  linkBody: { display: 'grid', rowGap: '4px', padding: '10px 12px' },
  linkTitle: { fontSize: tokens.fontSizeBase400, fontWeight: tokens.fontWeightSemibold },
  linkDesc: { fontSize: tokens.fontSizeBase300, color: tokens.colorNeutralForeground2 },
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

/**
 * 素材を 1 つ消す(確かめてから。ファイルも置き場所から消す。この素材へのやり取りは、DB の CASCADE で一緒に消える)。
 * 消したら true。入れた人がほかの人なら、確かめの文で名前を出す(だれでも消せるので、うっかり人の素材を消さないように)
 */
async function deleteAsset(a: CardAsset, me: string): Promise<boolean> {
  const by = (a.added_by ?? '').trim()
  const other = by && by !== me
  const ok = window.confirm(
    other
      ? tr(`素材「${a.name}」は ${by} さんが入れたものです。消しますか?(この素材へのやり取りも消えます)`, `"${a.name}" was added by ${by}. Delete it? Its conversation is deleted too.`)
      : tr(`素材「${a.name}」を消します(この素材へのやり取りも消えます)。よろしいですか?`, `Delete "${a.name}"? Its conversation is deleted too.`),
  )
  if (!ok) return false
  // 消せないときは投げる(呼ぶ側が文言を出す)
  await CardAssetsService.delete(a.id)
  // ファイルが消せなくても、素材の行はもう無い(置き場所に残るだけ)ので、失敗にしない
  for (const f of [a.stored, a.preview_image]) if (f) await CreativeFiles.remove(f).catch(() => undefined)
  return true
}

interface Props {
  /** 保存済みの配信カードの ID(新規作成中は undefined。素材は、保存してから) */
  cardId?: string
  /** どこで開いているか(素材へのやり取りを、その段階の話として書く) */
  stage: 'plan' | 'production'
  /** 配信の担当者(いまは使っていない。消すのは、だれでもできる) */
  owner?: string
  people: string[]
  cardName: string
  productionOwner: string
  productionDue: string
  productIds: string[]
  products: Product[]
  /** 素材の数が変わったとき(タブの数を合わせる) */
  onCount?: (n: number) => void
  /** 見出し(既定は「素材(Creative Assets)」。制作指示の下では「参考の素材」) */
  title?: string
  /** 説明の文を出さない(制作指示の下など、続けて読む場所) */
  hideCaption?: boolean
  /**
   * 足す欄を「＋」だけにする(シンプルな配信カード。縦に長くならないように)。押すと「ファイル / URL」を選び、選んだものに要ることだけを聞く。
   * 一覧の上にファイルを落としても足せる
   */
  compactAdd?: boolean
}

/**
 * 素材(Creative Assets。X58。利用者の要望 2026-10-21: マーケ担当などから、制作に使ってほしい画像・ページのイメージを伝えたい)。
 * 配信ごとに、ファイル(画像・PDF・Office)と参考の URL を置き、素材ごとにやり取り(コメント)できる。配信カードと制作のページの両方で、同じものを出す。
 * だれでも足せて、コメントでき、消せる(2026-10-23 利用者: 消す場所がない。名前の設定が無い・担当が違うと消せなかったので、だれでも消せるようにし、
 * 人の入れた素材は確かめの文で名前を出す)。一覧の行の右上と、素材のフロートから消す。制作の依頼の写しには入れない(いつも最新を見る)
 */
export function CreativeAssets({ cardId, stage, people, cardName, productionOwner, productionDue, productIds, products, onCount, title, hideCaption, compactAdd = false }: Props) {
  const s = useStyles()
  const t = useT()
  const me = useSyncExternalStore(onMeChange, myName).trim()
  const [assets, setAssets] = useState<CardAsset[] | null>(null)
  // 足す欄を「＋」だけにしているとき、いま聞いているもの(null = ＋だけ / url = URL と題名・ひとこと)
  const [adding, setAdding] = useState<null | 'url'>(null)
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
    if (!res.success || !res.data) setError(res.error?.message ?? tr('素材を保存できませんでした', 'Could not save the asset'))
    else {
      setUrl('')
      setUrlName('')
      setNote('')
      // 見本カード(題名・説明・代表の画像)を取る。読めなくても、URL の素材としては使える
      try {
        await refreshPreview(res.data)
        // 題名を入れていなければ、ページの題名を素材の名前にする
        if (!urlName.trim()) {
          const p = await CardAssetsService.get(res.data.id)
          if (p.success && p.data?.preview_title) await CardAssetsService.update(res.data.id, { name: p.data.preview_title })
        }
      } catch (e) {
        setError(tr(`URL は追加しました。見本カードは作れませんでした(${e instanceof Error ? e.message : String(e)})`, `Added the URL, but could not build the preview card (${e instanceof Error ? e.message : String(e)})`))
      }
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
          {title ?? t('素材(Creative Assets)', 'Creative assets')}
          {assets && assets.length > 0 && <Badge appearance="tint" size="small">{assets.length}</Badge>}
        </div>
        <div className={s.caption} hidden={hideCaption}>
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
          {/* 一覧が先(マーケ担当からのメッセージを、まず読む)。足す欄は、その下 */}
          {assets === null ? (
            <Spinner size="tiny" />
          ) : assets.length === 0 ? (
            <div className={s.caption}>{t('まだ素材はありません。', 'No assets yet.')}</div>
          ) : (
            <div className={s.list}>
              {assets.map((a) => (
                <div key={a.id} className={s.rowWrap}>
                <button type="button" className={mergeClasses(s.row, s.rowPad)} onClick={() => setOpenId(a.id)} title={t('押すと大きく見て、この素材についてやり取りできます', 'Click to view it and discuss it')}>
                  {isImage(a) && a.stored ? (
                    <img className={s.rowThumb} src={CreativeFiles.url(a.stored)} alt="" loading="lazy" />
                  ) : a.kind === 'url' && a.preview_image ? (
                    <img className={s.rowThumb} src={CreativeFiles.url(a.preview_image)} alt="" loading="lazy" />
                  ) : (
                    <span className={s.rowIcon}>{a.kind === 'url' ? <LinkRegular /> : isPdf(a) ? <DocumentPdfRegular /> : <DocumentRegular />}</span>
                  )}
                  <span className={s.rowBody}>
                    <span className={s.rowTitle}>{a.name}</span>
                    {a.note ? <span className={s.rowMessage}>{a.note}</span> : <span className={s.rowMeta}>{t('(制作へのメッセージなし)', '(no message for production)')}</span>}
                    <span className={s.rowMeta}>
                      <span>{[a.added_by, when(a.created_on)].filter(Boolean).join(' ・ ')}</span>
                      <span>{a.kind === 'url' ? hostOf(a.url) : `${extOf(a.file_name).toUpperCase()} ${sizeText(a.size)}`}</span>
                      {(talk.get(a.id) ?? 0) > 0 && <Badge appearance="tint" color="warning" size="small">{t(`未解決のコメント ${talk.get(a.id)}`, `${talk.get(a.id)} open comments`)}</Badge>}
                    </span>
                  </span>
                </button>
                <Button
                  size="small"
                  appearance="subtle"
                  className={mergeClasses('ccp-asset-del', s.rowDel)}
                  icon={<DeleteRegular />}
                  disabled={busy}
                  aria-label={t(`素材「${a.name}」を消す`, `Delete "${a.name}"`)}
                  title={t('この素材を消す', 'Delete this asset')}
                  onClick={async () => {
                    setError(null)
                    try {
                      if (await deleteAsset(a, me)) await load()
                    } catch (e) {
                      setError(e instanceof Error ? e.message : String(e))
                    }
                  }}
                />
                </div>
              ))}
            </div>
          )}
          {compactAdd ? (
            <>
              {/* 一覧の上にファイルを落としても足せる */}
              <div
                className={mergeClasses(s.compactDrop, over && s.dropOn)}
                onDragOver={(e) => {
                  if (!e.dataTransfer.types.includes('Files')) return
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
                {adding === null ? (
                  <Menu>
                    <MenuTrigger disableButtonEnhancement>
                      <Button size="small" icon={busy ? <Spinner size="extra-tiny" /> : <AddRegular />} disabled={busy}>
                        {t('素材を足す', 'Add an asset')}
                      </Button>
                    </MenuTrigger>
                    <MenuPopover>
                      <MenuList>
                        <MenuItem icon={<AttachRegular />} onClick={() => fileRef.current?.click()}>
                          {t('ファイル(画像・PDF・Office)', 'File (image, PDF, Office)')}
                        </MenuItem>
                        <MenuItem icon={<LinkRegular />} onClick={() => setAdding('url')}>
                          {t('参考のページ(URL)', 'Reference page (URL)')}
                        </MenuItem>
                      </MenuList>
                    </MenuPopover>
                  </Menu>
                ) : (
                  <div className={s.urlRow}>
                    <Field label={t('参考のページ(URL)', 'Reference page (URL)')} size="small">
                      <Input size="small" autoFocus value={url} onChange={(_, d) => setUrl(d.value)} placeholder="https://" />
                    </Field>
                    <Field label={t('題名(任意)', 'Title (optional)')} size="small">
                      <Input size="small" value={urlName} onChange={(_, d) => setUrlName(d.value)} placeholder={t('例: 競合の秋特集', 'e.g. Competitor fall feature')} />
                    </Field>
                    <Field label={t('ひとこと(任意)', 'Message (optional)')} size="small">
                      <Input size="small" value={note} onChange={(_, d) => setNote(d.value)} placeholder={t('例: このような雰囲気で', 'e.g. A mood like this')} />
                    </Field>
                    <span style={{ display: 'flex', columnGap: 6 }}>
                      <Button
                        size="small"
                        appearance="primary"
                        icon={<LinkRegular />}
                        disabled={busy || !url.trim()}
                        onClick={async () => {
                          await addUrl()
                          setAdding(null)
                        }}
                      >
                        {t('URL を追加', 'Add URL')}
                      </Button>
                      <Button size="small" onClick={() => setAdding(null)}>
                        {t('やめる', 'Cancel')}
                      </Button>
                    </span>
                  </div>
                )}
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
            </>
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
          <Field label={t('制作へのメッセージ(次に足す素材に付きます。任意)', 'Message for production (added to the next asset; optional)')} size="small">
            <Textarea size="small" resize="vertical" value={note} onChange={(_, d) => setNote(d.value)} placeholder={t('例: このような雰囲気で。背景は明るめに。/ この資料の数字を使って', 'e.g. A mood like this, with a lighter background. / Use the figures in this document')} />
          </Field>
            </>
          )}
          {error && <div className={s.error}>{error}</div>}
        </>
      )}
      {opened && cardId && (
        <AssetFloat
          asset={opened}
          me={me}
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
function AssetFloat({ asset: a, me, canEdit, onChanged, onClose, comments }: { asset: CardAsset; me: string; canEdit: boolean; onChanged: () => Promise<void>; onClose: () => void; comments: React.ReactNode }) {
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
    setBusy(true)
    try {
      if (await deleteAsset(a, me)) onClose()
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
                // 見本カード(ページは埋め込めないことが多いので、題名・説明・代表の画像で見せる)
                <div className={s.linkCard}>
                  {a.preview_image && <img className={s.linkImage} src={CreativeFiles.url(a.preview_image)} alt="" />}
                  <div className={s.linkBody}>
                    {a.preview_site && <span className={s.caption}>{a.preview_site}</span>}
                    <span className={s.linkTitle}>{a.preview_title || a.name}</span>
                    {a.preview_description && <span className={s.linkDesc}>{a.preview_description}</span>}
                    <span className={s.url}>{a.url}</span>
                    {!a.preview_at && <span className={s.caption}>{t('まだ見本カードがありません。「見本カードを取る」で、ページの題名・説明・代表の画像を取ります。', 'No preview card yet. Use "Get preview" to fetch the page title, description and image.')}</span>}
                  </div>
                </div>
              ) : (
                <div className={s.meta}>
                  <span>{a.file_name}</span>
                  <span className={s.caption}>{t('この種類のファイルは、ダウンロードして開きます。', 'Download this file to open it.')}</span>
                </div>
              )}
              <div className={s.actions}>
                {a.kind === 'url' ? (
                  <>
                    <Button size="small" icon={<OpenRegular />} as="a" href={a.url} target="_blank" rel="noreferrer">
                      {t('ページを開く', 'Open page')}
                    </Button>
                    {canEdit && (
                      <Button
                        size="small"
                        appearance="subtle"
                        icon={<ArrowSyncRegular />}
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true)
                          setError(null)
                          try {
                            await refreshPreview(a)
                            await onChanged()
                          } catch (e) {
                            setError(e instanceof Error ? e.message : String(e))
                          } finally {
                            setBusy(false)
                          }
                        }}
                      >
                        {a.preview_at ? t('見本カードを取り直す', 'Refresh preview') : t('見本カードを取る', 'Get preview')}
                      </Button>
                    )}
                  </>
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
                  <Field label={t('制作へのメッセージ', 'Message for production')} size="small">
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
                  <span className={s.caption}>{t('制作へのメッセージ', 'Message for production')}</span>
                  {a.note ? <span className={s.message}>{a.note}</span> : <span className={s.caption}>{t('(なし)', '(none)')}</span>}
                  <span className={s.caption}>
                    {[a.added_by, when(a.created_on), a.kind === 'file' ? `${a.file_name} ${sizeText(a.size)}` : ''].filter(Boolean).join(' ・ ')}
                  </span>
                  <div className={s.actions}>
                    {canEdit && (
                      <Button size="small" appearance="subtle" icon={<EditRegular />} onClick={() => setEdit({ name: a.name, note: a.note ?? '' })}>
                        {t('題名・メッセージを直す', 'Edit title and message')}
                      </Button>
                    )}
                    <Button size="small" appearance="subtle" icon={<DeleteRegular />} disabled={busy} onClick={() => void remove()}>
                      {t('消す', 'Delete')}
                    </Button>
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
