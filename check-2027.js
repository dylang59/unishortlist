// Has the 2027 entry cycle filled out yet?
//
// The cycle technically opened on 2026-05-07, but almost no provider has
// uploaded courses into it. This reports how many have, so you can tell
// when it becomes worth searching for real. Run: node check-2027.js
const API = 'https://services.ucas.com/search/api/courses/search';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
           '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

async function ucas(body) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('UCAS API ' + res.status);
  return res.json();
}

const countFor = async (starts) => {
  const d = await ucas({ filters: { schemes: ['UCAS Undergraduate'], startDates: starts } });
  const cc = (d.information && d.information.courseCounts) || {};
  return { total: cc.totalCourseCount || 0, courses: d.courses || [] };
};

(async () => {
  const autumn27 = await countFor(['09/2027', '10/2027']);
  const autumn26 = await countFor(['09/2026', '10/2026']);

  console.log('UCAS undergraduate autumn starts, checked ' + new Date().toISOString().slice(0, 10));
  console.log('  Sept/Oct 2026:', autumn26.total.toLocaleString());
  console.log('  Sept/Oct 2027:', autumn27.total.toLocaleString());

  // Only courses whose academicYearId is 2027 are genuinely 2027 entry;
  // 2027 start months also appear on 2026-cycle mid-year intakes.
  const real = autumn27.courses.filter(c => c.academicYearId === '2027');
  if (real.length) {
    console.log('\n  Providers that have published 2027 courses:');
    const names = [...new Set(real.map(c => c.provider && c.provider.name))];
    names.forEach(n => console.log('   -', n));
  }

  const ratio = autumn26.total ? autumn27.total / autumn26.total : 0;
  console.log('');
  if (ratio > 0.25) {
    console.log('  => The 2027 cycle has filled out. Search it directly.');
  } else if (autumn27.total > 200) {
    console.log('  => 2027 is starting to populate. Worth checking alongside 2026.');
  } else {
    console.log('  => Still essentially empty. Search 2026 as a preview.');
  }
})().catch(e => { console.error('failed:', e.message); process.exit(1); });
