# How publications get onto the site

## The short version

Every Monday a GitHub Action looks for new papers and preprints. When it finds one, it opens a
GitHub issue assigned to you, which lands in your inbox as an email. Reply to that email (or comment
on the issue) with the `/approve` line it gives you, and the paper appears on the publications page a
minute or two later. Reply `/reject` instead and it's never suggested again.

You never have to edit a file by hand.

## What to reply

The email contains two commands. Put one of them on the **first line** of your reply, above the
quoted text:

```
/approve doi:10.64898/2026.08.14.744561
```

```
/reject doi:10.64898/2026.08.14.744561
```

If the command can't be read, the bot replies saying so and leaves the issue open — it never claims
to have added something it didn't.

## Where the papers come from

Four sources, queried together and merged:

| Source | Query | Covers |
| --- | --- | --- |
| Crossref | `filter=orcid:0000-0001-8684-2417` | Journal articles **and** bioRxiv/medRxiv preprints. Primary source. |
| Europe PMC | name + Berkeley/IGI affiliation | Papers where a publisher never recorded your ORCID iD — typically middle-author papers. |
| PubMed | `[auid]` ORCID search | Adds PMIDs. |
| ORCID | works API | Anything you've linked by hand. |

Crossref alone misses nothing that has your ORCID attached, but publishers don't always attach it,
which is why Europe PMC is there. Europe PMC is searched by name, so it's restricted to Berkeley/IGI
affiliations — at least two other researchers publish as "Rubin BE", and an unrestricted name search
once opened about 1,800 spurious issues.

A run fails loudly if Crossref is unreachable or returns nothing, rather than quietly reporting "no
new publications".

## Preprints that get published

When a preprint on the site is accepted somewhere, the next run proposes the journal version and
notes that approving it will **replace** the preprint entry rather than add a second one. This works
whether or not the title changed.

## Editing things by hand

- **The publication list** is `data/publications.json`. After editing it, run
  `node scripts/build-publications.js` to regenerate the copy inside `<noscript>` in
  `publications.html` (that copy is what search engines read; it is generated, don't edit it
  directly).
- **Who gets bolded** in author lists is `data/lab-members.json`, built from the people page. Names
  are matched on surname plus first initial, so a non-lab author who happens to share both will be
  bolded too — remove or add entries here to fix it, then re-run `build-publications.js`.

## Running a check right now

```
gh workflow run check-publications.yml
```

Or use the "Run workflow" button on the *Check for New Publications* action.
