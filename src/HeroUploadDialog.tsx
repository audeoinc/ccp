import { useRef, useState } from 'react'
import { Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Field, Input, Select, Slider, Spinner, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { ImageAddRegular, SparkleRegular } from '@fluentui/react-icons'
import { AutoTextarea } from './AutoTextarea'
import { HeroImagesService } from './data/heroImages'
import { HeroUpload, type HeroDraft } from './data/heroUpload'
import { heroImage } from './images'
import { cropStyle } from './heroRights'
import { rasterize, toUploadable } from './imageConvert'
import { getLang, optionLabel, tr, useT } from './i18n'
import { HeroImagePurpose, HeroImageSeason, type HeroImage } from './models/heroImages'

const useStyles = makeStyles({
  surface: { width: 'min(1000px, (94vw / var(--ui-zoom, 1)))', maxWidth: 'none' },
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
  img: { width: '100%', maxHeight: 'calc(56vh / var(--ui-zoom, 1))', objectFit: 'contain', backgroundColor: tokens.colorNeutralBackground3 },
  focal: { position: 'absolute', width: '28px', height: '28px', marginLeft: '-14px', marginTop: '-14px', borderRadius: '50%', border: '3px solid #ffffff', boxShadow: '0 0 0 2px rgba(0,0,0,0.6)', pointerEvents: 'none' },
  crops: { display: 'flex', columnGap: '10px', marginTop: '8px', alignItems: 'end' },
  cropBox: { display: 'grid', rowGap: '2px', justifyItems: 'center', fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3 },
  crop: { borderRadius: tokens.borderRadiusSmall, border: `1px solid ${tokens.colorNeutralStroke2}`, overflow: 'hidden', lineHeight: 0 },
  zoomRow: { display: 'flex', alignItems: 'center', columnGap: '8px', marginTop: '6px', fontSize: tokens.fontSizeBase200 },
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
  /** 直すとき(ライブラリの管理画面。X59 ②)。画像は差し替えず、名前・用途・季節・タグ・説明・焦点・出どころ・期限を直す */
  hero?: HeroImage
}

/**
 * 持っている画像を、メイン画像のライブラリに上げる(X59。利用者と決めた流れ: AI の案 → 頼み直す → ほかから選ぶ → 持っている画像を上げる)。
 * 上げると、AI が画像を見て名前・用途・季節・タグ・説明の下書きを作り、人は確かめて直すだけ。焦点(いちばん見せたい場所)を 1 点決め、
 * テンプレートの縦横比に切り出したときの見え方を確かめる。出どころと使える期限(過ぎたら候補から外す)も入れる。
 * 上げた画像は配信ではなくライブラリに入り、同じ国の次の配信からは、選ぶ候補にも AI の候補にも出る
 */
export function HeroUploadDialog({ market, cardId, me, onDone, onClose, hero }: Props) {
  const s = useStyles()
  const t = useT()
  const fileRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState<'' | 'upload' | 'ai' | 'save'>('')
  const [error, setError] = useState<string | null>(null)
  const editing = !!hero
  const [url, setUrl] = useState(hero ? (heroImage(hero) ?? '') : '')
  const [focal, setFocal] = useState({ x: hero?.focal_x ?? 0.5, y: hero?.focal_y ?? 0.5 })
  // 切り出すときの拡大(X59 ④。1 = 拡大なし)
  const [zoom, setZoom] = useState(Math.min(3, Math.max(1, Number(hero?.focal_zoom) || 1)))
  const [form, setForm] = useState({
    name: hero?.name ?? '',
    purpose: (hero?.purpose ?? 'feature') as string,
    season: (hero?.season ?? 'all_year') as string,
    tags: hero?.tags ?? '',
    description: hero?.description ?? '',
    source: 'own' as (typeof SOURCES)[number],
    // 直すときは、出どころを 1 つの文として直す(上げたときの「種類: ひとこと」をそのまま)
    sourceNote: hero?.source ?? '',
    until: (hero?.usable_until ?? '').slice(0, 10),
  })
  // ライブラリの画面から上げるときは、どの国のライブラリに入れるかを選ぶ
  const [pickMarket, setPickMarket] = useState<'US' | 'JP'>(market ?? 'US')
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }))

  /** AI の下書きを、フォームに入れる(焦点は、上げたときだけ) */
  const applyDraft = (d: HeroDraft, withFocal: boolean) => {
    setForm((f) => ({
      ...f,
      name: d.name || f.name,
      purpose: d.purpose && d.purpose in HeroImagePurpose ? d.purpose : f.purpose,
      season: d.season && d.season in HeroImageSeason ? d.season : f.season,
      tags: [d.tags, d.colors, d.subjects].filter(Boolean).join(', ') || f.tags,
      description: d.description || f.description,
    }))
    if (withFocal && d.focal && typeof d.focal.x === 'number' && typeof d.focal.y === 'number') setFocal({ x: Math.min(1, Math.max(0, d.focal.x)), y: Math.min(1, Math.max(0, d.focal.y)) })
  }
  const lang = () => (getLang() === 'en' ? 'en' : 'ja')

  // 直すとき: いまの画像を AI に見せ直して、名前・用途・季節・タグ・説明を作り直す(X59 ⑤。焦点は変えない)
  const redraft = async () => {
    if (!url) return
    setError(null)
    setBusy('ai')
    try {
      applyDraft(await HeroUpload.describeImage(await rasterize(url), lang()), false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy('')
    }
  }

  const pick = async (picked?: File) => {
    if (!picked) return
    if (!/\.(jpe?g|png|webp|avif)$/i.test(picked.name)) {
      setError(tr('メイン画像に使えるのは JPEG・PNG・WebP・AVIF です', 'Use a JPEG, PNG, WebP or AVIF image'))
      return
    }
    setError(null)
    setBusy('upload')
    try {
      // AVIF は、ブラウザの中で JPEG に変えてから上げる(メールでは AVIF を出せない受信ソフトが多いため。X59 ⑥)
      const file = await toUploadable(picked)
      const up = await HeroUpload.upload(file)
      setUrl(up.image_url)
      setForm((f) => ({ ...f, name: f.name || file.name.replace(/\.[^.]+$/, '') }))
      setBusy('ai')
      // AI の下書き(失敗しても、手で入れれば登録できる)
      try {
        applyDraft(await HeroUpload.describe(up.image_url, lang()), true)
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
    if (hero) {
      const res = await HeroImagesService.update(hero.id, {
        name: form.name.trim(),
        purpose: form.purpose as HeroImage['purpose'],
        season: form.season as HeroImage['season'],
        tags: form.tags.trim(),
        description: form.description.trim(),
        source: form.sourceNote.trim(),
        usable_until: form.until || null,
        focal_x: Math.round(focal.x * 1000) / 1000,
        focal_y: Math.round(focal.y * 1000) / 1000,
        focal_zoom: Math.round(zoom * 100) / 100,
      })
      setBusy('')
      if (!res.success) {
        setError(res.error?.message ?? tr('保存できませんでした', 'Could not save'))
        return
      }
      await onDone({ ...hero, ...(res.data ?? {}) })
      return
    }
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
      market: market ?? pickMarket,
      source: [sourceLabel(form.source), form.sourceNote.trim()].filter(Boolean).join(': '),
      usable_until: form.until || null,
      focal_x: Math.round(focal.x * 1000) / 1000,
      focal_y: Math.round(focal.y * 1000) / 1000,
      focal_zoom: Math.round(zoom * 100) / 100,
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

  return (
    <Dialog open onOpenChange={(_, d) => !d.open && !busy && onClose()}>
      <DialogSurface className={s.surface}>
        <DialogBody>
          <DialogTitle>{editing ? t(`メイン画像を直す — ${hero?.image_code ?? ''}`, `Edit hero image — ${hero?.image_code ?? ''}`) : t('持っている画像を上げる(メイン画像のライブラリへ)', 'Upload your own image (to the hero library)')}</DialogTitle>
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
                    <span>{t('ここに画像を置く(JPEG・PNG・WebP・AVIF、15MB まで。AVIF は JPEG に変えて上げます)', 'Drop an image here (JPEG, PNG, WebP, AVIF; up to 15 MB. AVIF is converted to JPEG)')}</span>
                    <Button size="small" disabled={!!busy} onClick={() => fileRef.current?.click()}>
                      {t('画像を選ぶ', 'Choose an image')}
                    </Button>
                    <input ref={fileRef} type="file" hidden accept=".jpg,.jpeg,.png,.webp,.avif" onChange={(e) => void pick(e.target.files?.[0] ?? undefined)} />
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
                    <span className={s.note}>{t('画像を押して、焦点(いちばん見せたい場所)を決めます。拡大すると、焦点を中心に寄って切り出します。下は、テンプレートの枠(帯・正方形・縦長・横長)に切り出したときの見え方です。', 'Click the image to set the focal point. Zoom in to crop closer around it. Below: how it crops into the template frames (band, square, tall, wide).')}</span>
                    <div className={s.zoomRow}>
                      <span>{t('拡大', 'Zoom')}</span>
                      <Slider size="small" min={1} max={3} step={0.1} value={zoom} onChange={(_, d) => setZoom(d.value)} aria-label={t('切り出すときの拡大', 'Crop zoom')} />
                      <span>{`${zoom.toFixed(1)}×`}</span>
                      {zoom > 1 && (
                        <Button size="small" appearance="subtle" onClick={() => setZoom(1)}>
                          {t('拡大なし', 'Reset')}
                        </Button>
                      )}
                    </div>
                    <div className={s.crops}>
                      {(
                        [
                          [t('帯 8:3', 'Band 8:3'), 160, 60],
                          [t('正方形', 'Square'), 90, 90],
                          [t('縦 4:5', 'Tall 4:5'), 80, 100],
                          [t('横 2:1', 'Wide 2:1'), 140, 70],
                        ] as const
                      ).map(([label, w, h]) => (
                        <span key={label} className={s.cropBox}>
                          <span className={s.crop} style={{ width: w, height: h }}>
                            <img src={url} alt="" style={{ width: '100%', height: '100%', ...cropStyle(focal.x, focal.y, zoom) }} />
                          </span>
                          {label}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <div className={s.form}>
                {busy === 'ai' && <Spinner size="tiny" label={t('AI が画像を見て、下書きを作っています…', 'AI is reading the image and drafting…')} />}
                {!editing && <span className={s.note}>{t('名前・用途・季節・タグ・説明は、AI が画像を見て下書きします。確かめて直してください。', 'AI drafts the name, purpose, season, tags and description from the image. Check and edit them.')}</span>}
                {editing && (
                  <div>
                    <Button size="small" icon={<SparkleRegular />} disabled={!!busy || !url} onClick={() => void redraft()} title={t('いまの画像を AI に見せ直して、名前・用途・季節・タグ・説明を作り直します(焦点は変えません。保存で確定)', 'Show the image to AI again and redraft the name, purpose, season, tags and description (focal point unchanged; saved on Save)')}>
                      {t('AI で下書きし直す', 'Redraft with AI')}
                    </Button>
                  </div>
                )}
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
                  <AutoTextarea size="small" rows={2} value={form.tags} onChange={(_, d) => set('tags')(d.value)} />
                </Field>
                <Field label={t('説明', 'Description')} size="small">
                  <AutoTextarea size="small" rows={4} value={form.description} onChange={(_, d) => set('description')(d.value)} />
                </Field>
                {editing ? (
                  <div className={s.two}>
                    <Field label={t('出どころ', 'Source')} size="small">
                      <Input size="small" value={form.sourceNote} onChange={(_, d) => set('sourceNote')(d.value)} />
                    </Field>
                    <Field label={t('使える期限(任意)', 'Usable until (optional)')} size="small">
                      <Input size="small" type="date" value={form.until} onChange={(_, d) => set('until')(d.value)} />
                    </Field>
                  </div>
                ) : (
                <>
                {!market && (
                  <Field label={t('入れる国のライブラリ', 'Library (country)')} size="small">
                    <Select size="small" value={pickMarket} onChange={(_, d) => setPickMarket(d.value as 'US' | 'JP')}>
                      <option value="US">US</option>
                      <option value="JP">JP</option>
                    </Select>
                  </Field>
                )}
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
                </>
                )}
                <span className={s.note}>{t('期限を過ぎた画像は、選ぶ候補と AI の候補から外れます(使っている配信からは消えません)。', 'Images past the deadline are removed from the candidates and AI suggestions (deliveries already using them keep them).')}</span>
                {error && <span className={s.error}>{error}</span>}
              </div>
            </div>
          </DialogContent>
          <DialogActions>
            <Button disabled={!!busy} onClick={onClose}>{t('やめる', 'Cancel')}</Button>
            <Button appearance="primary" disabled={!!busy || !url || !form.name.trim()} onClick={() => void save()}>
              {busy === 'save' ? t('保存しています…', 'Saving…') : editing ? t('保存', 'Save') : cardId ? t('ライブラリに入れて、この配信に使う', 'Add to library and use here') : t('ライブラリに入れる', 'Add to library')}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
