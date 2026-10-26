/*
 * token.js（パネル用）
 * Notion のトークンを、Windows の暗号化（DPAPI）でパソコンの中にしまう
 *
 * - 保存先：%APPDATA%\PolaroidTable\notion-token.dat（暗号化した文字。同じ Windows ユーザーでしか元に戻せない）
 * - 暗号化と元に戻すのは PowerShell の ConvertTo-SecureString / ConvertFrom-SecureString で行う
 *   トークンはコマンドの文字に入れず、標準入力で渡す（ほかのプログラムから見えないように）
 * - 一度読んだトークンは、パネルを開いている間だけ覚えておく
 */
(function (root) {
  var cache = null;

  function nodeRequire(name) {
    var req = (typeof window !== "undefined" && (window.require || (window.cep_node && window.cep_node.require))) ||
              (typeof require === "function" ? require : null);
    if (!req) throw new Error("Node が使えません（パネルの設定）。パネルを入れ直してください。");
    return req(name);
  }

  function filePath() {
    var path = nodeRequire("path");
    var base = (typeof process !== "undefined" && process.env && process.env.APPDATA) || "";
    if (!base) throw new Error("トークンの保存場所（APPDATA）がわかりません。Windows でのみ使えます。");
    return path.join(base, "PolaroidTable", "notion-token.dat");
  }

  // PowerShell に script を実行させ、input を標準入力で渡して、出力を返す
  function powershell(script, input) {
    return new Promise(function (resolve, reject) {
      var child = nodeRequire("child_process").spawn("powershell.exe",
        ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], { windowsHide: true });
      var out = [], err = [];
      child.stdout.on("data", function (c) { out.push(c); });
      child.stderr.on("data", function (c) { err.push(c); });
      child.on("error", function (e) { reject(new Error("PowerShell を動かせませんでした：" + e.message)); });
      child.on("close", function (code) {
        var text = Buffer.concat(out).toString("utf8").replace(/\s+$/, "");
        if (code !== 0) reject(new Error("トークンの暗号化に失敗しました：" + Buffer.concat(err).toString("utf8")));
        else resolve(text);
      });
      child.stdin.end(input);
    });
  }

  var ENCRYPT = "$t = [Console]::In.ReadToEnd().Trim(); ConvertTo-SecureString $t -AsPlainText -Force | ConvertFrom-SecureString";
  var DECRYPT = "$e = [Console]::In.ReadToEnd().Trim(); $s = ConvertTo-SecureString $e; "
              + "[Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))";

  function save(token) {
    token = String(token || "").replace(/^\s+|\s+$/g, "");
    if (!token) return Promise.reject(new Error("トークンを入れてください。"));
    return powershell(ENCRYPT, token).then(function (encrypted) {
      var fs = nodeRequire("fs"), path = nodeRequire("path");
      var file = filePath();
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, encrypted, "utf8");
      cache = token;
      return true;
    });
  }

  function load() {
    if (cache) return Promise.resolve(cache);
    var fs;
    try {
      fs = nodeRequire("fs");
      if (!fs.existsSync(filePath())) return Promise.resolve(null);
    } catch (e) {
      return Promise.reject(e);
    }
    return powershell(DECRYPT, fs.readFileSync(filePath(), "utf8")).then(function (token) {
      cache = token || null;
      return cache;
    });
  }

  function exists() {
    try { return !!cache || nodeRequire("fs").existsSync(filePath()); } catch (e) { return false; }
  }

  function remove() {
    cache = null;
    try {
      var fs = nodeRequire("fs");
      if (fs.existsSync(filePath())) fs.unlinkSync(filePath());
    } catch (e) {}
  }

  var api = { save: save, load: load, exists: exists, remove: remove };
  root.PTToken = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : this);
