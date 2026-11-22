/* Citea Motors website: menu, cars for sale (live from the team portal), photo viewer, forms. */
(function(){
  var SB = "https://asobgojrhatjpazgwnjp.supabase.co", KEY = "sb_publishable_riv9JqsHGiE6u1ScP2TXfQ_atLGKvX9";
  var H = {apikey: KEY, Authorization: "Bearer " + KEY};
  var $ = function(s, r){ return (r || document).querySelector(s); }, $$ = function(s, r){ return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]; }); };
  var money = function(n){ return n ? "$" + Number(n).toLocaleString("en-US") : "Call for price"; };
  var mi = function(n){ return n ? Number(n).toLocaleString("en-US") + " mi" : ""; };
  var short = function(s){ return String(s || "").replace(/ Wheel Drive$/, "").replace(/^All$/, "AWD").replace(/^Rear$/, "RWD").replace(/^Front$/, "FWD").replace(/^Four$/, "4WD"); };
  var title = function(c){ return [c.year, c.make, c.model].filter(Boolean).join(" "); };
  var carUrl = function(c){ return "car.html?id=" + c.id + "#" + (title(c) + " " + (c.trim || "")).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); };

  // menu
  var mb = $(".menu"), nav = $(".top nav");
  if (mb) mb.onclick = function(){ var o = nav.classList.toggle("open"); mb.setAttribute("aria-expanded", o); };
  var here = location.pathname.split("/").pop() || "index.html";
  $$(".top nav a").forEach(function(a){ if (a.getAttribute("href") === here || (here === "car.html" && a.getAttribute("href") === "cars.html")) a.setAttribute("aria-current", "page"); });
  $$("[data-year]").forEach(function(e){ e.textContent = new Date().getFullYear(); });

  function getCars(q){
    return fetch(SB + "/rest/v1/listings?select=*&status=in.(for_sale,pending)&order=sort.asc,created_at.desc" + (q || ""), {headers: H})
      .then(function(r){ if (!r.ok) throw new Error(r.status); return r.json(); });
  }
  function card(c){
    var ph = (c.photos || [])[0];
    var sp = [c.transmission && c.transmission.replace("Shiftable ", ""), short(c.drivetrain), c.ext_color].filter(Boolean).map(function(s){ return "<span>" + esc(s) + "</span>"; }).join("");
    return '<a class="car" href="' + carUrl(c) + '"><div class="ph" style="background-image:url(\'' + esc(ph || "") + '\')">' + (c.status === "pending" ? '<span class="flag">Sale pending</span>' : "") + '</div>'
      + '<div class="bd"><h3>' + esc(title(c)) + '</h3><div class="trim">' + esc(c.trim || "") + '</div><div class="specs">' + sp + '</div>'
      + '<div class="row"><span class="price">' + money(c.price) + '</span>' + (c.miles ? '<span class="miles">' + mi(c.miles) + '</span>' : "") + '</div></div></a>';
  }
  var fail = function(el){ el.innerHTML = '<div class="empty">We couldn\'t load our cars right now. Call <a href="tel:+17029072107">(702) 907-2107</a> and we\'ll tell you what\'s in stock.</div>'; };

  // home: featured cars
  var feat = $("#featured");
  if (feat) getCars("&limit=6").then(function(cs){
    cs.sort(function(a, b){ return (b.featured - a.featured) || 0; });
    feat.innerHTML = cs.length ? cs.slice(0, 6).map(card).join("") : '<div class="empty">New cars are on the way. Check back soon.</div>';
    var hp = $("#heroPhoto"), f = cs.filter(function(c){ return (c.photos || []).length; })[0];
    if (hp && f){ hp.style.backgroundImage = "url('" + f.photos[0] + "')"; var t = $("#heroTag"); if (t) t.innerHTML = '<a href="' + carUrl(f) + '">' + esc(title(f) + " " + (f.trim || "")) + " · " + money(f.price) + "</a>"; }
  }).catch(function(){ fail(feat); });

  // inventory
  var inv = $("#inventory");
  if (inv) getCars().then(function(all){
    var st = {body: "", make: "", sort: "new"};
    var bodies = Array.from(new Set(all.map(function(c){ return c.body; }).filter(Boolean))).sort();
    var makes = Array.from(new Set(all.map(function(c){ return c.make; }).filter(Boolean))).sort();
    $("#fBody").innerHTML = '<button class="chip" data-b="" aria-pressed="true">All</button>' + bodies.map(function(b){ return '<button class="chip" data-b="' + esc(b) + '" aria-pressed="false">' + esc(b) + "</button>"; }).join("");
    $("#fMake").innerHTML = '<option value="">All makes</option>' + makes.map(function(m){ return "<option>" + esc(m) + "</option>"; }).join("");
    var draw = function(){
      var cs = all.filter(function(c){ return (!st.body || c.body === st.body) && (!st.make || c.make === st.make); });
      var s = {new: function(a, b){ return a.sort - b.sort; }, low: function(a, b){ return (a.price || 9e9) - (b.price || 9e9); }, high: function(a, b){ return (b.price || 0) - (a.price || 0); }, miles: function(a, b){ return (a.miles || 9e9) - (b.miles || 9e9); }, year: function(a, b){ return (b.year || 0) - (a.year || 0); }}[st.sort];
      cs.sort(s);
      $("#fCount").textContent = cs.length + (cs.length === 1 ? " car" : " cars");
      inv.innerHTML = cs.length ? cs.map(card).join("") : '<div class="empty">Nothing matches. Try another filter.</div>';
    };
    $$("#fBody .chip").forEach(function(b){ b.onclick = function(){ st.body = b.dataset.b; $$("#fBody .chip").forEach(function(x){ x.setAttribute("aria-pressed", x === b); }); draw(); }; });
    $("#fMake").onchange = function(e){ st.make = e.target.value; draw(); };
    $("#fSort").onchange = function(e){ st.sort = e.target.value; draw(); };
    draw();
  }).catch(function(){ fail(inv); });

  // listing description: keep line breaks, bullets and **bold**
  function descHTML(t){
    var out = [], list = false;
    String(t || "").split(/\n/).forEach(function(l){
      l = l.trim(); var m = l.match(/^[-*•]\s+(.*)/);
      var inl = function(s){ return esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>"); };
      if (m){ if (!list){ out.push("<ul>"); list = true; } out.push("<li>" + inl(m[1]) + "</li>"); return; }
      if (list){ out.push("</ul>"); list = false; }
      if (l) out.push("<p>" + inl(l) + "</p>");
    });
    if (list) out.push("</ul>");
    return out.join("");
  }

  // photo viewer (swipe, arrows, keys)
  function viewer(urls, i){
    var el = document.createElement("div"); el.className = "lightbox"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Photos");
    el.innerHTML = '<img alt=""><button class="x" aria-label="Close">×</button><button class="l" aria-label="Previous">‹</button><button class="r" aria-label="Next">›</button><div class="n"></div>';
    var img = $("img", el), go = function(n){ i = (n + urls.length) % urls.length; img.src = urls[i]; $(".n", el).textContent = (i + 1) + " / " + urls.length; };
    var close = function(){ el.remove(); document.removeEventListener("keydown", key); document.body.style.overflow = ""; };
    var key = function(e){ if (e.key === "Escape") close(); if (e.key === "ArrowLeft") go(i - 1); if (e.key === "ArrowRight") go(i + 1); };
    $(".x", el).onclick = close; $(".l", el).onclick = function(){ go(i - 1); }; $(".r", el).onclick = function(){ go(i + 1); };
    el.onclick = function(e){ if (e.target === el) close(); };
    swipe(el, function(d){ go(i + d); });
    document.addEventListener("keydown", key); document.body.style.overflow = "hidden"; document.body.appendChild(el); go(i);
  }
  function swipe(el, cb){
    var x0 = null, y0 = null;
    el.addEventListener("touchstart", function(e){ x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, {passive: true});
    el.addEventListener("touchend", function(e){ if (x0 == null) return; var dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0; x0 = null; if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)){ el.dataset.swiped = "1"; setTimeout(function(){ el.dataset.swiped = ""; }, 300); cb(dx < 0 ? 1 : -1); } });
  }

  // vehicle page
  var vp = $("#vehicle");
  if (vp){
    var id = new URLSearchParams(location.search).get("id");
    (id ? getCars("&id=eq." + encodeURIComponent(id)) : Promise.resolve([])).then(function(r){
      var c = r[0];
      if (!c){ vp.innerHTML = '<div class="empty">This car has been sold or is no longer listed. <a href="cars.html">See the cars we have now</a>.</div>'; return; }
      var name = title(c), ps = c.photos || [], i = 0;
      document.title = name + " " + (c.trim || "") + " for sale in Las Vegas | Citea Motors";
      var md = $('meta[name="description"]'); if (md) md.setAttribute("content", name + " " + (c.trim || "") + ", " + mi(c.miles) + ", " + money(c.price) + ". For sale at Citea Motors, Las Vegas, NV.");
      var rows = [["Price", '<span class="mono">' + money(c.price) + "</span>"], ["Mileage", '<span class="mono">' + mi(c.miles) + "</span>"], ["Engine", esc(c.engine)], ["Transmission", esc(c.transmission)], ["Drivetrain", esc(c.drivetrain)], ["Body", esc(c.body)], ["Exterior", esc(c.ext_color)], ["Interior", esc(c.int_color)], ["Fuel", esc(c.fuel)], ["MPG", esc(c.mpg)], ["VIN", '<span class="mono">' + esc(c.vin) + "</span>"], ["Stock #", '<span class="mono">' + esc(c.stock) + "</span>"]].filter(function(x){ return x[1] && x[1].replace(/<[^>]+>/g, "").trim(); });
      vp.innerHTML = '<div class="vgrid"><div class="gal">' + (ps.length ? '<div class="main"><img alt="' + esc(name) + '"><button class="nav prev" aria-label="Previous photo">‹</button><button class="nav next" aria-label="Next photo">›</button><span class="num"></span></div><div class="thumbs">' + ps.map(function(u, k){ return '<button style="background-image:url(\'' + esc(u) + '\')" data-k="' + k + '" aria-label="Photo ' + (k + 1) + '"></button>'; }).join("") + "</div>" : '<div class="main"></div>')
        + "</div>"
        + '<div class="desc"><p class="eyebrow">About this car</p>' + descHTML(c.description) + "</div>"
        + '<div class="vhead"><p class="eyebrow">' + (c.status === "pending" ? "Sale pending" : "For sale") + '</p><h1>' + esc(name) + '</h1><div class="trim">' + esc([c.trim, c.body].filter(Boolean).join(" · ")) + '</div>'
        + '<div class="btns" style="align-items:center"><span class="price big">' + money(c.price) + '</span>' + (c.miles ? '<span class="miles" style="height:52px">' + mi(c.miles) + "</span>" : "") + "</div>"
        + '<table class="specs-t">' + rows.map(function(x){ return "<tr><th>" + x[0] + "</th><td>" + x[1] + "</td></tr>"; }).join("") + "</table>"
        + '<div class="btns"><a class="btn" href="tel:+17029072107">Call (702) 907-2107</a><a class="btn ghost" href="sms:+17029072107?&body=' + encodeURIComponent("Hi, is the " + name + " " + (c.trim || "") + " still available?") + '">Text us</a></div>'
        + '<div class="box"><h3 style="margin-bottom:6px">Check availability or book a test drive</h3><p class="muted" style="font-size:14px">We\'ll get back to you the same day during business hours.</p>'
        + '<form class="form" data-kind="availability" data-listing="' + esc(c.id) + '" data-about="' + esc(name + " " + (c.trim || "") + " (VIN " + (c.vin || "") + ")") + '">'
        + '<div class="two"><div><label for="n1">Name</label><input id="n1" name="name" autocomplete="name" required></div><div><label for="p1">Phone</label><input id="p1" name="phone" type="tel" autocomplete="tel" required></div></div>'
        + '<div><label for="e1">Email (optional)</label><input id="e1" name="email" type="email" autocomplete="email"></div>'
        + '<div><label for="m1">Message</label><textarea id="m1" name="message">Is the ' + esc(name + " " + (c.trim || "")) + ' still available? I\'d like to come see it.</textarea></div>'
        + '<label class="chk-inline" style="display:flex;gap:10px;align-items:center;text-transform:none;letter-spacing:0;font-weight:500;font-size:14px"><input type="checkbox" name="has_trade_in" value="yes" style="width:auto"> I have a car to trade in</label>'
        + CONSENT + '<button class="btn" type="submit">Send</button></form></div>'
        + '<p class="asis">All cars are sold as is, with no warranty unless stated in writing. Price excludes tax, title and registration.</p></div></div>';
      if (ps.length){
        var main = $(".gal .main", vp), im = $("img", main), num = $(".num", vp);
        var show = function(k){ i = (k + ps.length) % ps.length; im.src = ps[i]; num.textContent = (i + 1) + " / " + ps.length; $$(".thumbs button", vp).forEach(function(b, n){ if (n === i) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current"); }); };
        $(".prev", vp).onclick = function(e){ e.stopPropagation(); show(i - 1); }; $(".next", vp).onclick = function(e){ e.stopPropagation(); show(i + 1); };
        $$(".thumbs button", vp).forEach(function(b){ b.onclick = function(){ show(+b.dataset.k); }; });
        main.onclick = function(){ if (!main.dataset.swiped) viewer(ps, i); };
        swipe(main, function(d){ show(i + d); });
        show(0);
      }
      bindForms(vp);
      // search engines: describe the car
      var ld = document.createElement("script"); ld.type = "application/ld+json";
      ld.textContent = JSON.stringify({"@context": "https://schema.org", "@type": "Car", name: name + " " + (c.trim || ""), brand: c.make, model: c.model, vehicleModelDate: String(c.year), vehicleIdentificationNumber: c.vin, color: c.ext_color, image: ps, mileageFromOdometer: {"@type": "QuantitativeValue", value: c.miles, unitCode: "SMI"}, offers: {"@type": "Offer", price: c.price, priceCurrency: "USD", availability: "https://schema.org/InStock", seller: {"@type": "AutoDealer", name: "Citea Motors"}}});
      document.head.appendChild(ld);
    }).catch(function(){ fail(vp); });
  }

  // forms -> team portal (Leads)
  var CONSENT = '<p class="consent">By sending, you agree that Citea Motors may call or text you at the number you give about this request. Message and data rates may apply. We never sell your information.</p>';
  $$("[data-consent]").forEach(function(e){ e.outerHTML = CONSENT; });
  function bindForms(root){
    $$("form[data-kind]", root).forEach(function(f){
      if (f.dataset.bound) return; f.dataset.bound = "1";
      if (!$(".hp", f)) f.insertAdjacentHTML("afterbegin", '<div class="hp" aria-hidden="true"><label>Leave this empty<input name="website" tabindex="-1" autocomplete="off"></label></div>');
      f.onsubmit = function(e){
        e.preventDefault();
        var fd = new FormData(f), data = {}, btn = $("button[type=submit]", f), er = $(".err", f);
        fd.forEach(function(v, k){ if (["name", "phone", "email", "message", "website"].indexOf(k) < 0){ data[k] = data[k] ? data[k] + ", " + v : v; } });
        if (f.dataset.about) data.vehicle = f.dataset.about;
        data.page = location.pathname.split("/").pop() || "index.html";
        var phone = String(fd.get("phone") || ""), email = String(fd.get("email") || "");
        var say = function(t){ if (!er){ er = document.createElement("p"); er.className = "err"; btn.before(er); } er.textContent = t; };
        if (String(fd.get("name") || "").trim().length < 2) return say("Please add your name.");
        if (phone.replace(/\D/g, "").length < 10 && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return say("Please add a phone number or email so we can reach you.");
        btn.disabled = true; btn.textContent = "Sending…";
        fetch(SB + "/rest/v1/rpc/submit_lead", {method: "POST", headers: Object.assign({"Content-Type": "application/json"}, H), body: JSON.stringify({p_kind: f.dataset.kind, p_name: fd.get("name") || "", p_phone: phone, p_email: email, p_message: fd.get("message") || "", p_data: data, p_listing: f.dataset.listing || null, p_hp: fd.get("website") || ""})})
          .then(function(r){ return r.json(); }).then(function(r){
            if (!r || !r.ok) throw new Error(r && r.error);
            f.outerHTML = '<div class="ok">Thanks, ' + esc(String(fd.get("name")).split(" ")[0]) + '. We got your message and will reach out soon. Need us now? Call <a href="tel:+17029072107">(702) 907-2107</a>.</div>';
          }).catch(function(err){
            btn.disabled = false; btn.textContent = "Send";
            say(err && err.message === "too_many" ? "We already got your message. We'll be in touch soon." : "That didn't go through. Please try again or call (702) 907-2107.");
          });
      };
    });
  }
  bindForms(document);
})();
