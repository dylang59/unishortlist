# University starter rankings

The home-page switcher uses fixed 2027 editions, independent of the UCAS entry
year. Switching ranking or cutoff changes the quick picks, not the shortlist.
Times and Guardian include published ranks up to 25, 50 or 100, including ties.
Guardian's Top 100 contains 101 universities because two share rank 100.

QS is a world table, so its UK list is every UK university it ranks: 60 in
the 2027 edition. Their UK positions are derived from the world ranks, ties
kept (Warwick and Birmingham share world rank 68, so both are UK =10 and the
next is 12), and each entry keeps its `world` rank, shown in the chip's
tooltip. The ISSC table also lists 79 UK universities QS does not rank
("N/A"); they are left out. With only 60 entries, the 100 cut reads "all 60".
QS opens at its top 20, as the home screen always has.

Times and Guardian sources checked on 1 October 2026; QS on 2 October 2026:

- Times and Sunday Times Good University Guide: [table reproduced by ISSC](https://issc.co.uk/uk-university-rankings/times/default.asp?year=2027).
- Guardian University Guide: [table reproduced by CFE](https://cfeuk.com/the-guardian-university-guide-2027/), with a link to the [publisher's interactive table](https://www.theguardian.com/education/ng-interactive/2026/sep/12/the-guardian-university-guide-2027-the-rankings).
- QS World University Rankings, UK subset: [ISSC table](https://issc.co.uk/uk-university-rankings/qs/default.asp?year=2027qs).

Times here means the domestic Good University Guide, not Times Higher Education.
The new ranking data is in `public/rankings.js`; each list includes its source,
publisher, edition, and check date. Institution labels and exact UCAS provider
names are separate. All entries were matched to the 2027 undergraduate provider
list; unavailable institutions in another entry year remain visible but disabled.

When refreshing, replace ranks and source metadata together, retain joint ranks,
and validate exact provider names. Do not take the first N source rows: some
reproductions put tied institutions at the bottom of the table. Include every
institution whose published rank is within the cutoff.
