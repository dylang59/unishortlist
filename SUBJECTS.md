# Subject starter directory

The home-page subject browser is a static snapshot in `public/subjects.js`.
It makes no UCAS request when the page loads.

The entries were curated from the `searchSubjects.name` facet on the UCAS 2027
undergraduate index and checked on 1 October 2026. The upstream facet response is
capped at 1,000 labels, so this is a useful navigation directory rather than an
exhaustive taxonomy. Free-text search remains available for specialist subjects.

Each entry stores a display label separately from the exact search query. This
lets the UI show friendly labels such as “Biomedical Science” while searching the
UCAS term “Biomedical sciences”. Popular subjects are a fixed subset of the same
directory. A–Z views show 20 entries initially, followed by a “Show all” control.

To refresh the snapshot, query the live index for `searchSubjects.name`, review
new and removed labels, update the curated entries, and change the edition and
check date in `public/subjects.js`. Do not derive the directory from course-title
first words: that produces fragments such as “Applied” and “International”.
