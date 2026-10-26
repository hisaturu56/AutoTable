// パネルの match.js・notion.js のテスト（node tests/notion_test.js）
const assert = require("assert");
const M = require("../panel/match.js");
const N = require("../panel/notion.js");

let ok = 0;
function test(name, fn) {
  return Promise.resolve().then(fn).then(() => { ok++; console.log("ok  " + name); },
    (e) => { console.log("NG  " + name + "\n    " + e.message); process.exitCode = 1; });
}

const today = "2026-10-26";
const scripts = [
  { id: "a", title: "(テスト)表作成テスト用台本", date: null },
  { id: "b", title: "タフィー解説", date: "2026-10-20" },
  { id: "c", title: "タフィー解説", date: "2026-11-01" },
  { id: "d", title: "インタビュー&記事内容情報まとめ", date: "2026-09-01" },
];

const rowsOf = (name, order, image, ...cells) => ({
  properties: {
    "表": { type: "title", title: [{ plain_text: name }] },
    "行": { type: "number", number: order },
    "画像": { type: "rich_text", rich_text: image ? [{ plain_text: image }] : [] },
    ...Object.fromEntries(cells.map((c, i) => ["列" + (i + 1), { type: "rich_text", rich_text: c ? [{ plain_text: c }] : [] }])),
  },
});

(async () => {
  await test("文字を整える（全角半角・記号）", () => {
    assert.strictEqual(M.normalize("（テスト）表作成 テスト用台本.ai"), "テスト表作成テスト用台本");
    assert.strictEqual(M.normalize("ＡＢＣ_ー"), "abcー");
  });
  await test("ドキュメント名で当たる", () => {
    const r = M.pick([{ name: "(テスト)表作成テスト用台本.ai", kind: "ドキュメント" }], scripts, today);
    assert.strictEqual(r.script.id, "a");
  });
  await test("配置した画像のファイル名で当たる（ドキュメント名は「本編」）", () => {
    const r = M.pick([{ name: "本編.ai", kind: "ドキュメント" }, { name: "インタビュー&記事内容情報まとめ_サムネ.png", kind: "ファイル" }], scripts, today);
    assert.strictEqual(r.script.id, "d");
    assert.strictEqual(r.by.kind, "ファイル");
  });
  await test("「本編」「BGM01」だけなら選ばない", () => {
    const r = M.pick([{ name: "本編" }, { name: "BGM01.wav" }], scripts, today);
    assert.strictEqual(r.script, null);
  });
  await test("同じくらい近いときは公開日が今日に近い方", () => {
    const r = M.pick([{ name: "タフィー解説" }], scripts, "2026-10-22");
    assert.strictEqual(r.script.id, "b");
    const r2 = M.pick([{ name: "タフィー解説" }], scripts, "2026-10-30");
    assert.strictEqual(r2.script.id, "c");
  });
  await test("プルダウンは公開日が今日に近い順（公開日なしは最後）", () => {
    assert.deepStrictEqual(M.sortByDate(scripts, today).map((s) => s.id), ["b", "c", "d", "a"]);
  });

  await test("テーブルリストを表ごとにまとめる（行の番号順・使っている列まで・画像の列）", () => {
    const t = N.groupTables([
      rowsOf("1_基礎ステータス比較", 2, "タフィー.png", "タフィー", "15552"),
      rowsOf("1_基礎ステータス比較", 1, "無限大ロゴ.png", "キャラクター", "HP"),
      rowsOf("3_ハンマー", 1, "", "武器名", "攻撃力", "サブ"),
      rowsOf("3_ハンマー", 2, "", "トイハンマー", "420", ""),
    ]);
    assert.strictEqual(t.length, 2);
    assert.strictEqual(t[0].name, "1_基礎ステータス比較");
    assert.strictEqual(t[0].hasImages, true);
    assert.deepStrictEqual(t[0].rows, [["無限大ロゴ.png", "キャラクター", "HP"], ["タフィー.png", "タフィー", "15552"]]);
    assert.strictEqual(t[1].hasImages, false);
    assert.deepStrictEqual(t[1].rows, [["武器名", "攻撃力", "サブ"], ["トイハンマー", "420", ""]]);
  });

  // Notion のダミー
  const page = "page1", db = "db1";
  function fake(map) {
    return (method, path) => Promise.resolve(map(method, path));
  }
  await test("台本の一覧（ページをまたいで全部）", async () => {
    let n = 0;
    N.setTransport(fake((m, p) => {
      assert.ok(p.indexOf("/v1/databases/" + N.SCRIPT_DB + "/query") === 0);
      n++;
      return n === 1
        ? { status: 200, json: { results: [{ id: "x", properties: { "タイトル": { type: "title", title: [{ plain_text: "台本A" }] }, "公開日": { type: "date", date: { start: "2026-10-01" } } } }], has_more: true, next_cursor: "c2" } }
        : { status: 200, json: { results: [{ id: "y", properties: { "タイトル": { type: "title", title: [{ plain_text: "台本B" }] }, "公開日": { type: "date", date: null } } }], has_more: false } };
    }));
    const list = await N.listScripts("tok");
    assert.deepStrictEqual(list, [{ id: "x", title: "台本A", date: "2026-10-01" }, { id: "y", title: "台本B", date: null }]);
  });
  await test("台本ページの中（トグルの中）のテーブルリストを読む", async () => {
    N.setTransport(fake((m, p) => {
      if (p.indexOf("/v1/blocks/" + page + "/children") === 0) return { status: 200, json: { results: [
        { id: "t1", type: "paragraph", has_children: false },
        { id: "tg", type: "toggle", has_children: true },
        { id: "other", type: "child_database", child_database: { title: "テロップリスト" } }], has_more: false } };
      if (p.indexOf("/v1/blocks/tg/children") === 0) return { status: 200, json: { results: [
        { id: db, type: "child_database", child_database: { title: "テーブルリスト" } }], has_more: false } };
      if (p.indexOf("/v1/databases/" + db + "/query") === 0) return { status: 200, json: { results: [rowsOf("1_表", 1, "", "a", "b")], has_more: false } };
      throw new Error("想定外：" + p);
    }));
    const r = await N.readTables(page, "tok");
    assert.strictEqual(r.db.name, "テーブルリスト");
    assert.deepStrictEqual(r.tables[0].rows, [["a", "b"]]);
  });
  await test("テーブルリストがない台本", async () => {
    N.setTransport(fake(() => ({ status: 200, json: { results: [{ id: "p", type: "paragraph", has_children: false }], has_more: false } })));
    const r = await N.readTables(page, "tok");
    assert.strictEqual(r.db, null);
  });
  for (const [status, word] of [[401, "トークンが違います"], [403, "コネクト"], [404, "見つかりません"], [429, "混み合って"], [502, "調子が悪い"]]) {
    await test("エラー " + status + " を日本語で", async () => {
      N.setTransport(fake(() => ({ status, json: { message: "x" } })));
      await assert.rejects(N.listScripts("tok"), (e) => e.message.indexOf(word) >= 0);
    });
  }
  await test("トークンがないとき", async () => {
    await assert.rejects(N.listScripts(""), (e) => e.message.indexOf("登録されていません") >= 0);
  });
  console.log("\n" + ok + " 件 成功");
})();
