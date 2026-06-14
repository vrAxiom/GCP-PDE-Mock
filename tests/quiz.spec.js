// @ts-check
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

// ── App constants (must match practice-exam.html) ────────────────────
const SECTION_Q_COUNT = 20;
const FULL_TEST_DIST = [4, 4, 4, 4, 4, 10, 10, 10];
const FULL_TOTAL = FULL_TEST_DIST.reduce((a, b) => a + b, 0); // 50
const EXPECTED_POOL = [173, 134, 172, 137, 117, 105, 180, 100];
const EXPECTED_TOTAL_POOL = EXPECTED_POOL.reduce((a, b) => a + b, 0); // 1118

// ── Mock question factory ─────────────────────────────────────────────
// ans is always 0 pre-shuffle so we can use state.questions[i].ans after shuffle
function mockSection(tag, count) {
  count = count || SECTION_Q_COUNT;
  return Array.from({ length: count }, function (_, i) {
    return {
      q: '[MOCK] ' + tag + ' Question ' + (i + 1) + ': Which service?',
      opts: [
        'Correct-' + tag + '-' + i,
        'Wrong-B-' + tag + '-' + i,
        'Wrong-C-' + tag + '-' + i,
        'Wrong-D-' + tag + '-' + i
      ],
      ans: 0,
      explain: 'Explanation ' + tag + ' Q' + (i + 1),
      concept: 'Concept ' + tag
    };
  });
}

// ── Route interceptors ────────────────────────────────────────────────
async function withMock(page) {
  const fileNames = [
    'questions-s1.json',
    'questions-s2.json',
    'questions-s3.json',
    'questions-s4.json',
    'questions-s5.json',
    'questions-s6-core-fundamentals.json',
    'questions-s7-mlops.json',
    'questions-s8-security-governance.json'
  ];
  for (var i = 1; i <= 8; i++) {
    var data = mockSection('S' + i);
    await page.route('**/' + fileNames[i - 1], (function (d, num) {
      return function (route) {
        route.fulfill({ contentType: 'application/json', body: JSON.stringify(d) });
      };
    })(data, i));
  }
}

async function loadApp(page) {
  await page.goto('/practice-exam.html');
  await page.waitForFunction(
    function () { return typeof SECTIONS !== 'undefined' && SECTIONS[0] && SECTIONS[0].questions.length > 0; },
    { timeout: 8000 }
  );
}

// ── Programmatic answer helper ────────────────────────────────────────
// Directly sets state.answers / state.submitted without UI clicks — tests scoring logic
async function programmaticAnswers(page, opts) {
  var correctIndices = opts.correctIndices || [];
  var wrongIndices = opts.wrongIndices || [];
  await page.evaluate(function (args) {
    var qs = state.questions;
    for (var i = 0; i < qs.length; i++) {
      if (args.ci.indexOf(i) !== -1) {
        state.answers[i] = qs[i].ans;
        state.submitted[i] = true;
        state.questionDurations[i] = 10 + i; // fake duration
        state.questionStartTimes[i] = Date.now();
      } else if (args.wi.indexOf(i) !== -1) {
        state.answers[i] = (qs[i].ans + 1) % 4;
        state.submitted[i] = true;
        state.questionDurations[i] = 20 + i;
        state.questionStartTimes[i] = Date.now();
      }
      // else: not submitted → counts as "skipped" in results
    }
  }, { ci: correctIndices, wi: wrongIndices });
}

async function viewResults(page) {
  await page.locator('#btn-review').click();
  await page.waitForSelector('#results.active', { timeout: 5000 });
}

async function waitForQuiz(page) {
  await page.waitForSelector('#quiz.active', { timeout: 5000 });
}

// ═══════════════════════════════════════════════════════════════════════
// 1. JSON DATA INTEGRITY — file-system checks, no browser
// ═══════════════════════════════════════════════════════════════════════
test.describe('JSON Data Integrity', function () {
  const FILE_NAMES = [
    'questions-s1.json',
    'questions-s2.json',
    'questions-s3.json',
    'questions-s4.json',
    'questions-s5.json',
    'questions-s6-core-fundamentals.json',
    'questions-s7-mlops.json',
    'questions-s8-security-governance.json'
  ];

  for (var si = 1; si <= 8; si++) {
    (function (sectionNum) {
      var expectedCount = EXPECTED_POOL[sectionNum - 1];
      var fileName = FILE_NAMES[sectionNum - 1];
      test(fileName + ' — valid JSON, count=' + expectedCount + ', full schema', function () {
        var file = path.join(__dirname, '../' + fileName);
        expect(fs.existsSync(file), 'file exists').toBe(true);

        var raw = fs.readFileSync(file, 'utf-8');
        var questions;
        expect(function () { questions = JSON.parse(raw); }).not.toThrow();
        expect(Array.isArray(questions), 'is array').toBe(true);
        expect(questions.length, 'question count').toBe(expectedCount);

        questions.forEach(function (q, idx) {
          var ref = 's' + sectionNum + '[' + idx + ']';
          // q
          expect(typeof q.q, ref + '.q type').toBe('string');
          expect(q.q.trim().length, ref + '.q not empty').toBeGreaterThan(0);
          // opts
          expect(Array.isArray(q.opts), ref + '.opts is array').toBe(true);
          expect(q.opts.length, ref + '.opts has 4').toBe(4);
          q.opts.forEach(function (o, oi) {
            expect(typeof o, ref + '.opts[' + oi + '] type').toBe('string');
            expect(o.trim().length, ref + '.opts[' + oi + '] not empty').toBeGreaterThan(0);
          });
          // ans
          expect(typeof q.ans, ref + '.ans type').toBe('number');
          expect(Number.isInteger(q.ans), ref + '.ans integer').toBe(true);
          expect(q.ans, ref + '.ans >= 0').toBeGreaterThanOrEqual(0);
          expect(q.ans, ref + '.ans <= 3').toBeLessThanOrEqual(3);
          // explain
          expect(typeof q.explain, ref + '.explain type').toBe('string');
          expect(q.explain.trim().length, ref + '.explain not empty').toBeGreaterThan(0);
          // concept
          expect(typeof q.concept, ref + '.concept type').toBe('string');
          expect(q.concept.trim().length, ref + '.concept not empty').toBeGreaterThan(0);
        });
      });
    })(si);
  }

  test('grand total across all 8 files = 1118', function () {
    var total = 0;
    for (var i = 1; i <= 8; i++) {
      var fileName = FILE_NAMES[i - 1];
      var qs = JSON.parse(fs.readFileSync(path.join(__dirname, '../' + fileName), 'utf-8'));
      total += qs.length;
    }
    expect(total).toBe(EXPECTED_TOTAL_POOL);
  });

  test('no duplicate question text within any section file', function () {
    for (var i = 1; i <= 8; i++) {
      var fileName = FILE_NAMES[i - 1];
      var qs = JSON.parse(fs.readFileSync(path.join(__dirname, '../' + fileName), 'utf-8'));
      var seen = new Set();
      qs.forEach(function (q, idx) {
        var key = q.q.trim().toLowerCase().slice(0, 150);
        expect(seen.has(key), 's' + i + '[' + idx + '] duplicate: "' + q.q.slice(0, 50) + '"').toBe(false);
        seen.add(key);
      });
    }
  });

  test('ans values are valid indices into opts array', function () {
    for (var i = 1; i <= 8; i++) {
      var fileName = FILE_NAMES[i - 1];
      var qs = JSON.parse(fs.readFileSync(path.join(__dirname, '../' + fileName), 'utf-8'));
      qs.forEach(function (q, idx) {
        expect(q.opts[q.ans], 's' + i + '[' + idx + '] opts[ans] exists').toBeDefined();
      });
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 2. HOME SCREEN — real data, verifies actual pool sizes
// ═══════════════════════════════════════════════════════════════════════
test.describe('Home Screen', function () {
  test('shows 8 section cards with correct pool sizes, "Not attempted" state, full-test button', async function ({ page }) {
    await page.addInitScript(function () { localStorage.clear(); });
    await page.goto('/practice-exam.html');
    // Wait for all 8 sections to load real data
    await page.waitForFunction(
      function () {
        return typeof SECTIONS !== 'undefined' &&
        SECTIONS.length === 8 &&
        SECTIONS.every(function (s) { return s.questions.length > 0; });
      },
      { timeout: 10000 }
    );

    var cards = page.locator('.section-card');
    await expect(cards).toHaveCount(8);

    var poolSizes = ['173 Qs', '134 Qs', '172 Qs', '137 Qs', '117 Qs', '105 Qs', '180 Qs', '100 Qs'];
    for (var i = 0; i < 8; i++) {
      await expect(cards.nth(i)).toContainText(poolSizes[i]);
    }

    // All sections show "Not attempted" on fresh state
    for (var j = 0; j < 8; j++) {
      await expect(cards.nth(j)).toContainText('Not attempted');
    }

    // Full test button
    await expect(page.locator('.full-test-btn')).toBeVisible();
    await expect(page.locator('.full-test-btn')).toContainText('50-Question Mock Exam');
  });

  test('section cards show section numbers and weights', async function ({ page }) {
    await page.addInitScript(function () { localStorage.clear(); });
    await page.goto('/practice-exam.html');
    await page.waitForFunction(
      function () { return typeof SECTIONS !== 'undefined' && SECTIONS[0] && SECTIONS[0].questions.length > 0; },
      { timeout: 10000 }
    );

    var weights = ['22%', '25%', '20%', '15%', '18%', '100Q', '180Q', '100Q'];
    var cards = page.locator('.section-card');
    for (var i = 0; i < 8; i++) {
      await expect(cards.nth(i)).toContainText('Section ' + (i + 1));
      await expect(cards.nth(i)).toContainText(weights[i]);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 3. SECTION QUIZ SCORING — mock data for deterministic control
// ═══════════════════════════════════════════════════════════════════════
test.describe('Section Quiz Scoring', function () {
  test.beforeEach(async function ({ page }) {
    await page.addInitScript(function () { localStorage.clear(); });
    await withMock(page);
  });

  test('all 20 correct → correct=20 wrong=0 skipped=0 total=20 pct=100% PASS', async function ({ page }) {
    await loadApp(page);
    await page.locator('.section-card').first().click();
    await waitForQuiz(page);

    var all20 = Array.from({ length: 20 }, function (_, i) { return i; });
    await programmaticAnswers(page, { correctIndices: all20 });
    await viewResults(page);

    await expect(page.locator('#st-correct')).toHaveText('20');
    await expect(page.locator('#st-wrong')).toHaveText('0');
    await expect(page.locator('#st-skipped')).toHaveText('0');
    await expect(page.locator('#st-total')).toHaveText('20');
    await expect(page.locator('#st-pct')).toHaveText('100%');
    await expect(page.locator('#pass-indicator')).toHaveClass(/pass/);
    await expect(page.locator('#results-sub')).toContainText('20 of 20');
  });

  test('all 20 wrong → correct=0 wrong=20 skipped=0 total=20 pct=0% FAIL', async function ({ page }) {
    await loadApp(page);
    await page.locator('.section-card').first().click();
    await waitForQuiz(page);

    var all20 = Array.from({ length: 20 }, function (_, i) { return i; });
    await programmaticAnswers(page, { wrongIndices: all20 });
    await viewResults(page);

    await expect(page.locator('#st-correct')).toHaveText('0');
    await expect(page.locator('#st-wrong')).toHaveText('20');
    await expect(page.locator('#st-skipped')).toHaveText('0');
    await expect(page.locator('#st-total')).toHaveText('20');
    await expect(page.locator('#st-pct')).toHaveText('0%');
    await expect(page.locator('#pass-indicator')).toHaveClass(/fail/);
    await expect(page.locator('#results-sub')).toContainText('0 of 20');
  });

  test('13 correct + 7 wrong → pct=65% FAIL', async function ({ page }) {
    await loadApp(page);
    await page.locator('.section-card').first().click();
    await waitForQuiz(page);

    var correct = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];       // 13
    var wrong = [13, 14, 15, 16, 17, 18, 19];                         // 7
    await programmaticAnswers(page, { correctIndices: correct, wrongIndices: wrong });
    await viewResults(page);

    await expect(page.locator('#st-correct')).toHaveText('13');
    await expect(page.locator('#st-wrong')).toHaveText('7');
    await expect(page.locator('#st-skipped')).toHaveText('0');
    await expect(page.locator('#st-pct')).toHaveText('65%');
    await expect(page.locator('#pass-indicator')).toHaveClass(/fail/);
  });

  test('14 correct + 3 wrong + 3 skipped → pct=70% PASS (boundary)', async function ({ page }) {
    await loadApp(page);
    await page.locator('.section-card').first().click();
    await waitForQuiz(page);

    var correct = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];   // 14
    var wrong = [14, 15, 16];                                          // 3
    // indices 17,18,19 → not submitted → skipped=3
    await programmaticAnswers(page, { correctIndices: correct, wrongIndices: wrong });
    await viewResults(page);

    await expect(page.locator('#st-correct')).toHaveText('14');
    await expect(page.locator('#st-wrong')).toHaveText('3');
    await expect(page.locator('#st-skipped')).toHaveText('3');
    await expect(page.locator('#st-total')).toHaveText('20');
    await expect(page.locator('#st-pct')).toHaveText('70%');
    await expect(page.locator('#pass-indicator')).toHaveClass(/pass/);
  });

  test('10 correct + 5 wrong + 5 skipped → pct=50% FAIL', async function ({ page }) {
    await loadApp(page);
    await page.locator('.section-card').first().click();
    await waitForQuiz(page);

    var correct = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];                   // 10
    var wrong = [10, 11, 12, 13, 14];                                  // 5
    // 15-19 → skipped
    await programmaticAnswers(page, { correctIndices: correct, wrongIndices: wrong });
    await viewResults(page);

    await expect(page.locator('#st-correct')).toHaveText('10');
    await expect(page.locator('#st-wrong')).toHaveText('5');
    await expect(page.locator('#st-skipped')).toHaveText('5');
    await expect(page.locator('#st-pct')).toHaveText('50%');
    await expect(page.locator('#pass-indicator')).toHaveClass(/fail/);
  });

  test('all 20 skipped → correct=0 wrong=0 skipped=20 pct=0% FAIL', async function ({ page }) {
    await loadApp(page);
    await page.locator('.section-card').first().click();
    await waitForQuiz(page);

    // No answers set → all 20 skipped
    await viewResults(page);

    await expect(page.locator('#st-correct')).toHaveText('0');
    await expect(page.locator('#st-wrong')).toHaveText('0');
    await expect(page.locator('#st-skipped')).toHaveText('20');
    await expect(page.locator('#st-pct')).toHaveText('0%');
    await expect(page.locator('#pass-indicator')).toHaveClass(/fail/);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 4. SCORE PERCENTAGE FORMULA
// ═══════════════════════════════════════════════════════════════════════
test.describe('Score Percentage Formula', function () {
  test.beforeEach(async function ({ page }) {
    await page.addInitScript(function () { localStorage.clear(); });
    await withMock(page);
  });

  var scenarios = [
    { correct: 20, wrong: 0, expectedPct: '100%', pass: true },
    { correct: 15, wrong: 5, expectedPct: '75%', pass: true },
    { correct: 14, wrong: 6, expectedPct: '70%', pass: true },   // exact boundary
    { correct: 13, wrong: 7, expectedPct: '65%', pass: false },  // just below
    { correct: 10, wrong: 10, expectedPct: '50%', pass: false },
    { correct: 1, wrong: 19, expectedPct: '5%', pass: false },
    { correct: 0, wrong: 20, expectedPct: '0%', pass: false },
  ];

  scenarios.forEach(function (s) {
    test(s.correct + '/20 = ' + s.expectedPct + ' (' + (s.pass ? 'PASS' : 'FAIL') + ')', async function ({ page }) {
      await loadApp(page);
      await page.locator('.section-card').first().click();
      await waitForQuiz(page);

      var correctIdx = Array.from({ length: s.correct }, function (_, i) { return i; });
      var wrongIdx = Array.from({ length: s.wrong }, function (_, i) { return i + s.correct; });
      await programmaticAnswers(page, { correctIndices: correctIdx, wrongIndices: wrongIdx });
      await viewResults(page);

      await expect(page.locator('#st-pct')).toHaveText(s.expectedPct);
      var cls = await page.locator('#pass-indicator').getAttribute('class');
      expect(cls).toContain(s.pass ? 'pass' : 'fail');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 5. FULL MOCK EXAM (50 questions)
// ═══════════════════════════════════════════════════════════════════════
test.describe('Full Mock Exam', function () {
  test.beforeEach(async function ({ page }) {
    await page.addInitScript(function () { localStorage.clear(); });
    await withMock(page);
  });

  test('draws exactly 50 questions with correct per-section distribution', async function ({ page }) {
    await loadApp(page);
    await page.locator('.full-test-btn').click();
    await waitForQuiz(page);

    var totalQs = await page.evaluate(function () { return state.questions.length; });
    expect(totalQs).toBe(FULL_TOTAL);

    var dist = await page.evaluate(function () {
      var counts = [0, 0, 0, 0, 0, 0, 0, 0];
      state.questions.forEach(function (q) {
        if (q._secIdx !== undefined) counts[q._secIdx]++;
      });
      return counts;
    });
    expect(dist).toEqual(FULL_TEST_DIST);
  });

  test('all 50 correct → correct=50 total=50 pct=100% PASS', async function ({ page }) {
    await loadApp(page);
    await page.locator('.full-test-btn').click();
    await waitForQuiz(page);

    var all50 = Array.from({ length: FULL_TOTAL }, function (_, i) { return i; });
    await programmaticAnswers(page, { correctIndices: all50 });
    await viewResults(page);

    await expect(page.locator('#st-correct')).toHaveText('50');
    await expect(page.locator('#st-wrong')).toHaveText('0');
    await expect(page.locator('#st-skipped')).toHaveText('0');
    await expect(page.locator('#st-total')).toHaveText('50');
    await expect(page.locator('#st-pct')).toHaveText('100%');
    await expect(page.locator('#pass-indicator')).toHaveClass(/pass/);
    await expect(page.locator('#results-sub')).toContainText('50 of 50');
  });

  test('35/50 = 70% PASS (full exam boundary)', async function ({ page }) {
    await loadApp(page);
    await page.locator('.full-test-btn').click();
    await waitForQuiz(page);

    var correct = Array.from({ length: 35 }, function (_, i) { return i; });
    var wrong = Array.from({ length: 15 }, function (_, i) { return i + 35; });
    await programmaticAnswers(page, { correctIndices: correct, wrongIndices: wrong });
    await viewResults(page);

    await expect(page.locator('#st-correct')).toHaveText('35');
    await expect(page.locator('#st-total')).toHaveText('50');
    await expect(page.locator('#st-pct')).toHaveText('70%');
    await expect(page.locator('#pass-indicator')).toHaveClass(/pass/);
  });

  test('34/50 = 68% FAIL (just below boundary)', async function ({ page }) {
    await loadApp(page);
    await page.locator('.full-test-btn').click();
    await waitForQuiz(page);

    var correct = Array.from({ length: 34 }, function (_, i) { return i; });
    var wrong = Array.from({ length: 16 }, function (_, i) { return i + 34; });
    await programmaticAnswers(page, { correctIndices: correct, wrongIndices: wrong });
    await viewResults(page);

    await expect(page.locator('#st-correct')).toHaveText('34');
    await expect(page.locator('#st-total')).toHaveText('50');
    await expect(page.locator('#st-pct')).toHaveText('68%');
    await expect(page.locator('#pass-indicator')).toHaveClass(/fail/);
  });

  test('section-wise breakdown saved to localStorage on full exam', async function ({ page }) {
    await loadApp(page);
    await page.locator('.full-test-btn').click();
    await waitForQuiz(page);

    var all50 = Array.from({ length: FULL_TOTAL }, function (_, i) { return i; });
    await programmaticAnswers(page, { correctIndices: all50 });
    await viewResults(page);

    // Check localStorage has entries for all 8 sections
    var saved = await page.evaluate(function () {
      var store = JSON.parse(localStorage.getItem('gcp_pde_quiz_v1') || '{}');
      return [1, 2, 3, 4, 5, 6, 7, 8].map(function (id) {
        return store.scores && store.scores[id] ? store.scores[id].bestPct : null;
      });
    });
    // All sections should have 100% since all answers were correct
    saved.forEach(function (pct) {
      expect(pct).toBe(100);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 6. RESULTS REVIEW CARDS
// ═══════════════════════════════════════════════════════════════════════
test.describe('Results Review Cards', function () {
  test.beforeEach(async function ({ page }) {
    await page.addInitScript(function () { localStorage.clear(); });
    await withMock(page);
  });

  test('"All Questions" tab shows 20 review cards', async function ({ page }) {
    await loadApp(page);
    await page.locator('.section-card').first().click();
    await waitForQuiz(page);

    var all20 = Array.from({ length: 20 }, function (_, i) { return i; });
    await programmaticAnswers(page, { correctIndices: all20 });
    await viewResults(page);

    await page.locator('#tab-all').click();
    await expect(page.locator('.review-card')).toHaveCount(20);
  });

  test('"Wrong/Skipped" tab filters to only wrong+skipped cards', async function ({ page }) {
    await loadApp(page);
    await page.locator('.section-card').first().click();
    await waitForQuiz(page);

    // 10 correct, 6 wrong, 4 skipped
    var correct = Array.from({ length: 10 }, function (_, i) { return i; });
    var wrong = Array.from({ length: 6 }, function (_, i) { return i + 10; });
    await programmaticAnswers(page, { correctIndices: correct, wrongIndices: wrong });
    await viewResults(page);

    // All tab → 20 cards
    await page.locator('#tab-all').click();
    await expect(page.locator('.review-card')).toHaveCount(20);

    // Wrong/Skipped tab → 6 wrong + 4 skipped = 10 cards
    await page.locator('#tab-wrong').click();
    await expect(page.locator('.review-card')).toHaveCount(10);

    // Badge shows 10
    await expect(page.locator('#wrong-count-badge')).toHaveText('10');
  });

  test('correct cards get ✅ badge, wrong ❌ badge, skipped ⏭ badge', async function ({ page }) {
    await loadApp(page);
    await page.locator('.section-card').first().click();
    await waitForQuiz(page);

    // Q0 correct, Q1 wrong, Q2-Q19 skipped
    await programmaticAnswers(page, { correctIndices: [0], wrongIndices: [1] });
    await viewResults(page);

    var cards = page.locator('.review-card');
    await expect(cards.nth(0).locator('.rc-badge')).toContainText('Correct');
    await expect(cards.nth(1).locator('.rc-badge')).toContainText('Incorrect');
    await expect(cards.nth(2).locator('.rc-badge')).toContainText('Skipped');
  });

  test('correct review card shows "Show explanation" collapsed by default', async function ({ page }) {
    await loadApp(page);
    await page.locator('.section-card').first().click();
    await waitForQuiz(page);

    await programmaticAnswers(page, { correctIndices: [0] });
    await viewResults(page);

    // First card is correct → has <details> for explanation
    var details = page.locator('.review-card').first().locator('details');
    var open = await details.getAttribute('open');
    expect(open).toBeNull(); // collapsed by default
  });

  test('"All Sections" perfect score shows no wrong-answer message', async function ({ page }) {
    await loadApp(page);
    await page.locator('.section-card').first().click();
    await waitForQuiz(page);

    var all20 = Array.from({ length: 20 }, function (_, i) { return i; });
    await programmaticAnswers(page, { correctIndices: all20 });
    await viewResults(page);

    await page.locator('#tab-wrong').click();
    await expect(page.locator('#review-cards')).toContainText('No wrong answers');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 7. QUIZ NAVIGATION (UI clicks)
// ═══════════════════════════════════════════════════════════════════════
test.describe('Quiz Navigation', function () {
  test.beforeEach(async function ({ page }) {
    await page.addInitScript(function () { localStorage.clear(); });
    await withMock(page);
  });

  test('Prev button is disabled on Q1, enabled on Q2+', async function ({ page }) {
    await loadApp(page);
    await page.locator('.section-card').first().click();
    await waitForQuiz(page);

    await expect(page.locator('#btn-prev')).toBeDisabled();

    // Select correct answer and submit → move to Q2
    var ans = await page.evaluate(function () { return state.questions[0].ans; });
    await page.locator('.option').nth(ans).click();
    await page.locator('#btn-next').click();
    await page.waitForFunction(function () { return state.current === 1; });

    await expect(page.locator('#btn-prev')).toBeEnabled();
  });

  test('Prev button navigates to previous question', async function ({ page }) {
    await loadApp(page);
    await page.locator('.section-card').first().click();
    await waitForQuiz(page);

    var ans = await page.evaluate(function () { return state.questions[0].ans; });
    await page.locator('.option').nth(ans).click();
    await page.locator('#btn-next').click();
    await page.waitForFunction(function () { return state.current === 1; });

    await page.locator('#btn-prev').click();
    await page.waitForFunction(function () { return state.current === 0; });

    await expect(page.locator('#q-number-text')).toContainText('Question 1 of 20');
  });

  test('clicking a progress dot jumps to that question', async function ({ page }) {
    await loadApp(page);
    await page.locator('.section-card').first().click();
    await waitForQuiz(page);

    // Click dot at index 4 → Q5
    await page.locator('.q-dot').nth(4).click();
    await page.waitForFunction(function () { return state.current === 4; });

    await expect(page.locator('#q-number-text')).toContainText('Question 5 of 20');
  });

  test('Back (←) button returns to home screen', async function ({ page }) {
    await loadApp(page);
    await page.locator('.section-card').first().click();
    await waitForQuiz(page);

    await page.locator('.back-btn').click();
    await page.waitForSelector('#home.active');
    await expect(page.locator('#home')).toHaveClass(/active/);
  });

  test('progress bar width increases after each submitted answer', async function ({ page }) {
    await loadApp(page);
    await page.locator('.section-card').first().click();
    await waitForQuiz(page);

    var widthBefore = await page.locator('#quiz-progress').evaluate(function (el) {
      return parseFloat(el.style.width);
    });

    var ans = await page.evaluate(function () { return state.questions[0].ans; });
    await page.locator('.option').nth(ans).click();
    await page.locator('#btn-next').click();
    await page.waitForFunction(function () { return state.current === 1; });

    var widthAfter = await page.locator('#quiz-progress').evaluate(function (el) {
      return parseFloat(el.style.width);
    });
    expect(widthAfter).toBeGreaterThan(widthBefore);
  });

  test('q-answered-info counter increments as questions are submitted', async function ({ page }) {
    await loadApp(page);
    await page.locator('.section-card').first().click();
    await waitForQuiz(page);

    await expect(page.locator('#q-answered-info')).toContainText('0/20');

    var ans = await page.evaluate(function () { return state.questions[0].ans; });
    await page.locator('.option').nth(ans).click();
    await page.locator('#btn-next').click();
    await page.waitForFunction(function () { return state.current === 1; });

    await expect(page.locator('#q-answered-info')).toContainText('1/20');
  });

  test('pool smaller than 20 → quiz has fewer questions', async function ({ page }) {
    await page.addInitScript(function () { localStorage.clear(); });
    // Override S1 with only 5 questions
    await page.route('**/questions-s1.json', function (route) {
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(Array.from({ length: 5 }, function (_, i) {
          return { q: 'Tiny pool Q' + i, opts: ['A', 'B', 'C', 'D'], ans: 0, explain: 'x', concept: 'x' };
        }))
      });
    });
    for (var i = 2; i <= 5; i++) {
      await page.route('**/questions-s' + i + '.json', function (route) {
        route.fulfill({ contentType: 'application/json', body: '[]' });
      });
    }
    await page.goto('/practice-exam.html');
    await page.waitForFunction(function () { return typeof SECTIONS !== 'undefined' && SECTIONS[0].questions.length === 5; });

    await page.locator('.section-card').first().click();
    await waitForQuiz(page);

    var total = await page.evaluate(function () { return state.questions.length; });
    expect(total).toBe(5);
    await expect(page.locator('#q-number-text')).toContainText('of 5');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 8. PERSISTENCE (localStorage)
// ═══════════════════════════════════════════════════════════════════════
test.describe('Persistence', function () {
  test.beforeEach(async function ({ page }) {
    await page.addInitScript(function () { localStorage.clear(); });
    await withMock(page);
  });

  test('score saved and shown on home card after completing a section quiz', async function ({ page }) {
    await loadApp(page);
    await page.locator('.section-card').first().click();
    await waitForQuiz(page);

    // 14/20 = 70%
    var correct = Array.from({ length: 14 }, function (_, i) { return i; });
    var wrong = Array.from({ length: 6 }, function (_, i) { return i + 14; });
    await programmaticAnswers(page, { correctIndices: correct, wrongIndices: wrong });
    await viewResults(page);

    await page.locator('button:has-text("All Sections")').first().click();
    await page.waitForSelector('#home.active');

    var card1 = page.locator('.section-card').first();
    await expect(card1).toContainText('Best: 70%');
    await expect(card1).toContainText('14/20');
  });

  test('attempt history count increases on each retake', async function ({ page }) {
    await loadApp(page);

    // First attempt
    await page.locator('.section-card').first().click();
    await waitForQuiz(page);
    var all20 = Array.from({ length: 20 }, function (_, i) { return i; });
    await programmaticAnswers(page, { correctIndices: all20 });
    await viewResults(page);
    await page.locator('button:has-text("All Sections")').first().click();
    await page.waitForSelector('#home.active');
    await expect(page.locator('.section-card').first()).toContainText('1 try');

    // Second attempt
    await page.locator('.section-card').first().click();
    await waitForQuiz(page);
    await programmaticAnswers(page, { correctIndices: all20 });
    await viewResults(page);
    await page.locator('button:has-text("All Sections")').first().click();
    await page.waitForSelector('#home.active');
    await expect(page.locator('.section-card').first()).toContainText('2 tries');
  });

  test('best score is NOT overwritten by a lower score on retake', async function ({ page }) {
    await loadApp(page);

    // Attempt 1: 100%
    await page.locator('.section-card').first().click();
    await waitForQuiz(page);
    var all20 = Array.from({ length: 20 }, function (_, i) { return i; });
    await programmaticAnswers(page, { correctIndices: all20 });
    await viewResults(page);
    await page.locator('button:has-text("All Sections")').first().click();
    await page.waitForSelector('#home.active');

    // Attempt 2: 50%
    await page.locator('.section-card').first().click();
    await waitForQuiz(page);
    var half = Array.from({ length: 10 }, function (_, i) { return i; });
    var halfWrong = Array.from({ length: 10 }, function (_, i) { return i + 10; });
    await programmaticAnswers(page, { correctIndices: half, wrongIndices: halfWrong });
    await viewResults(page);
    await page.locator('button:has-text("All Sections")').first().click();
    await page.waitForSelector('#home.active');

    // Best should still be 100%
    await expect(page.locator('.section-card').first()).toContainText('Best: 100%');
  });

  test('lower score IS saved as best when it actually is the best', async function ({ page }) {
    await loadApp(page);

    // Single attempt: 60%
    await page.locator('.section-card').first().click();
    await waitForQuiz(page);
    var correct = Array.from({ length: 12 }, function (_, i) { return i; });
    var wrong = Array.from({ length: 8 }, function (_, i) { return i + 12; });
    await programmaticAnswers(page, { correctIndices: correct, wrongIndices: wrong });
    await viewResults(page);
    await page.locator('button:has-text("All Sections")').first().click();
    await page.waitForSelector('#home.active');

    await expect(page.locator('.section-card').first()).toContainText('Best: 60%');
  });

  test('clearSectionHistory removes score and shows "Not attempted"', async function ({ page }) {
    await loadApp(page);

    // Complete a quiz
    await page.locator('.section-card').first().click();
    await waitForQuiz(page);
    var all20 = Array.from({ length: 20 }, function (_, i) { return i; });
    await programmaticAnswers(page, { correctIndices: all20 });
    await viewResults(page);
    await page.locator('button:has-text("All Sections")').first().click();
    await page.waitForSelector('#home.active');

    // Confirm score shown
    await expect(page.locator('.section-card').first()).toContainText('Best: 100%');

    // Clear section 1 history programmatically
    await page.evaluate(function () { clearSectionHistory(1); });
    await page.waitForFunction(function () { return document.querySelector('.section-card .sec-score-label'); });

    // Should now show "Not attempted"
    await expect(page.locator('.section-card').first()).toContainText('Not attempted');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 9. RETAKE & GO HOME
// ═══════════════════════════════════════════════════════════════════════
test.describe('Retake and Go Home', function () {
  test.beforeEach(async function ({ page }) {
    await page.addInitScript(function () { localStorage.clear(); });
    await withMock(page);
  });

  test('"Retake" starts a fresh quiz (state reset)', async function ({ page }) {
    await loadApp(page);
    await page.locator('.section-card').first().click();
    await waitForQuiz(page);

    var all20 = Array.from({ length: 20 }, function (_, i) { return i; });
    await programmaticAnswers(page, { correctIndices: all20 });
    await viewResults(page);

    await page.locator('button:has-text("Retake")').first().click();
    await waitForQuiz(page);

    var cur = await page.evaluate(function () { return state.current; });
    var answersLen = await page.evaluate(function () { return Object.keys(state.answers).length; });
    var submittedLen = await page.evaluate(function () { return Object.keys(state.submitted).length; });
    expect(cur).toBe(0);
    expect(answersLen).toBe(0);
    expect(submittedLen).toBe(0);
    await expect(page.locator('#q-number-text')).toContainText('Question 1 of 20');
  });

  test('"All Sections" button from results returns to home', async function ({ page }) {
    await loadApp(page);
    await page.locator('.section-card').first().click();
    await waitForQuiz(page);

    var all20 = Array.from({ length: 20 }, function (_, i) { return i; });
    await programmaticAnswers(page, { correctIndices: all20 });
    await viewResults(page);

    await page.locator('button:has-text("All Sections")').first().click();
    await page.waitForSelector('#home.active');
    await expect(page.locator('#home')).toHaveClass(/active/);
  });

  test('retake after a section quiz starts the same section', async function ({ page }) {
    await loadApp(page);
    // Start section 3
    await page.locator('.section-card').nth(2).click();
    await waitForQuiz(page);

    var title = await page.locator('#quiz-title').textContent();
    expect(title).toContain('Sec 3');

    var all20 = Array.from({ length: 20 }, function (_, i) { return i; });
    await programmaticAnswers(page, { correctIndices: all20 });
    await viewResults(page);
    await page.locator('button:has-text("Retake")').first().click();
    await waitForQuiz(page);

    var titleAfter = await page.locator('#quiz-title').textContent();
    expect(titleAfter).toContain('Sec 3');
  });
});
