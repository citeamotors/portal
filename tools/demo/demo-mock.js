/* Citea Motors portal DEMO. Every database, login, file and live-update call is answered here, inside this
   browser, from made-up sample data. Nothing is ever sent to the real Citea Motors database. */
(function(){
  var SB = "https://asobgojrhatjpazgwnjp.supabase.co";
  var KEY = "citea-demo-db-v1", FILES = "citea-demo-files-v1";
  var SEED = window.__DEMO_SEED__;
  var realFetch = window.fetch.bind(window);
  var db, files = {};
  function load(){
    try{ db = JSON.parse(localStorage.getItem(KEY) || "null"); }catch(e){ db = null; }
    if(!db || db.__v !== SEED.__v){ db = JSON.parse(JSON.stringify(SEED)); }
    try{ files = JSON.parse(localStorage.getItem(FILES) || "{}"); }catch(e){ files = {}; }
  }
  var saveT = null;
  function persist(){ clearTimeout(saveT); saveT = setTimeout(function(){
    try{ localStorage.setItem(KEY, JSON.stringify(db)); }catch(e){}
    try{ localStorage.setItem(FILES, JSON.stringify(files)); }catch(e){ /* photos too big to keep: they last until the page reloads */ }
  }, 200); }
  load();
  window.__citeaDemoReset = function(){ try{ localStorage.removeItem(KEY); localStorage.removeItem(FILES); localStorage.removeItem("citea-demo-auth"); }catch(e){} location.reload(); };

  var uuid = function(){ return (crypto.randomUUID ? crypto.randomUUID() : "d" + Math.random().toString(16).slice(2) + Date.now().toString(16)); };
  var nowIso = function(){ return new Date().toISOString(); };
  var PK = {procedure_answers: "procedure_id", onboarding: "user_id", team_info: "user_id", team_pay: "user_id", team_pins: "user_id", auth_secrets: "user_id", worksheets: "wo_id", customer_links: "wo_id", qbo_links: "wo_id", car_deals: "vehicle_id", shop_settings: "id", video_views: "id"};
  var NOID = {team_info: 1, team_pay: 1, team_pins: 1, worksheets: 1, customer_links: 1, qbo_links: 1, car_deals: 1, procedure_answers: 1, onboarding: 1};
  var T = function(name){ return db[name] || (db[name] = []); };

  function b64(s){ return btoa(unescape(encodeURIComponent(s))).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_"); }
  function jwt(sub){ var t = Math.floor(Date.now() / 1000); return b64(JSON.stringify({alg: "HS256", typ: "JWT"})) + "." + b64(JSON.stringify({sub: sub, aud: "authenticated", role: "authenticated", exp: t + 86400 * 30, iat: t, email: sub + "@demo.local"})) + ".demo"; }
  function uidFrom(h){ try{ var a = (h && (h.get ? h.get("authorization") : h.authorization || h.Authorization)) || ""; var p = a.split(" ")[1].split(".")[1]; return JSON.parse(decodeURIComponent(escape(atob(p.replace(/-/g, "+").replace(/_/g, "/"))))).sub; }catch(e){ return null; } }
  function user(id){ return {id: id, aud: "authenticated", role: "authenticated", email: id + "@demo.local", app_metadata: {provider: "email"}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z"}; }
  function session(id){ return {access_token: jwt(id), refresh_token: "demo-" + id, token_type: "bearer", expires_in: 86400 * 30, expires_at: Math.floor(Date.now() / 1000) + 86400 * 30, user: user(id)}; }
  function J(body, status, headers){ return Promise.resolve(new Response(body == null ? "" : JSON.stringify(body), {status: status || 200, headers: Object.assign({"content-type": "application/json"}, headers || {})})); }

  // ---- PostgREST-style filters ----
  function val(v){ if(v === "null") return null; if(v === "true") return true; if(v === "false") return false; return v; }
  function cmp(a, b){ var na = Number(a), nb = Number(b); if(a !== null && b !== null && a !== "" && b !== "" && !isNaN(na) && !isNaN(nb)) return na - nb; return String(a == null ? "" : a).localeCompare(String(b == null ? "" : b)); }
  function test(row, col, expr){
    var m = expr.match(/^(not\.)?([a-z]+)\.([\s\S]*)$/); if(!m) return true;
    var neg = !!m[1], op = m[2], arg = m[3], v = row[col], r;
    if(op === "eq") r = String(v) === String(val(arg)) || v === val(arg);
    else if(op === "neq") r = String(v) !== String(val(arg));
    else if(op === "is") r = arg === "null" ? v == null : v === val(arg);
    else if(op === "in"){ var list = arg.replace(/^\(|\)$/g, "").split(",").map(function(s){ return s.replace(/^"|"$/g, ""); }); r = list.indexOf(String(v)) >= 0; }
    else if(op === "gt") r = cmp(v, arg) > 0; else if(op === "gte") r = cmp(v, arg) >= 0;
    else if(op === "lt") r = cmp(v, arg) < 0; else if(op === "lte") r = cmp(v, arg) <= 0;
    else if(op === "like" || op === "ilike"){ var re = new RegExp("^" + arg.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/%/g, ".*") + "$", op === "ilike" ? "i" : ""); r = re.test(String(v == null ? "" : v)); }
    else if(op === "cs"){ try{ var want = JSON.parse(arg.replace(/^\{/, "[").replace(/\}$/, "]")); r = Array.isArray(v) && want.every(function(w){ return v.indexOf(w) >= 0; }); }catch(e){ r = true; } }
    else r = true;
    return neg ? !r : r;
  }
  var RESERVED = {select: 1, order: 1, limit: 1, offset: 1, on_conflict: 1, columns: 1};
  function matchRows(rows, params){
    var out = rows.filter(function(row){
      var ok = true;
      params.forEach(function(v, k){
        if(!ok || RESERVED[k]) return;
        if(k === "or"){ var parts = v.replace(/^\(|\)$/g, "").split(","); ok = parts.some(function(p){ var i = p.indexOf("."); return test(row, p.slice(0, i), p.slice(i + 1)); }); return; }
        ok = test(row, k, v);
      });
      return ok;
    });
    var ord = params.get("order");
    if(ord){ var keys = ord.split(",").map(function(s){ var p = s.split("."); return {c: p[0], d: p.indexOf("desc") > 0 ? -1 : 1}; });
      out.sort(function(a, b){ for(var i = 0; i < keys.length; i++){ var c = cmp(a[keys[i].c], b[keys[i].c]) * keys[i].d; if(c) return c; } return 0; }); }
    return out;
  }
  function defaults(table, row, me){
    if(!NOID[table] && row.id == null) row.id = table === "leads" || table === "body_events" || table === "punch_edits" || table === "deleted_work_orders" ? (T(table).reduce(function(m, r){ return Math.max(m, Number(r.id) || 0); }, 0) + 1) : uuid();
    if(row.created_at == null && table !== "shop_settings") row.created_at = nowIso();
    if(table === "work_orders" && row.number == null) row.number = T(table).reduce(function(m, r){ return Math.max(m, Number(r.number) || 0); }, 1000) + 1;
    if(table === "body_jobs"){ if(row.number == null) row.number = T(table).reduce(function(m, r){ return Math.max(m, Number(r.number) || 0); }, 2000) + 1;
      row.stage = row.stage || "estimate"; row.stage_at = row.stage_at || nowIso(); row.estimate = row.estimate || []; row.checks = row.checks || {}; row.impact = row.impact || []; row.payer = row.payer || "customer"; row.priority = row.priority || "normal"; row.on_hold = !!row.on_hold; }
    if(table === "body_parts") row.status = row.status || "needed";
    if(table === "body_time") row.start_at = row.start_at || nowIso();
    if(table === "body_photos" || table === "body_events"){ row.taken_by = row.taken_by || me; row.at = row.at || nowIso(); }
    if(table === "listings"){ row.status = row.status || "draft"; row.photos = row.photos || []; row.sort = row.sort || 0; }
    if(table === "leads") row.status = row.status || "new";
    return row;
  }
  function bodyStageLog(oldRow, row, me){
    if(oldRow.stage !== row.stage){ row.stage_at = nowIso(); if(row.stage === "delivered" && !row.delivered_at) row.delivered_at = nowIso();
      T("body_events").push(defaults("body_events", {job_id: row.id, kind: "stage", detail: oldRow.stage + " > " + row.stage, user_id: me}, me)); }
    if(oldRow.on_hold !== row.on_hold) T("body_events").push(defaults("body_events", {job_id: row.id, kind: row.on_hold ? "hold" : "unhold", detail: row.hold_reason, user_id: me}, me));
  }

  async function rest(url, init, me){
    var u = new URL(url), path = u.pathname.split("/rest/v1/")[1], method = (init.method || "GET").toUpperCase();
    var h = new Headers(init.headers || {}), accept = h.get("accept") || "", prefer = h.get("prefer") || "";
    var single = accept.indexOf("vnd.pgrst.object") >= 0;
    var body = null; if(init.body){ try{ body = JSON.parse(typeof init.body === "string" ? init.body : await new Response(init.body).text()); }catch(e){ body = null; } }
    if(path.indexOf("rpc/") === 0) return rpc(path.slice(4), body || {}, me);
    var table = path, rows = T(table), params = u.searchParams;
    var reply = function(list, status){
      if(single){ if(list.length !== 1) return J({code: "PGRST116", details: "The result contains " + list.length + " rows", message: "JSON object requested, multiple (or no) rows returned"}, 406); return J(list[0], status || 200); }
      return J(list, status || 200, {"content-range": "0-" + Math.max(0, list.length - 1) + "/" + list.length});
    };
    if(method === "GET" || method === "HEAD"){
      var out = matchRows(rows, params);
      var off = Number(params.get("offset") || 0), lim = params.get("limit") ? Number(params.get("limit")) : null, range = h.get("range");
      if(range){ var r = range.split("-"); off = Number(r[0]); lim = Number(r[1]) - off + 1; }
      out = out.slice(off, lim == null ? undefined : off + lim);
      return reply(JSON.parse(JSON.stringify(out)));
    }
    if(method === "POST"){
      var list = Array.isArray(body) ? body : [body || {}], upsert = prefer.indexOf("resolution=merge-duplicates") >= 0 || prefer.indexOf("resolution=ignore-duplicates") >= 0;
      var key = params.get("on_conflict") || PK[table] || "id", saved = [];
      list.forEach(function(r){
        r = Object.assign({}, r);
        var ex = upsert && r[key] != null ? rows.find(function(x){ return String(x[key]) === String(r[key]); }) : null;
        if(ex){ if(prefer.indexOf("ignore-duplicates") < 0){ var old = Object.assign({}, ex); Object.assign(ex, r); if(table === "body_jobs") bodyStageLog(old, ex, me); } saved.push(ex); }
        else { defaults(table, r, me); rows.push(r); saved.push(r); }
      });
      persist();
      if(prefer.indexOf("return=representation") >= 0 || single) return reply(JSON.parse(JSON.stringify(saved)), 201);
      return J(null, 201);
    }
    if(method === "PATCH"){
      var hit = matchRows(rows, params);
      hit.forEach(function(r){ var old = Object.assign({}, r); Object.assign(r, body || {}); if(table === "body_jobs"){ r.updated_at = nowIso(); bodyStageLog(old, r, me); } });
      persist();
      if(prefer.indexOf("return=representation") >= 0 || single) return reply(JSON.parse(JSON.stringify(hit)));
      return J(null, 204);
    }
    if(method === "DELETE"){
      var gone = matchRows(rows, params), ids = new Set(gone);
      db[table] = rows.filter(function(r){ return !ids.has(r); });
      if(table === "work_orders") gone.forEach(function(w){ ["payments", "estimate_requests", "worksheets", "customer_links", "wo_costs"].forEach(function(t){ db[t] = T(t).filter(function(x){ return x.wo_id !== w.id; }); }); });
      if(table === "body_jobs") gone.forEach(function(j){ ["body_parts", "body_photos", "body_time", "body_events"].forEach(function(t){ db[t] = T(t).filter(function(x){ return x.job_id !== j.id; }); }); });
      persist();
      if(prefer.indexOf("return=representation") >= 0) return reply(gone);
      return J(null, 204);
    }
    return J({message: "Not supported in the demo"}, 400);
  }

  function rpc(name, a, me){
    var ok = function(x){ persist(); return J(Object.assign({ok: true}, x || {})); };
    var wo = function(id){ return T("work_orders").find(function(w){ return w.id === id; }); };
    if(name === "tech_set_status"){ var w = wo(a.p_id); if(!w) return J({error: "not_found"});
      w.status = a.p_status; w.done = a.p_status === "completed"; w.completed_at = a.p_status === "completed" ? (w.completed_at || Date.now()) : null; w.updated_at = nowIso();
      if(a.p_status === "completed") T("job_time").forEach(function(t){ if(t.job_id === w.id && !t.end_ms) t.end_ms = Date.now(); });
      return ok(); }
    if(name === "delete_work_order"){ if(!a.p_reason || String(a.p_reason).trim().length < 5) return J({error: "reason_required"}); var w2 = wo(a.p_id); if(!w2) return J({error: "not_found"});
      T("deleted_work_orders").push(defaults("deleted_work_orders", {wo_id: w2.id, wo_number: w2.number, reason: a.p_reason, deleted_by: me, data: {work_order: w2}}, me));
      db.work_orders = T("work_orders").filter(function(x){ return x !== w2; }); return ok(); }
    if(name === "body_tech_update"){ var j = T("body_jobs").find(function(x){ return x.id === a.p_id; }); if(!j) return J({error: "not_found"});
      var order = ["teardown", "body", "prep", "paint", "reassembly", "detail", "qc"];
      if(a.p_checks && typeof a.p_checks === "object") j.checks = Object.assign({}, j.checks || {}, a.p_checks);
      if(a.p_next){ var i = order.indexOf(j.stage); if(i < 0) return J({error: "stage_locked"}); if(a.p_next !== (order[i + 1] || "ready")) return J({error: "bad_stage"});
        T("body_time").forEach(function(t){ if(t.job_id === j.id && !t.end_at) t.end_at = nowIso(); }); var old = Object.assign({}, j); j.stage = a.p_next; bodyStageLog(old, j, me); }
      return ok(); }
    if(name === "close_job_line") return ok();
    if(/^set_/.test(name)){ var s = T("shop_settings")[0] || (db.shop_settings = [{id: 1}])[0];
      Object.keys(a).forEach(function(k){ s[k.replace(/^p_/, "")] = a[k]; }); return ok(); }
    if(name === "tech_set_vehicle_photos"){ var v = T("vehicles").find(function(x){ return x.id === a.p_vehicle || x.id === a.p_id; }); if(v){ Object.keys(a).forEach(function(k){ if(k !== "p_id" && k !== "p_vehicle") v[k.replace(/^p_/, "")] = a[k]; }); } return ok(); }
    return ok();
  }

  function fns(name, body, me){
    if(name === "login"){
      var n = String(body.name || "").trim().toLowerCase(), pw = String(body.password || "");
      var p = T("profiles").find(function(x){ return x.active && x.login === n; }), pin = p && T("team_pins").find(function(x){ return x.user_id === p.id; });
      if(!p || !pin || pin.pin !== pw) return J({error: "wrong"});
      var s = session(p.id); return J({access_token: s.access_token, refresh_token: s.refresh_token, must_change: false});
    }
    if(name === "vin-decode") return J({error: "VIN lookup isn't available in the demo. Type the vehicle in by hand."});
    if(name === "qbo") return J({error: "QuickBooks isn't connected in the demo."});
    if(name === "team-admin") return J({error: "Adding or changing logins is turned off in the demo."});
    return J({error: "Not available in the demo."});
  }

  async function storage(url, init){
    var u = new URL(url), p = u.pathname.split("/storage/v1/")[1], method = (init.method || "GET").toUpperCase();
    if(p.indexOf("object/public/deploy/") === 0) return realFetch(url, init);
    var m;
    if(method === "POST" && (m = p.match(/^object\/sign\/([^/]+)$/))){ var b = JSON.parse(init.body || "{}");
      return J((b.paths || []).map(function(x){ return {path: x, signedURL: "/demo-file/" + m[1] + "/" + x, error: null}; })); }
    if(method === "POST" && (m = p.match(/^object\/sign\/([^/]+)\/(.+)$/))) return J({signedURL: "/demo-file/" + m[1] + "/" + m[2]});
    if((method === "POST" || method === "PUT") && (m = p.match(/^object\/([^/]+)\/(.+)$/))){
      var blob = init.body instanceof Blob ? init.body : (init.body instanceof FormData ? init.body.get("") || [...init.body.values()].find(function(v){ return v instanceof Blob; }) : new Blob([init.body || ""]));
      var dataUrl = await new Promise(function(res){ var r = new FileReader(); r.onload = function(){ res(r.result); }; r.readAsDataURL(blob); });
      files[m[1] + "/" + decodeURIComponent(m[2])] = dataUrl; persist();
      return J({Key: m[1] + "/" + m[2], Id: uuid()});
    }
    if(method === "DELETE"){ var bb = {}; try{ bb = JSON.parse(init.body || "{}"); }catch(e){}
      var bucket = (p.match(/^object\/([^/]+)/) || [])[1]; (bb.prefixes || []).forEach(function(x){ delete files[bucket + "/" + x]; }); persist(); return J([]); }
    return J({message: "Not available in the demo"}, 400);
  }
  window.__citeaDemoFile = function(bucket, path){ return files[bucket + "/" + path] || ""; };

  window.fetch = function(input, init){
    var url = typeof input === "string" ? input : input.url; init = init || {};
    if(typeof input !== "string" && !init.method){ init = {method: input.method, headers: input.headers, body: init.body}; }
    if(url.indexOf(SB) !== 0) return realFetch(input, init);
    var path = url.slice(SB.length), me = uidFrom(new Headers(init.headers || {}));
    try{
      if(path.indexOf("/rest/v1/") === 0) return rest(url, init, me);
      if(path.indexOf("/functions/v1/") === 0){ var nm = path.split("/functions/v1/")[1].split(/[/?]/)[0]; var b = {}; try{ b = JSON.parse(init.body || "{}"); }catch(e){} return fns(nm, b, me); }
      if(path.indexOf("/auth/v1/") === 0){
        if(path.indexOf("/auth/v1/token") === 0){ var bd = {}; try{ bd = JSON.parse(init.body || "{}"); }catch(e){} var id = String(bd.refresh_token || "").replace(/^demo-/, ""); if(!id || !T("profiles").some(function(x){ return x.id === id; })) return J({error: "invalid_grant", error_description: "Demo session ended"}, 400); return J(session(id)); }
        if(path.indexOf("/auth/v1/user") === 0){ if(!me) return J({message: "not signed in"}, 401); if((init.method || "GET").toUpperCase() === "PUT") return J(user(me)); return J(user(me)); }
        if(path.indexOf("/auth/v1/logout") === 0) return Promise.resolve(new Response(null, {status: 204}));
        return J({});
      }
      if(path.indexOf("/storage/v1/") === 0) return storage(url, init);
    }catch(e){ return J({message: String(e && e.message || e)}, 500); }
    return J({message: "Not available in the demo"}, 404);
  };

  // live updates: a pretend socket that accepts every subscription (the demo has no other users)
  var RealWS = window.WebSocket;
  function FakeWS(url){ var self = this; this.url = url; this.readyState = 0; this.protocol = ""; this.extensions = ""; this.bufferedAmount = 0; this.binaryType = "blob";
    setTimeout(function(){ self.readyState = 1; self.onopen && self.onopen({type: "open"}); self.dispatch("open", {type: "open"}); }, 30); this._l = {}; }
  FakeWS.CONNECTING = 0; FakeWS.OPEN = 1; FakeWS.CLOSING = 2; FakeWS.CLOSED = 3;
  FakeWS.prototype.addEventListener = function(t, f){ (this._l[t] = this._l[t] || []).push(f); };
  FakeWS.prototype.removeEventListener = function(t, f){ this._l[t] = (this._l[t] || []).filter(function(x){ return x !== f; }); };
  FakeWS.prototype.dispatch = function(t, e){ (this._l[t] || []).forEach(function(f){ f(e); }); };
  FakeWS.prototype.send = function(raw){ var self = this, m; try{ m = JSON.parse(raw); }catch(e){ return; }
    var isArr = Array.isArray(m), msg = isArr ? {join_ref: m[0], ref: m[1], topic: m[2], event: m[3], payload: m[4]} : m;
    var resp = {status: "ok", response: {}};
    if(msg.event === "phx_join"){ var pc = ((msg.payload || {}).config || {}).postgres_changes || []; resp.response = {postgres_changes: pc.map(function(c, i){ return Object.assign({id: i + 1}, c); })}; }
    var out = isArr ? [msg.join_ref, msg.ref, msg.topic, "phx_reply", resp] : {topic: msg.topic, event: "phx_reply", payload: resp, ref: msg.ref};
    setTimeout(function(){ var e = {data: JSON.stringify(out), type: "message"}; self.onmessage && self.onmessage(e); self.dispatch("message", e); }, 10);
  };
  FakeWS.prototype.close = function(){ this.readyState = 3; var e = {type: "close", code: 1000, reason: "", wasClean: true}; this.onclose && this.onclose(e); this.dispatch("close", e); };
  window.WebSocket = function(url, proto){ if(String(url).indexOf("supabase.co") >= 0) return new FakeWS(url); return new RealWS(url, proto); };
  ["CONNECTING", "OPEN", "CLOSING", "CLOSED"].forEach(function(k, i){ window.WebSocket[k] = i; });

  // photo links: the demo keeps uploaded photos in this browser
  window.__citeaDemoPatchClient = function(c){
    var orig = c.storage.from.bind(c.storage);
    c.storage.from = function(bucket){ var api = orig(bucket);
      var link = function(p){ return window.__citeaDemoFile(bucket, p) || ""; };
      api.createSignedUrl = function(p){ return Promise.resolve({data: {signedUrl: link(p)}, error: null}); };
      api.createSignedUrls = function(ps){ return Promise.resolve({data: ps.map(function(p){ return {path: p, signedUrl: link(p), error: null}; }), error: null}); };
      var pub = api.getPublicUrl.bind(api); api.getPublicUrl = function(p){ var d = link(p); return d ? {data: {publicUrl: d}} : pub(p); };
      return api; };
    return c;
  };
})();
