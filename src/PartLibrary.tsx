import { useCallback, useEffect, useState } from 'react'
import { Badge, Button, Spinner, Switch, makeStyles, tokens } from '@fluentui/react-components'
import { CalendarCancelRegular, DeleteRegular, EditRegular, ImageAddRegular } from '@fluentui/react-icons'
import { PartImagesService } from './data/partImages'
import { PartUpload } from './data/partUpload'
import { PartUploadDialog } from './PartUploadDialog'
import { FilterChips, SearchField } from './SearchField'
import { isUsablePart, today } from './heroRights'
import { partImage } from './images'
import { optionLabel, tr, useT } from './i18n'
import { PartImageKind, type PartImage } from './models/partImages'

const useStyles = makeStyles({
  wrap: { display: 'flex', flexDirection: 'column', minHeight: 0, flexGrow: 1 },
  tools: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: '8px', rowGap: '6px', margin: '8px 0' },
  search: { flexBasis: '320px', flexGrow: 1, maxWidth: '480px' },
  error: { fontSize: tokens.fontSizeBase200, color: tokens.colorPaletteRedForeground1 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gridAutoRows: 'max-content', gap: '10px', overflow: 'auto', minHeight: 0, flexGrow: 1, flexBasis: 0, alignContent: 'start', paddingBottom: '8px' },
  card: { display: 'grid', gridTemplateRows: '120px auto', alignSelf: 'start', border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, overflow: 'hidden', backgroundColor: tokens.colorNeutralBackground1 },
  // 透明な部分が分かるように、市松模様の上に出す
  thumbBox: {
    display: 'grid',
    placeItems: 'center',
    padding: '8px',
    backgroundColor: '#ffffff',
    backgroundImage: 'linear-gradient(45deg, #eee 25%, transparent 25%), linear-gradient(-45deg, #eee 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #eee 75%), linear-gradient(-45deg, transparent 75%, #eee 75%)',
    backgroundSize: '14px 14px',
    backgroundPosition: '0 0, 0 7px, 7px -7px, -7px 0',
    overflow: 'hidden',
  },
  thumb: { maxWidth: '100%', maxHeight: '104px', objectFit: 'contain' },
  info: { display: 'grid', rowGap: '3px', padding: '8px 10px', minWidth: 0 },
  name: { fontWeight: tokens.fontWeightSemibold, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  line: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  badges: { display: 'flex', flexWrap: 'wrap', gap: '4px' },
  actions: { display: 'flex', flexWrap: 'wrap', columnGap: '4px', marginTop: '4px' },
  empty: { display: 'grid', placeItems: 'center', rowGap: '8px', flexGrow: 1, color: tokens.colorNeutralForeground3, border: `1px dashed ${tokens.colorNeutralStroke1}`, borderRadius: tokens.borderRadiusMedium, padding: '24px' },
})


/**
 * 部品の画像のライブラリ(X59 ③。画像のライブラリの「部品の画像」のタブ)。ボタン・バナー・ロゴ・アイコンを、上げる・直す・消す。
 * 配信とは結びつけない(使うのは制作のページ。URL か <img> のタグをコピーして、HTML に貼る)ので、消すときは確かめるだけ
 */
export function PartLibrary({ country, me }: { country: string; me: string }) {
  const s = useStyles()
  const t = useT()
  const [parts, setParts] = useState<PartImage[] | null>(null)
  const [q, setQ] = useState('')
  const [market, setMarket] = useState<'' | 'US' | 'JP'>(country === 'US' || country === 'JP' ? country : '')
  const [kind, setKind] = useState<'' | keyof typeof PartImageKind>('')
  const [showExpired, setShowExpired] = useState(true)
  const [editing, setEditing] = useState<PartImage | null>(null)
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const r = await PartImagesService.getAll()
    setParts(r.success ? (r.data ?? []) : [])
    if (!r.success) setError(r.error?.message ?? tr('部品の画像を読めませんでした', 'Could not load part images'))
  }, [])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const list = (parts ?? [])
    .filter((p) => !market || p.market === market)
    .filter((p) => !kind || p.kind === kind)
    .filter((p) => showExpired || isUsablePart(p))
    .filter((p) => {
      const w = q.trim().toLowerCase()
      return !w || [p.name, p.tags, p.description, p.alt_text, p.source].some((x) => (x ?? '').toLowerCase().includes(w))
    })
    .sort((a, b) => (b.created_on ?? '').localeCompare(a.created_on ?? ''))

  const run = async (id: string, f: () => Promise<unknown>) => {
    setBusy(id)
    setError(null)
    try {
      await f()
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }
  const remove = (p: PartImage) => {
    if (!window.confirm(tr(`部品の画像「${p.name}」を消します(上げた画像なら、ファイルも消します。すでに HTML に貼った画像は見えなくなります)。よろしいですか?`, `Delete "${p.name}" (its file too, if uploaded; HTML that already uses it will lose the image)?`))) return
    void run(p.id, async () => {
      await PartImagesService.delete(p.id)
      if (p.image_url) await PartUpload.remove(p.image_url)
    })
  }
  const expireToday = (p: PartImage) =>
    run(p.id, async () => {
      const r = await PartImagesService.update(p.id, { usable_until: today() })
      if (!r.success) throw new Error(r.error?.message ?? tr('期限を切れませんでした', 'Could not set the deadline'))
    })

  return (
    <div className={s.wrap}>
      <div className={s.tools}>
        <SearchField className={s.search} value={q} onChange={setQ} placeholder={t('名前・タグ・代替テキストで探す', 'Search name, tags, alt text')} count={list.length} unit={(n) => t(`${n} 点`, `${n} images`)} />
        <FilterChips label={t('国', 'Country')} allLabel={t('すべての国', 'All countries')} options={[{ value: 'US', label: 'US' }, { value: 'JP', label: 'JP' }]} value={market} onChange={setMarket} />
        <FilterChips
          label={t('種類', 'Kind')}
          allLabel={t('すべての種類', 'All kinds')}
          options={(Object.keys(PartImageKind) as (keyof typeof PartImageKind)[]).map((k) => ({ value: k, label: optionLabel(PartImageKind[k]) }))}
          value={kind}
          onChange={setKind}
        />
        <Switch checked={showExpired} onChange={(_, d) => setShowExpired(d.checked)} label={t('期限切れも出す', 'Show expired')} />
        <Button size="small" appearance="primary" icon={<ImageAddRegular />} onClick={() => setUploading(true)}>
          {t('部品の画像を上げる', 'Upload a part image')}
        </Button>
      </div>
      {error && <span className={s.error}>{error}</span>}
      {parts === null ? (
        <Spinner size="small" />
      ) : list.length === 0 ? (
        <div className={s.empty}>
          <span>{t('部品の画像はまだありません。ボタン・バナー・ロゴ・アイコンを上げると、制作のページから URL や <img> のタグをコピーして使えます。', 'No part images yet. Upload buttons, banners, logos and icons, then copy their URL or <img> tag on the production page.')}</span>
          <Button size="small" icon={<ImageAddRegular />} onClick={() => setUploading(true)}>
            {t('部品の画像を上げる', 'Upload a part image')}
          </Button>
        </div>
      ) : (
        <div className={s.grid}>
          {list.map((p) => {
            const expired = !isUsablePart(p)
            return (
              <div key={p.id} className={s.card}>
                <div className={s.thumbBox}>
                  <img className={s.thumb} src={partImage(p)} alt={p.alt_text ?? ''} loading="lazy" />
                </div>
                <div className={s.info}>
                  <span className={s.name} title={p.name}>{p.name}</span>
                  <span className={s.line}>{[optionLabel(p.kind_name ?? (p.kind ? PartImageKind[p.kind] : '')), p.market, p.width && p.height ? `${p.width}×${p.height}` : ''].filter(Boolean).join(' ・ ')}</span>
                  <span className={s.line} title={p.alt_text}>{t(`代替テキスト: ${p.alt_text || '(未入力)'}`, `Alt: ${p.alt_text || '(not set)'}`)}</span>
                  {p.tags && <span className={s.line} title={p.tags}>{p.tags}</span>}
                  <div className={s.badges}>
                    {expired ? (
                      <Badge appearance="filled" color="danger" size="small">{t('期限切れ', 'Expired')}</Badge>
                    ) : p.usable_until ? (
                      <Badge appearance="outline" size="small">{t(`${p.usable_until.slice(0, 10)} まで`, `Until ${p.usable_until.slice(0, 10)}`)}</Badge>
                    ) : null}
                    {p.uploaded_by && <Badge appearance="tint" color="brand" size="small">{t(`上げた人: ${p.uploaded_by}`, `By ${p.uploaded_by}`)}</Badge>}
                  </div>
                  <div className={s.actions}>
                    <Button size="small" appearance="subtle" icon={<EditRegular />} disabled={busy === p.id} onClick={() => setEditing(p)}>
                      {t('直す', 'Edit')}
                    </Button>
                    {!expired && (
                      <Button size="small" appearance="subtle" icon={<CalendarCancelRegular />} disabled={busy === p.id} onClick={() => void expireToday(p)} title={t('今日までにして、明日から制作のページの候補に出さない(ファイルは残すので、貼った HTML の画像は消えない)', 'Expire today: hidden from the production page from tomorrow (the file stays, so HTML that uses it keeps working)')}>
                        {t('今日で期限を切る', 'Expire today')}
                      </Button>
                    )}
                    <Button size="small" appearance="subtle" icon={<DeleteRegular />} disabled={busy === p.id} onClick={() => remove(p)}>
                      {t('消す', 'Delete')}
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
      {(editing || uploading) && (
        <PartUploadDialog
          market={market || null}
          part={editing ?? undefined}
          me={me}
          onClose={() => {
            setEditing(null)
            setUploading(false)
          }}
          onDone={async () => {
            await load()
            setEditing(null)
            setUploading(false)
          }}
        />
      )}
    </div>
  )
}
