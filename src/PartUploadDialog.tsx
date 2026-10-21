import { useRef, useState } from 'react'
import { Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Field, Input, Select, Spinner, Textarea, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { ImageAddRegular, SparkleRegular } from '@fluentui/react-icons'
import { PartImagesService } from './data/partImages'
import { PartUpload, type PartDraft } from './data/partUpload'
import { rasterize, toUploadable } from './imageConvert'
import { partImage } from './images'
import { getLang, optionLabel, tr, useT } from './i18n'
import { PartImageKind, type PartImage } from './models/partImages'

const useStyles = makeStyles({
  surface: { width: 'min(920px, (94vw / var(--ui-zoom, 1)))', maxWidth: 'none' },
  cols: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', columnGap: '16px', alignItems: 'start' },
  drop: {
    display: 'grid',
    placeItems: 'center',
    rowGap: '6px',
    minHeight: '220px',
    border: `1px dashed ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
    color: tokens.colorNeutralForeground2,
    textAlign: 'center',
    padding: '16px',
  },
  dropOn: { border: `1px dashed ${tokens.colorBrandStroke1}`, backgroundColor: tokens.colorBrandBackground2 },
  // 透明な部分が分かるように、市松模様の上に出す
  stage: {
    display: 'grid',
    placeItems: 'center',
    minHeight: '220px',
    padding: '12px',
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: '#ffffff',
    backgroundImage: 'linear-gradient(45deg, #eee 25%, transparent 25%), linear-gradient(-45deg, #eee 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #eee 75%), linear-gradient(-45deg, transparent 75%, #eee 75%)',
    backgroundSize: '16px 16px',
    backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0',
  },
  img: { maxWidth: '100%', maxHeight: 'calc(40vh / var(--ui-zoom, 1))', objectFit: 'contain' },
  form: { display: 'grid', rowGap: '8px' },
  two: { display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: '8px' },
  note: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  error: { fontSize: tokens.fontSizeBase200, color: tokens.colorPaletteRedForeground1 },
})

interface Props {
  /** 入れる国のライブラリ(空は、画面で選ぶ) */
  market: 'US' | 'JP' | null
  me: string
  onDone: (part: PartImage) => void | Promise<void>
  onClose: () => void
  /** 直すとき。画像は差し替えず、名前・種類・タグ・説明・代替テキスト・出どころ・期限を直す */
  part?: PartImage
}

/**
 * 部品の画像(ボタン・バナー・ロゴ・アイコン)を、ライブラリに上げる・直す(X59 ③)。
 * 上げると、AI が画像を見て名前・種類・タグ・説明・代替テキストを下書きし、人は確かめて直すだけ(メイン画像と同じ流れ)。
 * AVIF は PNG に変えて上げる(ボタン・ロゴの透明を残すため)
 */
export function PartUploadDialog({ market, me, onDone, onClose, part }: Props) {
  const s = useStyles()
  const t = useT()
  const fileRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState<'' | 'upload' | 'ai' | 'save'>('')
  const [error, setError] = useState<string | null>(null)
  const editing = !!part
  const [url, setUrl] = useState(part ? (partImage(part) ?? '') : '')
  const [size, setSize] = useState<{ w: number; h: number } | null>(part?.width && part?.height ? { w: part.width, h: part.height } : null)
  const [form, setForm] = useState({
    name: part?.name ?? '',
    kind: (part?.kind ?? 'button') as string,
    tags: part?.tags ?? '',
    description: part?.description ?? '',
    alt: part?.alt_text ?? '',
    source: part?.source ?? '',
    until: (part?.usable_until ?? '').slice(0, 10),
  })
  const [pickMarket, setPickMarket] = useState<'US' | 'JP'>(part?.market ?? market ?? 'US')
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }))
  const lang = () => (getLang() === 'en' ? 'en' : 'ja')

  const applyDraft = (d: PartDraft) =>
    setForm((f) => ({
      ...f,
      name: d.name || f.name,
      kind: d.kind && d.kind in PartImageKind ? d.kind : f.kind,
      tags: d.tags || f.tags,
      description: d.description || f.description,
      alt: d.alt_text || f.alt,
    }))

  const draft = async (src: string) => {
    setBusy('ai')
    try {
      applyDraft(await PartUpload.describeImage(await rasterize(src), lang()))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy('')
    }
  }

  const pick = async (picked?: File) => {
    if (!picked) return
    if (!/\.(jpe?g|png|webp|avif)$/i.test(picked.name)) {
      setError(tr('部品の画像に使えるのは JPEG・PNG・WebP・AVIF です', 'Use a JPEG, PNG, WebP or AVIF image'))
      return
    }
    setError(null)
    setBusy('upload')
    try {
      const file = await toUploadable(picked, true)
      const up = await PartUpload.upload(file)
      setUrl(up.image_url)
      setForm((f) => ({ ...f, name: f.name || file.name.replace(/\.[^.]+$/, '') }))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy('')
      return
    }
    setBusy('')
  }

  const save = async () => {
    setBusy('save')
    setError(null)
    const fields = {
      name: form.name.trim(),
      kind: form.kind as PartImage['kind'],
      market: pickMarket,
      tags: form.tags.trim(),
      description: form.description.trim(),
      alt_text: form.alt.trim(),
      source: form.source.trim(),
      usable_until: form.until || null,
      width: size?.w ?? null,
      height: size?.h ?? null,
    }
    const res = part ? await PartImagesService.update(part.id, fields) : await PartImagesService.create({ ...fields, image_url: url, uploaded_by: me, state_code: 0 })
    setBusy('')
    if (!res.success) {
      setError(res.error?.message ?? tr('保存できませんでした', 'Could not save'))
      return
    }
    await onDone({ ...(part ?? {}), ...(res.data ?? {}) } as PartImage)
  }

  return (
    <Dialog open onOpenChange={(_, d) => !d.open && !busy && onClose()}>
      <DialogSurface className={s.surface}>
        <DialogBody>
          <DialogTitle>{editing ? t(`部品の画像を直す — ${part?.name ?? ''}`, `Edit part image — ${part?.name ?? ''}`) : t('部品の画像を上げる(ボタン・バナー・ロゴ・アイコン)', 'Upload a part image (button, banner, logo, icon)')}</DialogTitle>
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
                    <span>{t('ここに画像を置く(PNG・JPEG・WebP・AVIF、15MB まで。透明を使うなら PNG)', 'Drop an image here (PNG, JPEG, WebP, AVIF; up to 15 MB. Use PNG for transparency)')}</span>
                    <Button size="small" disabled={!!busy} onClick={() => fileRef.current?.click()}>
                      {t('画像を選ぶ', 'Choose an image')}
                    </Button>
                    <input ref={fileRef} type="file" hidden accept=".png,.jpg,.jpeg,.webp,.avif" onChange={(e) => void pick(e.target.files?.[0] ?? undefined)} />
                  </div>
                ) : (
                  <>
                    <div className={s.stage}>
                      <img
                        className={s.img}
                        src={url}
                        alt=""
                        onLoad={(e) => {
                          const img = e.currentTarget
                          const next = { w: img.naturalWidth, h: img.naturalHeight }
                          // 上げたばかりの画像は、大きさを測ってから AI に見せる(1 回だけ)
                          if (!size && !editing) void draft(url)
                          setSize(next)
                        }}
                      />
                    </div>
                    <span className={s.note}>{size ? t(`大きさ: ${size.w} × ${size.h} px(メールでは、半分の幅で出すと高精細の画面でもくっきり見えます)`, `Size: ${size.w} × ${size.h} px (show at half width in emails for sharp display on high-density screens)`) : ''}</span>
                  </>
                )}
              </div>
              <div className={s.form}>
                {busy === 'ai' && <Spinner size="tiny" label={t('AI が画像を見て、下書きを作っています…', 'AI is reading the image and drafting…')} />}
                {editing ? (
                  <div>
                    <Button size="small" icon={<SparkleRegular />} disabled={!!busy || !url} onClick={() => void draft(url)}>
                      {t('AI で下書きし直す', 'Redraft with AI')}
                    </Button>
                  </div>
                ) : (
                  <span className={s.note}>{t('名前・種類・タグ・説明・代替テキストは、AI が画像を見て下書きします。確かめて直してください。', 'AI drafts the name, kind, tags, description and alt text from the image. Check and edit them.')}</span>
                )}
                <Field label={t('名前', 'Name')} required size="small">
                  <Input size="small" value={form.name} onChange={(_, d) => set('name')(d.value)} />
                </Field>
                <div className={s.two}>
                  <Field label={t('種類', 'Kind')} size="small">
                    <Select size="small" value={form.kind} onChange={(_, d) => set('kind')(d.value)}>
                      {Object.entries(PartImageKind).map(([k, v]) => (
                        <option key={k} value={k}>{optionLabel(v)}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={t('国のライブラリ', 'Library (country)')} size="small">
                    <Select size="small" value={pickMarket} onChange={(_, d) => setPickMarket(d.value as 'US' | 'JP')}>
                      <option value="US">US</option>
                      <option value="JP">JP</option>
                    </Select>
                  </Field>
                </div>
                <Field label={t('代替テキスト(画像が出ないときに代わりに出る文。ボタンなら、その文言)', 'Alt text (shown when images are off; for a button, its label)')} size="small">
                  <Input size="small" value={form.alt} onChange={(_, d) => set('alt')(d.value)} />
                </Field>
                <Field label={t('タグ(色・形・文言・用途)', 'Tags (color, shape, wording, use)')} size="small">
                  <Input size="small" value={form.tags} onChange={(_, d) => set('tags')(d.value)} />
                </Field>
                <Field label={t('説明', 'Description')} size="small">
                  <Textarea size="small" value={form.description} onChange={(_, d) => set('description')(d.value)} />
                </Field>
                <div className={s.two}>
                  <Field label={t('出どころ(任意)', 'Source (optional)')} size="small">
                    <Input size="small" value={form.source} onChange={(_, d) => set('source')(d.value)} placeholder={t('例: 自社で作成', 'e.g. Made in-house')} />
                  </Field>
                  <Field label={t('使える期限(任意)', 'Usable until (optional)')} size="small">
                    <Input size="small" type="date" value={form.until} onChange={(_, d) => set('until')(d.value)} />
                  </Field>
                </div>
                {error && <span className={s.error}>{error}</span>}
              </div>
            </div>
          </DialogContent>
          <DialogActions>
            <Button disabled={!!busy} onClick={onClose}>{t('やめる', 'Cancel')}</Button>
            <Button appearance="primary" disabled={!!busy || !url || !form.name.trim()} onClick={() => void save()}>
              {busy === 'save' ? t('保存しています…', 'Saving…') : editing ? t('保存', 'Save') : t('ライブラリに入れる', 'Add to library')}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
