/*
 * notion.js（パネル用）
 * Notion の API で、台本DB の台本の一覧と、台本ページの中の「ポロライドテーブル_表リスト」を読む
 *
 * - 通信は Node の https で行う（パネルの画面からの通信は Notion に断られるため。manifest で Node を使えるようにしてある）
 * - Notion のエラーは、わかりやすい日本語にして返す
 *
 * 表リストの形（Claude が台本から作って置く）
 *   表：タイトル（表の名前。同じ名前の行が 1 つの表）／行：数値（並び順。1 ＝ 項目名の行）
 *   画像：テキスト（キャラ欄の画像のファイル名）／列1〜列8：テキスト（マスの文字）
 */
(function (root) {
  var SCRIPT_DB = "22c89356515d8067a5eccc96060268da";  // 台本DB
  var TABLE_DB_NAME = "表リスト";                       // 台本ページの中の、名前にこれを含むデータベースを読む
  var NOTION_VERSION = "2022-06-28";
  var MAX_COLUMNS = 8;
  var CONNECTION = "レターボックス_自動テロップ";        // 台本DB につないであるコネクションの名前（案内用）

  // 通信のしかた（テストではダミーに差し替える）
  var transport = nodeTransport;

  function nodeRequire(name) {
    var req = (typeof window !== "undefined" && (window.require || (window.cep_node && window.cep_node.require))) ||
              (typeof require === "function" ? require : null);
    if (!req) throw notionError(0, "Node が使えません（パネルの設定）。パネルを入れ直してください。");
    return req(name);
  }

  function nodeTransport(method, path, body, token) {
    return new Promise(function (resolve, reject) {
      var https = nodeRequire("https");
      var data = body ? JSON.stringify(body) : null;
      var req = https.request({
        hostname: "api.notion.com", path: path, method: method,
        headers: {
          "Authorization": "Bearer " + token,
          "Notion-Version": NOTION_VERSION,
          "Content-Type": "application/json"
        }
      }, function (res) {
        var chunks = [];
        res.on("data", function (c) { chunks.push(c); });
        res.on("end", function () {
          var text = Buffer.concat(chunks).toString("utf8");
          var json = null;
          try { json = JSON.parse(text); } catch (e) {}
          resolve({ status: res.statusCode, json: json });
        });
      });
      req.on("error", function (e) { reject(notionError(0, null, e)); });
      req.setTimeout(30000, function () { req.destroy(new Error("timeout")); });
      if (data) req.write(data);
      req.end();
    });
  }

  // ---- エラーを日本語に ----

  function notionError(status, message, cause) {
    var e = new Error(message || japanese(status, cause));
    e.status = status;
    return e;
  }

  function japanese(status, cause) {
    if (status === 401) return "Notion のトークンが違います。「Notion の設定」でトークンを登録し直してください。";
    if (status === 403) return "この台本（台本DB）に、Notion のコネクション「" + CONNECTION + "」がつながっていません。"
                             + "Notion で台本DB の右上の「…」→「コネクト」から「" + CONNECTION + "」を選んでください。";
    if (status === 404) return "Notion で見つかりません。消されたか、コネクション「" + CONNECTION + "」がつながっていないページです。";
    if (status === 429) return "Notion が混み合っています。少し待ってから「読み直す」を押してください。";
    if (status >= 500) return "Notion の調子が悪いようです（" + status + "）。少し待ってからもう一度試してください。";
    if (status === 0) return "Notion につながりません。インターネットの接続を確かめてください。" + (cause && cause.message ? "（" + cause.message + "）" : "");
    return "Notion でエラーが出ました（" + status + "）。";
  }

  function call(method, path, body, token) {
    if (!token) return Promise.reject(notionError(-1, "Notion のトークンが登録されていません。「Notion の設定」で登録してください。"));
    return transport(method, path, body, token).then(function (res) {
      if (res.status >= 200 && res.status < 300) return res.json;
      throw notionError(res.status);
    });
  }

  // 100 件ずつ全部読む（データベースの行・ページの中のブロック）
  function queryAll(dbId, body, token) {
    var all = [];
    function next(cursor) {
      var b = {};
      for (var k in body) b[k] = body[k];
      b.page_size = 100;
      if (cursor) b.start_cursor = cursor;
      return call("POST", "/v1/databases/" + dbId + "/query", b, token).then(function (r) {
        all = all.concat(r.results || []);
        return r.has_more ? next(r.next_cursor) : all;
      });
    }
    return next(null);
  }

  function childrenAll(blockId, token) {
    var all = [];
    function next(cursor) {
      var q = "/v1/blocks/" + blockId + "/children?page_size=100" + (cursor ? "&start_cursor=" + cursor : "");
      return call("GET", q, null, token).then(function (r) {
        all = all.concat(r.results || []);
        return r.has_more ? next(r.next_cursor) : all;
      });
    }
    return next(null);
  }

  // ---- 値を文字にする ----

  function plain(list) {
    return (list || []).map(function (t) { return t.plain_text || ""; }).join("");
  }

  function propText(p) {
    if (!p) return "";
    switch (p.type) {
      case "title": return plain(p.title);
      case "rich_text": return plain(p.rich_text);
      case "number": return p.number === null || p.number === undefined ? "" : String(p.number);
      case "select": return p.select ? p.select.name : "";
      case "multi_select": return (p.multi_select || []).map(function (o) { return o.name; }).join("・");
      case "formula": return p.formula ? String(p.formula[p.formula.type] === null ? "" : p.formula[p.formula.type]) : "";
      case "url": return p.url || "";
      case "date": return p.date ? p.date.start : "";
      default: return "";
    }
  }

  function titleOf(props) {
    for (var k in props) if (props[k] && props[k].type === "title") return plain(props[k].title);
    return "";
  }

  // ---- 2. 台本の一覧 ----

  function listScripts(token) {
    return queryAll(SCRIPT_DB, {}, token).then(function (pages) {
      return pages.map(function (p) {
        var d = p.properties && p.properties["公開日"];
        return { id: p.id, title: titleOf(p.properties || {}), date: d && d.date ? d.date.start : null };
      }).filter(function (s) { return s.title; });
    });
  }

  // ---- 7. 台本ページの中の表リストを読む ----

  var NESTED = { toggle: 1, heading_1: 1, heading_2: 1, heading_3: 1, column_list: 1, column: 1, callout: 1, quote: 1 };

  // 名前に「表リスト」を含むデータベースを探す（トグルや段組みの中も 2 段まで）
  function findTableDb(pageId, token) {
    var calls = 0;
    function search(blockId, depth) {
      return childrenAll(blockId, token).then(function (blocks) {
        for (var i = 0; i < blocks.length; i++) {
          var b = blocks[i];
          if (b.type === "child_database" && b.child_database && b.child_database.title.indexOf(TABLE_DB_NAME) >= 0) {
            return { id: b.id, name: b.child_database.title };
          }
        }
        if (depth >= 2) return null;
        var inner = blocks.filter(function (b) { return b.has_children && NESTED[b.type]; });
        return (function each(i) {
          if (i >= inner.length || calls >= 30) return null;
          calls++;
          return search(inner[i].id, depth + 1).then(function (found) { return found || each(i + 1); });
        })(0);
      });
    }
    return search(pageId, 0);
  }

  // 表リストの行を、表ごとにまとめる
  //   戻り値：[{ name, hasImages, rows: [[画像?, 列1, 列2, …]] }]（表は最初に出てきた順、行は「行」の番号順）
  function groupTables(pages) {
    var tables = [], byName = {};
    pages.forEach(function (p, i) {
      var props = p.properties || {};
      var name = titleOf(props).replace(/^\s+|\s+$/g, "");
      if (!name) return;
      var order = parseFloat(propText(props["行"]));
      var cells = [];
      for (var c = 1; c <= MAX_COLUMNS; c++) cells.push(propText(props["列" + c]).replace(/^\s+|\s+$/g, ""));
      var row = { order: isNaN(order) ? 1e9 + i : order, index: i, image: propText(props["画像"]).replace(/^\s+|\s+$/g, ""), cells: cells };
      if (!byName[name]) {
        byName[name] = { name: name, items: [] };
        tables.push(byName[name]);
      }
      byName[name].items.push(row);
    });
    return tables.map(function (t) {
      t.items.sort(function (a, b) { return a.order - b.order || a.index - b.index; });
      var used = 0, hasImages = false;
      t.items.forEach(function (r) {
        for (var c = MAX_COLUMNS - 1; c >= 0; c--) if (r.cells[c]) { used = Math.max(used, c + 1); break; }
        if (r.image) hasImages = true;
      });
      var rows = t.items.map(function (r) {
        var cells = r.cells.slice(0, Math.max(used, 1));
        return hasImages ? [r.image].concat(cells) : cells;
      });
      return { name: t.name, hasImages: hasImages, rows: rows };
    });
  }

  function readTables(pageId, token) {
    return findTableDb(pageId, token).then(function (db) {
      if (!db) return { db: null, tables: [] };
      return queryAll(db.id, {}, token).then(function (pages) {
        return { db: db, tables: groupTables(pages) };
      });
    });
  }

  var api = {
    listScripts: listScripts,
    readTables: readTables,
    groupTables: groupTables,
    japanese: japanese,
    setTransport: function (fn) { transport = fn || nodeTransport; },
    SCRIPT_DB: SCRIPT_DB, TABLE_DB_NAME: TABLE_DB_NAME
  };
  root.PTNotion = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : this);
