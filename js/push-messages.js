/* 알림 문구 생성기
   - 서비스 워커(매일 저녁 8시 푸시)와 앱(8시 이후 운동을 마쳤을 때)이 함께 쓰는 일반 스크립트다. 전역 buildPushMessage를 만든다.
   - 오늘 운동을 안 했으면: 그날 가장 강한 동기(연속 기록 위기, 복귀 보너스, 다음 배지, 교환 가능한 보상, 주간 미션)를 골라 운동을 권한다.
   - 이미 했으면: 오늘 한 것과 누적 성과, 챌린지 진행률을 정리해 보람을 느끼게 한다.
   - 같은 상황이라도 날짜마다 문장이 바뀌도록 날짜를 씨앗으로 고른다. */
(function (g) {
  var NAMES = {
    squat: '스쿼트', lunge: '런지', pushup: '푸시업', kneePushup: '무릎 푸시업', plank: '플랭크', jumpingJack: '점핑잭',
    highKnees: '하이니', mountainClimber: '마운틴 클라이머', gluteBridge: '글루트 브릿지', crunch: '크런치', legRaise: '레그 레이즈', burpee: '버피',
  };
  var HOLD = { plank: true };
  var PLAN = { A: '하체 집중', B: '상체·코어', C: '전신 유산소', R: '가벼운 회복' };
  var CYCLE = 'ABCABCR';
  var MILESTONES = [3, 7, 14, 21, 30, 50, 100];
  // [음식, kcal, 단위]: 오늘 태운 칼로리를 1~3단위로 말할 수 있는 음식을 고른다
  var FOODS = [['밥', 300, '공기'], ['라떼', 180, '잔'], ['바나나', 90, '개'], ['사과', 95, '개'], ['초코파이', 170, '개'], ['방울토마토', 3, '개'], ['아몬드', 7, '알']];

  function pad(n) { return String(n).padStart(2, '0'); }
  function fmt(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parse(s) { var p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  function add(s, n) { var d = parse(s); d.setDate(d.getDate() + n); return fmt(d); }
  function diff(a, b) { return Math.round((parse(b) - parse(a)) / 86400000); }
  function seedOf(s) { var h = 7; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
  function pick(list, seed) { return list[seed % list.length]; }
  function fill(t, v) { return t.replace(/\{(\w+)\}/g, function (_, k) { return v[k] == null ? '' : v[k]; }); }
  function weekStart(date) { var d = parse(date); return add(date, -((d.getDay() + 6) % 7)); }

  function context(data, date) {
    var logs = data.logs || {}, r = data.rewards || {}, sd = r.shieldDays || {}, c = data.challenge;
    var kept = function (d) { return !!((logs[d] && logs[d].done) || sd[d]); };
    var d = kept(date) ? date : add(date, -1), streak = 0;
    while (kept(d)) { streak++; d = add(d, -1); }
    var idx = diff(c.start, date);
    var doneDays = Object.keys(logs).filter(function (k) { var i = diff(c.start, k); return logs[k].done && i >= 0 && i < c.days; }).length;
    var ws = weekStart(date), weekDone = 0;
    for (var i = 0; i < 7; i++) { var l = logs[add(ws, i)]; if (l && l.done) weekDone++; }
    var miniUsed = Object.keys(r.miniDays || {}).some(function (k) { return weekStart(k) === ws; });
    return {
      logs: logs, r: r, c: c, idx: idx, day: idx + 1, inChallenge: idx >= 0 && idx < c.days, streak: streak,
      yKept: kept(add(date, -1)), anyBefore: Object.keys(logs).some(function (k) { return logs[k].done && k < date; }),
      doneDays: doneDays, weekDone: weekDone, miniUsed: miniUsed, coins: r.coins || 0, shields: r.shields || 0,
      plan: PLAN[CYCLE[((idx % 7) + 7) % 7]],
    };
  }

  // ---------- 운동 전: 오늘 하게 만드는 문구 ----------
  function nudge(x, date, log) {
    var seed = seedOf(date);
    if (x.idx < 0) return { title: '챌린지 D-' + (-x.idx), body: '곧 Day 1이 시작돼요. 오늘은 동작 미리보기로 몸을 풀어 두세요.' };
    if (!x.inChallenge) return { title: x.c.days + '일 챌린지를 마쳤어요', body: '여기서 멈추기엔 아까워요. 새 챌린지를 시작하면 레벨과 코인은 그대로 이어져요.' };

    var comeback = !x.yKept && x.anyBefore;
    var next = x.streak + 1;
    var bonus = 100 * (comeback ? 2 : 1) + 50 + (next >= 2 ? Math.min(next * 10, 100) : 0);
    var v = { day: x.day, plan: x.plan, st: x.streak, next: next, bonus: bonus, shields: x.shields, coins: x.coins, left: x.c.days - x.idx };
    var line = fill(pick([
      'Day {day} {plan} · 끝까지 하면 +{bonus} 코인.',
      '오늘은 {plan}. 끝까지 하면 코인 +{bonus}.',
      'Day {day} · {plan} · 완주 보상 +{bonus} 코인.',
    ], seed), v);
    var tip = !x.miniUsed ? ' 시간이 없다면 7분 미니 운동도 연속 기록에 들어가요.' : '';
    var cheer = ' ' + pick(['시작만 하면 몸이 기억해요.', '하기 싫은 날 한 운동이 제일 커요.', '오늘 한 만큼 내일이 가벼워져요.', '어제의 나에게 지지 마세요.', '10분이면 오늘 몫은 끝나요.', '딱 첫 세트만 시작해 봐요.'], seed >>> 3);

    if (log && log.partial) {
      return { title: fill(pick(['아까 하던 운동, 마저 끝내요', '절반은 이미 해냈어요', '남은 세트만 하면 완주예요'], seed), v),
        body: '이어서 끝까지 하면 완주 보너스 +50과 연속 기록 보너스를 받아요. ' + line };
    }
    var milestone = MILESTONES.indexOf(next) >= 0;
    if (x.streak >= 2) {
      var t = milestone
        ? fill(pick(['오늘 하면 {next}일 연속 달성', '{next}일 연속까지 딱 하루', '오늘이 {next}일째 되는 날'], seed), v)
        : fill(pick(['{st}일 연속 기록, 오늘 지켜요', '{st}일 쌓은 기록이 기다려요', '연속 {st}일, 여기서 끊기면 아까워요'], seed), v);
      var extra = next % 7 === 0 ? ' 7일마다 받는 스트릭 방어권도 생겨요.' : x.shields ? ' 방어권 ' + x.shields + '개는 정말 힘든 날을 위해 아껴 두세요.' : ' 방어권이 없어서 오늘 쉬면 기록이 끊겨요.';
      return { title: t, body: line + extra + cheer };
    }
    if (comeback) {
      return { title: fill(pick(['다시 시작하기 딱 좋은 날', '어제는 쉬었으니 오늘은 2배', '돌아오면 코인이 2배예요'], seed), v),
        body: '쉬었다 돌아온 날은 기본 코인이 2배예요. ' + line + cheer + tip };
    }
    var coupon = (x.r.coupons || []).filter(function (cp) { return cp.cost > x.coins && cp.cost <= x.coins + bonus; })[0];
    if (coupon) {
      return { title: '오늘 끝내면 "' + coupon.name + '" 교환 가능', body: '지금 ' + x.coins + ' 코인, 오늘 완주하면 ' + coupon.cost + ' 코인을 넘어요. ' + line };
    }
    if (x.weekDone === 4) return { title: '오늘 하면 주간 미션 달성', body: '이번 주 4일 했어요. 오늘 하면 "5일 운동" 미션을 채워요. ' + line };
    if (!x.anyBefore) return { title: '첫 운동, 오늘 시작해요', body: '처음이 제일 어려워요. 영상 속 코치를 따라 천천히 해도 충분해요. ' + line };
    if (milestone) return { title: fill('오늘 하면 {next}일 연속 배지', v), body: line };
    return {
      title: fill(pick(['오늘의 홈트 시간이에요', 'Day {day}, 준비됐나요?', '{left}일 남은 챌린지, 오늘도 한 칸', '오늘 몫을 채울 시간이에요'], seed), v),
      body: line + cheer + tip,
    };
  }

  // ---------- 운동 후: 오늘의 성과 정리 ----------
  function recap(x, date, log, data) {
    var seed = seedOf(date + 'r');
    var reps = log.reps || {};
    var total = 0, top = null;
    Object.keys(reps).forEach(function (k) {
      if (!HOLD[k]) { total += reps[k]; if (!top || reps[k] > reps[top]) top = k; }
    });
    var cum = 0;
    if (top) Object.keys(x.logs).forEach(function (d) { cum += (x.logs[d].reps && x.logs[d].reps[top]) || 0; });
    var kcal = log.kcal || 0;
    var fits = FOODS.filter(function (f) { var n = kcal / f[1]; return n >= 1 && n <= (f[1] < 10 ? 40 : 3.5); });
    var food = fits.length ? fits[seed % fits.length] : null;
    var foodText = food && kcal >= 15 ? food[0] + ' ' + (Math.round(kcal / food[1] * 2) / 2) + food[2] : '';
    var earned = (x.r.ledger || []).filter(function (l) { return l.date === date && l.coins > 0; }).reduce(function (a, l) { return a + l.coins; }, 0);
    var pct = Math.round((x.doneDays / x.c.days) * 100);
    var mins = Math.max(1, Math.round((log.sec || 0) / 60));
    var nextMs = MILESTONES.filter(function (m) { return m > x.streak; })[0];
    var tomorrow = x.idx + 1 < x.c.days ? PLAN[CYCLE[(x.idx + 1) % 7]] : null;
    var ws = Object.keys(data.weights || {}).sort();
    var dw = ws.length > 1 ? data.weights[ws[ws.length - 1]] - data.weights[ws[0]] : null;

    var v = { day: x.day, st: x.streak, mins: mins, total: total, kcal: kcal, coins: earned, done: x.doneDays, days: x.c.days, pct: pct };
    var title = fill(pick([
      'Day {day} 완료 · {st}일 연속',
      '오늘도 해냈어요 · {st}일 연속',
      '{st}일째 나와의 약속을 지켰어요',
      'Day {day}, 오늘 몫은 끝',
    ], seed), v);

    var facts = [];
    facts.push(fill('오늘 {mins}분, ' + (total ? '{total}회 움직이고 ' : '') + '{kcal}kcal를 태웠어요' + (foodText ? ' (' + foodText + ' 만큼)' : '') + '.', v));
    if (top && cum > reps[top]) facts.push('지금까지 ' + NAMES[top] + ' 누적 ' + cum.toLocaleString() + '회.');
    if (earned) facts.push('코인 +' + earned + ' 적립.');
    if (dw != null && dw < 0) facts.push('시작보다 ' + Math.abs(dw).toFixed(1) + 'kg 가벼워졌어요.');
    facts.push(fill('챌린지 {done}/{days}일, {pct}% 왔어요.', v));
    if (nextMs && nextMs - x.streak === 1) facts.push('내일 하면 ' + nextMs + '일 연속 배지예요.');
    else if (nextMs && nextMs - x.streak <= 3) facts.push((nextMs - x.streak) + '일만 더 하면 ' + nextMs + '일 연속 배지예요.');
    else if (tomorrow) facts.push('내일은 ' + tomorrow + '.');
    return { title: title, body: facts.join(' ') };
  }

  g.buildPushMessage = function (data, now) {
    now = now || new Date();
    var date = fmt(now);
    if (!data || !data.challenge) return { title: '오늘홈트', body: '오늘 몸을 움직일 시간이에요. 앱을 열어 챌린지를 시작해 보세요.', kind: 'nudge' };
    var x = context(data, date);
    var log = x.logs[date];
    if (log && log.done && x.inChallenge) { var m = recap(x, date, log, data); m.kind = 'recap'; return m; }
    var n = nudge(x, date, log); n.kind = 'nudge'; return n;
  };
})(self);
