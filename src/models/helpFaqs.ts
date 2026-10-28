// 表 help_faqs(「？ 聞く」のよく聞かれる質問。X82 段 ④)の、1 行の型。列を変えたら、server/schema.json と一緒に直す。
// AI が質問を束ねて作った行。消さない。読み書きは /api/help(src/data/help.ts)だけ

/** 書き込める列(書くのはサーバーの /api/help だけ) */
export interface HelpFaqFields {
  /** 代表の聞き方(日本語・English) */
  question_ja?: string
  question_en?: string
  /** 答え(src/help/helpAsk.ts の HelpAnswer の JSON) */
  answer_ja?: string
  answer_en?: string
  /** 束ねた質問の数 */
  ask_count?: number
  /** そのうち「開発に伝える」に進んだ数 */
  dev_count?: number
  first_asked_at?: string
  last_asked_at?: string
  /** 関係する画面と部品(JSON の配列。{page, view, open, el, count}) */
  places?: string
  /** まちがった FAQ を隠した日時(空なら出す) */
  hidden_at?: string
  /** 聞き方・答えを作り直した日時 */
  built_at?: string
}

/** 読んだ 1 行 */
export interface HelpFaq extends HelpFaqFields {
  id: string
  created_on?: string
}
