// 素材(X58)の URL の見本カードを取る(画面の部品のファイルからは、関数を書き出せないので分ける)
import { CardAssetsService } from './data/cardAssets'
import { CreativeFiles } from './data/creativeFiles'
import { tr } from './i18n'
import type { CardAsset } from './models/cardAssets'

/**
 * URL の素材の見本カードを取り、素材の行に書く(ページの題名・説明・サイト名・代表の画像。X58 の案 A)。
 * 前の代表の画像は、置き場所から消す。読めないページは例外(URL のままでも使える)
 */
export async function refreshPreview(a: CardAsset): Promise<void> {
  if (a.kind !== 'url' || !a.url) return
  const p = await CreativeFiles.preview(a.url)
  const res = await CardAssetsService.update(a.id, {
    preview_title: p.title,
    preview_description: p.description,
    preview_site: p.site,
    preview_image: p.image_stored,
    preview_at: new Date().toISOString(),
  })
  if (!res.success) throw new Error(res.error?.message ?? tr('見本カードを保存できませんでした', 'Could not save the preview card'))
  if (a.preview_image && a.preview_image !== p.image_stored) await CreativeFiles.remove(a.preview_image)
}
