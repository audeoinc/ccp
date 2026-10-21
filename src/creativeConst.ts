// 素材(Creative Assets。X58)の決まり。サーバー(server/ccp/creative.py)と同じ値にする
/** 添付できる拡張子(SVG は、中に処理を書けるので除く) */
export const CREATIVE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx']
/** 1 つのファイルの上限 */
export const CREATIVE_MAX_BYTES = 20 * 1024 * 1024
export const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp']
export const extOf = (name?: string) => (name && name.includes('.') ? name.split('.').pop()!.toLowerCase() : '')
