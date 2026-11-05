---
name: confluence-page-writing-en
description: Use whenever writing an English Confluence page or other human-facing document (explainer, report, proposal, how-to, meeting notes), even if not asked, including when creating or editing a page directly in Confluence. Confirms reader and purpose first, puts the conclusion first, and writes in plain prose that reads like a person wrote it.
---

# Writing a Confluence page (English)

AI-written pages usually feel off not because the content is wrong but because the conventions are. Every section gets the same weight, the writer takes no position, claims stay abstract, and none of the team's own context shows up. This skill pulls the page toward what a colleague would write for a specific reader.

For Japanese pages, use `confluence-page-writing` instead.

## 1. Confirm the direction before writing

This applies when creating or editing a page directly in Confluence (through a connector or a browser) too: follow these steps before writing anything there.

Always confirm the direction before writing the body. Don't ask from scratch: infer what you can from the conversation, propose it ("here's what I'm assuming"), and ask whether it's right.

What to confirm:

- Reader: who will read it (e.g. the US marketing lead, a new engineer, the approver)
- Purpose: what the reader should do afterward (decide / act / just know)
- Position: what the writer recommends or needs decided
- Length and depth: a one-screen read, or a detailed reference

How to ask:

- One round of questions, four at most, answerable by choosing an option. Use a multiple-choice tool if one is available.
- **Always ask about the reader and the purpose first, every time.** Even when you can infer them, don't skip the question: put your inference first as the recommended option.
- For the other items, put your inferred answer first, marked as recommended. Don't ask about anything the conversation already settles.
- Once answered, show the heading list with one line per heading on what it will say, and get a yes before writing the body.
- Skip asking only when the person explicitly says "just write it", or in a scheduled run where no answer can come. Then, including the reader and purpose, state your assumptions at the top of the page and proceed.

If `examples/` exists, read it before writing. `good/` shows the conventions to follow; `bad/` shows what to avoid and why.

## 2. Structure

The first three lines tell the reader why this page exists.

```
Purpose: what this page is for (one sentence)
Bottom line: the decision or recommendation (one or two sentences)
Ask: what you need from the reader, with a date if there is one
```

After that, order sections by what the reader needs, not by a fixed template. Rough patterns:

- Decision request: recommendation → why → how it compares to alternatives → risks and mitigations → what we need decided
- How-to: what you'll be able to do → steps → common pitfalls → who to contact
- Update: what changed → who is affected → what happens next

End with decisions and next actions (owner and date). Don't end with a "Summary" that repeats the body.

## 3. Make the weight uneven

- Spend the most words on the part that matters most. Don't give every section the same length.
- Cover what the reader already knows in one line, or skip it.
- Don't default to three bullets per section. Groups of three are a strong AI tell.

## 4. Writing rules

- Explain in paragraphs. Use bullets only for steps, parallel items, or comparisons.
- Bold a few things on the whole page, not in every section.
- Back each claim with one concrete thing: an example, a number, a screenshot, or a link.
- State the writer's judgment: "We recommend A because...", "I'm still unsure about...". Don't end on both-sides hedging.
- Use the team's own names for things. Spell out an acronym the first time only.
- Use sentence case for headings, not Title Case.
- Prefer short, active sentences. Contractions are fine in an internal doc.

Avoid:

| Avoid | Instead |
|---|---|
| leverage, streamline, robust, seamless, delve, unlock, empower | say what actually changes |
| "It's not just X, it's Y" / "X isn't about A, it's about B" | state the point directly |
| "In today's fast-paced..." / "Let's dive in" / "Here's a breakdown" | start with the content |
| "It's important to note that..." / "It's worth mentioning..." | just say it |
| frequent em dashes and colons to join clauses | ordinary sentences |
| emoji as bullet markers or section decoration | plain text |
| a closing line that restates the page | stop when you're done |

## 5. Confluence formatting

- Two heading levels at most (H2, H3).
- Put long detail, logs, and big tables in an Expand macro.
- Warnings go in a Note/Warning panel, side information in an Info panel. Two or three panels per page at most.
- Show state (In review / Decided / On hold) with the Status macro.
- Use tables only for comparisons. Don't turn prose into a table.
- If the page runs past about three screens, split it into child pages and link them from the parent.
- Add a Table of Contents macro only on long pages.
- Use @mentions for owners and date pickers for deadlines.

When the output is Markdown, keep it paste-safe for Confluence and mark macro spots inline, e.g. "(Expand macro)".

## 6. Final check

Re-read the page as someone opening it for the first time, and fix anything that fails:

- Do the first three lines alone tell me what this is and what I need to do?
- Is the most important part also the longest?
- Is any claim left without a concrete example?
- Can I tell where the writer stands?
- Is anything from the "Avoid" table still there?
- Are there too many bold phrases, bullets, or panels?

## Where examples go

- `examples/good/`: pages people found easy to read (names and figures redacted)
- `examples/bad/`: pages people found hard to read, with notes on why

When the examples show a convention not listed here, add it to the rules above. This repository is public, so only add examples with nothing confidential in them.
