---
name: slide-deck-writing-en
description: Use whenever drafting an English slide deck, PowerPoint, or presentation, even if not asked. Confirms audience and goal first, builds a storyline readable from titles alone, and avoids the templated AI look.
---

# Writing slide content (English)

This skill decides what goes on the slides and in what order. For building the file itself (.pptx or a slide tool), follow that skill's or tool's instructions.

For Japanese decks, use `slide-deck-writing` instead.

AI-made decks look AI-made because every slide has the same shape (title + three bullets + icon), there's no peak, titles are topic labels like "Background" or "Challenges", and the conclusion arrives last. Decks people make are shaped by the audience and the room.

## 1. Confirm the direction before building

Always confirm the direction before building slides. Don't ask from scratch: infer what you can from the conversation, propose it ("here's what I'm assuming"), and ask whether it's right.

What to confirm:

- Audience: who will see it
- Format: presented live, or sent to be read on its own
- Goal: what the audience should decide or do afterward
- Position: what you're recommending
- Time: length of the slot (roughly 1–2 minutes per slide)

How to ask:

- One round of questions, four at most, answerable by choosing an option. Use a multiple-choice tool if one is available.
- **Always ask about the audience and the purpose (format and goal) first, every time.** Even when you can infer them, don't skip the question: put your inference first as the recommended option.
- For the other items, put your inferred answer first, marked as recommended. Don't ask about anything the conversation already settles.
- Once answered, show the title-only storyline (next section) and get a yes before building slide content.
- Skip asking only when the person explicitly says "just make it", or in a scheduled run where no answer can come. Then, including the audience and purpose (format and goal), state your assumptions first and proceed.

If `examples/` exists, read it first. If there is a company template, follow it.

## 2. Write the titles first

Before any slide content, list the slide titles in order and show them to the person for a yes. Read them top to bottom; the story should make sense from the titles alone.

- Titles are claims, not topics. Not "Current state" but "40% of tickets are the same three questions".
- One message per slide. If a slide has two, split it.
- Put the recommendation or the ask on slide 2 at the latest. Don't spend the opening on preamble.
- The last slide is not "Summary". It is the decision you need, or next steps with owners and dates.

## 3. Build a peak

- Concentrate visuals, real screenshots, and numbers on the one or two slides that matter most. Let the others stay quiet.
- Don't use the same layout on every slide.
- Don't default to three bullets.

## 4. Slide content rules

- Prefer diagrams, tables, numbers, and real screens over text.
- At most five bullet lines per slide, each short and readable as a phrase.
- Give every number a small source and date.
- Make claims concrete: not "improve efficiency" but "a 20-hour monthly report drops to 2 hours".
- Say what you think: "We recommend option A", "Risk: vendor lock-in".
- Use the team's own names for things.
- Put what you'll say in the speaker notes, not on the slide.
- For a read-ahead deck, more text is fine, but each title still states the point.
- Sentence case for titles.

Avoid:

- Slides made only of words like leverage, streamline, synergy, unlock, empower, robust, seamless
- "It's not just X, it's Y" constructions and other slogan-style lines
- Decorative icons or stock images that carry no information; gradients as decoration
- Content chopped into identical rounded cards
- ALL-CAPS eyebrow labels and "01 / 02 / 03" numbering unless the content really is a sequence
- Emoji as bullets
- More than one accent color

## 5. Final check

Look at the deck as a first-time viewer, and fix anything that fails:

- Do the titles alone tell the story in order?
- Is the recommendation or ask visible by slide 2?
- Does the peak slide stand out from the rest?
- Is any claim left without a concrete example?
- Does any slide carry two messages?
- Does the last slide tell the audience what to do?

## Where examples go

- `examples/good/`: decks people found clear (names and figures redacted)
- `examples/bad/`: decks people found hard to follow, with notes on why

When the examples show a convention not listed here, add it to the rules above. This repository is public, so only add examples with nothing confidential in them.
