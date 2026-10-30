// 開発へのリクエストの添付の見た目(付いている添付・書く欄の下の付ける操作)。データと操作は devRequestAttachments.ts(X69 (g))
import { useRef, useState } from 'react'
import { Button, Input, Popover, PopoverSurface, PopoverTrigger, Spinner, makeStyles, tokens } from '@fluentui/react-components'
import { DismissRegular, ImageAddRegular, LinkAddRegular, WarningRegular } from '@fluentui/react-icons'
import { OpenLink } from './LinkText'
import { useT } from './i18n'
import { attachmentImageUrl, type AttachDraft, type DevAttachment } from './devRequestAttachments'

const useStyles = makeStyles({
  list: { display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', minWidth: 0 },
  // 画像は切らずに全体を見せる(小さく、押すと新しいタブで大きく)
  thumb: { display: 'block', width: '72px', height: '54px', objectFit: 'contain', borderRadius: tokens.borderRadiusSmall, border: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: tokens.colorNeutralBackground3 },
  thumbSmall: { width: '48px', height: '36px' },
  url: { display: 'inline-flex', alignItems: 'center', columnGap: '2px', maxWidth: '100%', minWidth: 0, fontSize: tokens.fontSizeBase200 },
  urlText: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  chip: { position: 'relative', display: 'inline-flex', alignItems: 'center', columnGap: '2px', minWidth: 0, maxWidth: '100%' },
  remove: { minWidth: 'auto' },
  tools: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: '2px' },
  warn: { display: 'flex', alignItems: 'flex-start', columnGap: '4px', fontSize: tokens.fontSizeBase200, color: tokens.colorPaletteDarkOrangeForeground1 },
  urlForm: { display: 'flex', columnGap: '6px', alignItems: 'center' },
})

/** 付いている添付(スレッドの 1 件・一覧の行の下) */
export function AttachmentList({ items, small }: { items: DevAttachment[]; small?: boolean }) {
  const s = useStyles()
  if (items.length === 0) return null
  return (
    <div className={s.list}>
      {items.map((a, i) => (a.kind === 'image' ? <ImageThumb key={i} a={a} small={small} /> : <UrlChip key={i} url={a.url} />))}
    </div>
  )
}

function ImageThumb({ a, small }: { a: Extract<DevAttachment, { kind: 'image' }>; small?: boolean }) {
  const s = useStyles()
  const t = useT()
  const src = attachmentImageUrl(a.stored)
  return (
    <a href={src} target="_blank" rel="noreferrer" title={t(`${a.name}(押すと大きく開きます)`, `${a.name} (click to open)`)}>
      <img src={src} alt={a.name} className={small ? `${s.thumb} ${s.thumbSmall}` : s.thumb} />
    </a>
  )
}

function UrlChip({ url }: { url: string }) {
  const s = useStyles()
  return (
    <span className={s.url} title={url}>
      <span className={s.urlText}>{url}</span>
      <OpenLink url={url} />
    </span>
  )
}


/** 書く欄の下の、付ける操作と、これから送る添付 */
export function AttachDraftView({ draft, disabled }: { draft: AttachDraft; disabled?: boolean }) {
  const s = useStyles()
  const t = useT()
  const [urlOpen, setUrlOpen] = useState(false)
  const [url, setUrl] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const hasImage = draft.items.some((a) => a.kind === 'image')
  return (
    <>
      <div className={s.tools}>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(ev) => {
            void draft.addFiles([...(ev.target.files ?? [])])
            ev.target.value = ''
          }}
        />
        <Button size="small" appearance="subtle" icon={<ImageAddRegular />} disabled={disabled} title={t('画像を付ける(書く欄に貼り付けても付きます)', 'Attach an image (or paste it into the text box)')} onClick={() => fileRef.current?.click()}>
          {t('画像', 'Image')}
        </Button>
        <Popover open={urlOpen} onOpenChange={(_, d) => setUrlOpen(d.open)} inline trapFocus>
          <PopoverTrigger disableButtonEnhancement>
            <Button size="small" appearance="subtle" icon={<LinkAddRegular />} disabled={disabled}>
              {t('URL', 'URL')}
            </Button>
          </PopoverTrigger>
          <PopoverSurface>
            <form
              className={s.urlForm}
              onSubmit={(ev) => {
                ev.preventDefault()
                if (draft.addUrl(url)) {
                  setUrl('')
                  setUrlOpen(false)
                }
              }}
            >
              <Input size="small" autoFocus value={url} onChange={(_, d) => setUrl(d.value)} placeholder="https://…" aria-label={t('付ける URL', 'URL to attach')} />
              <Button size="small" appearance="primary" type="submit" disabled={!url.trim()}>
                {t('付ける', 'Attach')}
              </Button>
            </form>
          </PopoverSurface>
        </Popover>
        {draft.uploading && <Spinner size="extra-tiny" label={t('画像を上げています', 'Uploading')} />}
      </div>
      {draft.items.length > 0 && (
        <div className={s.list}>
          {draft.items.map((a, i) => (
            <span key={i} className={s.chip}>
              {a.kind === 'image' ? <ImageThumb a={a} small /> : <UrlChip url={a.url} />}
              <Button size="small" appearance="subtle" className={s.remove} icon={<DismissRegular />} onClick={() => draft.remove(i)} aria-label={t('外す', 'Remove')} />
            </span>
          ))}
        </div>
      )}
      {/* 画像は、チームのだれでも見られる。貼る前に、写っているものを確かめてもらう */}
      {hasImage && (
        <span className={s.warn}>
          <WarningRegular />
          {t('個人情報・機密(お客様の名前・メールアドレス・社外秘の数字など)が写っていないか、確認してから送ってください', 'Check that no personal or confidential information (customer names, emails, internal figures) is visible before sending')}
        </span>
      )}
      {draft.error && <span className={s.warn}>{draft.error}</span>}
    </>
  )
}
