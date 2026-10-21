import { useMemo, useRef, useState } from 'react'
import { Badge, Button, Dialog, DialogBody, DialogSurface, DialogTitle, Input, Switch, makeStyles, tokens } from '@fluentui/react-components'
import { CalendarCancelRegular, DeleteRegular, DismissRegular, EditRegular, ImageAddRegular, SearchRegular, SparkleRegular } from '@fluentui/react-icons'
import { HeroImagesService } from './data/heroImages'
import { HeroUpload } from './data/heroUpload'
import { HeroUploadDialog } from './HeroUploadDialog'
import { heroPosition, isUsableHero } from './heroRights'
import { heroImage } from './images'
import { rasterize } from './imageConvert'
import { getLang, optionLabel, tr, useT } from './i18n'
import { heroMarket } from './market'
import type { DeliveryCard } from './models/deliveryCards'
import { HeroImagePurpose, HeroImageSeason, type HeroImage } from './models/heroImages'
import { weekKeyOf } from './weekLock'

const useStyles = makeStyles({
  surface: { width: 'min(1400px, (96vw / var(--ui-zoom, 1)))', maxWidth: 'none', height: 'calc(90vh / var(--ui-zoom, 1))' },
  body: { height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 },
  titleRow: { display: 'flex', alignItems: 'center', columnGap: '8px' },
  grow: { flexGrow: 1, minWidth: 0 },
  tools: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: '8px', rowGap: '6px', margin: '8px 0' },
  chip: { minWidth: 'auto', height: '26px', padding: '0 10px', fontWeight: tokens.fontWeightRegular },
  note: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  error: { fontSize: tokens.fontSizeBase200, color: tokens.colorPaletteRedForeground1 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gridAutoRows: 'max-content', gap: '10px', overflow: 'auto', minHeight: 0, flexGrow: 1, flexBasis: 0, alignContent: 'start', paddingBottom: '8px' },
  card: { display: 'grid', gridTemplateRows: '150px auto', alignSelf: 'start', border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, overflow: 'hidden', backgroundColor: tokens.colorNeutralBackground1 },
  thumb: { width: '100%', height: '150px', objectFit: 'cover', backgroundColor: tokens.colorNeutralBackground3 },
  info: { display: 'grid', rowGap: '3px', padding: '8px 10px', minWidth: 0 },
  name: { fontWeight: tokens.fontWeightSemibold, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  line: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  badges: { display: 'flex', flexWrap: 'wrap', gap: '4px' },
  actions: { display: 'flex', flexWrap: 'wrap', columnGap: '4px', marginTop: '4px' },
})

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const daysUntil = (ymd: string) => Math.round((new Date(`${ymd.slice(0, 10)}T00:00:00`).getTime() - new Date(`${today()}T00:00:00`).getTime()) / 86400000)
const isUploaded = (h: HeroImage) => /^\/img\/heroes\/up-/.test(h.image_url ?? '') || !!h.uploaded_by

interface Props {
  heroes: HeroImage[]
  cards: DeliveryCard[]
  /** いまの絞り込みの国(空は、すべて) */
  country: string
  me: string
  onChanged: () => Promise<void>
  onClose: () => void
}

/**
 * メイン画像のライブラリの管理画面(X59 ②。⚙ から)。一覧(画像・国・用途・季節・出どころ・使える期限・使っている配信の数と今週・前週)、
 * 絞り込み、画像を上げる、直す(名前・タグ・焦点・出どころ・期限)、期限を今日で切る、消す(使っている配信がない画像だけ)
 */
export function HeroLibrary({ heroes, cards, country, me, onChanged, onClose }: Props) {
  const s = useStyles()
  const t = useT()
  const [q, setQ] = useState('')
  const [market, setMarket] = useState<'' | 'US' | 'JP'>(country === 'US' || country === 'JP' ? country : '')
  const [onlyUploaded, setOnlyUploaded] = useState(false)
  const [showExpired, setShowExpired] = useState(true)
  const [editing, setEditing] = useState<HeroImage | null>(null)
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // 空の項目を AI で埋める(X59 ⑤): 進み具合と、やめる印
  const [filling, setFilling] = useState<{ done: number; total: number; failed: number } | null>(null)
  const stopRef = useRef(false)

  // 画像ごとの、使っている配信の数(取りやめた配信は数えない)と、今週・前週の数
  const usage = useMemo(() => {
    const now = new Date()
    const thisWeek = weekKeyOf(now)
    const lastWeek = weekKeyOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7))
    const m = new Map<string, { all: number; thisWeek: number; lastWeek: number }>()
    for (const c of cards) {
      if (!c.hero_image_id || c.cancelled_at) continue
      const u = m.get(c.hero_image_id) ?? { all: 0, thisWeek: 0, lastWeek: 0 }
      u.all++
      if (c.scheduled_at) {
        const k = weekKeyOf(new Date(c.scheduled_at))
        if (k === thisWeek) u.thisWeek++
        if (k === lastWeek) u.lastWeek++
      }
      m.set(c.hero_image_id, u)
    }
    return m
  }, [cards])

  const list = heroes
    .filter((h) => !market || heroMarket(h) === market)
    .filter((h) => !onlyUploaded || isUploaded(h))
    .filter((h) => showExpired || isUsableHero(h))
    .filter((h) => {
      const w = q.trim().toLowerCase()
      return !w || [h.name, h.image_code, h.tags, h.description, h.source].some((x) => (x ?? '').toLowerCase().includes(w))
    })
    .sort((a, b) => (b.created_on ?? '').localeCompare(a.created_on ?? ''))

  const run = async (id: string, f: () => Promise<unknown>) => {
    setBusy(id)
    setError(null)
    try {
      await f()
      await onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }
  const expireToday = (h: HeroImage) =>
    run(h.id, async () => {
      // 今日まで使える = 明日から候補に出ない(使っている配信からは消えない)
      const r = await HeroImagesService.update(h.id, { usable_until: today() })
      if (!r.success) throw new Error(r.error?.message ?? tr('期限を切れませんでした', 'Could not set the deadline'))
    })
  const remove = (h: HeroImage) => {
    if (!window.confirm(tr(`メイン画像「${h.name}」をライブラリから消します(上げた画像なら、ファイルも消します)。よろしいですか?`, `Delete "${h.name}" from the library (its file too, if it was uploaded)?`))) return
    void run(h.id, async () => {
      await HeroImagesService.delete(h.id)
      if (h.image_url) await HeroUpload.remove(h.image_url)
    })
  }

  // タグか説明が空の画像(いま絞り込んでいるものだけ)。名前は、コードのままのものも埋める
  const needsFill = (h: HeroImage) => !h.tags?.trim() || !h.description?.trim() || !h.name?.trim() || h.name.trim() === h.image_code
  const toFill = list.filter(needsFill)
  /** 空の項目だけを、AI が画像を見て埋める(入っている項目は変えない。1 点ずつ順に。途中でやめられる) */
  const fillEmpty = async () => {
    if (!toFill.length) return
    if (!window.confirm(tr(`タグ・説明などが空の ${toFill.length} 点を、AI が画像を見て埋めます(入っている項目は変えません)。よろしいですか?`, `AI will fill the empty fields of ${toFill.length} images from the images (filled fields stay). Continue?`))) return
    stopRef.current = false
    setError(null)
    const targets = [...toFill]
    const state = { done: 0, total: targets.length, failed: 0 }
    setFilling({ ...state })
    const lang = getLang() === 'en' ? 'en' : 'ja'
    for (const h of targets) {
      if (stopRef.current) break
      try {
        const src = heroImage(h)
        if (!src) throw new Error('no image')
        const d = await HeroUpload.describeImage(await rasterize(src), lang)
        const tags = [d.tags, d.colors, d.subjects].filter(Boolean).join(', ')
        const patch: Partial<HeroImage> = {}
        if ((!h.name?.trim() || h.name.trim() === h.image_code) && d.name) patch.name = d.name
        if (!h.tags?.trim() && tags) patch.tags = tags
        if (!h.description?.trim() && d.description) patch.description = d.description
        if (!h.purpose && d.purpose && d.purpose in HeroImagePurpose) patch.purpose = d.purpose as HeroImage['purpose']
        if (!h.season && d.season && d.season in HeroImageSeason) patch.season = d.season as HeroImage['season']
        if (Object.keys(patch).length) {
          const r = await HeroImagesService.update(h.id, patch)
          if (!r.success) throw new Error(r.error?.message)
        }
      } catch {
        state.failed++
      }
      state.done++
      setFilling({ ...state })
    }
    await onChanged()
    setFilling(null)
    if (state.failed) setError(tr(`${state.failed} 点は AI で読めませんでした(画像を開けないか、AI が答えませんでした。直すから手で入れられます)`, `${state.failed} images could not be read by AI (enter them via Edit)`))
  }

  return (
    <Dialog open onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface className={s.surface}>
        <DialogBody className={s.body}>
          <div className={s.titleRow}>
            <DialogTitle className={s.grow}>{t('メイン画像のライブラリ', 'Hero image library')}</DialogTitle>
            <Button appearance="primary" icon={<ImageAddRegular />} onClick={() => setUploading(true)}>
              {t('画像を上げる', 'Upload an image')}
            </Button>
            <Button appearance="subtle" icon={<DismissRegular />} onClick={onClose} aria-label={t('閉じる', 'Close')} />
          </div>
          <div className={s.tools}>
            <Input size="small" contentBefore={<SearchRegular />} value={q} onChange={(_, d) => setQ(d.value)} placeholder={t('名前・コード・タグ・出どころで探す', 'Search name, code, tags, source')} />
            {(['', 'US', 'JP'] as const).map((m) => (
              <Button key={m || 'all'} size="small" shape="circular" className={s.chip} appearance={market === m ? 'primary' : 'outline'} onClick={() => setMarket(m)}>
                {m || t('すべての国', 'All countries')}
              </Button>
            ))}
            <Switch checked={onlyUploaded} onChange={(_, d) => setOnlyUploaded(d.checked)} label={t('上げた画像だけ', 'Uploaded only')} />
            <Switch checked={showExpired} onChange={(_, d) => setShowExpired(d.checked)} label={t('期限切れも出す', 'Show expired')} />
            <span className={s.note}>{t(`${list.length} 点`, `${list.length} images`)}</span>
            {filling ? (
              <>
                <span className={s.note}>{t(`AI で埋めています… ${filling.done} / ${filling.total}`, `Filling with AI… ${filling.done} / ${filling.total}`)}</span>
                <Button size="small" appearance="subtle" onClick={() => (stopRef.current = true)}>{t('やめる', 'Stop')}</Button>
              </>
            ) : (
              <Button size="small" icon={<SparkleRegular />} disabled={!toFill.length || !!busy} onClick={() => void fillEmpty()} title={t('名前(コードのまま)・タグ・説明が空の画像を、AI が画像を見て埋めます。入っている項目は変えません。いま絞り込んでいる画像だけが対象です', 'AI fills the empty name (code only), tags and description from each image. Filled fields stay. Only the images currently listed')}>
                {t(`空の項目を AI で埋める(${toFill.length} 点)`, `Fill empty fields with AI (${toFill.length})`)}
              </Button>
            )}
          </div>
          {error && <span className={s.error}>{error}</span>}
          <div className={s.grid}>
            {list.map((h) => {
              const u = usage.get(h.id) ?? { all: 0, thisWeek: 0, lastWeek: 0 }
              const left = h.usable_until ? daysUntil(h.usable_until) : null
              return (
                <div key={h.id} className={s.card}>
                  <img className={s.thumb} src={heroImage(h)} alt="" loading="lazy" style={{ objectPosition: heroPosition(h) }} />
                  <div className={s.info}>
                    <span className={s.name} title={h.name}>{h.name}</span>
                    <span className={s.line}>{[h.image_code, heroMarket(h), optionLabel(h.purpose_name), optionLabel(h.season_name)].filter(Boolean).join(' ・ ')}</span>
                    {h.tags && <span className={s.line} title={h.tags}>{h.tags}</span>}
                    <span className={s.line} title={h.source}>{t(`出どころ: ${h.source || '(未入力)'}`, `Source: ${h.source || '(not set)'}`)}</span>
                    <div className={s.badges}>
                      {left !== null && left < 0 ? (
                        <Badge appearance="filled" color="danger" size="small">{t('期限切れ', 'Expired')}</Badge>
                      ) : left !== null && left <= 30 ? (
                        <Badge appearance="tint" color="warning" size="small">{t(`期限まで ${left} 日`, `${left} days left`)}</Badge>
                      ) : h.usable_until ? (
                        <Badge appearance="outline" size="small">{t(`${h.usable_until.slice(0, 10)} まで`, `Until ${h.usable_until.slice(0, 10)}`)}</Badge>
                      ) : null}
                      {isUploaded(h) && <Badge appearance="tint" color="brand" size="small">{t(`上げた画像${h.uploaded_by ? `(${h.uploaded_by})` : ''}`, `Uploaded${h.uploaded_by ? ` by ${h.uploaded_by}` : ''}`)}</Badge>}
                      <Badge appearance="outline" size="small">{t(`使っている配信 ${u.all}(今週 ${u.thisWeek}・前週 ${u.lastWeek})`, `Used in ${u.all} (this wk ${u.thisWeek} · last wk ${u.lastWeek})`)}</Badge>
                    </div>
                    <div className={s.actions}>
                      <Button size="small" appearance="subtle" icon={<EditRegular />} disabled={busy === h.id} onClick={() => setEditing(h)}>
                        {t('直す', 'Edit')}
                      </Button>
                      {u.all > 0 ? (
                        // 使っている配信がある画像は消さず、期限を切って候補から外す(使っている配信のメイン画像が消えないように)
                        isUsableHero(h) && (
                          <Button size="small" appearance="subtle" icon={<CalendarCancelRegular />} disabled={busy === h.id} onClick={() => void expireToday(h)} title={t('使っている配信があるので消さず、今日までにして、明日から候補に出さない', 'In use, so set it to expire today instead of deleting')}>
                            {t('今日で期限を切る', 'Expire today')}
                          </Button>
                        )
                      ) : (
                        <Button size="small" appearance="subtle" icon={<DeleteRegular />} disabled={busy === h.id} onClick={() => remove(h)}>
                          {t('消す', 'Delete')}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          {(editing || uploading) && (
            <HeroUploadDialog
              market={market || null}
              hero={editing ?? undefined}
              me={me}
              onClose={() => {
                setEditing(null)
                setUploading(false)
              }}
              onDone={async () => {
                await onChanged()
                setEditing(null)
                setUploading(false)
              }}
            />
          )}
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
