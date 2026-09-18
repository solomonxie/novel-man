# Translation, glossary, screenplay

## Translation  `app/book/[id]/translation.tsx`

```
┌───────────────────────────────────────────┐
│ ‹  Translations                           │
│ ┌───────────────────────────────────────┐ │
│ │ English            2,140 / 8,900   ›  │ │
│ │ ▓▓▓▓▓░░░░░░░░░░░░░░░░░░               │ │
│ │ 日本語                 Not translated │ │
│ │ ＋ Translate into…                    │ │
│ └───────────────────────────────────────┘ │
│ ┌───────────────────────────────────────┐ │
│ │ Translate 6,760 sentences  costs $ ›  │ │
│ │ Glossary                    41     ›  │ │
│ └───────────────────────────────────────┘ │
│ Names and terms in the glossary are       │
│ obeyed exactly. Fill it in before a long  │
│ run — changing a term later marks the     │
│ sentences using it for re-running.        │
│ SENTENCES                                 │
│ ┌───────────────────────────────────────┐ │
│ │ 她还是下去了。                        │ │
│ │ She went down anyway.      ✎ edited › │ │
│ │ 雨已经下了三天…             needs      │ │
│ │                          re-running   │ │
│ └───────────────────────────────────────┘ │
│ empty  Add a language to translate this   │
│        book into. Nothing is sent         │
│        anywhere until you run it.         │
│ done   Everything is translated           │
│ result 2,140 sentences translated.        │
│        12 couldn't be aligned.            │
│ [ Remove this language ]!                 │
│   ⇒ Delete the English translation,       │
│     including your edits?                 │
└───────────────────────────────────────────┘
```

A chapter that fails alignment is flagged and retried alone — never a
whole-book rollback.

## Sentence editor  `src/ui/UnitEditor.tsx`

```
┌───────────────────────────────────────────┐
│ Cancel            Sentence          Save  │
├───────────────────────────────────────────┤
│ ORIGINAL                                  │
│ 她还是下去了。                            │ ← not editable
│ YOUR CHANGES                              │
│ She went down ~~regardless~~ anyway.      │ ← diff vs the machine output:
│ ┌───────────────────────────────────────┐ │   strikethrough removed,
│ │ She went down anyway.                 │ │   underline added
│ └───────────────────────────────────────┘ │
│ [ Back to the machine translation ]       │
│ [ Make this a glossary term ]             │ ← promotes the diff in one tap
│ A term is obeyed in every chapter, and    │
│ the sentences already using it are marked │
│ for re-running.                           │
└───────────────────────────────────────────┘
```

## Glossary  `app/book/[id]/terms.tsx`

```
┌───────────────────────────────────────────┐
│ ‹  Terms                                  │
│ ┌───────────────────────────────────────┐ │
│ │ In the original   她                  │ │
│ │ Translate as      she                 │ │
│ │ [ Add the term ]                      │ │
│ └───────────────────────────────────────┘ │
│ TERMS                          From the cast│
│ ┌───────────────────────────────────────┐ │
│ │ 林小满        Lin Xiaoman      🔒     │ │ ← 🔒 = decided: a hard
│ │ 老陈          Old Chen                │ │   constraint, not a hint
│ │ 长夜纪        The Long Night   🔒     │ │
│ └───────────────────────────────────────┘ │
│ A locked term is one you have decided.    │
│ Tap the lock to mark it settled.          │
│ No terms yet.                             │
│ SUGGESTED TERMS                       41  │
│ 灯塔                             128×     │ ← proper nouns seen often that
│ Names and repeated proper nouns that      │   nobody has decided on
│ aren't in the glossary yet. Tap one to    │
│ start adding it.                          │
│ seeded  41 names added. Fill in their     │
│         translations.                     │
│ added   Term saved · 128 translated       │
│         sentences use it and are now      │
│         marked for re-running.            │
└───────────────────────────────────────────┘
```

## Screenplay  `app/book/[id]/script.tsx`

```
┌───────────────────────────────────────────┐
│ ‹  Screenplay                             │
│ ┌───────────────────────────────────────┐ │
│ │ Turn scenes into a screenplay  costs ›│ │
│ └───────────────────────────────────────┘ │
│ Converts one scene at a time, keeping the │
│ book's own names…                         │
│ SCENES                                    │
│ ┌───────────────────────────────────────┐ │
│ │ ch.12 · At the lighthouse   converted │ │
│ │ INT. LIGHTHOUSE — NIGHT               │ │
│ │ 林小满: 灯灭了。                       │ │
│ │                        ( Show more )  │ │
│ │ ch.13 · The river          ( Convert )│ │
│ └───────────────────────────────────────┘ │
│ empty  Nothing yet.                       │
│ [ Clear the screenplay ]!                 │
└───────────────────────────────────────────┘
```
