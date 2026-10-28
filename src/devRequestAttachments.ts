// 開発へのリクエストの添付(X69 (g)。2026-10-28 利用者)。画像(クリップボードからの貼り付け・ファイル)と URL を、リクエストにも返信にも付ける。
// 表は足さず、dev_requests の attachments の列に JSON の配列で持つ(返信も同じ表の行なので、1 つの列で両方に付く)。
// 画像の置き場は、素材の置き場所(書いたときの様子の画像 anchor_image と同じ所)。import-pack の入れ替えでも残る(pack.py の file_refs)
import { useEffect, useRef, useState, type ClipboardEvent } from 'react'
import { CreativeFiles } from './data/creativeFiles'
import { tr } from './i18n'

export type DevAttachment = { kind: 'image'; stored: string; name: string; content_type?: string; size?: number } | { kind: 'url'; url: string }

/** 列の文字から読む(読めない・空なら空の配列) */
export function readAttachments(v?: string | null): DevAttachment[] {
  if (!v) return []
  try {
    const list = JSON.parse(v) as unknown
    if (!Array.isArray(list)) return []
    return list.filter((a): a is DevAttachment => !!a && typeof a === 'object' && ((a.kind === 'image' && typeof a.stored === 'string') || (a.kind === 'url' && typeof a.url === 'string')))
  } catch {
    return []
  }
}

/** 列に書く文字(空なら undefined = 書かない) */
export const writeAttachments = (list: DevAttachment[]): string | undefined => (list.length ? JSON.stringify(list) : undefined)

/** 画像の URL(まとめてコピーに入れるときは、ほかの人が開けるように、画面の場所から始まる絶対の URL) */
export const attachmentImageUrl = (stored: string, absolute = false) => {
  const path = CreativeFiles.url(stored)
  return absolute ? new URL(path, window.location.href).href : path
}

/** まとめてコピーの文の行(画像は URL、URL はそのまま) */
export const attachmentLines = (list: DevAttachment[]) =>
  list.map((a) => (a.kind === 'image' ? `${tr('画像', 'Image')}: ${a.name} ${attachmentImageUrl(a.stored, true)}` : `URL: ${a.url}`))

/**
 * これから送る添付(書く欄の下)。画像は付けたときに置き場所へ上げる(送らずに外したら、置き場所からも消す)。
 * 書く欄への貼り付け(onPaste)で、クリップボードの画像も付ける
 */
export function useAttachDraft() {
  const [items, setItems] = useState<DevAttachment[]>([])
  const [uploading, setUploading] = useState(0)
  const [error, setError] = useState<string | null>(null)
  // 送らずにフロートを閉じたら、上げておいた画像は置き場所から消す(どの行も持たない画像を残さない)
  const unsent = useRef<DevAttachment[]>([])
  useEffect(() => {
    unsent.current = items
  }, [items])
  useEffect(
    () => () => {
      for (const a of unsent.current) if (a.kind === 'image') void CreativeFiles.remove(a.stored)
    },
    [],
  )
  const addFiles = async (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith('image/'))
    if (images.length === 0) return
    setError(null)
    setUploading((n) => n + images.length)
    for (const f of images) {
      try {
        // 貼り付けた画像は名前が「image.png」になるので、いつ貼ったかが分かる名前にする
        const name = f.name && f.name !== 'image.png' ? f.name : `${tr('貼り付け', 'pasted')}-${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')}.png`
        const up = await CreativeFiles.upload(new File([f], name, { type: f.type }))
        setItems((prev) => [...prev, { kind: 'image', stored: up.stored, name, content_type: up.contentType, size: up.size }])
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setUploading((n) => n - 1)
      }
    }
  }
  const addUrl = (url: string) => {
    const u = url.trim()
    if (!/^https?:\/\//i.test(u)) {
      setError(tr('URL は http:// か https:// で始めてください', 'URLs must start with http:// or https://'))
      return false
    }
    setError(null)
    setItems((prev) => [...prev, { kind: 'url', url: u }])
    return true
  }
  const remove = (i: number) =>
    setItems((prev) => {
      const a = prev[i]
      if (a?.kind === 'image') void CreativeFiles.remove(a.stored)
      return prev.filter((_, j) => j !== i)
    })
  /** 送ったあと(置き場所の画像は、送った行が持つので消さない) */
  const clear = () => {
    unsent.current = []
    setItems([])
    setError(null)
  }
  const onPaste = (ev: ClipboardEvent) => {
    const files = [...ev.clipboardData.files].filter((f) => f.type.startsWith('image/'))
    if (files.length === 0) return
    // 画像だけを貼ったときは、文字の欄に何も入れない
    ev.preventDefault()
    void addFiles(files)
  }
  return { items, uploading: uploading > 0, error, addFiles, addUrl, remove, clear, onPaste }
}

export type AttachDraft = ReturnType<typeof useAttachDraft>
