/*
 * match.js（パネル用）
 * 開いているドキュメントの名前・配置した画像のファイル名から、いちばん近い台本を選ぶ
 * （Premiere の「テロップ自動作成」の台本の自動選びと同じ決まり）
 *
 * - 名前と台本のタイトルを整えて（全角半角・大文字小文字・記号と空白）、2 文字ずつの似ている度合いでくらべる
 * - 台本ごとに、いちばん近い名前の値を使う。0.5 以上のうちで最も近い台本を選ぶ
 * - 近さがほぼ同じ（差が 0.05 以内）の台本がいくつかあれば、公開日が今日にいちばん近いものを選ぶ
 */
(function (root) {
  var THRESHOLD = 0.5;  // これより似ていなければ選ばない
  var TIE = 0.05;       // この差までは「ほぼ同じ近さ」として公開日で決める

  // 文字を整える：全角半角をそろえ、小文字にし、拡張子・空白・記号を取る
  function normalize(s) {
    s = String(s || "");
    if (s.normalize) s = s.normalize("NFKC");
    s = s.replace(/\.[a-z0-9]{1,5}$/i, "").toLowerCase();
    return s.replace(/[\s_\-‐－―ー・･,，.。、()（）\[\]［］【】「」『』〈〉《》<>"'`~!?！？:：;；\/\\|+＋=＝*＊&＆#＃%％@＠^]/g, function (c) {
      return c === "ー" ? c : "";  // 長音（ー）は言葉の一部なので残す
    });
  }

  function bigrams(s) {
    var list = [];
    if (s.length === 1) return [s];
    for (var i = 0; i < s.length - 1; i++) list.push(s.substr(i, 2));
    return list;
  }

  // 2 文字ずつの似ている度合い（0〜1）。タイトルがまるごと名前の中にあれば 1
  function similarity(name, title) {
    var a = normalize(name), b = normalize(title);
    if (!a || !b) return 0;
    if (a === b) return 1;
    if (b.length >= 4 && a.indexOf(b) >= 0) return 1;
    var x = bigrams(a), y = bigrams(b);
    var counts = {};
    x.forEach(function (g) { counts[g] = (counts[g] || 0) + 1; });
    var hit = 0;
    y.forEach(function (g) { if (counts[g] > 0) { counts[g]--; hit++; } });
    return (2 * hit) / (x.length + y.length);
  }

  // 公開日と今日の差（日数）。公開日がなければ とても大きい数
  function daysFromToday(date, today) {
    if (!date) return Infinity;
    var d = new Date(String(date).slice(0, 10) + "T00:00:00");
    if (isNaN(d.getTime())) return Infinity;
    var t = new Date(today || new Date());
    t.setHours(0, 0, 0, 0);
    return Math.abs(d.getTime() - t.getTime()) / 86400000;
  }

  // 公開日が今日に近い順に並べる（プルダウン用）
  function sortByDate(scripts, today) {
    return scripts.slice().sort(function (p, q) {
      var d = daysFromToday(p.date, today) - daysFromToday(q.date, today);
      return isNaN(d) ? 0 : d;  // どちらも公開日がないときは並びを変えない
    });
  }

  /*
   * 台本を選ぶ
   *   names   ：[{ name: "名前", kind: "ドキュメント" | "ファイル" }]
   *   scripts ：[{ id, title, date }]
   * 戻り値：{ script, score, by }（選べなければ script は null。score はいちばん近い値）
   */
  function pick(names, scripts, today) {
    var scored = scripts.map(function (s) {
      var best = { score: 0, by: null };
      names.forEach(function (n) {
        var v = similarity(n.name, s.title);
        if (v > best.score) best = { score: v, by: n };
      });
      return { script: s, score: best.score, by: best.by };
    });
    var top = 0;
    scored.forEach(function (r) { if (r.score > top) top = r.score; });
    if (top < THRESHOLD) return { script: null, score: top, by: null };
    var close = scored.filter(function (r) { return r.score >= THRESHOLD && r.score >= top - TIE; });
    close.sort(function (p, q) {
      var d = daysFromToday(p.script.date, today) - daysFromToday(q.script.date, today);
      return d !== 0 && !isNaN(d) ? d : q.score - p.score;
    });
    return close[0];
  }

  var api = { normalize: normalize, similarity: similarity, sortByDate: sortByDate, pick: pick,
              daysFromToday: daysFromToday, THRESHOLD: THRESHOLD, TIE: TIE };
  root.PTMatch = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : this);
