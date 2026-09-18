# Structure — chapters, one chapter, scenes

## Chapter list  `app/book/[id]/structure.tsx`

```
┌───────────────────────────────────────────┐
│ ‹  Structure                              │
│ 3 chapters the detector wasn't sure about.│
│ CHAPTERS                                  │
│ ┌───────────────────────────────────────┐ │
│ │ 1  第一章 灯灭                     ›  │ │
│ │    12,400 chars · 4 scenes            │ │
│ │ 2  Untitled                 ⚠ unsure ›│ │ ← the detector's own doubt,
│ │    8,100 chars · 0 scenes             │ │   shown not hidden
│ │ 3  第三章 河水          ✎ edited   ›  │ │ ← your rename survives a re-run
│ └───────────────────────────────────────┘ │
│ ┌───────────────────────────────────────┐ │
│ │ Detect chapters again             ›   │ │
│ │ Find chapters with AI  costs money ›  │ │
│ │ Suggest scene breaks in every chapter │ │
│ │ Brief all 44 remaining chapters       │ │
│ └───────────────────────────────────────┘ │
└───────────────────────────────────────────┘
 row menu ▸ Split… · Merge with next · Move up · Move down ·
            Add a scene break… · Clear 4 scene breaks ·
            Delete this chapter !
```

```
 Re-run detection? Chapters you renamed keep their names.
 Your renames and splits survive a re-run; everything else is recomputed.
 Delete this chapter ⇒ Its text joins the neighbouring chapter. Nothing is
                       removed from the manuscript.
 Split before…       ⇒ a list of paragraph starts to cut at
                       This chapter is a single paragraph — there's nowhere
                       to split it.
 AI found            ⇒ Found 47 chapters. 2 batches failed.
                       No chapters found. Nothing was changed.
```

Every AI row states what leaves the device before it runs:

```
 Find chapters with AI
 Sends only the short lines that could be headings — never the
 manuscript — and asks which are chapter titles.
 Suggest scene breaks
 Sends the first line of each paragraph — never the prose — and asks
 where the time, place or viewpoint changes.
```

## One chapter  `app/chapter/[id].tsx`

```
┌───────────────────────────────────────────┐
│ ‹  Chapter                     ( Analyze )│
│ Chapter 12                                │
│ The Second Step                           │ ← title, edits in place
│ What happens in this chapter?             │ ← brief, edits in place
│ est. 12k tokens · $0.03                   │ ← or "add an AI key to see the
│ Read from here →                          │   cost"
│ SCENES                                    │
│ ┌───────────────────────────────────────┐ │
│ │ Scene 1                            ›  │ │ ← each scene's summary edits
│ │ What happens in this scene?           │ │   in place, right here
│ │ Read from this scene →                │ │
│ └───────────────────────────────────────┘ │
│ No scenes yet — mark one, or let an       │
│ analysis read for them.                   │
│ WHO IS IN IT      ( 林小满 )( 老陈 )       │ ← names open that profile
│ Nobody recorded yet.                      │
│ WHERE IT HAPPENS  ( 灯塔 )                 │
│ No places recorded yet.                   │
│ Names here open that profile. Analyzing   │
│ the chapter fills the scenes, the cast    │
│ and the places.                           │
└───────────────────────────────────────────┘
```

## Scenes  `app/book/[id]/scenes.tsx` · `app/scene/[id].tsx`

```
┌───────────────────────────────────────────┐
│ ‹  Scenes                                 │
│ 128 scenes under 34 names                 │
│ At the lighthouse                appears 6×│
│ ┌───────────────────────────────────────┐ │
│ │ ch.1 · 灯灭                        ›  │ │
│ │ No summary for this one yet.          │ │
│ └───────────────────────────────────────┘ │
│ empty  No scenes yet.                     │
│        Scenes come from analyzing a       │
│        chapter, or from marking a break   │
│        yourself in the chapter list.      │
└───────────────────────────────────────────┘

 one scene  `app/scene/[id].tsx`
 ‹  Scene                          found by AI
 Scene 3 of 5
 At the lighthouse                    ← name and summary edit in place
 The chapter                                       ›
 Read from here →
 IN THIS SCENE     ( 林小满 )( 老陈 )   ( 灯塔 a place )
 Nobody recognized in this scene.
 HOW IT STARTS
 ┌──────────────────────────────────────┐
 │ The rain had not stopped…            │   the scene's opening lines
 └──────────────────────────────────────┘
 WHERE THIS SCENE APPEARS
 ch.1 · 灯灭                  this one           ›
 Who is in a scene is counted from the scene's own words, so a name
 only mentioned elsewhere in the chapter isn't listed here.
```
