// 表 help_questions(「？ 聞く」の質問と答えの生の記録。X82 段 ④)の、1 行の型。列を変えたら、server/schema.json と一緒に直す。
// だれが聞いたかは残さない。まとめに入れてから 90 日で消える。読み書きは /api/help(src/data/help.ts)だけ

/** 書き込める列(書くのはサーバーの /api/help だけ) */
export interface HelpQuestionFields {
  question?: string
  /** 答え(HelpAnswer の JSON) */
  answer?: string
  /** 画面の言葉(ja / en) */
  lang?: string
  /** 聞いたときの画面(HelpScreen の JSON) */
  screen?: string
  /** 右クリックの「ここについて聞く」から始めたときの部品(data-el)と、その名前 */
  element?: string
  element_label?: string
  asked_at?: string
  /** 「開発に伝える」に進んだ日時 */
  sent_to_dev_at?: string
  /** よく聞かれる質問のまとめに入れた日時 */
  summarized_at?: string
  /** 束ねた FAQ */
  help_faq_id?: string
}

/** 読んだ 1 行 */
export interface HelpQuestion extends HelpQuestionFields {
  id: string
  created_on?: string
}
