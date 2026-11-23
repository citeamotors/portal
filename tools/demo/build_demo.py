#!/usr/bin/env python3
"""Builds site/demo/: a copy of the team portal that runs on made-up sample data inside the visitor's
browser (tools/demo/demo-mock.js). It never talks to the real Citea Motors database.
Run from the repo root: python3 tools/demo/build_demo.py"""
import json, re, shutil, datetime, os, random, uuid

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "site", "index.html")
OUT = os.path.join(ROOT, "site", "demo")
HERE = os.path.dirname(os.path.abspath(__file__))
random.seed(7)
today = datetime.date.today()
now = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None).replace(microsecond=0)
iso = lambda d: d.isoformat() + "Z" if isinstance(d, datetime.datetime) else d.isoformat()
day = lambda n: (today + datetime.timedelta(days=n)).isoformat()
ms = lambda dt: int(dt.replace(tzinfo=datetime.timezone.utc).timestamp() * 1000)
U = lambda: str(uuid.uuid4())

# ---------- people (all made up) ----------
MGR, TECH, ALEX, SAM, CHRIS = U(), U(), U(), U(), U()
profiles = [
    dict(id=MGR, name="Demo Manager", login="demo.manager", role="gm", role_id="manager", active=True),
    dict(id=TECH, name="Demo Tech", login="demo.tech", role="tech", role_id="tech", active=True),
    dict(id=ALEX, name="Alex Rivera", login="alex", role="tech", role_id="tech", active=True),
    dict(id=CHRIS, name="Chris Lee", login="chris", role="tech", role_id="tech", active=True),
    dict(id=SAM, name="Sam Ortiz", login="sam", role="tech", role_id="body", active=True),
]
for p in profiles:
    p.update(must_change=False, failed_attempts=0, locked_until=None, created_at=iso(now - datetime.timedelta(days=60)))
team_pins = [dict(user_id=MGR, pin="demo1234"), dict(user_id=TECH, pin="demo1234"), dict(user_id=SAM, pin="demo1234")]
team_roles = [
    dict(id="owner", name="Owner", access="owner", perms={"cars": False}, is_system=True, sort=1),
    dict(id="manager", name="Manager", access="gm", perms={"cars": False}, is_system=False, sort=2),
    dict(id="tech", name="Technician", access="tech", perms={"cars": "repair", "pages": {"jobs": True, "clock": True, "training": True}}, is_system=False, sort=3),
    dict(id="body", name="Body Shop Tech", access="tech", perms={"cars": "body", "pages": {"jobs": True, "clock": True, "training": True, "bodyjobs": True}}, is_system=False, sort=4),
]
shop_settings = [dict(id=1, rate_std=150, rate_tesla=170, tax=0.08375, open_time="07:00", close_time="17:00", pay_url="", zelle_to="(555) 010-0000",
                      snap_url=None, affirm_url=None, card_fee_pct=0, cash_discount_pct=0, square_app_id=None,
                      body_rates={"body": 65, "refinish": 65, "frame": 85, "mech": 150, "materials": 42})]

# ---------- customers and vehicles (made up; 555 numbers) ----------
C = [("Jamie Carter", "(555) 201-4410", "jamie.carter@example.com"), ("Morgan Diaz", "(555) 201-7783", "morgan.diaz@example.com"),
     ("Taylor Brooks", "(555) 201-3392", ""), ("Riley Nguyen", "(555) 201-9024", "riley.n@example.com"),
     ("Jordan Patel", "(555) 201-5567", ""), ("Casey Kim", "(555) 201-6638", "casey.kim@example.com"),
     ("Avery Johnson", "(555) 201-2281", ""), ("Drew Martinez", "(555) 201-8156", "drew.m@example.com")]
V = [("2021", "Tesla", "Model 3", "5YJ3E1EA1MF000101", "38,412"), ("2016", "Subaru", "WRX STI", "JF1VA2M60G9800102", "91,207"),
     ("2018", "Honda", "Accord", "1HGCV1F30JA000103", "64,980"), ("2019", "Toyota", "Tacoma", "3TMCZ5AN0KM000104", "72,115"),
     ("2017", "BMW", "340i", "WBA8B3G50HN000105", "58,640"), ("2020", "Ford", "F-150", "1FTEW1E50LF000106", "81,333"),
     ("2015", "Mitsubishi", "Lancer Evolution", "JA32W8FV5FU000107", "77,902"), ("2022", "Tesla", "Model Y", "7SAYGDEE0NF000108", "21,456")]
customers, vehicles = [], []
for i, (n, ph, em) in enumerate(C):
    cid, vid = f"dc{i+1}", f"dv{i+1}"
    customers.append(dict(id=cid, name=n, phone=ph, email=em, notes="", extra={}, is_sample=True, created_at=iso(now - datetime.timedelta(days=40 - i))))
    y, mk, md, vin, mi = V[i]
    vehicles.append(dict(id=vid, customer_id=cid, year=y, make=mk, model=md, vin=vin, engine="", mileage=mi, plate=f"DEMO{i+1:02d}", photo=None, extra={}, is_sample=True, created_at=iso(now - datetime.timedelta(days=40 - i))))

# ---------- work orders ----------
def wo(n, ci, title, status, labor, parts, assignee, d=0, done_hrs=None, prio="normal", notes=""):
    c, v = customers[ci], vehicles[ci]
    row = dict(id=U(), number=n, date=day(d), title=title, status=status, customer_id=c["id"], vehicle_id=v["id"], year=v["year"], make=v["make"], model=v["model"],
               vin=v["vin"], mileage=v["mileage"], engine="", plate=v["plate"], labor=labor, parts=parts, rate=170 if v["make"] == "Tesla" else 150,
               worksheet="", promised="", assignee=assignee, priority=prio, notes=notes, done=status in ("completed", "picked_up"),
               completed_at=ms(now - datetime.timedelta(hours=done_hrs)) if done_hrs is not None else None, extra={}, is_sample=True, techs=[],
               created_at=iso(now - datetime.timedelta(days=-d + 1)), updated_at=iso(now))
    return row
P = lambda desc, qty, price: dict(lid=U()[:10], desc=desc, qty=qty, price=price, partId=None)
work_orders = [
    wo(1001, 0, "A/C not blowing cold", "estimate", [["Diagnose A/C system", 1.0], ["Replace A/C compressor", 4.0]], [P("A/C compressor", 1, 1095.00)], None, 0, notes="Customer says it started last week."),
    wo(1002, 1, "Front brakes and rotors", "approved", [["Front brake pads and rotors", 1.8]], [P("Front brake pads", 1, 139.99), P("Front rotors (pair)", 1, 248.00)], TECH, 0),
    wo(1003, 2, "Check engine light, misfire", "in_progress", [["Diagnose check engine light", 1.0], ["Replace ignition coil cyl 3", 0.5]], [P("Ignition coil", 1, 89.50)], TECH, 0, prio="high"),
    wo(1004, 3, "Oil service and tire rotation", "waiting_parts", [["Oil and filter change", 0.5], ["Rotate tires", 0.4]], [P("Synthetic oil 0W-20 (6 qt)", 1, 54.00), P("Oil filter", 1, 14.50)], ALEX, 0),
    wo(1005, 4, "Clunk over bumps", "estimate", [["Inspect front suspension", 0.8], ["Replace front lower control arms", 2.6]], [P("Front lower control arm", 2, 186.00)], None, 0),
    wo(1006, 5, "Alignment", "completed", [["Four-wheel alignment", 1.0]], [], CHRIS, -1, done_hrs=20),
    wo(1007, 6, "Clutch slipping", "picked_up", [["Replace clutch and flywheel", 7.5]], [P("Clutch kit", 1, 689.00), P("Flywheel", 1, 412.00)], ALEX, -4, done_hrs=80),
    wo(1008, 7, "Suspension noise, 12V battery", "approved", [["Diagnose suspension noise", 1.0], ["Replace 12V battery", 0.6]], [P("12V battery", 1, 165.00)], CHRIS, 0),
]
def total(w):
    lab = sum(float(l[1]) * w["rate"] for l in w["labor"]); pt = sum(p["qty"] * p["price"] for p in w["parts"])
    return round(lab + pt + round(pt * 0.08375, 2), 2)
payments = [dict(id=U(), wo_id=w["id"], amount=total(w), fee=0, discount=0, method=m, kind="payment", note=None, received_by=MGR, created_at=iso(now - datetime.timedelta(hours=h)), voided_at=None)
            for w, m, h in [(work_orders[5], "credit", 19), (work_orders[6], "zelle", 79)]]
appointments = [dict(id=U(), date=day(1), start="08:00", mins=60, customer_id=customers[1]["id"], vehicle_id=vehicles[1]["id"], vehicle="2016 Subaru WRX STI", concern="Pick up after brakes", tech=None, type="pickup", status="scheduled", notes="", wo_id=None, extra={}, is_sample=True),
                dict(id=U(), date=day(2), start="09:30", mins=90, customer_id=customers[4]["id"], vehicle_id=vehicles[4]["id"], vehicle="2017 BMW 340i", concern="Clunk over bumps", tech=None, type="dropoff", status="scheduled", notes="", wo_id=None, extra={}, is_sample=True)]
start = datetime.datetime.combine(today, datetime.time(14, 5))
clock_in = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None).replace(second=0, microsecond=0) - datetime.timedelta(hours=3)
punches = [dict(id=U(), user_id=u, in_ms=ms(clock_in - datetime.timedelta(minutes=k)), out_ms=None, geo=None) for u, k in [(ALEX, 0), (CHRIS, 12), (SAM, 20)]]

# ---------- website: cars for sale and leads (made up, no photos) ----------
listings = [dict(id=U(), status="for_sale", year=2018, make="Subaru", model="WRX", trim="Premium", body="Sedan", price=17900, miles=68210, vin="JF1VA1C60J9800201", stock="D201",
                 engine="2.0L H4 Turbo 268hp", transmission="6-Speed Manual", drivetrain="All Wheel Drive", ext_color="Crystal White Pearl", int_color="Black", fuel="Gasoline", mpg="21 City - 27 Hwy",
                 description="Demo listing. Clean title, one owner, new tires.\n- Apple CarPlay\n- Heated seats\n- Backup camera", photos=[], featured=True, sort=0, created_at=iso(now), updated_at=iso(now)),
            dict(id=U(), status="draft", year=2015, make="Honda", model="Civic", trim="Si", body="Coupe", price=13500, miles=99402, vin="2HGFG4A56FH000202", stock="D202",
                 engine="2.4L I4 205hp", transmission="6-Speed Manual", drivetrain="Front Wheel Drive", ext_color="Rallye Red", int_color="Black", fuel="Gasoline", mpg="22 City - 31 Hwy",
                 description="Demo draft listing. Add photos and set it to For sale.", photos=[], featured=False, sort=1, created_at=iso(now), updated_at=iso(now))]
leads = [dict(id=1, kind="availability", name="Pat Gomez", phone="(555) 301-1122", email="", message="Is the WRX still available? Can I see it Saturday?", data={"vehicle": "2018 Subaru WRX Premium", "has_trade_in": "yes"}, listing_id=listings[0]["id"], status="new", created_at=iso(now - datetime.timedelta(hours=3))),
         dict(id=2, kind="service", name="Lee Turner", phone="(555) 301-4455", email="lee@example.com", message="Squeal when braking.", data={"services": "Brakes", "year": "2019", "make": "Toyota", "model": "Camry"}, listing_id=None, status="new", created_at=iso(now - datetime.timedelta(hours=26)))]

# ---------- collision jobs ----------
def bj(n, ci, stage, payer, est, impact, color, damage, ins=None, days=1, **kw):
    v, c = vehicles[ci], customers[ci]
    r = dict(id=U(), number=n, stage=stage, on_hold=False, hold_reason=None, priority="normal", customer_id=c["id"], cust_name=c["name"], cust_phone=c["phone"], cust_email=c["email"],
             vehicle_id=v["id"], year=v["year"], make=v["make"], model=v["model"], vin=v["vin"], color=color, paint_code=kw.pop("paint", ""), mileage=v["mileage"], plate=v["plate"], drivable=True,
             payer=payer, insurer=None, claim_no=None, policy_no=None, adjuster=None, adjuster_phone=None, adjuster_email=None, deductible=None, damage=damage, impact=impact,
             body_tech=SAM, painter=SAM, prep_tech=None, estimate=est, rates=shop_settings[0]["body_rates"], checks={}, notes="", approved_at=None, delivered_at=None,
             stage_at=iso(now - datetime.timedelta(days=days)), created_by=MGR, created_at=iso(now - datetime.timedelta(days=days + 2)), updated_at=iso(now))
    if ins: r.update(ins)
    r.update(kw); return r
L = lambda op, desc, **k: dict(dict(id=U()[:8], op=op, desc=desc, qty=1, supp=0), **k)
body_jobs = [
    bj(2001, 2, "teardown", "insurance", [L("Repl", "Rear bumper cover", partNo="04715-TVA-A00ZZ", part=389.0, body=1.6, refn=2.8), L("Rpr", "Trunk lid", body=2.0, refn=2.2), L("Repl", "Left tail lamp", partNo="33550-TVA-A01", part=212.0, body=0.3)],
       ["Rear", "Trunk / liftgate"], "Lunar Silver", "Rear-ended at a light.", {"insurer": "Example Mutual", "claim_no": "EX-44718", "adjuster": "Dana Wells", "adjuster_phone": "(555) 401-1000", "deductible": 500}, days=1, paint="NH-830M"),
    bj(2002, 5, "parts", "customer", [L("Repl", "Front bumper cover", part=455.0, body=1.8, refn=3.0), L("Repl", "Right headlamp", part=389.0, body=0.4), L("Blnd", "Right fender", refn=1.2)],
       ["Front", "Right front"], "Oxford White", "Hit a pole in a parking lot.", days=3, paint="YZ"),
    bj(2003, 0, "paint", "insurance", [L("Rpr", "Left front door", body=2.5, refn=2.6), L("Blnd", "Left rear door", refn=1.4), L("R&I", "Left front door handle", body=0.3)],
       ["Left side"], "Pearl White", "Door dent from a shopping cart.", {"insurer": "Sample Insurance Co.", "claim_no": "SIC-90213", "deductible": 1000}, days=0, painter=SAM),
]
body_parts = [dict(id=U(), job_id=body_jobs[0]["id"], line_id=body_jobs[0]["estimate"][0]["id"], descr="Rear bumper cover", part_no="04715-TVA-A00ZZ", qty=1, status="ordered", created_at=iso(now)),
              dict(id=U(), job_id=body_jobs[0]["id"], line_id=body_jobs[0]["estimate"][2]["id"], descr="Left tail lamp", part_no="33550-TVA-A01", qty=1, status="received", created_at=iso(now)),
              dict(id=U(), job_id=body_jobs[1]["id"], line_id=body_jobs[1]["estimate"][0]["id"], descr="Front bumper cover", qty=1, status="backordered", eta=day(4), created_at=iso(now)),
              dict(id=U(), job_id=body_jobs[1]["id"], line_id=body_jobs[1]["estimate"][1]["id"], descr="Right headlamp", qty=1, status="ordered", created_at=iso(now))]

inventory = [dict(id=f"di{i}", part_no=pn, description=d, location=loc, vendor=ven, qty=q, min=m, price=pr, extra={}, is_sample=True) for i, (pn, d, loc, ven, q, m, pr) in enumerate([
    ("FL-500S", "Oil filter", "A1", "Parts store", 14, 6, 9.99), ("5W30-5QT", "Synthetic oil 5W-30 (5 qt)", "A2", "Parts store", 8, 4, 38.00),
    ("BP-1001", "Front brake pads", "B1", "Parts store", 3, 2, 89.99), ("WB-22", "Wiper blade 22 in", "C3", "Parts store", 10, 4, 19.99),
    ("CAB-01", "Cabin air filter", "C1", "Parts store", 2, 3, 24.99)])]
videos = [dict(id=f"dvid{i}", title=t, url=u, required=r, created_at=iso(now)) for i, (t, u, r) in enumerate([
    ("Welcome to the shop (demo)", "https://www.youtube.com/watch?v=dQw4w9WgXcQ", True)])]

seed = {"__v": now.strftime("%Y%m%d%H%M%S"), "profiles": profiles, "team_pins": team_pins, "team_roles": team_roles, "shop_settings": shop_settings,
        "customers": customers, "vehicles": vehicles, "work_orders": work_orders, "payments": payments, "appointments": appointments, "punches": punches,
        "listings": listings, "leads": leads, "body_jobs": body_jobs, "body_parts": body_parts, "body_photos": [], "body_time": [], "body_events": [],
        "inventory": inventory, "videos": [], "job_time": [], "video_views": [], "estimate_requests": [], "worksheets": [], "customer_links": [],
        "wo_costs": [], "part_costs": [], "car_deals": [], "team_info": [], "team_pay": [], "punch_edits": [], "qbo_links": []}

# ---------- build the page ----------
s = open(SRC, encoding="utf-8").read()
def rep(a, b):
    global s
    assert s.count(a) >= 1, a[:60]
    s = s.replace(a, b, 1)
SUPA = re.search(r'<script src="https://cdn\.jsdelivr\.net/npm/@supabase/supabase-js[^"]*"></script>', s).group(0)
rep(SUPA, '<meta name="robots" content="noindex">\n<script>window.__DEMO_SEED__=' + json.dumps(seed, separators=(",", ":")).replace("</", "<\\/") + ';</script>\n'
    '<script src="demo-mock.js"></script>\n' + SUPA +
    '\n<script>(function(){var o=window.supabase.createClient;window.supabase.createClient=function(){return window.__citeaDemoPatchClient(o.apply(this,arguments));};})();</script>')
rep('storageKey:"citea-team-auth"', 'storageKey:"citea-demo-auth"')
s = re.sub(r"<title>[^<]*</title>", "<title>Citea Motors Team Portal (Demo)</title>", s, count=1)
bar = ('<div id="demoBar" style="position:fixed;left:0;right:0;bottom:0;z-index:9999;background:#C8201F;color:#fff;font:600 12.5px Montserrat,Arial,sans-serif;'
       'display:flex;gap:10px;align-items:center;justify-content:center;flex-wrap:wrap;padding:7px 12px">'
       '<span>DEMO: sample data only, kept in this browser. Logins: demo.manager / demo1234 · demo.tech / demo1234 · sam (body tech) / demo1234</span>'
       '<button type="button" onclick="if(confirm(\'Reset the demo to its starting sample data?\'))window.__citeaDemoReset()" '
       'style="background:#fff;color:#C8201F;border:0;font:inherit;padding:5px 10px;cursor:pointer">Reset demo</button></div>')
i = s.rfind("</body>"); s = s[:i] + bar + "\n" + s[i:]
os.makedirs(OUT, exist_ok=True)
open(os.path.join(OUT, "index.html"), "w", encoding="utf-8").write(s)
shutil.copy(os.path.join(HERE, "demo-mock.js"), os.path.join(OUT, "demo-mock.js"))
for f in ("favicon.ico", "favicon.svg", "apple-touch-icon.png"):
    if os.path.exists(os.path.join(ROOT, "site", f)): shutil.copy(os.path.join(ROOT, "site", f), os.path.join(OUT, f))
print("demo built:", os.path.join(OUT, "index.html"), len(s), "bytes")
