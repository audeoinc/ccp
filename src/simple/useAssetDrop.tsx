// 左のバーの欄(渡すもの・素材 など)に、画像・資料・URL を落として、参考の素材に入れる。計画・制作の面で同じ形(optimize-survey の 2 章。2026-11-02)。
// SideRail の drop にそのまま渡せる形と、入れた・入れられなかったをバーの下に短く知らせる印(note)を返す
import { useState } from 'react'
import { Tooltip, makeStyles, tokens } from '@fluentui/react-components'
import { CheckmarkRegular, ErrorCircleRegular } from '@fluentui/react-icons'
import { addDroppedAssets, canDropAsset } from './assetDrop'
import { useT } from '../i18n'

const useStyles = makeStyles({
  note: { fontSize: '16px' },
})

/** cardId の配信の参考の素材に入れる。me は入れた人の名前(落としたときに求める)。onAdded は、1 件でも入ったとき(素材の欄・数を読み直すため) */
export function useAssetDrop<V extends string>({ cardId, me, onAdded }: { cardId: string; me: () => string; onAdded: () => void }) {
  const s = useStyles()
  const t = useT()
  const [over, setOver] = useState<V | null>(null)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const dropAssets = async (dt: DataTransfer) => {
    setOver(null)
    try {
      const r = await addDroppedAssets(cardId, me(), dt)
      setNote(r.error ? { ok: false, text: r.error } : { ok: true, text: t(`${r.added} 件を参考の素材に入れました`, `Added ${r.added} to reference assets`) })
      if (r.added > 0) onAdded()
    } catch (err) {
      setNote({ ok: false, text: err instanceof Error ? err.message : String(err) })
    }
    window.setTimeout(() => setNote(null), 4000)
  }
  const drop = {
    over,
    onOver: (v: V, ev: React.DragEvent) => {
      if (!canDropAsset(ev.dataTransfer)) return
      ev.preventDefault()
      setOver(v)
    },
    onLeave: () => setOver(null),
    onDrop: (_: V, ev: React.DragEvent) => {
      ev.preventDefault()
      void dropAssets(ev.dataTransfer)
    },
  }
  // 落としたものを入れた・入れられなかったを、バーの下に短く知らせる
  const noteEl = note && (
    <Tooltip content={note.text} relationship="label" positioning="after" visible>
      <span className={s.note} style={{ color: note.ok ? tokens.colorPaletteGreenForeground1 : tokens.colorPaletteRedForeground1 }}>
        {note.ok ? <CheckmarkRegular /> : <ErrorCircleRegular />}
      </span>
    </Tooltip>
  )
  return { drop, note: noteEl }
}
