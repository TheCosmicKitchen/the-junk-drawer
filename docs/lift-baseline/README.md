# Lift screenshot baseline

How the lift demo looked before the front-end rebuild (issue #54), so every later PR can be
compared screen by screen.

```
npm run shots                      # all of it: 3 themes x light/dark x phone/desktop x 17 screens
npm run shots -- --only=plain      # one theme (comma-separated list)
npm run shots -- --shot=sheet-     # only shots whose name contains this
npm run shots -- --png             # lossless PNG instead of JPEG, for pixel diffs
```

Files are `<theme>_<light|dark>_<phone|desktop>_<screen>.jpg`. Phone is 375x812, desktop 1440x900,
both at 1x, reduced motion, `America/Los_Angeles`, demo data (`lift/?demo`). Tabs and the season
page are full-page; sheets are the viewport.

Only the **Plain** set is committed (about 4 MB); The Iron King and Iron Arcade are made locally by
the same command and ignored by git. To compare a branch with the baseline, run `npm run shots` on
`main` and on the branch and look at the two folders side by side.

Screens: the six tabs (Log, Routines, Library, Calendar, Seasons, Progress), a season's page, and
the sheets: picker, logger, cardio, exercise info, routine editor, plan designer (desktop page; the
phone gets the program designer from the same button), "What are you making?", new season,
settings, and the recap (after logging one set).

Known quirks of the captures, not of the app:
- Desktop full-page shots show the sidebar only to 900 px: it is fixed to the viewport.
- The recap shot includes the "Logged ... Undo" toast from the set logged to reach it.
- There is no wizard shot: `openWizard` in `app.js` is never called, so no button reaches it.
