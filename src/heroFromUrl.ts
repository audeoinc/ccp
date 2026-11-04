// URL のページから選んだ画像を、メイン画像のライブラリに入れる(content.hero.fromurl。2026-11-02 利用者)。
// 配信カード(確定のとき)と、制作の HeroPicker の両方から使う。
// 画像はこちらの置き場所に写してから使う(外のサイトの画像の URL は、あとで消えることがあるため)。写せない(外に出られない など)ときは、元の URL のまま入れる
import { ProductPages } from './data/productPages'
import { HeroImagesService } from './data/heroImages'
import type { HeroImage, HeroImageMarket } from './models/heroImages'
import { tr } from './i18n'

/** 画像そのものの URL か(ページを読まずに、その 1 枚を出す) */
export const isImageUrl = (url: string) => /^https?:\/\/[^?#]+\.(jpe?g|png|webp|gif|avif)([?#].*)?$/i.test(url.trim())

export async function addHeroFromUrl(input: { src: string; name: string; page: string; market: HeroImageMarket | null; me: string; cardId?: string }): Promise<HeroImage> {
  let url = input.src
  if (/^https?:\/\//.test(input.src)) {
    try {
      url = (await ProductPages.adopt(input.src)).image_url
    } catch {
      // 写せなくても、ブラウザからは見えるので、元の URL のまま使う
    }
  }
  const d = new Date()
  // 上げた画像(HeroUploadDialog)と同じ形の番号。URL から入れたものは頭を UR にして見分ける
  const code = `UR${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
  const res = await HeroImagesService.create({
    name: input.name.trim() || tr('URL から選んだ画像', 'Image from a URL'),
    image_code: code,
    image_url: url,
    ...(input.market ? { market: input.market } : {}),
    // 出どころに、選んだページ(画像そのものの URL なら、その URL)を残す
    source: `${tr('URL から', 'From a URL')}: ${input.page || input.src}`,
    uploaded_by: input.me,
    ...(input.cardId ? { first_card_id: input.cardId } : {}),
    state_code: 0,
  })
  if (!res.success || !res.data) throw new Error(res.error?.message ?? tr('ライブラリに入れられませんでした', 'Could not add to the library'))
  return res.data
}
