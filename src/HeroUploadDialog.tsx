import { useRef, useState } from 'react'
import { Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Field, Input, Select, Spinner, Textarea, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { ImageAddRegular } from '@fluentui/react-icons'
import { HeroImagesService } from './data/heroImages'
import { HeroUpload, type HeroDraft } from './data/heroUpload'
import { getLang, optionLabel, tr, useT } from './i18n'
import { HeroImagePurpose, HeroImageSeason, type HeroImage } from './models/heroImages'

const useStyles = makeStyles({
  surface: { width: 'min(1000px, 94vw)', maxWidth: 'none' },
  cols: { display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)', columnGap: '16px', alignItems: 'start' },
  drop: {
    display: 'grid',
    placeItems: 'center',
    rowGap: '6px',
    minHeight: '280px',
    border: `1px dashed ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
    color: tokens.colorNeutralForeground2,
    textAlign: 'center',
    padding: '16px',
  },
  dropOn: { border: `1px dashed ${tokens.colorBrandStroke1}`, backgroundColor: tokens.colorBrandBackground2 },
  stage: { position: 'relative', cursor: 'crosshair', userSelect: 'none', lineHeight: 0 },
  img: { width: '100%', maxHeight: '56vh', objectFit: 'contain', backgroundColor: tokens.colorNeutralBackground3 },
  focal: { position: 'absolute', width: '28px', height: '28px', marginLeft: '-14px', marginTop: '-14px', borderRadius: '50%', border: '3px solid #ffffff', boxShadow: '0 0 0 2px rgba(0,0,0,0.6)', pointerEvents: 'none' },
  crops: { display: 'flex', columnGap: '8px', marginTop: '8px' },
  crop: { borderRadius: tokens.borderRadiusSmall, border: `1px solid ${tokens.colorNeutralStroke2}`, objectFit: 'cover' },
  form: { display: 'grid', rowGap: '8px' },
  two: { display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: '8px' },
  note: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  error: { fontSize: tokens.fontSizeBase200, color: tokens.colorPaletteRedForeground1 },
})

const SOURCES = ['own', 'partner', 'stock', 'other'] as const
const sourceLabel = (k: (typeof SOURCES)[number]) =>
  k === 'own' ? tr('自社で撮影', 'Shot in-house') : k === 'partner' ? tr('取引先から', 'From a partner') : k === 'stock' ? tr('素材サイトで購入', 'Bought from a stock site') : tr('その他', 'Other')

interface Props {
  /** 配信の国の市場(上げた画像は、この市場のライブラリに入る) */
  market: 'US' | 'JP' | null
  /** 最初に使う配信(記録だけ) */
  cardId?: string
  me: string
  onDone: (hero: HeroImage) => void | Promise<void>
  onClose: () => void
}

/**
 * 持っている画像を、メイン画像のライブラリに上げる(X59。利用者と決めた流れ: AI の案 → 頼み直す → ほかから選ぶ → 持っている画像を上げる)。
 * 上げると、AI が画像を見て名前・用途・季節・タグ・説明の下書きを作り、人は確かめて直すだけ。焦点(いちばん見せたい場所)を 1 点決め、
 * テンプレートの縦横比に切り出したときの見え方を確かめる。出どころと使える期限(過ぎたら候補から外す)も入れる。
 * 上げた画像は配信ではなくライブラリに入り、同じ国の次の配信からは、選ぶ候補にも AI の候補にも出る
 */
export function HeroUploadDialog({ market, cardId, me, onDone, onClose }: Props) {
  const s = useStyles()
  const t = useT()
  const fileRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState<'' | 'upload' | 'ai' | 'save'>('')
  const [error, setError] = useState<string | null>(null)
  const [url, setUrl] = useState('')
  const [focal, setFocal] = useState({ x: 0.5, y: 0.5 })
  const [form, setForm] = useState({ name: '', purpose: 'feature', season: 'all_year', tags: '', description: '', source: 'own' as (typeof SOURCES)[number], sourceNote: '', until: '' })
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }))

  const pick = async (file?: File) => {
    if (!file) return
    if (!/\.(jpe?g|png|webp)$/i.test(file.name)) {
      setError(tr('メイン画像に使えるのは JPEG・PNG・WebP です', 'Use a JPEG, PNG or WebP image'))
      return
    }
    setError(null)
    setBusy('upload')
    try {
      const up = await HeroUpload.upload(file)
      setUrl(up.image_url)
      setForm((f) => ({ ...f, name: f.name || file.name.replace(/\.[^.]+$/, '') }))
      setBusy('ai')
      // AI の下書き(失敗しても、手で入れれば登録できる)
      try {
        const d: HeroDraft = await HeroUpload.describe(up.image_url, getLang() === 'en' ? 'en' : 'ja')
        setForm((f) => ({
          ...f,
          name: d.name || f.name,
          purpose: d.purpose && d.purpose in HeroImagePurpose ? d.purpose : f.purpose,
          season: d.season && d.season in HeroImageSeason ? d.season : f.season,
          tags: [d.tags, d.colors, d.subjects].filter(Boolean).join(', '),
          description: d.description || f.description,
        }))
        if (d.focal && typeof d.focal.x === 'number' && typeof d.focal.y === 'number') setFocal({ x: Math.min(1, Math.max(0, d.focal.x)), y: Math.min(1, Math.max(0, d.focal.y)) })
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy('')
    }
  }

  const save = async () => {
    setBusy('save')
    setError(null)
    const d = new Date()
    const code = `UP${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
    const res = await HeroImagesService.create({
      name: form.name.trim(),
      image_code: code,
      purpose: form.purpose as HeroImage['purpose'],
      season: form.season as HeroImage['season'],
      tags: form.tags.trim(),
      description: form.description.trim(),
      image_url: url,
      ...(market ? { market } : {}),
      source: [sourceLabel(form.source), form.sourceNote.trim()].filter(Boolean).join(': '),
      usable_until: form.until || null,
      focal_x: Math.round(focal.x * 1000) / 1000,
      focal_y: Math.round(focal.y * 1000) / 1000,
      uploaded_by: me,
      ...(cardId ? { first_card_id: cardId } : {}),
      state_code: 0,
    })
    if (!res.success || !res.data) {
      setBusy('')
      setError(res.error?.message ?? tr('ライブラリに入れられませんでした', 'Could not add to the library'))
      return
    }
    await onDone(res.data)
    setBusy('')
  }

  const pos = `${focal.x * 100}% ${focal.y * 100}%`
  return (
    <Dialog open onOpenChange={(_, d) => !d.open && !busy && onClose()}>
      <DialogSurface className={s.surface}>
        <DialogBody>
          <DialogTitle>{t('持っている画像を上げる(メイン画像のライブラリへ)', 'Upload your own image (to the hero library)')}</DialogTitle>
          <DialogContent>
            <div className={s.cols}>
              <div>
                {!url ? (
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
                      void pick(e.dataTransfer.files[0])
                    }}
                  >
                    {busy === 'upload' ? <Spinner size="small" /> : <ImageAddRegular fontSize={32} />}
                    <span>{t('ここに画像を置く(JPEG・PNG・WebP、15MB まで)', 'Drop an image here (JPEG, PNG, WebP; up to 15 MB)')}</span>
                    <Button size="small" disabled={!!busy} onClick={() => fileRef.current?.click()}>
                      {t('画像を選ぶ', 'Choose an image')}
                    </Button>
                    <input ref={fileRef} type="file" hidden accept=".jpg,.jpeg,.png,.webp" onChange={(e) => void pick(e.target.files?.[0] ?? undefined)} />
                  </div>
                ) : (
                  <>
                    <div
                      className={s.stage}
                      onClick={(e) => {
                        const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
                        setFocal({ x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) })
                      }}
                    >
                      <img className={s.img} src={url} alt="" />
                      <span className={s.focal} style={{ left: `${focal.x * 100}%`, top: `${focal.y * 100}%` }} />
                    </div>
                    <span className={s.note}>{t('画像を押して、焦点(いちばん見せたい場所)を決めます。下は、横長・正方形・縦長に切り出したときの見え方です。', 'Click the image to set the focal point. Below: how it crops to wide, square and tall.')}</span>
                    <div className={s.crops}>
                      <img className={s.crop} src={url} alt="" style={{ width: 160, height: 90, objectPosition: pos }} />
                      <img className={s.crop} src={url} alt="" style={{ width: 90, height: 90, objectPosition: pos }} />
                      <img className={s.crop} src={url} alt="" style={{ width: 72, height: 96, objectPosition: pos }} />
                    </div>
                  </>
                )}
              </div>
              <div className={s.form}>
                {busy === 'ai' && <Spinner size="tiny" label={t('AI が画像を見て、下書きを作っています…', 'AI is reading the image and drafting…')} />}
                <span className={s.note}>{t('名前・用途・季節・タグ・説明は、AI が画像を見て下書きします。確かめて直してください。', 'AI drafts the name, purpose, season, tags and description from the image. Check and edit them.')}</span>
                <Field label={t('名前', 'Name')} required size="small">
                  <Input size="small" value={form.name} onChange={(_, d) => set('name')(d.value)} />
                </Field>
                <div className={s.two}>
                  <Field label={t('用途', 'Purpose')} size="small">
                    <Select size="small" value={form.purpose} onChange={(_, d) => set('purpose')(d.value)}>
                      {Object.entries(HeroImagePurpose).map(([k, v]) => (
                        <option key={k} value={k}>{optionLabel(v)}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={t('季節', 'Season')} size="small">
                    <Select size="small" value={form.season} onChange={(_, d) => set('season')(d.value)}>
                      {Object.entries(HeroImageSeason).map(([k, v]) => (
                        <option key={k} value={k}>{optionLabel(v)}</option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <Field label={t('タグ(テーマ・色・写っているもの)', 'Tags (theme, colors, subjects)')} size="small">
                  <Input size="small" value={form.tags} onChange={(_, d) => set('tags')(d.value)} />
                </Field>
                <Field label={t('説明', 'Description')} size="small">
                  <Textarea size="small" value={form.description} onChange={(_, d) => set('description')(d.value)} />
                </Field>
                <div className={s.two}>
                  <Field label={t('出どころ', 'Source')} size="small">
                    <Select size="small" value={form.source} onChange={(_, d) => set('source')(d.value)}>
                      {SOURCES.map((k) => (
                        <option key={k} value={k}>{sourceLabel(k)}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={t('使える期限(任意)', 'Usable until (optional)')} size="small">
                    <Input size="small" type="date" value={form.until} onChange={(_, d) => set('until')(d.value)} />
                  </Field>
                </div>
                <Field label={t('出どころのひとこと(任意。例: 取引先名、契約の番号)', 'Source note (optional, e.g. partner, license number)')} size="small">
                  <Input size="small" value={form.sourceNote} onChange={(_, d) => set('sourceNote')(d.value)} />
                </Field>
                <span className={s.note}>{t('期限を過ぎた画像は、選ぶ候補と AI の候補から外れます(使っている配信からは消えません)。', 'Images past the deadline are removed from the candidates and AI suggestions (deliveries already using them keep them).')}</span>
                {error && <span className={s.error}>{error}</span>}
              </div>
            </div>
          </DialogContent>
          <DialogActions>
            <Button disabled={!!busy} onClick={onClose}>{t('やめる', 'Cancel')}</Button>
            <Button appearance="primary" disabled={!!busy || !url || !form.name.trim()} onClick={() => void save()}>
              {busy === 'save' ? t('入れています…', 'Adding…') : t('ライブラリに入れて、この配信に使う', 'Add to library and use here')}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
