// ⚙ →「見本のデータ」→「商品・メイン画像の写真の ZIP を取り込む」(サーバーの /api/product-images/import。server/ccp/product_images.py)。
// コマンドを使えない環境(本番)でも、AI で作った見本の写真(scripts/sample-photos.py)や、集めた商品ページの画像を取り込めるように。
// まず確認だけを頼んで件数を見せ、OK のときだけ取り込む。
import { appPath } from './appRoot'
import { dropSharedReads } from './gcp/readShare'
import { tr } from './i18n'
import { confirmDialog } from './confirm'

interface ImportSummary {
  sample: boolean
  /** heroes = メイン画像(ヒーロー)の見本の写真の ZIP(scripts/sample-photos.py の kind = heroes) */
  kind?: 'heroes'
  products: number
  images: number
  missing: string[]
  unsupported: number
  mains?: number
}

async function post(file: File, yes: boolean, main = false): Promise<ImportSummary> {
  const res = await fetch(appPath(`/api/product-images/import${yes ? `?yes=1&main=${main ? 1 : 0}` : ''}`), { method: 'POST', body: file, headers: { 'Content-Type': 'application/zip' } })
  dropSharedReads() // 書いたので、途中の読み込みに相乗りさせない(gcp/readShare.ts)
  const json = (await res.json()) as { success: boolean; data?: ImportSummary; error?: { message?: string } }
  if (!json.success || !json.data) throw new Error(json.error?.message ?? tr('ZIP を取り込めませんでした', 'Could not import the ZIP'))
  return json.data
}

/** ファイルを選ばせて取り込む。取り込んだら件数の文、やめたら null */
export async function importProductImagesZip(): Promise<string | null> {
  const file = await new Promise<File | null>((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.zip,application/zip'
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.click()
  })
  if (!file) return null
  const s = await post(file, false)
  if (s.kind === 'heroes') return importHeroes(file, s)
  const kind = s.sample ? tr('AI で作った見本の写真', 'AI-made sample photos') : tr('集めた商品ページの画像', 'collected product page images')
  const missing = s.missing.length ? tr(`\nマスタにない商品(飛ばす): ${s.missing.length} 件`, `\nProducts not in the master (skipped): ${s.missing.length}`) : ''
  const msg = tr(
    `${kind}を取り込みます: 商品 ${s.products} 件・画像 ${s.images} 枚。${missing}\nこの商品の${s.sample ? '見本の' : '(見本でない)'}画像は入れ替わります。${s.sample ? '商品のメイン画像をどうするかは、次に聞きます。' : '商品のメイン画像は、空か仮の画像のときだけ置き換えます。'}よろしいですか?`,
    `Import ${kind}: ${s.products} products, ${s.images} images.${missing}\nThe ${s.sample ? 'sample' : 'non-sample'} images of these products are replaced. ${s.sample ? 'You will be asked next about the main images.' : "A product's main image is replaced only when empty or a placeholder."} Continue?`,
  )
  if (!(await confirmDialog(msg))) return null
  // 見本の写真なら、今のメイン画像も置き換えるかを聞く(前の画像は控えを残すので、元に戻せる)
  const main =
    s.sample &&
    (await confirmDialog(
      tr(
        '商品のメイン画像(一覧・配信に出る画像)も、見本の写真のメインで置き換えますか?\n「OK」= 置き換える(今の画像は控えとして残します)/「キャンセル」= 空か仮の画像のときだけ置き換える',
        "Also replace each product's main image (shown in lists and deliveries) with the sample main photo?\nOK = replace (the current image is kept as a backup) / Cancel = only when empty or a placeholder",
      ),
    ))
  const r = await post(file, true, main)
  return tr(`商品 ${r.products} 件の画像 ${r.images} 枚を取り込みました(メイン画像を ${r.mains ?? 0} 件置き換え)`, `Imported ${r.images} images for ${r.products} products (${r.mains ?? 0} main images replaced)`)
}

// メイン画像は、行の画像を差し替えるだけ(前の画像は original_image_url に控える)なので、確かめは 1 回
async function importHeroes(file: File, s: ImportSummary): Promise<string | null> {
  const missing = s.missing.length ? tr(`
表にないメイン画像(飛ばす): ${s.missing.length} 件`, `
Hero images not in the library (skipped): ${s.missing.length}`) : ''
  const ok = await confirmDialog(
    tr(
      `AI で作ったメイン画像の見本の写真を取り込みます: ${s.images} 枚。${missing}
このメイン画像の画像は差し替わります(前の画像は控えとして残します)。よろしいですか?`,
      `Import AI-made sample hero photos: ${s.images} images.${missing}
These hero images are replaced (the current images are kept as a backup). Continue?`,
    ),
  )
  if (!ok) return null
  const r = await post(file, true)
  return tr(`メイン画像 ${r.mains ?? 0} 枚を差し替えました`, `Replaced ${r.mains ?? 0} hero images`)
}
