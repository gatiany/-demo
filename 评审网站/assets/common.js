// 公共逻辑：数据接口（Supabase 或演示模式）、计分规则
(function () {
  const C = window.CONFIG;
  const DEMO = !C.SUPABASE_URL || !C.SUPABASE_ANON_KEY;
  const DIMKEYS = window.DIMS.map(d => d.key);
  const MAX = Object.fromEntries(window.DIMS.map(d => [d.key, d.max]));

  // ---------- Supabase：通过 REST 调用数据库函数 ----------
  async function rpc(fn, args) {
    const res = await fetch(C.SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/rpc/" + fn, {
      method: "POST",
      headers: Object.assign({ "Content-Type": "application/json", apikey: C.SUPABASE_ANON_KEY },
        C.SUPABASE_ANON_KEY.startsWith("eyJ") ? { Authorization: "Bearer " + C.SUPABASE_ANON_KEY } : {}),
      body: JSON.stringify(args),
    });
    const text = await res.text();
    let body = null; try { body = text ? JSON.parse(text) : null; } catch (e) {}
    if (!res.ok) {
      const msg = (body && (body.message || body.hint)) || text || res.statusText;
      const err = new Error(msg); err.code = (msg.match(/[A-Z_]{6,}/) || [""])[0]; throw err;
    }
    return body;
  }

  // ---------- 演示模式：数据存在当前浏览器 ----------
  const KEY = "cccuk_review_demo_v1";
  function demoDB() {
    let db = null;
    try { db = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
    if (!db) {
      const co = [...new Set(window.CASES.map(c => c.company))];
      db = { jurors: [
        { id: "j1", token: "demo1", name: "演示评委A", org: co[2], recuse: [co[2]], submitted_at: null, created_at: new Date().toISOString() },
        { id: "j2", token: "demo2", name: "演示评委B", org: co[0], recuse: [co[0]], submitted_at: null, created_at: new Date().toISOString() },
      ], scores: [] };
      demoSave(db);
    }
    return db;
  }
  function demoSave(db) { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} }
  function fail(code) { const e = new Error(code); e.code = code; throw e; }
  function demoJ(db, t) { const j = db.jurors.find(x => x.token === t); if (!j) fail("INVALID_LINK"); return j; }
  const caseById = id => window.CASES.find(c => c.id === id);

  const demo = {
    judge_load({ p_token }) {
      const db = demoDB(), j = demoJ(db, p_token);
      return { juror: { name: j.name, org: j.org, recuse: j.recuse, submitted_at: j.submitted_at },
               scores: db.scores.filter(s => s.juror_id === j.id) };
    },
    judge_save({ p_token, p_case, p_scores }) {
      const db = demoDB(), j = demoJ(db, p_token);
      if (j.submitted_at) fail("ALREADY_SUBMITTED");
      const c = caseById(p_case); if (!c) fail("UNKNOWN_CASE");
      if (j.recuse.includes(c.company)) fail("RECUSED");
      const row = { juror_id: j.id, case_id: p_case, updated_at: new Date().toISOString() };
      for (const k of DIMKEYS) {
        const v = p_scores[k] === "" || p_scores[k] == null ? null : Number(p_scores[k]);
        if (v != null && (v < 0 || v > MAX[k])) fail("OUT_OF_RANGE");
        row[k] = v;
      }
      db.scores = db.scores.filter(s => !(s.juror_id === j.id && s.case_id === p_case)).concat(row);
      demoSave(db); return { ok: true };
    },
    judge_submit({ p_token }) {
      const db = demoDB(), j = demoJ(db, p_token);
      const need = window.CASES.filter(c => !j.recuse.includes(c.company));
      const done = need.filter(c => isComplete(db.scores.find(s => s.juror_id === j.id && s.case_id === c.id)));
      if (done.length < need.length) fail("INCOMPLETE");
      j.submitted_at = new Date().toISOString(); demoSave(db); return { ok: true };
    },
    admin_load({ p_key }) {
      if (p_key !== "demo") fail("INVALID_ADMIN_KEY");
      const db = demoDB(); return { jurors: db.jurors, scores: db.scores, cases: window.CASES };
    },
    admin_sync_cases() { return { ok: true, count: window.CASES.length }; },
    admin_save_juror({ p_key, p_id, p_name, p_org, p_recuse }) {
      if (p_key !== "demo") fail("INVALID_ADMIN_KEY");
      const db = demoDB(); let j = db.jurors.find(x => x.id === p_id);
      if (!j) { j = { id: "j" + Date.now(), token: Math.random().toString(36).slice(2, 12), submitted_at: null, created_at: new Date().toISOString() }; db.jurors.push(j); }
      Object.assign(j, { name: p_name, org: p_org, recuse: p_recuse || [] }); demoSave(db); return j;
    },
    admin_delete_juror({ p_key, p_id }) {
      if (p_key !== "demo") fail("INVALID_ADMIN_KEY");
      const db = demoDB(); db.jurors = db.jurors.filter(x => x.id !== p_id); db.scores = db.scores.filter(s => s.juror_id !== p_id); demoSave(db); return { ok: true };
    },
    admin_unlock({ p_key, p_id }) {
      if (p_key !== "demo") fail("INVALID_ADMIN_KEY");
      const db = demoDB(); const j = db.jurors.find(x => x.id === p_id); if (j) j.submitted_at = null; demoSave(db); return { ok: true };
    },
    reset() { localStorage.removeItem(KEY); },
  };

  async function call(fn, args) {
    if (DEMO) { await new Promise(r => setTimeout(r, 120)); return demo[fn](args); }
    return rpc(fn, args);
  }

  // ---------- 计分 ----------
  function isComplete(s) { return !!s && DIMKEYS.every(k => s[k] !== null && s[k] !== undefined && s[k] !== ""); }
  function total(s) { return DIMKEYS.reduce((a, k) => a + (Number(s[k]) || 0), 0); }
  function mean(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; }
  // 去掉一个最高分和一个最低分后取平均；有效评分少于 5 份时直接平均
  function trimmedMean(a) {
    if (a.length < 5) return mean(a);
    const s = [...a].sort((x, y) => x - y); return mean(s.slice(1, -1));
  }

  const ERR = {
    INVALID_LINK: "链接无效或已失效，请联系秘书处。",
    ALREADY_SUBMITTED: "您已提交评分，无法再修改。如需修改请联系秘书处。",
    RECUSED: "该案例属于回避范围，无需评分。",
    OUT_OF_RANGE: "分值超出该项满分范围。",
    INCOMPLETE: "尚有案例未评完，请完成全部案例后再提交。",
    INVALID_ADMIN_KEY: "管理密钥不正确。",
    UNKNOWN_CASE: "案例清单未同步，请秘书处在后台点击“同步案例清单”。",
  };
  function errText(e) { return ERR[e.code] || ("出错了：" + (e.message || e)); }

  window.APP = { DEMO, call, isComplete, total, trimmedMean, mean, errText, DIMKEYS, MAX, resetDemo: demo.reset };
})();
