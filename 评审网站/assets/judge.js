// 评委评分页
(function () {
  const C = window.CONFIG, D = window.DIMS, A = window.APP;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const token = new URLSearchParams(location.search).get("t");
  const app = $("#app");

  let juror = null, scores = {}, cur = null, saveTimer = null, saving = Promise.resolve(), dirty = false;

  function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("on"), 2200); }
  function modal(html) { $("#modal").innerHTML = html; $("#mask").classList.add("on"); }
  function closeModal() { $("#mask").classList.remove("on"); }

  const recused = c => juror.recuse.includes(c.company);
  const mine = () => window.CASES.filter(c => !recused(c));
  const doneCount = () => mine().filter(c => A.isComplete(scores[c.id])).length;
  const locked = () => !!juror.submitted_at;

  function status(c) {
    if (recused(c)) return "rec";
    const s = scores[c.id];
    if (A.isComplete(s)) return "done";
    if (s && A.DIMKEYS.some(k => s[k] != null && s[k] !== "")) return "part";
    return "";
  }

  // ---------- 无链接时 ----------
  if (!token) {
    app.innerHTML = `<div class="center"><h1>${esc(C.TITLE)}</h1>
      <p>请使用秘书处发送给您的专属评审链接打开本页面。</p>
      ${A.DEMO ? `<p class="muted">当前为<b>演示模式</b>，可用以下演示链接体验：</p>
        <p><a href="?t=demo1">演示评委 A</a>　·　<a href="?t=demo2">演示评委 B</a>　·　<a href="admin.html">秘书处后台（密钥 demo）</a></p>` : ""}
      <p class="muted">${esc(C.CONTACT)}</p></div>`;
    return;
  }

  A.call("judge_load", { p_token: token }).then(res => {
    juror = res.juror;
    for (const s of res.scores) scores[s.case_id] = s;
    const first = mine().find(c => !A.isComplete(scores[c.id])) || mine()[0] || window.CASES[0];
    shell(); go(first.id);
  }).catch(e => {
    app.innerHTML = `<div class="center"><h1>无法打开评审页</h1><p>${esc(A.errText(e))}</p><p class="muted">${esc(C.CONTACT)}</p></div>`;
  });

  // ---------- 页面框架 ----------
  function shell() {
    app.innerHTML = `
      <div class="top">
        <div class="in">
          <div class="brand">${esc(C.TITLE)}<small>评分截止：${esc(C.DEADLINE)} · 修改会自动保存</small></div>
          <div class="spacer"></div>
          <div class="prog"><div class="bar"><i id="pbar"></i></div><span id="ptext"></span></div>
          <div class="who">评委：<b>${esc(juror.name)}</b><br>${esc(juror.org || "")}</div>
          <button class="btn" id="submit">提交评分</button>
        </div>
        ${A.DEMO ? `<div class="demo-flag">演示模式：数据只保存在本浏览器，不会提交给秘书处。 <a href="#" id="reset">清空演示数据</a></div>` : ""}
      </div>
      <div class="mob-select"><select id="msel"></select></div>
      <div class="layout">
        <nav class="list" id="list"></nav>
        <main class="viewer" id="viewer"></main>
        <aside class="panel" id="panel"></aside>
      </div>`;
    $("#submit").onclick = askSubmit;
    $("#msel").onchange = e => go(e.target.value);
    const r = $("#reset"); if (r) r.onclick = e => { e.preventDefault(); A.resetDemo(); location.reload(); };
    window.addEventListener("beforeunload", e => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });
    document.addEventListener("keydown", e => {
      if (e.target.tagName === "INPUT" || $("#mask").classList.contains("on")) return;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") step(1);
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") step(-1);
    });
  }

  function renderList() {
    let html = "", last = null, opts = "";
    for (const c of window.CASES) {
      if (c.company !== last) { html += `<div class="co">${esc(c.company)}</div>`; last = c.company; }
      const st = status(c);
      html += `<button data-id="${esc(c.id)}" class="${c.id === cur ? "on" : ""} ${st === "rec" ? "rec" : ""}">
        <span class="no">${esc(c.id)}</span><span>${esc(c.title)}${st === "rec" ? "（回避）" : ""}</span><span class="dot ${st}"></span></button>`;
      opts += `<option value="${esc(c.id)}" ${c.id === cur ? "selected" : ""}>${esc(c.id)} ${esc(c.title)}${st === "done" ? " ✓" : st === "rec" ? "（回避）" : ""}</option>`;
    }
    $("#list").innerHTML = html; $("#msel").innerHTML = opts;
    $("#list").querySelectorAll("button").forEach(b => b.onclick = () => go(b.dataset.id));
    const n = doneCount(), m = mine().length;
    $("#pbar").style.width = (m ? n / m * 100 : 0) + "%";
    $("#ptext").textContent = locked() ? `已提交 · ${n} / ${m} 项` : `已评 ${n} / ${m} 项`;
    $("#submit").disabled = locked();
    $("#submit").textContent = locked() ? "已提交" : "提交评分";
  }

  async function go(id) {
    await flush();
    cur = id; const c = window.CASES.find(x => x.id === id);
    renderList();
    const on = $("#list .on"); if (on) on.scrollIntoView({ block: "nearest" });
    $("#viewer").innerHTML = `<div class="pages">${(c.pages && c.pages.length)
      ? c.pages.map((p, i) => `<img src="${esc(p)}" alt="案例 ${esc(c.id)} 第${i + 1}页" loading="${i ? "lazy" : "eager"}">`).join("")
      : `<div class="nopage">该案例页正在制作中，请参阅评审包中的申报材料。</div>`}</div>`;
    $("#viewer").scrollTop = 0;
    renderPanel(c);
  }

  function renderPanel(c) {
    const s = scores[c.id] || {};
    const types = (c.types || []).map(t => `<span>${esc(t)}</span>`).join("");
    let body;
    if (recused(c)) {
      body = `<div class="recnote">该案例由您所在单位申报，按规定<b>回避</b>，无需评分。</div>`;
    } else {
      body = D.map(d => {
        const v = s[d.key] ?? "";
        return `<div class="dim ${v === "" ? "empty" : ""}" data-k="${d.key}">
          <div class="h"><b>${esc(d.name)}</b><small>满分 ${d.max}</small></div>
          <div class="d">${esc(d.desc)}</div>
          <div class="r"><input type="range" min="0" max="${d.max}" step="0.5" value="${v === "" ? 0 : v}" ${locked() ? "disabled" : ""}>
          <input type="number" min="0" max="${d.max}" step="0.5" inputmode="decimal" value="${v}" placeholder="—" ${locked() ? "disabled" : ""}></div></div>`;
      }).join("") + `
        <div class="sum"><span>总分（满分 100）</span><b id="sum">—</b></div>
        <div class="status" id="st"></div>
        ${locked() ? `<div class="lock">您已于 ${new Date(juror.submitted_at).toLocaleString("zh-CN")} 提交评分，内容已锁定。</div>` : ""}`;
    }
    const idx = window.CASES.indexOf(c);
    $("#panel").innerHTML = `
      <div class="cid">案例 ${esc(c.id)}</div>
      <h2>${esc(c.title)}</h2>
      <div class="cco">${esc(c.company)}</div>
      <div class="types">${types}</div>
      ${body}
      <div class="nav" style="margin-top:14px">
        <button class="btn ghost" id="prev" ${idx === 0 ? "disabled" : ""}>← 上一项</button>
        <button class="btn ghost" id="next" ${idx === window.CASES.length - 1 ? "disabled" : ""}>下一项 →</button>
      </div>`;
    $("#prev").onclick = () => step(-1); $("#next").onclick = () => step(1);
    if (!recused(c)) {
      $("#panel").querySelectorAll(".dim").forEach(el => {
        const k = el.dataset.k, max = A.MAX[k];
        const rg = el.querySelector("[type=range]"), nu = el.querySelector("[type=number]");
        rg.oninput = () => { nu.value = rg.value; changed(c.id, k, rg.value, el, nu, max); };
        nu.oninput = () => { if (nu.value !== "") rg.value = nu.value; changed(c.id, k, nu.value, el, nu, max); };
      });
      updateSum(c.id);
    }
  }

  function changed(id, k, raw, el, nu, max) {
    const v = raw === "" ? null : Math.round(Number(raw) * 10) / 10;
    const bad = v != null && (isNaN(v) || v < 0 || v > max);
    nu.classList.toggle("bad", bad); el.classList.toggle("empty", v == null);
    if (bad) { setStatus(`“${D.find(d => d.key === k).name}”应在 0–${max} 之间`, true); return; }
    scores[id] = Object.assign({ case_id: id }, scores[id], { [k]: v });
    updateSum(id); renderList(); dirty = true; setStatus("正在保存…");
    clearTimeout(saveTimer); saveTimer = setTimeout(() => save(id), 600);
  }

  function updateSum(id) {
    const s = scores[id], el = $("#sum"); if (!el) return;
    el.textContent = s && A.DIMKEYS.some(k => s[k] != null) ? A.total(s).toFixed(1).replace(/\.0$/, "") : "—";
  }
  function setStatus(t, err) { const el = $("#st"); if (el) { el.textContent = t; el.classList.toggle("err", !!err); } }

  function save(id) {
    const s = scores[id]; const payload = {};
    for (const k of A.DIMKEYS) payload[k] = s[k] ?? null;
    saving = saving.then(() => A.call("judge_save", { p_token: token, p_case: id, p_scores: payload }))
      .then(() => { dirty = false; if (cur === id) setStatus(A.isComplete(s) ? "✓ 已保存，本案例已评完" : "✓ 已保存"); })
      .catch(e => { setStatus(A.errText(e), true); toast(A.errText(e)); });
    return saving;
  }
  async function flush() { if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; if (cur && dirty) await save(cur); } await saving; }

  function step(d) {
    const i = window.CASES.findIndex(c => c.id === cur) + d;
    if (i >= 0 && i < window.CASES.length) go(window.CASES[i].id);
  }

  async function askSubmit() {
    await flush();
    const left = mine().filter(c => !A.isComplete(scores[c.id]));
    if (left.length) {
      modal(`<h3>还有 ${left.length} 项未评完</h3><p>请完成以下案例的全部六项评分后再提交：</p>
        <p class="muted">${left.map(c => esc(c.id)).join("、")}</p>
        <div class="acts"><button class="btn" id="m1">去评分</button></div>`);
      $("#m1").onclick = () => { closeModal(); go(left[0].id); };
      return;
    }
    modal(`<h3>确认提交评分？</h3><p>您已完成全部 ${mine().length} 项案例的评分。<b>提交后将无法修改</b>，如需修改须联系秘书处解锁。</p>
      <div class="acts"><button class="btn ghost" id="m0">再检查一下</button><button class="btn" id="m1">确认提交</button></div>`);
    $("#m0").onclick = closeModal;
    $("#m1").onclick = async () => {
      $("#m1").disabled = true;
      try {
        await A.call("judge_submit", { p_token: token });
        juror.submitted_at = new Date().toISOString(); closeModal(); renderList(); go(cur);
        modal(`<h3>提交成功，感谢您的评审！</h3><p>秘书处将在评审截止后汇总结果。</p><div class="acts"><button class="btn" id="m2">好的</button></div>`);
        $("#m2").onclick = closeModal;
      } catch (e) { closeModal(); toast(A.errText(e)); }
    };
  }
})();
