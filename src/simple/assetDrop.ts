import { CardAssetsService } from '../data/cardAssets'
import { CreativeFiles } from '../data/creativeFiles'
import { CREATIVE_EXTS, CREATIVE_MAX_BYTES, extOf } from '../creativeConst'
import { tr } from '../i18n'

/** ドラッグで運ばれてきたものに、素材にできるもの(ファイル・URL)があるか(ドラッグ中は中身を読めないので、種類だけで決める) */
export const canDropAsset = (dt: DataTransfer) => dt.types.includes('Files') || dt.types.includes('text/uri-list') || dt.types.includes('text/plain')

/**
 * 右端の帯の「渡すもの」に落とした画像・資料・URL を、参考の素材(card_assets)に入れる(SU1。PLAN の途中で思いついたイメージを、列を開かずに書き留めるため)。
 * 入れ方は素材の欄(CreativeAssets)と同じ(ファイルは置き場所に上げてから行を作る。形式と大きさの決まりも同じ)。入れた数と、入れられなかった理由を返す
 */
export async function addDroppedAssets(cardId: string, me: string, dt: DataTransfer): Promise<{ added: number; error?: string }> {
  const files = [...dt.files]
  if (files.length > 0) {
    const bad = files.filter((f) => !CREATIVE_EXTS.includes(extOf(f.name)) || f.size > CREATIVE_MAX_BYTES)
    let added = 0
    for (const f of files.filter((x) => !bad.includes(x))) {
      const up = await CreativeFiles.upload(f)
      const res = await CardAssetsService.create({ name: f.name, kind: 'file', file_name: f.name, stored: up.stored, content_type: up.contentType, size: up.size, note: '', added_by: me, delivery_card_id: cardId })
      if (res.success) added++
    }
    return { added, error: bad.length ? tr(`添付できないファイルがあります(画像・PDF・Office、1 つ 20MB まで): ${bad.map((f) => f.name).join('、')}`, `Some files can't be attached (images, PDF, Office; up to 20 MB each): ${bad.map((f) => f.name).join(', ')}`) : undefined }
  }
  const url = (dt.getData('text/uri-list') || dt.getData('text/plain')).split('\n')[0]?.trim() ?? ''
  if (!/^https?:\/\//i.test(url)) return { added: 0, error: tr('落とせるのは、画像・資料のファイルか、http(s) の URL です', 'Drop image or document files, or an http(s) URL') }
  let host = url
  try {
    host = new URL(url).host
  } catch {
    // 名前は URL のまま
  }
  const res = await CardAssetsService.create({ name: host, kind: 'url', url, note: '', added_by: me, delivery_card_id: cardId })
  return res.success ? { added: 1 } : { added: 0, error: res.error?.message ?? tr('素材を保存できませんでした', 'Could not save the asset') }
}
