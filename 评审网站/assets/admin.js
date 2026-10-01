// 秘书处后台：评委管理、进度、结果排名与导出
(function () {
  const C = window.CONFIG, D = window.DIMS, A = window.APP, AW = window.AWARDS;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const app = $("#app");
  const COMPANIES = [...new Set(window.CASES.map(c => c.company))];
  let key = null, data = null, tab = "progress", onlySubmitted = true, editing = null;

  function toast(m) { const t = $("#toast"); t.textContent = m; t.classList.add("on"); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("on"), 2200); }
  function modal(h) { $("#modal").innerHTML = h; $("#mask").classList.add("on"); }
  function closeModal() { $("#mask").classList.remove("on"); }
  const linkFor = j => new URL("index.html?t=" + j.token, location.href).href;
  const fmt = (v, d = 1) => v == null ? "—" : Number(v).toFixed(d);
  async function copy(text) { try { await navigator.clipboard.writeText(text); toast("已复制"); } catch (e) { prompt("请手动复制：", text); } }

  // ---------- 登录 ----------
  function login(msg) {
    app.innerHTML = `<div class="center"><h1>秘书处评审后台</h1>
      <p class="muted">${esc(C.TITLE)}</p>
      <div class="row" style="margin-top:14px"><input id="k" type="password" placeholder="管理密钥" style="flex:1;padding:8px;border:1px solid var(--rule);border-radius:4px">
      <button class="btn" id="go">登录</button></div>
      <p class="status err" style="margin-top:8px">${esc(msg || "")}</p>
      ${A.DEMO ? `<p class="muted">演示模式：管理密钥为 <b>demo</b>。</p>` : ""}</div>`;
    const go = () => { key = $("#k").value.trim(); load(); };
    $("#go").onclick = go; $("#k").onkeydown = e => { if (e.key === "Enter") go(); }; $("#k").focus();
  }
  async function load() {
    try {
      data = await A.call("admin_load", { p_key: key });
      try { sessionStorage.setItem("cccuk_admin_key", key); } catch (e) {}
      render();
    } catch (e) { try { sessionStorage.removeItem("cccuk_admin_key"); } catch (x) {} login(A.errText(e)); }
  }
  try { key = sessionStorage.getItem("cccuk_admin_key"); } catch (e) {}
  key ? load() : login();

  // ---------- 计算 ----------
  function needFor(j) { return window.CASES.filter(c => !(j.recuse || []).includes(c.company)); }
  function scoreOf(j, cid) { return data.scores.find(s => s.juror_id === j.id && s.case_id === cid); }
  function progressOf(j) {
    const need = needFor(j); const done = need.filter(c => A.isComplete(scoreOf(j, c.id))).length;
    const last = data.scores.filter(s => s.juror_id === j.id).map(s => s.updated_at).sort().pop();
    return { need: need.length, done, last };
  }
  function results() {
    const counted = data.jurors.filter(j => !onlySubmitted || j.submitted_at);
    const rows = window.CASES.map(c => {
      const valid = counted.filter(j => !(j.recuse || []).includes(c.company)).map(j => scoreOf(j, c.id)).filter(A.isComplete);
      const totals = valid.map(A.total);
      const avg = {}; for (const d of D) avg[d.key] = A.mean(valid.map(s => Number(s[d.key])));
      return { c, n: valid.length, score: A.trimmedMean(totals), avg, award: null, awardCls: "" };
    });
    const ranked = rows.filter(r => r.score != null).sort((a, b) =>
      b.score - a.score || (b.avg.d2 - a.avg.d2) || (b.avg.d1 - a.avg.d1));
    ranked.forEach((r, i) => r.rank = i + 1);
    // 卓越成果奖：前 N 名，同一单位最多 1 项
    const topCos = new Set(); let n = 0;
    for (const r of ranked) { if (n >= AW.top.count) break; if (topCos.has(r.c.company)) continue; r.award = AW.top.name; r.awardCls = ""; topCos.add(r.c.company); n++; }
    // 专项奖：每类取未获奖案例中得分最高者
    for (const sp of AW.special) {
      const r = ranked.find(x => !x.award && (x.c.types || []).some(t => sp.types.includes(t)));
      if (r) { r.award = sp.name; r.awardCls = "sp"; }
    }
    // 优秀成果奖
    for (const r of ranked) if (!r.award && r.score >= AW.merit.minScore) { r.award = AW.merit.name; r.awardCls = "mr"; }
    return { ranked, unrated: rows.filter(r => r.score == null), counted: counted.length };
  }

  // ---------- 页面 ----------
  function render() {
    const sub = data.jurors.filter(j => j.submitted_at).length;
    const pct = data.jurors.length ? Math.round(data.jurors.reduce((a, j) => { const p = progressOf(j); return a + (p.need ? p.done / p.need : 0); }, 0) / data.jurors.length * 100) : 0;
    const dbCases = (data.cases || []).length, mismatch = !A.DEMO && dbCases !== window.CASES.length;
    app.innerHTML = `
      <div class="top"><div class="in">
        <div class="brand">秘书处评审后台<small>${esc(C.TITLE)}</small></div><div class="spacer"></div>
        <button class="btn ghost sm" id="refresh">刷新数据</button>
        <button class="btn ghost sm" id="logout">退出</button></div>
        ${A.DEMO ? `<div class="demo-flag">演示模式：数据只保存在本浏览器。部署时在 config.js 填入 Supabase 信息即切换为正式模式。</div>` : ""}
      </div>
      <div class="wrap">
        ${mismatch ? `<div class="card" style="border-color:#f0dfa8;background:#fffaf0"><b>案例清单未同步</b>：网站 ${window.CASES.length} 项，数据库 ${dbCases} 项。评委打分前请先同步。 <button class="btn sm" id="sync">同步案例清单</button></div>` : ""}
        <div class="kpis">
          <div class="kpi"><b>${window.CASES.length}</b><span>参评案例</span></div>
          <div class="kpi"><b>${data.jurors.length}</b><span>评委人数</span></div>
          <div class="kpi"><b>${sub} / ${data.jurors.length}</b><span>已提交</span></div>
          <div class="kpi"><b>${pct}%</b><span>平均完成度</span></div>
        </div>
        <div class="tabs">
          <button data-t="progress" class="${tab === "progress" ? "on" : ""}">评审进度</button>
          <button data-t="jurors" class="${tab === "jurors" ? "on" : ""}">评委管理</button>
          <button data-t="results" class="${tab === "results" ? "on" : ""}">结果排名</button>
        </div>
        <div id="body"></div>
      </div>`;
    $("#refresh").onclick = load;
    $("#logout").onclick = () => { try { sessionStorage.removeItem("cccuk_admin_key"); } catch (e) {} key = null; login(); };
    const sy = $("#sync"); if (sy) sy.onclick = sync;
    app.querySelectorAll(".tabs button").forEach(b => b.onclick = () => { tab = b.dataset.t; render(); });
    ({ progress: renderProgress, jurors: renderJurors, results: renderResults })[tab]();
  }

  async function sync() {
    modal(`<h3>同步案例清单</h3><p>将以网站 <code>assets/cases.js</code> 中的 ${window.CASES.length} 项案例为准更新数据库。<b>清单中已删除的案例，其已有评分也会一并删除。</b></p>
      <div class="acts"><button class="btn ghost" id="m0">取消</button><button class="btn" id="m1">确认同步</button></div>`);
    $("#m0").onclick = closeModal;
    $("#m1").onclick = async () => {
      try { await A.call("admin_sync_cases", { p_key: key, p_cases: window.CASES.map(c => ({ id: c.id, company: c.company, title: c.title })) }); closeModal(); toast("已同步"); load(); }
      catch (e) { closeModal(); toast(A.errText(e)); }
    };
  }

  function renderProgress() {
    if (!data.jurors.length) { $("#body").innerHTML = `<div class="card muted">还没有评委。请在“评委管理”中添加。</div>`; return; }
    const pending = data.jurors.filter(j => !j.submitted_at);
    $("#body").innerHTML = `<div class="card">
      <div class="row" style="justify-content:space-between;margin-bottom:10px"><h3 style="margin:0">评委进度</h3>
      ${pending.length ? `<button class="btn ghost sm" id="remind">复制未提交评委名单与链接（用于催办）</button>` : ""}</div>
      <table class="t"><tr><th>评委</th><th>单位</th><th>回避</th><th>进度</th><th>状态</th><th>最近保存</th><th></th></tr>
      ${data.jurors.map(j => { const p = progressOf(j);
        const st = j.submitted_at ? `<span class="pill ok">已提交</span>` : p.done ? `<span class="pill mid">评分中</span>` : `<span class="pill no">未开始</span>`;
        return `<tr><td><b>${esc(j.name)}</b></td><td>${esc(j.org)}</td><td class="muted">${(j.recuse || []).length ? esc(j.recuse.join("、")) : "—"}</td>
          <td class="n">${p.done} / ${p.need}</td><td>${st}</td><td class="muted">${p.last ? new Date(p.last).toLocaleString("zh-CN") : "—"}</td>
          <td>${j.submitted_at ? `<button class="btn ghost sm" data-unlock="${j.id}">解锁</button>` : `<button class="btn ghost sm" data-copy="${j.id}">复制链接</button>`}</td></tr>`; }).join("")}
      </table></div>`;
    const r = $("#remind"); if (r) r.onclick = () => copy(pending.map(j => { const p = progressOf(j); return `${j.name}（${j.org || ""}）已评 ${p.done}/${p.need}：${linkFor(j)}`; }).join("\n"));
    $("#body").querySelectorAll("[data-copy]").forEach(b => b.onclick = () => copy(linkFor(data.jurors.find(j => j.id === b.dataset.copy))));
    $("#body").querySelectorAll("[data-unlock]").forEach(b => b.onclick = () => {
      const j = data.jurors.find(x => x.id === b.dataset.unlock);
      modal(`<h3>解锁 ${esc(j.name)} 的评分？</h3><p>解锁后该评委可以修改评分，修改完需重新提交。</p><div class="acts"><button class="btn ghost" id="m0">取消</button><button class="btn" id="m1">解锁</button></div>`);
      $("#m0").onclick = closeModal;
      $("#m1").onclick = async () => { try { await A.call("admin_unlock", { p_key: key, p_id: j.id }); closeModal(); toast("已解锁"); load(); } catch (e) { closeModal(); toast(A.errText(e)); } };
    });
  }

  function renderJurors() {
    const j = editing ? data.jurors.find(x => x.id === editing) : null;
    $("#body").innerHTML = `
      <div class="card"><h3>${j ? "修改评委" : "添加评委"}</h3>
        <div class="form">
          <div><label>姓名</label><input id="fn" value="${esc(j?.name)}"></div>
          <div><label>所在单位</label><input id="fo" value="${esc(j?.org)}" list="cos"><datalist id="cos">${COMPANIES.map(c => `<option value="${esc(c)}">`).join("")}</datalist></div>
        </div>
        <label class="muted" style="display:block;margin:12px 0 4px">需回避的申报单位（本单位及同一集团）</label>
        <div class="checks">${COMPANIES.map(c => `<label><input type="checkbox" value="${esc(c)}" ${(j?.recuse || []).includes(c) ? "checked" : ""}> ${esc(c)}</label>`).join("")}</div>
        <div class="row" style="margin-top:12px"><button class="btn" id="save">${j ? "保存修改" : "添加并生成链接"}</button>
        ${j ? `<button class="btn ghost" id="cancel">取消</button>` : ""}<span class="muted">提示：所在单位若是申报单位，会自动勾选回避。</span></div>
      </div>
      <div class="card"><div class="row" style="justify-content:space-between;margin-bottom:10px"><h3 style="margin:0">评委名单（${data.jurors.length}）</h3>
        ${data.jurors.length ? `<button class="btn ghost sm" id="copyall">复制全部评委链接</button>` : ""}</div>
        ${data.jurors.length ? `<table class="t"><tr><th>评委</th><th>单位</th><th>专属链接</th><th></th></tr>
        ${data.jurors.map(x => `<tr><td><b>${esc(x.name)}</b></td><td>${esc(x.org)}</td><td class="link">${esc(linkFor(x))}</td>
          <td style="white-space:nowrap"><button class="btn ghost sm" data-copy="${x.id}">复制</button> <button class="btn ghost sm" data-edit="${x.id}">修改</button> <button class="btn ghost sm" data-del="${x.id}">删除</button></td></tr>`).join("")}</table>`
        : `<p class="muted">暂无评委。</p>`}
        <p class="muted" style="margin-top:10px">每位评委的链接都是唯一的，相当于密码，请只发给本人。</p></div>`;
    $("#fo").oninput = e => { const v = e.target.value.trim(); $("#body").querySelectorAll(".checks input").forEach(cb => { if (cb.value === v) cb.checked = true; }); };
    $("#save").onclick = async () => {
      const name = $("#fn").value.trim(), org = $("#fo").value.trim();
      if (!name) { toast("请填写姓名"); return; }
      const recuse = [...$("#body").querySelectorAll(".checks input:checked")].map(x => x.value);
      try { await A.call("admin_save_juror", { p_key: key, p_id: j ? j.id : null, p_name: name, p_org: org, p_recuse: recuse }); editing = null; toast(j ? "已保存" : "已添加"); load(); }
      catch (e) { toast(A.errText(e)); }
    };
    const cc = $("#cancel"); if (cc) cc.onclick = () => { editing = null; renderJurors(); };
    const ca = $("#copyall"); if (ca) ca.onclick = () => copy(data.jurors.map(x => `${x.name}\t${x.org || ""}\t${linkFor(x)}`).join("\n"));
    $("#body").querySelectorAll("[data-copy]").forEach(b => b.onclick = () => copy(linkFor(data.jurors.find(x => x.id === b.dataset.copy))));
    $("#body").querySelectorAll("[data-edit]").forEach(b => b.onclick = () => { editing = b.dataset.edit; renderJurors(); window.scrollTo(0, 0); });
    $("#body").querySelectorAll("[data-del]").forEach(b => b.onclick = () => {
      const x = data.jurors.find(y => y.id === b.dataset.del);
      modal(`<h3>删除评委 ${esc(x.name)}？</h3><p>该评委的链接将失效，<b>已打的分数也会一并删除</b>，无法恢复。</p><div class="acts"><button class="btn ghost" id="m0">取消</button><button class="btn" id="m1">删除</button></div>`);
      $("#m0").onclick = closeModal;
      $("#m1").onclick = async () => { try { await A.call("admin_delete_juror", { p_key: key, p_id: x.id }); closeModal(); toast("已删除"); load(); } catch (e) { closeModal(); toast(A.errText(e)); } };
    });
  }

  function renderResults() {
    const R = results();
    $("#body").innerHTML = `<div class="card">
      <div class="row" style="justify-content:space-between;margin-bottom:8px"><h3 style="margin:0">结果排名</h3>
        <div class="row"><label class="muted"><input type="checkbox" id="only" ${onlySubmitted ? "checked" : ""}> 只计入已提交的评委（${R.counted} 人）</label>
        <button class="btn ghost sm" id="csv1">导出排名 CSV</button><button class="btn ghost sm" id="csv2">导出全部原始评分 CSV</button></div></div>
      <p class="muted" style="margin:0 0 10px">得分＝去掉一个最高分和一个最低分后的平均分（有效评分少于 5 份时直接平均）；同分依次比较“中英合作价值”“实际成果与在英贡献”平均分。<b>建议奖项由系统按方案规则自动生成，仅供评审会商参考。</b></p>
      <table class="t"><tr><th>排名</th><th>编号</th><th>案例</th><th class="n">有效评分</th><th class="n">得分</th><th class="n">中英合作</th><th class="n">实际成果</th><th>建议奖项</th></tr>
      ${R.ranked.map(r => `<tr><td class="n">${r.rank}</td><td><b>${esc(r.c.id)}</b></td><td>${esc(r.c.title)}<div class="muted">${esc(r.c.company)}</div></td>
        <td class="n">${r.n}</td><td class="n"><b>${fmt(r.score, 2)}</b></td><td class="n">${fmt(r.avg.d2)}</td><td class="n">${fmt(r.avg.d1)}</td>
        <td>${r.award ? `<span class="award ${r.awardCls}">${esc(r.award)}</span>` : ""}</td></tr>`).join("")}
      ${R.unrated.map(r => `<tr><td class="n">—</td><td><b>${esc(r.c.id)}</b></td><td>${esc(r.c.title)}<div class="muted">${esc(r.c.company)}</div></td><td class="n">0</td><td class="n muted" colspan="4">暂无有效评分</td></tr>`).join("")}
      </table></div>`;
    $("#only").onchange = e => { onlySubmitted = e.target.checked; renderResults(); };
    $("#csv1").onclick = () => csv("评审排名.csv", [["排名", "编号", "申报单位", "案例名称", "有效评分数", "得分", ...D.map(d => d.name + "平均"), "建议奖项"],
      ...R.ranked.map(r => [r.rank, r.c.id, r.c.company, r.c.title, r.n, fmt(r.score, 2), ...D.map(d => fmt(r.avg[d.key], 2)), r.award || ""]),
      ...R.unrated.map(r => ["", r.c.id, r.c.company, r.c.title, 0, "", ...D.map(() => ""), ""])]);
    $("#csv2").onclick = () => {
      const rows = [["评委", "单位", "是否提交", "编号", "申报单位", ...D.map(d => `${d.name}(${d.max})`), "总分", "最近保存"]];
      for (const j of data.jurors) for (const c of window.CASES) {
        const rec = (j.recuse || []).includes(c.company), s = scoreOf(j, c.id);
        rows.push([j.name, j.org || "", j.submitted_at ? "是" : "否", c.id, c.company, ...D.map(d => rec ? "回避" : (s?.[d.key] ?? "")), rec ? "回避" : (A.isComplete(s) ? A.total(s) : ""), s?.updated_at || ""]);
      }
      csv("全部原始评分.csv", rows);
    };
  }

  function csv(name, rows) {
    const t = "﻿" + rows.map(r => r.map(v => { v = String(v ?? ""); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }).join(",")).join("\r\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([t], { type: "text/csv;charset=utf-8" })); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
})();
