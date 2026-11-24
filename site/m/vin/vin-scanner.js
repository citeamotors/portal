/*!
 * Citea Motors VIN Scanner
 * One file, three jobs:
 *   1. VIN logic   - check digit, pulling a VIN out of surrounding text, year/make decode
 *   2. OCR engine  - text detection + recognition (PP-OCR ONNX models on onnxruntime-web)
 *   3. Scanner UI  - live camera with auto-detect, photo capture/upload, manual entry
 * The same file also runs as its own Web Worker so the camera preview never stutters.
 *
 * Portal usage:
 *   <script src="vin/vin-scanner.js"></script>
 *   VinScanner.attach(document.querySelector('#vin'), { onResult: r => ... });
 *   // or
 *   const r = await VinScanner.open();   // r = { vin, verified, decoded, source } or null
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VinScanner = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ================================================================== *
   * 1. VIN LOGIC
   * ================================================================== */
  var VIN_CHARS = '0123456789ABCDEFGHJKLMNPRSTUVWXYZ';
  var TRANS = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9, S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9 };
  var WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
  var YEAR_CODES = 'ABCDEFGHJKLMNPRSTVWXY123456789';

  function charValue(c) { return c >= '0' && c <= '9' ? c.charCodeAt(0) - 48 : TRANS[c]; }

  /** The character position 9 must hold for a North American VIN. */
  function computeCheckDigit(vin) {
    var sum = 0;
    for (var i = 0; i < 17; i++) {
      var v = charValue(vin[i]);
      if (v === undefined) return null;
      sum += v * WEIGHTS[i];
    }
    var r = sum % 11;
    return r === 10 ? 'X' : String(r);
  }

  /** Uppercase, drop spaces/punctuation, and fix the letters a VIN can never contain (I, O, Q). */
  function normalize(s) {
    return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/[IL](?=$)|I/g, '1').replace(/[OQ]/g, '0');
  }
  function isWellFormed(vin) { return /^[0-9A-HJ-NPR-Z]{17}$/.test(vin); }
  function checkDigitOk(vin) { return isWellFormed(vin) && computeCheckDigit(vin) === vin[8]; }
  function yearCharOk(vin) { return YEAR_CODES.indexOf(vin[9]) >= 0; }
  function serialOk(vin) { return /^[0-9]{4}$/.test(vin.slice(13)); }

  var COUNTRY = [
    [/^[145]/, 'United States'], [/^2/, 'Canada'], [/^3/, 'Mexico'], [/^J/, 'Japan'], [/^K/, 'South Korea'],
    [/^L/, 'China'], [/^S[A-M]/, 'United Kingdom'], [/^W/, 'Germany'], [/^VF|^VR/, 'France'], [/^VS|^VW/, 'Spain'],
    [/^Z/, 'Italy'], [/^Y[S-W]/, 'Sweden'], [/^YV/, 'Sweden'], [/^9/, 'Brazil'], [/^M[A-E]/, 'India'],
    [/^M[L-R]/, 'Thailand'], [/^T[R-V]/, 'Hungary'], [/^TM/, 'Czech Republic'], [/^6/, 'Australia'], [/^SU|^SW/, 'Poland'],
    [/^NM|^NL/, 'Turkey'], [/^U[U-Z]/, 'Romania'], [/^A[A-H]/, 'South Africa'], [/^7/, 'United States']
  ];
    // WMI -> make. Built from 547k public VINs (vin-test-data), plus hand entries for older/rarer makes.
  var WMI = {"137":"Hummer","19U":"Acura","19V":"Acura","19X":"Honda","1A4":"Chrysler","1A8":"Chrysler","1B3":"Dodge","1B4":"Dodge","1B7":"Dodge","1B8":"Dodge","1C3":"Chrysler/Dodge","1C4":"Jeep","1C6":"Ram/Dodge","1D3":"Dodge","1D4":"Dodge","1D7":"Dodge","1D8":"Dodge","1FA":"Ford","1FB":"Ford","1FC":"Ford","1FD":"Ford","1FM":"Ford","1FT":"Ford","1FU":"Freightliner","1FV":"Freightliner","1G1":"Chevrolet","1G2":"Pontiac","1G3":"Oldsmobile","1G4":"Buick","1G6":"Cadillac","1G8":"Saturn","1GA":"Chevrolet","1GB":"Chevrolet","1GC":"Chevrolet","1GD":"GMC","1GG":"Isuzu","1GH":"Oldsmobile","1GJ":"GMC","1GK":"GMC","1GM":"Pontiac","1GN":"Chevrolet","1GT":"GMC","1GY":"Cadillac","1HG":"Honda","1J4":"Jeep","1J8":"Jeep","1L":"Lincoln","1L1":"Lincoln","1LN":"Lincoln","1ME":"Mercury","1N4":"Nissan","1N6":"Nissan","1NX":"Toyota","1P3":"Plymouth","1P4":"Plymouth","1VW":"Volkswagen","1Y1":"Chevrolet/Geo","1YV":"Mazda","1Z7":"Mitsubishi","1ZV":"Ford","1ZW":"Mercury","2A4":"Chrysler","2A8":"Chrysler","2B3":"Dodge","2B4":"Dodge","2B6":"Dodge","2B7":"Dodge","2B8":"Dodge","2C3":"Chrysler/Dodge","2C4":"Dodge/Chrysler","2C8":"Chrysler","2CK":"Pontiac","2CN":"Chevrolet","2CT":"GMC","2D":"Dodge","2D4":"Dodge","2D6":"Dodge","2D7":"Dodge","2D8":"Dodge","2FA":"Ford","2FM":"Ford","2FT":"Ford","2G1":"Chevrolet","2G2":"Pontiac","2G4":"Buick","2G6":"Cadillac","2GC":"Chevrolet","2GK":"GMC","2GN":"Chevrolet","2GT":"GMC","2HG":"Honda","2HJ":"Honda","2HK":"Honda","2HN":"Acura","2LM":"Lincoln","2LN":"Lincoln","2ME":"Mercury","2MH":"Mercury","2MR":"Mercury","2P4":"Plymouth","2S3":"Suzuki","2T":"Toyota","2T1":"Toyota","2T2":"Lexus","2T3":"Toyota","2V4":"Volkswagen","2V8":"Volkswagen","3A4":"Chrysler","3A8":"Chrysler","3B7":"Dodge","3C3":"Fiat/Chrysler","3C4":"Dodge","3C6":"Ram/Dodge","3C8":"Chrysler","3CZ":"Honda","3D":"Dodge","3D3":"Dodge","3D4":"Dodge","3D7":"Dodge","3FA":"Ford","3FE":"Ford","3FT":"Ford","3G":"General Motors","3G1":"Chevrolet","3G2":"Pontiac","3G5":"Buick","3G7":"Pontiac","3GC":"Chevrolet","3GK":"GMC","3GN":"Chevrolet","3GS":"Saturn","3GT":"GMC","3GY":"Cadillac","3H":"Honda","3HG":"Honda","3KP":"Kia","3LN":"Lincoln","3MA":"Mercury","3ME":"Mercury","3MV":"Mazda","3MW":"BMW","3MY":"Toyota","3MZ":"Mazda","3N1":"Nissan","3N6":"Nissan","3P3":"Plymouth","3TM":"Toyota","3TY":"Toyota","3VV":"Volkswagen","3VW":"Volkswagen","4A3":"Mitsubishi","4A4":"Mitsubishi","4B3":"Dodge","4C3":"Chrysler","4F":"Mazda","4F2":"Mazda","4F4":"Mazda","4G1":"Chevrolet","4G2":"Pontiac","4JG":"Mercedes-Benz","4M":"Mercury","4M2":"Mercury","4N2":"Nissan","4NU":"Isuzu","4S2":"Isuzu","4S3":"Subaru","4S4":"Subaru","4S6":"Honda","4T":"Toyota","4T1":"Toyota","4T3":"Toyota","4T4":"Toyota","4TA":"Toyota","4US":"BMW","50E":"Lucid","55S":"Mercedes-Benz","58A":"Lexus","5BZ":"Nissan","5FN":"Honda","5FP":"Honda","5FR":"Acura","5GA":"Buick","5GN":"Hummer","5GR":"Hummer","5GT":"Hummer","5GZ":"Saturn","5J6":"Honda","5J8":"Acura","5KB":"Honda","5L":"Lincoln","5LM":"Lincoln","5LT":"Lincoln","5N1":"Nissan","5N3":"Infiniti","5NM":"Hyundai","5NP":"Hyundai","5NT":"Hyundai","5S3":"SAAB","5TB":"Toyota","5TD":"Toyota","5TE":"Toyota","5TF":"Toyota","5UM":"BMW","5UX":"BMW","5XX":"Kia","5XY":"Kia/Hyundai","5Y2":"Pontiac","5YF":"Toyota","5YJ":"Tesla","5YM":"BMW","6G2":"Pontiac","6G3":"Chevrolet","6MM":"Mitsubishi","7FA":"Honda","7FC":"Rivian","7MM":"Mazda","7MU":"Toyota","7PD":"Rivian","7SA":"Tesla","9BW":"Volkswagen","JA3":"Mitsubishi","JA4":"Mitsubishi","JAC":"Isuzu","JF1":"Subaru","JF2":"Subaru","JF4":"SAAB","JH2":"Honda","JH4":"Acura","JHL":"Honda","JHM":"Honda","JK":"Kawasaki","JM1":"Mazda","JM3":"Mazda","JN1":"Infiniti","JN8":"Nissan","JNK":"Infiniti","JNR":"Infiniti","JS":"Suzuki","JS2":"Suzuki","JS3":"Suzuki","JT":"Toyota","JT2":"Toyota","JT3":"Toyota","JT4":"Toyota","JT6":"Lexus","JT8":"Lexus","JTD":"Toyota","JTE":"Toyota","JTH":"Lexus","JTJ":"Lexus","JTK":"Toyota","JTL":"Toyota","JTM":"Toyota","JTN":"Toyota","JY":"Yamaha","KL":"GM Korea","KL1":"Chevrolet","KL2":"Pontiac","KL4":"Buick","KL5":"Suzuki","KL8":"Chevrolet","KLA":"Daewoo","KM":"Hyundai","KM8":"Hyundai","KMH":"Hyundai","KMT":"Genesis","KMU":"Genesis","KN":"Kia","KNA":"Kia","KND":"Kia","KNM":"Renault Samsung","LPS":"Polestar","LRW":"Tesla","LVY":"Volvo","LYV":"Volvo","MAJ":"Ford","ML3":"Mitsubishi","NM0":"Ford","SAJ":"Jaguar","SAL":"Land Rover","SBM":"McLaren","SCA":"Rolls-Royce","SCB":"Bentley","SCC":"Lotus","SCF":"Aston Martin","SHH":"Honda","SHS":"Honda","TRU":"Audi","VF1":"Renault","VF3":"Peugeot","VF7":"Citroen","VNK":"Toyota","W04":"Buick","W06":"Cadillac","W08":"Saturn","W1K":"Mercedes-Benz","W1N":"Mercedes-Benz","WA1":"Audi","WAU":"Audi","WB1":"BMW Motorrad","WBA":"BMW","WBS":"BMW","WBX":"BMW","WBY":"BMW","WD0":"Dodge","WD2":"Sprinter (Dodge or Freightliner)","WD3":"Mercedes-Benz","WD4":"Mercedes-Benz","WD8":"Dodge","WDA":"Mercedes-Benz","WDB":"Mercedes-Benz","WDC":"Mercedes-Benz","WDD":"Mercedes-Benz","WDF":"Mercedes-Benz","WDY":"Freightliner","WDZ":"Mercedes-Benz","WME":"smart","WMW":"MINI","WMZ":"MINI","WP0":"Porsche","WP1":"Porsche","WUA":"Audi","WV1":"Volkswagen","WV2":"Volkswagen","WVG":"Volkswagen","WVW":"Volkswagen","YH4":"Fisker","YS3":"SAAB","YV1":"Volvo","YV4":"Volvo","ZAM":"Maserati","ZAR":"Alfa Romeo","ZAS":"Alfa Romeo","ZFA":"Fiat","ZFB":"Fiat","ZFF":"Ferrari","ZHW":"Lamborghini","ZN6":"Maserati"};

  /** Offline decode. Year can be ambiguous (the code repeats every 30 years); both are returned. */
  function decode(vin, nowYear) {
    vin = normalize(vin);
    if (!isWellFormed(vin)) return null;
    nowYear = nowYear || new Date().getFullYear();
    var wmi = vin.slice(0, 3);
    var make = WMI[wmi] || WMI[wmi.slice(0, 2)] || null;
    var country = null;
    for (var i = 0; i < COUNTRY.length; i++) if (COUNTRY[i][0].test(vin)) { country = COUNTRY[i][1]; break; }
    var idx = YEAR_CODES.indexOf(vin[9]);
    var year = null, yearAlt = null;
    if (idx >= 0) {
      var older = 1980 + idx, newer = 2010 + idx;
      if (newer > nowYear + 1) year = older;
      else if (/[0-9]/.test(vin[6])) { year = older; yearAlt = newer; }   // digit in position 7 = 2009 or earlier (rule from 2010 on)
      else { year = newer; yearAlt = older; }
    }
    return {
      vin: vin, wmi: wmi, make: make, country: country, year: year, yearAlt: yearAlt,
      serial: vin.slice(11), checkDigitOk: checkDigitOk(vin)
    };
  }

  /* ---- finding the VIN among other text --------------------------------
   * A "line" is an array of cells: { c, p, alts:[{c,p}] } where c is a VIN
   * character or ' ' (separator), p its confidence, alts the runner-up reads.
   */
  function lineFromText(text) {
    var out = [];
    var s = String(text || '').toUpperCase();
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (ch === 'I') ch = '1'; else if (ch === 'O' || ch === 'Q') ch = '0';
      if (VIN_CHARS.indexOf(ch) >= 0) out.push({ c: ch, p: 1, alts: [] });
      else if (!out.length || out[out.length - 1].c !== ' ') out.push({ c: ' ', p: 1, alts: [] });
    }
    return out;
  }

  function tryCorrect(cells) {
    // cells: 17 cells failing the check digit. Use the OCR's own runner-up reads to repair it.
    var base = cells.map(function (x) { return x.c; });
    var best = null;
    function consider(arr, ratio, n) {
      var v = arr.join('');
      if (computeCheckDigit(v) === v[8] && yearCharOk(v)) {
        if (!best || ratio > best.ratio) best = { vin: v, ratio: ratio, edits: n, second: best ? best.ratio : 0 };
        else if (ratio > best.second) best.second = ratio;
      }
    }
    var opts = [];
    for (var i = 0; i < 17; i++) {
      var a = cells[i].alts || [];
      for (var k = 0; k < a.length; k++) if (a[k].p >= 0.02 && a[k].c !== ' ') opts.push({ i: i, c: a[k].c, r: a[k].p / Math.max(cells[i].p, 1e-6) });
    }
    for (var x = 0; x < opts.length; x++) {
      var arr = base.slice(); arr[opts[x].i] = opts[x].c; consider(arr, opts[x].r, 1);
    }
    if (!best) {
      for (var p = 0; p < opts.length; p++) for (var q = p + 1; q < opts.length; q++) {
        if (opts[p].i === opts[q].i) continue;
        var arr2 = base.slice(); arr2[opts[p].i] = opts[p].c; arr2[opts[q].i] = opts[q].c;
        consider(arr2, opts[p].r * opts[q].r * 0.5, 2);
      }
    }
    // Only trust a repair that clearly beats any other possible repair.
    if (best && best.second > best.ratio * 0.5) return null;
    return best;
  }

  function evalCandidate(cells, kind, nTokens) {
    var vin = cells.map(function (x) { return x.c; }).join('');
    var sum = 0, min = 1;
    for (var i = 0; i < 17; i++) { sum += cells[i].p; if (cells[i].p < min) min = cells[i].p; }
    var conf = sum / 17;
    var ok = computeCheckDigit(vin) === vin[8];
    var corrected = false;
    if (!ok && kind !== 'window' && !(kind === 'joined' && nTokens > 3)) {
      var fix = tryCorrect(cells);
      if (fix) { vin = fix.vin; corrected = true; conf *= fix.edits === 1 ? 0.8 : 0.6; }
    }
    var valid = ok || corrected;
    var plausible = yearCharOk(vin) && serialOk(vin);
    var knownMake = !!(WMI[vin.slice(0, 3)] || WMI[vin.slice(0, 2)]);
    // pieces of ordinary label text (tyre sizes, weights) can add up to 17 characters: spaced-out reads must look like a real VIN
    if (kind === 'joined' && (nTokens > 3 || !knownMake)) kind = 'loose';
    // an alternative read that the check digit cannot tell apart (J/1, for example) keeps the result unverified
    var ambiguous = false;
    for (var ai = 0; ai < 17 && !ambiguous; ai++) {
      var al = cells[ai].alts || [];
      for (var aj = 0; aj < al.length; aj++) {
        if (al[aj].c !== cells[ai].c && charValue(al[aj].c) === charValue(cells[ai].c) && al[aj].p >= 0.08 * cells[ai].p) { ambiguous = true; break; }
      }
    }
    var verified = ok && plausible && knownMake && !ambiguous && (kind === 'exact' || kind === 'joined') && conf >= 0.8 && min >= 0.4;   // J/1 and similar swaps keep the check digit valid: a known make guards them   // anything weaker needs a second sighting
    var score = (ok ? 5 : corrected ? 2.5 : 0) + (kind === 'exact' ? 3 : kind === 'joined' ? 2.5 : kind === 'loose' ? 0 : 1) + conf + (plausible ? 1 : 0) + (knownMake ? 1 : 0);
    return { vin: vin, kind: kind, checkDigitOk: valid, corrected: corrected, verified: verified, plausible: plausible, confidence: conf, minConfidence: min, score: score };
  }

  /** Every 17-character run on a line that could be a VIN, best first. */
  function findInLine(cells) {
    var tokens = [], cur = [];
    for (var i = 0; i < cells.length; i++) {
      if (cells[i].c === ' ') { if (cur.length) tokens.push(cur); cur = []; }
      else cur.push(cells[i]);
    }
    if (cur.length) tokens.push(cur);
    var out = [], seen = {};
    function add(c) { var prev = seen[c.vin]; if (!prev || c.score > prev.score) { seen[c.vin] = c; } }
    // whole tokens (or neighbouring tokens, e.g. "JF1 GD7063 6L506581") adding up to exactly 17
    for (var a = 0; a < tokens.length; a++) {
      var len = 0, run = [];
      for (var b = a; b < tokens.length && len < 17; b++) {
        len += tokens[b].length; run = run.concat(tokens[b]);
        if (len === 17) add(evalCandidate(run, a === b ? 'exact' : 'joined', b - a + 1));
      }
    }
    // sliding window, for VINs glued to other characters ("VIN:1HG...", barcode start/stop marks)
    for (var t = 0; t < tokens.length; t++) {
      var flat = tokens[t];
      if (flat.length < 18) continue;
      var from = flat[0].c === 'V' && flat[1].c === '1' && flat[2].c === 'N' ? 3 : 0;   // "VIN" label stuck to the number
      for (var s = from; s + 17 <= flat.length; s++) {
        var c = evalCandidate(flat.slice(s, s + 17), 'window');
        if (c.checkDigitOk) add(c);
      }
    }
    for (var k in seen) if ((seen[k].checkDigitOk && (seen[k].kind !== 'loose' || seen[k].plausible)) || (seen[k].kind === 'exact' && yearCharOk(seen[k].vin) && /[0-9]{3}$/.test(seen[k].vin) && /[A-Z].*[A-Z]/.test(seen[k].vin))) out.push(seen[k]);
    out.sort(function (x, y) { return y.score - x.score; });
    // two different check-digit-valid windows on one line: neither can be auto-trusted
    var wins = out.filter(function (c) { return c.kind === 'window' && c.verified; });
    if (wins.length > 1) wins.forEach(function (c) { c.verified = false; });
    return out;
  }

  /** Pull VIN candidates out of plain text (a typed/pasted string, a barcode payload, a document). */
  function findInText(text) {
    var lines = String(text || '').split(/\r?\n/), all = {}, out = [];
    lines.concat([lines.join(' ')]).forEach(function (l) {
      findInLine(lineFromText(l)).forEach(function (c) { if (!all[c.vin] || c.score > all[c.vin].score) all[c.vin] = c; });
    });
    for (var k in all) out.push(all[k]);
    return out.sort(function (x, y) { return y.score - x.score; });
  }

  /* ================================================================== *
   * 2. OCR ENGINE
   * ================================================================== */
  // character table of the bundled recognition model (PP-OCRv5 English, mobile)
  var REC_CHARS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z", "!", "\"", "#", "$", "%", "&", "'", "(", ")", "*", "+", ",", "-", ".", "/", ":", ";", "<", "=", ">", "?", "@", "[", "\\", "]", "_", "`", "{", "|", "}", "^", "~", "\u00a9", "\u00ae", "\u2109", "\u2116", "\u2126", "\u212e", "\u2122", "\u2206", "\u2713", "\u2714", "\u2717", "\u2718", "\u2715", "\u2611", "\u2612", "\u25cf", "\u25aa", "\u25ab", "\u25fc", "\u25b6", "\u25c0", "\u2b06", "\u00a4", "\u00a6", "\u00a7", "\u00a8", "\u00aa", "\u00ab", "\u00ac", "\u00af", "\u00b0", "\u00b2", "\u00b3", "\u00b4", "\u00b5", "\u00b6", "\u00b8", "\u00b9", "\u00ba", "\u00bb", "\u00bc", "\u00bd", "\u00be", "\u00bf", "\u00d7", "\u2010", "\u2011", "\u2012", "\u2014", "\u2015", "\u2016", "\u2017", "\u2018", "\u2019", "\u201a", "\u201b", "\u201c", "\u201d", "\u201e", "\u201f", "\u2020", "\u2021", "\u2023", "\u2024", "\u2026", "\u2027", "\u2030", "\u2034", "\u2035", "\u2036", "\u2037", "\u2038", "\u2039", "\u203a", "\u203b", "\u203c", "\u203d", "\u203e", "\u2212", "\u20a4", "\u20a1", "\u20b9", "\u20bd", "\u20b4", "\u20bf", "\u00a2", "\u20ac", "\u00a3", "\u00a5", "\u2160", "\u2161", "\u2162", "\u2163", "\u2164", "\u2165", "\u2166", "\u2167", "\u2168", "\u2169", "\u216a", "\u216b", "\u2170", "\u2171", "\u2172", "\u2173", "\u2174", "\u2175", "\u2176", "\u2177", "\u2178", "\u2179", "\u217a", "\u217b", "\u2780", "\u2781", "\u2782", "\u2783", "\u2784", "\u2785", "\u2786", "\u2787", "\u2788", "\u2789", "\u278a", "\u278b", "\u278c", "\u278d", "\u278e", "\u278f", "\u2790", "\u2791", "\u2792", "\u2793", "\u2776", "\u2777", "\u2778", "\u2779", "\u277a", "\u277b", "\u277c", "\u277d", "\u277e", "\u277f", "\u2460", "\u2461", "\u2462", "\u2463", "\u2464", "\u2465", "\u2466", "\u2467", "\u2468", "\u2469", "\u2191", "\u2192", "\u2193", "\u2195", "\u2190", "\u2194", "\u21d2", "\u21d0", "\u21d4", "\u2200", "\u2203", "\u2204", "\u2234", "\u2235", "\u221d", "\u221e", "\u2229", "\u222a", "\u2202", "\u222b", "\u222c", "\u222d", "\u222e", "\u222f", "\u2230", "\u2211", "\u220f", "\u221a", "\u221b", "\u221c", "\u2231", "\u2232", "\u2233", "\u2236", "\u2237", "\u223c", "\u2216", "\u2217", "\u2248", "\u2260", "\u2261", "\u2264", "\u2265", "\u2282", "\u2283", "\u22a5", "\u22be", "\u22bf", "\u25a1", "\u2225", "\u220b", "\u0192", "\u2032", "\u2033", "\u00c0", "\u00c1", "\u00c2", "\u00c3", "\u00c4", "\u00c5", "\u00c6", "\u00c7", "\u00c8", "\u00c9", "\u00ca", "\u00cb", "\u00cc", "\u00cd", "\u00ce", "\u00cf", "\u00d0", "\u00d1", "\u00d2", "\u00d3", "\u00d4", "\u00d5", "\u00d6", "\u00d8", "\u00d9", "\u00da", "\u00db", "\u00dc", "\u00dd", "\u00de", "\u00e0", "\u00e1", "\u00e2", "\u00e3", "\u00e4", "\u00e5", "\u00e6", "\u00e7", "\u00e8", "\u00e9", "\u00ea", "\u00eb", "\u00ec", "\u00ed", "\u00ee", "\u00ef", "\u00f0", "\u00f1", "\u00f2", "\u00f3", "\u00f4", "\u00f5", "\u00f6", "\u00f8", "\u00f9", "\u00fa", "\u00fb", "\u00fc", "\u00fd", "\u00fe", "\u00ff", "\u0391", "\u0392", "\u0393", "\u0394", "\u0395", "\u0396", "\u0397", "\u0398", "\u0399", "\u039a", "\u039b", "\u039c", "\u039d", "\u039e", "\u039f", "\u03a0", "\u03a1", "\u03a3", "\u03a4", "\u03a5", "\u03a6", "\u03a7", "\u03a8", "\u03a9", "\u03b1", "\u03b2", "\u03b3", "\u03b4", "\u03b5", "\u03b6", "\u03b7", "\u03b8", "\u03b9", "\u03ba", "\u03bb", "\u03bc", "\u03bd", "\u03be", "\u03bf", "\u03c0", "\u03c1", "\u03c3", "\u03c2", "\u03c4", "\u03c5", "\u03c6", "\u03c7", "\u03c8", "\u03c9", "\u212b", "\u210f", "\u2300", "\u237a", "\u2375", "\ud835\udc62", "\ud835\udf13", "\u0966", "\u2025", "\ufe3d", "\ufe65", "\u2022", "\u00f7", "\u2215", "\u2219", "\u22c5", "\u00b7", "\u00b1", "\u2213", "\u221f", "\u2220", "\u2221", "\u2222", "\u2127", "\u263a", ""];
  var NV = VIN_CHARS.length;            // 33 VIN characters, index 33 = separator
  // map every model class -> index in VIN_CHARS, or NV (separator), or -1 (CTC blank)
  function buildClassMap(chars) {
    var m = new Int8Array(chars.length + 1); m[0] = -1;
    // VIN plates are all-caps and never use I, O or Q: fold look-alikes onto the character they must be
    var fold = { I: '1', O: '0', Q: '0', i: '1', l: '1', o: '0', q: '9', b: '6', g: '9', '|': '1' };
    for (var i = 0; i < chars.length; i++) {
      var ch = chars[i] || ' ';
      ch = fold[ch] || ch.toUpperCase();
      var k = ch.length === 1 ? VIN_CHARS.indexOf(ch) : -1;
      m[i + 1] = k >= 0 ? k : NV;
    }
    return m;
  }

  function Engine(ort, detSession, recSession, chars) {
    this.ort = ort; this.det = detSession; this.rec = recSession;
    this.chars = chars ? (typeof chars === 'string' ? chars.split('') : chars) : REC_CHARS;
    this.classMap = buildClassMap(this.chars);
    this.detIn = detSession.inputNames[0]; this.detOut = detSession.outputNames[0];
    this.recIn = recSession.inputNames[0]; this.recOut = recSession.outputNames[0];
  }

  Engine.create = async function (ort, detModel, recModel, sessionOptions, chars) {
    var o = sessionOptions || {};
    var det = await ort.InferenceSession.create(detModel, o);
    var rec = await ort.InferenceSession.create(recModel, o);
    return new Engine(ort, det, rec, chars);
  };

  // --- image helpers (plain typed arrays so the exact same code runs in a worker, a page, or Node) ---
  function grayStretch(img) {
    // contrast-stretched grayscale copy: helps faint stamped plates behind glass
    var n = img.width * img.height, d = img.data, g = new Uint8Array(n), hist = new Uint32Array(256), i;
    for (i = 0; i < n; i++) { var v = (d[i * 4] * 77 + d[i * 4 + 1] * 150 + d[i * 4 + 2] * 29) >> 8; g[i] = v; hist[v]++; }
    var lo = 0, hi = 255, acc = 0, cut = n * 0.01;
    for (i = 0; i < 256; i++) { acc += hist[i]; if (acc > cut) { lo = i; break; } }
    acc = 0;
    for (i = 255; i >= 0; i--) { acc += hist[i]; if (acc > cut) { hi = i; break; } }
    var sc = 255 / Math.max(1, hi - lo), out = new Uint8ClampedArray(n * 4);
    for (i = 0; i < n; i++) { var w = (g[i] - lo) * sc; out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = w; out[i * 4 + 3] = 255; }
    return { data: out, width: img.width, height: img.height };
  }
  function mirror(img) {
    var w = img.width, h = img.height, s = new Uint32Array(img.data.buffer, img.data.byteOffset, w * h), o = new Uint32Array(w * h);
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) o[y * w + x] = s[y * w + (w - 1 - x)];
    return { data: new Uint8ClampedArray(o.buffer), width: w, height: h };
  }
  function localContrast(img, radiusFrac, gain) {
    // per-neighbourhood contrast normalisation (integral images): pulls stamped/embossed characters out of flat metal
    var w = img.width, h = img.height, n = w * h, d = img.data, i, x, y;
    var W1 = w + 1, I = new Float64Array(W1 * (h + 1)), I2 = new Float64Array(W1 * (h + 1)), g = new Float32Array(n);
    for (y = 0; y < h; y++) {
      var rs = 0, rs2 = 0;
      for (x = 0; x < w; x++) {
        i = y * w + x; var v = (d[i * 4] * 77 + d[i * 4 + 1] * 150 + d[i * 4 + 2] * 29) / 256; g[i] = v;
        rs += v; rs2 += v * v;
        I[(y + 1) * W1 + x + 1] = I[y * W1 + x + 1] + rs; I2[(y + 1) * W1 + x + 1] = I2[y * W1 + x + 1] + rs2;
      }
    }
    var r = Math.max(8, Math.round(Math.max(w, h) * (radiusFrac || 0.02))), out = new Uint8ClampedArray(n * 4), k = gain || 55;
    for (y = 0; y < h; y++) {
      var y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
      for (x = 0; x < w; x++) {
        var x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1), cnt = (x1 - x0) * (y1 - y0);
        var sm = I[y1 * W1 + x1] - I[y0 * W1 + x1] - I[y1 * W1 + x0] + I[y0 * W1 + x0];
        var sq = I2[y1 * W1 + x1] - I2[y0 * W1 + x1] - I2[y1 * W1 + x0] + I2[y0 * W1 + x0];
        var m = sm / cnt, sd = Math.sqrt(Math.max(0, sq / cnt - m * m));
        i = y * w + x; var o = 128 + (g[i] - m) * k / (sd + 6);
        out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = o; out[i * 4 + 3] = 255;
      }
    }
    return { data: out, width: w, height: h };
  }
  function rotateCCW(img) {
    var w = img.width, h = img.height, s = new Uint32Array(img.data.buffer, img.data.byteOffset, w * h), o = new Uint32Array(w * h);
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) o[(w - 1 - x) * h + y] = s[y * w + x];
    return { data: new Uint8ClampedArray(o.buffer), width: h, height: w };
  }
  function invert(img) {
    var d = img.data, o = new Uint8ClampedArray(d.length);
    for (var i = 0; i < d.length; i += 4) { o[i] = 255 - d[i]; o[i + 1] = 255 - d[i + 1]; o[i + 2] = 255 - d[i + 2]; o[i + 3] = 255; }
    return { data: o, width: img.width, height: img.height };
  }

  // ---- barcodes (Code 39 / Code 128 / PDF417 / Data Matrix / QR) --------------
  // A barcode is read in one shot with a checksum, so when it carries a valid VIN it is the fastest and
  // strongest answer. The reader is optional: the page still works with text reading alone.
  var barcodeFn = null;
  function barcodeFn_() { return barcodeFn; }
  Engine.useBarcodeReader = function (fn) { barcodeFn = fn; };
  Engine.prototype.scanCodes = async function (img) {
    if (!barcodeFn) return [];
    var texts;
    try { texts = await barcodeFn(img); Engine.barcodeErr = null; } catch (e) { Engine.barcodeErr = String(e && e.message || e); return []; }
    var out = {};
    (texts || []).forEach(function (t) {
      findInText(t).forEach(function (c) {
        if (!c.checkDigitOk || c.corrected) return;
        c.kind = 'barcode'; c.verified = true; c.confidence = 1; c.source = 'barcode';
        if (!out[c.vin] || c.score > out[c.vin].score) out[c.vin] = c;
      });
    });
    return Object.keys(out).map(function (k) { return out[k]; });
  };

  Engine.prototype._detect = async function (img, limit) {
    var w = img.width, h = img.height, r = Math.min(1, limit / Math.max(w, h));
    var tw = Math.max(32, Math.round(w * r / 32) * 32), th = Math.max(32, Math.round(h * r / 32) * 32);
    var t = new Float32Array(3 * tw * th), d = img.data, plane = tw * th;
    var sx = w / tw, sy = h / th;
    var mean = [0.485, 0.456, 0.406], std = [0.229, 0.224, 0.225];
    // area-average when shrinking, bilinear otherwise
    var bx = Math.max(1, Math.round(sx)), by = Math.max(1, Math.round(sy));
    for (var y = 0; y < th; y++) {
      for (var x = 0; x < tw; x++) {
        var R = 0, G = 0, B = 0, n = 0;
        var x0 = Math.min(w - 1, Math.floor(x * sx)), y0 = Math.min(h - 1, Math.floor(y * sy));
        for (var yy = y0; yy < Math.min(h, y0 + by); yy++) for (var xx = x0; xx < Math.min(w, x0 + bx); xx++) {
          var p = (yy * w + xx) * 4; R += d[p]; G += d[p + 1]; B += d[p + 2]; n++;
        }
        var o = y * tw + x;
        // PaddleOCR feeds BGR
        t[o] = (B / n / 255 - mean[0]) / std[0];
        t[plane + o] = (G / n / 255 - mean[1]) / std[1];
        t[2 * plane + o] = (R / n / 255 - mean[2]) / std[2];
      }
    }
    var feeds = {}; feeds[this.detIn] = new this.ort.Tensor('float32', t, [1, 3, th, tw]);
    var res = await this.det.run(feeds);
    return boxesFromMap(res[this.detOut].data, tw, th, sx, sy);
  };

  function boxesFromMap(prob, w, h, sx, sy) {
    var n = w * h, lab = new Uint8Array(n), stack = new Int32Array(n), boxes = [];
    for (var i0 = 0; i0 < n; i0++) {
      if (lab[i0] || prob[i0] <= 0.3) continue;
      var top = 0, cnt = 0, sum = 0; stack[top++] = i0; lab[i0] = 1;
      var rowMin = {}, rowMax = {}, yMin = h, yMax = 0;
      while (top) {
        var i = stack[--top], y = (i / w) | 0, x = i - y * w;
        cnt++; sum += prob[i];
        if (rowMin[y] === undefined || x < rowMin[y]) rowMin[y] = x;
        if (rowMax[y] === undefined || x > rowMax[y]) rowMax[y] = x;
        if (y < yMin) yMin = y; if (y > yMax) yMax = y;
        for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
          var nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          var j = ny * w + nx;
          if (!lab[j] && prob[j] > 0.3) { lab[j] = 1; stack[top++] = j; }
        }
      }
      if (cnt < 12 || sum / cnt < 0.5) continue;
      var pts = [];
      for (var yy = yMin; yy <= yMax; yy++) {
        if (rowMin[yy] === undefined) continue;
        pts.push([rowMin[yy] * sx, yy * sy], [(rowMax[yy] + 1) * sx, yy * sy], [rowMin[yy] * sx, (yy + 1) * sy], [(rowMax[yy] + 1) * sx, (yy + 1) * sy]);
      }
      var rect = minAreaRect(pts);
      if (!rect || rect.S < 5) continue;
      var dist = rect.L * rect.S * 1.6 / (2 * (rect.L + rect.S));   // "unclip": the model predicts shrunken text cores
      rect.L += 2 * dist; rect.S += 2 * dist; rect.score = sum / cnt;
      boxes.push(rect);
    }
    return boxes;
  }

  function minAreaRect(pts) {
    pts.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    function cross(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
    var lo = [], up = [], i;
    for (i = 0; i < pts.length; i++) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], pts[i]) <= 0) lo.pop(); lo.push(pts[i]); }
    for (i = pts.length - 1; i >= 0; i--) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], pts[i]) <= 0) up.pop(); up.push(pts[i]); }
    var hull = lo.slice(0, -1).concat(up.slice(0, -1));
    if (hull.length < 3) return null;
    var best = null;
    for (i = 0; i < hull.length; i++) {
      var a = hull[i], b = hull[(i + 1) % hull.length], ex = b[0] - a[0], ey = b[1] - a[1], len = Math.hypot(ex, ey);
      if (len < 1e-6) continue;
      ex /= len; ey /= len;
      var mnU = Infinity, mxU = -Infinity, mnV = Infinity, mxV = -Infinity;
      for (var k = 0; k < hull.length; k++) {
        var u = hull[k][0] * ex + hull[k][1] * ey, v = -hull[k][0] * ey + hull[k][1] * ex;
        if (u < mnU) mnU = u; if (u > mxU) mxU = u; if (v < mnV) mnV = v; if (v > mxV) mxV = v;
      }
      var area = (mxU - mnU) * (mxV - mnV);
      if (!best || area < best.area) best = { area: area, ex: ex, ey: ey, mnU: mnU, mxU: mxU, mnV: mnV, mxV: mxV };
    }
    var cu = (best.mnU + best.mxU) / 2, cv = (best.mnV + best.mxV) / 2;
    var r = { cx: cu * best.ex - cv * best.ey, cy: cu * best.ey + cv * best.ex, ux: best.ex, uy: best.ey, L: best.mxU - best.mnU, S: best.mxV - best.mnV };
    if (r.S > r.L) { var t = r.L; r.L = r.S; r.S = t; var ox = r.ux; r.ux = -r.uy; r.uy = ox; }
    // point the long axis left-to-right (or top-to-bottom when vertical)
    if (Math.abs(r.ux) >= Math.abs(r.uy) ? r.ux < 0 : r.uy < 0) { r.ux = -r.ux; r.uy = -r.uy; }
    return r;
  }

  /** Join boxes that sit on the same text line (spaced-out dash plates are often detected in pieces). */
  function mergeLineBoxes(boxes) {
    var extra = [];
    for (var i = 0; i < boxes.length; i++) for (var j = 0; j < boxes.length; j++) {
      if (i === j) continue;
      var a = boxes[i], b = boxes[j];
      if (Math.abs(a.ux * b.ux + a.uy * b.uy) < 0.97) continue;
      if (Math.min(a.S, b.S) / Math.max(a.S, b.S) < 0.6) continue;
      var dx = b.cx - a.cx, dy = b.cy - a.cy;
      var along = dx * a.ux + dy * a.uy, across = -dx * a.uy + dy * a.ux;
      if (along <= 0 || Math.abs(across) > a.S * 0.35) continue;
      var gap = along - a.L / 2 - b.L / 2;
      if (gap > a.S * 1.6) continue;
      var start = -a.L / 2, end = along + b.L / 2, mid = (start + end) / 2;
      extra.push({ cx: a.cx + a.ux * mid + (-a.uy) * across / 2, cy: a.cy + a.uy * mid + a.ux * across / 2, ux: a.ux, uy: a.uy, L: end - start, S: Math.max(a.S, b.S), score: Math.min(a.score, b.score), merged: true, parts: [i, j] });
    }
    // chain merges once more (three-piece plates)
    var more = [];
    for (var m = 0; m < extra.length; m++) for (var k = 0; k < boxes.length; k++) {
      var e = extra[m], c = boxes[k];
      if (e.parts.indexOf(k) >= 0) continue;
      if (Math.abs(e.ux * c.ux + e.uy * c.uy) < 0.97 || Math.min(e.S, c.S) / Math.max(e.S, c.S) < 0.6) continue;
      var ddx = c.cx - e.cx, ddy = c.cy - e.cy, al = ddx * e.ux + ddy * e.uy, ac = -ddx * e.uy + ddy * e.ux;
      if (al <= 0 || Math.abs(ac) > e.S * 0.35 || al - e.L / 2 - c.L / 2 > e.S * 1.6) continue;
      var st = -e.L / 2, en = al + c.L / 2, md = (st + en) / 2;
      more.push({ cx: e.cx + e.ux * md, cy: e.cy + e.uy * md, ux: e.ux, uy: e.uy, L: en - st, S: Math.max(e.S, c.S), score: Math.min(e.score, c.score), merged: true });
    }
    return boxes.concat(extra, more);
  }

  var REC_H = 48;
  function cropTensor(img, box, pad) {
    var L = box.L * (1 + (pad || 0)), S = box.S * (1 + (pad || 0) * 2);
    var W = Math.max(REC_H, Math.min(960, Math.round(REC_H * L / S)));
    var t = new Float32Array(3 * REC_H * W), plane = REC_H * W, d = img.data, w = img.width, h = img.height;
    var vx = -box.uy, vy = box.ux;
    var ss = Math.max(1, Math.min(3, Math.round(S / REC_H)));  // supersample when shrinking
    for (var j = 0; j < REC_H; j++) for (var i = 0; i < W; i++) {
      var R = 0, G = 0, B = 0;
      for (var a = 0; a < ss; a++) for (var b = 0; b < ss; b++) {
        var fu = ((i + (a + 0.5) / ss) / W - 0.5) * L, fv = ((j + (b + 0.5) / ss) / REC_H - 0.5) * S;
        var x = box.cx + box.ux * fu + vx * fv - 0.5, y = box.cy + box.uy * fu + vy * fv - 0.5;
        if (x < 0) x = 0; else if (x > w - 1.001) x = w - 1.001;
        if (y < 0) y = 0; else if (y > h - 1.001) y = h - 1.001;
        var x0 = x | 0, y0 = y | 0, ax = x - x0, ay = y - y0, p = (y0 * w + x0) * 4, q = p + w * 4;
        var w00 = (1 - ax) * (1 - ay), w10 = ax * (1 - ay), w01 = (1 - ax) * ay, w11 = ax * ay;
        R += d[p] * w00 + d[p + 4] * w10 + d[q] * w01 + d[q + 4] * w11;
        G += d[p + 1] * w00 + d[p + 5] * w10 + d[q + 1] * w01 + d[q + 5] * w11;
        B += d[p + 2] * w00 + d[p + 6] * w10 + d[q + 2] * w01 + d[q + 6] * w11;
      }
      var o = j * W + i, k = ss * ss * 127.5;
      t[o] = B / k - 1; t[plane + o] = G / k - 1; t[2 * plane + o] = R / k - 1;
    }
    return { data: t, W: W };
  }
  function flip180(c) {
    var W = c.W, plane = REC_H * W, o = new Float32Array(c.data.length);
    for (var ch = 0; ch < 3; ch++) for (var i = 0; i < plane; i++) o[ch * plane + i] = c.data[ch * plane + plane - 1 - i];
    return { data: o, W: W };
  }

  Engine.prototype._recognize = async function (crop) {
    var feeds = {}; feeds[this.recIn] = new this.ort.Tensor('float32', crop.data, [1, 3, REC_H, crop.W]);
    var res = await this.rec.run(feeds), out = res[this.recOut], T = out.dims[1], C = out.dims[2], P = out.data;
    // greedy CTC over the model's own classes, then fold each character onto the VIN alphabet
    var cells = [], prev = 0, seg = null, raw = '', CLASS_MAP = this.classMap, chars = this.chars, nmap = CLASS_MAP.length;
    function close() {
      if (!seg) return;
      var base = seg.t * C, dist = new Float32Array(NV + 1);
      for (var c = 1; c < C; c++) { var pc = P[base + c]; if (pc > 1e-4) dist[c < nmap ? CLASS_MAP[c] : NV] += pc; }
      var bi = 0; for (var k = 1; k <= NV; k++) if (dist[k] > dist[bi]) bi = k;
      if (bi === NV) { if (cells.length && cells[cells.length - 1].c !== ' ') cells.push({ c: ' ', p: dist[NV], alts: [] }); }
      else {
        var alts = [];
        for (var a = 0; a < NV; a++) if (a !== bi && dist[a] >= 0.02) alts.push({ c: VIN_CHARS[a], p: dist[a] });
        alts.sort(function (x, y) { return y.p - x.p; });
        cells.push({ c: VIN_CHARS[bi], p: dist[bi], alts: alts.slice(0, 3) });
      }
      raw += chars[seg.cls - 1] || ' ';
      seg = null;
    }
    for (var t = 0; t < T; t++) {
      var b = t * C, mi = 0, mp = P[b];
      for (var c2 = 1; c2 < C; c2++) if (P[b + c2] > mp) { mp = P[b + c2]; mi = c2; }
      if (mi === 0) { close(); }
      else if (mi !== prev) { close(); seg = { cls: mi, p: mp, t: t }; }
      else if (seg && mp > seg.p) { seg.p = mp; seg.t = t; }
      prev = mi;
    }
    close();
    var n = 0, s = 0;
    for (var i = 0; i < cells.length; i++) if (cells[i].c !== ' ') { n++; s += cells[i].p; }
    return { cells: cells, raw: raw, chars: n, conf: n ? s / n : 0 };
  };

  /**
   * One pass over an image. opts: { detLimit, maxBoxes, stopOnVerified }
   * Returns { candidates:[...best first], lines:[raw text], boxes:n }
   */
  Engine.prototype.scan = async function (img, opts) {
    opts = opts || {};
    var codeHits = opts.codes ? await this.scanCodes(img) : [];
    if (codeHits.length) return { candidates: codeHits, lines: [], boxes: 0, vertical: false, detMs: 0, source: 'barcode' };
    var tDet = Date.now();
    var boxes = await this._detect(img, opts.detLimit || 960);
    tDet = Date.now() - tDet; var nRec = 0, self0 = this, rec0 = this._recognize;
    boxes = mergeLineBoxes(boxes).filter(function (b) { return b.L / b.S >= 3.2; });
    // most VIN-shaped first: long, and big on screen
    boxes.forEach(function (b) { var ar = b.L / b.S; b.rank = (ar >= 5 && ar <= 22 ? 2 : ar >= 3.5 ? 1 : 0) + (b.merged ? 0.5 : 0) + Math.min(1, b.L / img.width); });
    boxes.sort(function (a, b) { return b.rank - a.rank; });
    boxes = boxes.slice(0, opts.maxBoxes || 24);
    var found = {}, lines = [], done = false, retries = 0;
    var wins = [[0, 0], [0, 0]], vertLen = 0, horizLen = 0;     // [horizontal, vertical] x [as-is, flipped]
    for (var i = 0; i < boxes.length && !done; i++) {
      var crop = cropTensor(img, boxes[i], 0);
      var vert = Math.abs(boxes[i].uy) > Math.abs(boxes[i].ux) ? 1 : 0;
      if (vert) vertLen += boxes[i].L; else horizLen += boxes[i].L;
      var first = wins[vert][1] > wins[vert][0] ? 1 : 0;        // try the way up that has been working
      for (var vi = 0; vi < 2; vi++) {
        var v = vi ? 1 - first : first;
        var r = await this._recognize(v ? flip180(crop) : crop);
        if (r.conf >= 0.8 && r.chars >= 5) wins[vert][v]++;
        if (opts.debug) opts.debug.push({ raw: r.raw, conf: r.conf, ar: boxes[i].L / boxes[i].S, flip: v });
        if (r.chars < 6) { if (r.conf > 0.9 && r.chars >= 2) break; continue; }
        lines.push(r.raw);
        var c = findInLine(r.cells);
        for (var k = 0; k < c.length; k++) {
          c[k].box = boxes[i];
          if (!found[c[k].vin] || c[k].score > found[c[k].vin].score) found[c[k].vin] = c[k];
          if (c[k].verified && opts.stopOnVerified !== false) done = true;
        }
        // looks like a VIN but didn't verify: re-read the same spot with slightly different framing
        if (!done && c.length && retries < 4 && opts.retry !== false && !c.some(function (x) { return x.verified; })) {
          retries++;
          var jit = [[0.06, 0], [-0.05, 0], [0.02, 0.12], [0.02, -0.12]];
          for (var jn = 0; jn < jit.length && !done; jn++) {
            var bx = boxes[i], sh = jit[jn][1] * bx.S;
            var b2 = { cx: bx.cx - bx.uy * sh, cy: bx.cy + bx.ux * sh, ux: bx.ux, uy: bx.uy, L: bx.L, S: bx.S };
            var c2 = cropTensor(img, b2, jit[jn][0]);
            var r2 = await this._recognize(v ? flip180(c2) : c2);
            if (opts.debug) opts.debug.push({ raw: r2.raw, conf: r2.conf, ar: 0, flip: v, jitter: jn });
            var cc = findInLine(r2.cells);
            for (var q = 0; q < cc.length; q++) {
              var prevC = found[cc[q].vin];
              if (prevC && prevC.checkDigitOk && cc[q].checkDigitOk && !cc[q].corrected && !prevC.corrected && cc[q].kind !== 'loose') { cc[q].verified = cc[q].plausible; }   // same clean VIN from two framings
              cc[q].box = bx;
              if (!prevC || cc[q].score > prevC.score || cc[q].verified) found[cc[q].vin] = cc[q];
              if (cc[q].verified && opts.stopOnVerified !== false) done = true;
            }
          }
        }
        if (done || (r.conf >= 0.88 && r.chars >= 8) || (wins[vert][v] >= 2 && wins[vert][1 - v] === 0 && r.conf >= 0.5)) break;   // already reading this way up
      }
    }
    var out = []; for (var key in found) out.push(found[key]);
    out.sort(function (a, b) { return b.score - a.score; });
    return { candidates: out, lines: lines, boxes: boxes.length, vertical: vertLen > horizLen * 1.5, detMs: tDet };
  };

  /**
   * Thorough multi-pass read for a still photo: plain, contrast-boosted, high-res, inverted, mirrored.
   * Stops at the first verified VIN.
   */
  Engine.prototype.scanPhoto = async function (img, opts) {
    opts = opts || {};
    var t0 = Date.now(), self = this, tally = {}, passes = 0;
    var plan = [
      function () { return [img, 960]; },
      function () { return [localContrast(img), 960]; },
      function () { return [grayStretch(img), 1280]; },
      function () { return [img, 1600]; },
      function () { return [localContrast(img, 0.01, 70), 1600]; },
      function () { return [mirror(img), 960]; }
    ];
    var best = null;
    var codes = await self.scanCodes(img);
    if (opts.debug) opts.debug.barcode = { reader: !!barcodeFn, err: Engine.barcodeErr };
    if (codes.length) return { candidates: codes, passes: 0, ms: Date.now() - t0, source: 'barcode' };
    // quick look at which way the text runs; level it first (detection is far better on level text)
    var probe = await this._detect(img, 640), vl = 0, hl = 0;
    probe.forEach(function (b) { if (b.L / b.S < 2.5) return; if (Math.abs(b.uy) > Math.abs(b.ux)) vl += b.L; else hl += b.L; });
    if (vl > hl * 1.5) img = rotateCCW(img);
    for (var i = 0; i < plan.length; i++) {
      if (opts.budgetMs && Date.now() - t0 > opts.budgetMs) break;
      var p = plan[i]();
      if ((i === 3 || i === 4) && Math.max(img.width, img.height) <= 1280) continue;
      var r = await self.scan(p[0], { detLimit: p[1], maxBoxes: 36 });
      passes++;
      r.candidates.forEach(function (c) {
        var e = tally[c.vin];
        if (!e) tally[c.vin] = e = { c: c, votes: 0 };
        e.votes++; if (c.score > e.c.score) e.c = c;
        if (i === 5) e.c.mirrored = true;
      });
      var arr = Object.keys(tally).map(function (k) { var e = tally[k]; e.c.votes = e.votes; return e.c; });
      arr.sort(function (a, b) { return (b.score + b.votes * 0.5) - (a.score + a.votes * 0.5); });
      best = arr;
      if (arr.length && arr[0].verified) break;
      // a glued-on read (window) seen on two different passes is as good as verified
      if (arr.length && arr[0].checkDigitOk && !arr[0].corrected && arr[0].votes >= 2 && arr[0].plausible && arr[0].kind !== 'loose') { arr[0].verified = true; break; }
    }
    return { candidates: best || [], passes: passes, ms: Date.now() - t0 };
  };

  var api = {
    version: '1.0.0',
    normalize: normalize, isWellFormed: isWellFormed, checkDigitOk: checkDigitOk, computeCheckDigit: computeCheckDigit,
    decode: decode, findInText: findInText, findInLine: findInLine, lineFromText: lineFromText,
    Engine: Engine, _img: { grayStretch: grayStretch, mirror: mirror, invert: invert, rotateCCW: rotateCCW, localContrast: localContrast }
  };

  /* ================================================================== *
   * 3. WORKER SIDE  (this same file, loaded with new Worker(src))
   * ================================================================== */
  if (typeof WorkerGlobalScope !== 'undefined' && typeof self !== 'undefined' && self instanceof WorkerGlobalScope) {
    var wEngine = null;
    var fetchBytes = async function (url, id, label) {
      var res = await fetch(url).catch(function () { return { ok: false, status: 0 }; });
      if (!res.ok && /\.bin$/.test(url)) res = await fetch(url.replace(/\.bin$/, '.wasm'));   // some hosts only serve known extensions
      if (!res.ok) throw new Error('Could not load ' + url + ' (' + res.status + ')');
      var total = +res.headers.get('content-length') || 0;
      if (!res.body || !total) return new Uint8Array(await res.arrayBuffer());
      var reader = res.body.getReader(), chunks = [], got = 0;
      for (;;) {
        var step = await reader.read();
        if (step.done) break;
        chunks.push(step.value); got += step.value.length;
        self.postMessage({ id: id, progress: { label: label, loaded: got, total: total } });
      }
      var out = new Uint8Array(got), off = 0;
      for (var i = 0; i < chunks.length; i++) { out.set(chunks[i], off); off += chunks[i].length; }
      return out;
    };
    self.onmessage = async function (e) {
      var m = e.data;
      try {
        if (m.type === 'init') {
          importScripts(m.ortUrl);
          var ort = self.ort;
          ort.env.wasm.wasmPaths = m.wasmBase;
          ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
          var det = await fetchBytes(m.detUrl, m.id, 'det');
          var rec = await fetchBytes(m.recUrl, m.id, 'rec');
          wEngine = await Engine.create(ort, det, rec, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
          if (m.zxingUrl) {
            try {
              importScripts(m.zxingUrl);
              var zx = self.ZXingWASM;
              var zxReady = zx.prepareZXingModule({ overrides: { locateFile: function (p) { return p.endsWith('.wasm') ? m.zxingWasmUrl : p; } }, fireImmediately: true });
              await zxReady;
              Engine.useBarcodeReader(async function (img) {
                var im = typeof ImageData !== 'undefined' ? new ImageData(new Uint8ClampedArray(img.data), img.width, img.height) : img;
                var res = await zx.readBarcodes(im, { formats: ['Code39', 'Code128', 'PDF417', 'DataMatrix', 'QRCode'], tryHarder: true, maxNumberOfSymbols: 4 });
                return res.map(function (r) { return r.text; });
              });
            } catch (e) { self.postMessage({ id: m.id, warn: 'barcode reader off: ' + e.message }); }
          }
          self.postMessage({ id: m.id, result: { threads: ort.env.wasm.numThreads } });
        } else if (m.type === 'codes') {
          var cimg = { data: new Uint8ClampedArray(m.buffer), width: m.width, height: m.height };
          var ct0 = Date.now();
          var cands = await wEngine.scanCodes(cimg);
          cands.forEach(function (c) { delete c.box; });
          self.postMessage({ id: m.id, result: { candidates: cands, ms: Date.now() - ct0, barcodeErr: Engine.barcodeErr, barcodeReader: !!barcodeFn_() } });
        } else if (m.type === 'scan' || m.type === 'photo') {
          var img = { data: new Uint8ClampedArray(m.buffer), width: m.width, height: m.height };
          var t0 = Date.now();
          var r = m.type === 'scan' ? await wEngine.scan(img, m.opts) : await wEngine.scanPhoto(img, m.opts);
          r.candidates.forEach(function (c) { delete c.box; });
          r.barcodeErr = Engine.barcodeErr; r.barcodeReader = !!barcodeFn;
          r.ms = Date.now() - t0;
          self.postMessage({ id: m.id, result: r });
        }
      } catch (err) {
        self.postMessage({ id: m.id, error: String(err && err.message || err) });
      }
    };
    return api;
  }
  if (typeof document === 'undefined') return api;

  /* ================================================================== *
   * 4. BROWSER: engine client + scanner UI
   * ================================================================== */
  var SCRIPT_URL = (document.currentScript && document.currentScript.src) || (typeof window !== 'undefined' && window.VIN_SCANNER_SRC) || '';
  var cfg = { base: SCRIPT_URL ? SCRIPT_URL.replace(/[^/]*$/, '') : './' };
  function url(key, rel) { return cfg[key] || new URL(rel, new URL(cfg.base, location.href)).href; }

  var worker = null, ready = null, seq = 0, pending = {};
  function call(type, payload, transfer, onProgress) {
    return new Promise(function (resolve, reject) {
      var id = ++seq; pending[id] = { resolve: resolve, reject: reject, onProgress: onProgress };
      payload.type = type; payload.id = id;
      worker.postMessage(payload, transfer || []);
    });
  }
  /** Start (or reuse) the OCR engine. Safe to call early so the first scan is instant. */
  function preload(onProgress) {
    if (ready) return ready;
    ready = new Promise(function (resolve, reject) {
      try {
        var wsrc = cfg.workerUrl || SCRIPT_URL;
        if (new URL(wsrc, location.href).origin === location.origin) worker = new Worker(wsrc);
        else {
          // scanner files hosted on another site (e.g. Supabase storage): start the worker from a same-origin stub
          var stub = URL.createObjectURL(new Blob(['importScripts(' + JSON.stringify(new URL(wsrc, location.href).href) + ');'], { type: 'text/javascript' }));
          worker = new Worker(stub);
        }
      } catch (e) { ready = null; return reject(e); }
      worker.onmessage = function (e) {
        var m = e.data, p = pending[m.id]; if (m.warn) { console.warn('[vin-scanner] ' + m.warn); return; } if (!p) return;
        if (m.progress) { if (p.onProgress) p.onProgress(m.progress); return; }
        delete pending[m.id];
        if (m.error) p.reject(new Error(m.error)); else p.resolve(m.result);
      };
      worker.onerror = function (e) { ready = null; reject(new Error(e.message || 'Scanner failed to start')); };
      var sizes = { det: 0, rec: 0 }, loaded = { det: 0, rec: 0 };
      call('init', {
        ortUrl: url('ortUrl', 'ort/ort.wasm.min.js'), wasmBase: url('wasmBase', 'ort/'),
        detUrl: url('detUrl', 'models/det.bin'), recUrl: url('recUrl', 'models/rec.bin'),
        zxingUrl: url('zxingUrl', 'zxing-reader.js'), zxingWasmUrl: url('zxingWasmUrl', 'models/zxing.wasm')
      }, [], function (pr) {
        sizes[pr.label] = pr.total; loaded[pr.label] = pr.loaded;
        if (onProgress) onProgress((loaded.det + loaded.rec) / ((sizes.det || 2.5e6) + (sizes.rec || 7.9e6)));
      }).then(resolve, function (err) { ready = null; reject(err); });
    });
    return ready;
  }

  function finish(c, source, ms) {
    return {
      vin: c.vin, verified: !!c.verified, checkDigitOk: checkDigitOk(c.vin), corrected: !!c.corrected,
      confidence: c.confidence == null ? null : Math.round(c.confidence * 100) / 100,
      decoded: decode(c.vin), source: source, ms: ms
    };
  }

  /** Turn a File / Blob / <img> / <canvas> / ImageBitmap into pixels, long side capped. */
  async function toImageData(src, maxSide) {
    var bmp = src;
    if (typeof Blob !== 'undefined' && src instanceof Blob) {
      try { bmp = await createImageBitmap(src, { imageOrientation: 'from-image' }); }
      catch (e) { bmp = await createImageBitmap(src); }
    }
    var w = bmp.videoWidth || bmp.naturalWidth || bmp.width, h = bmp.videoHeight || bmp.naturalHeight || bmp.height;
    var s = Math.min(1, (maxSide || 1600) / Math.max(w, h));
    var c = document.createElement('canvas'); c.width = Math.round(w * s); c.height = Math.round(h * s);
    var ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    if (bmp.close && bmp !== src) bmp.close();
    return ctx.getImageData(0, 0, c.width, c.height);
  }

  /** Read a VIN from a still image with no UI. Resolves { best, candidates, ms }. */
  async function scanImage(src, opts) {
    await preload();
    var id = src && src.data && src.width ? src : await toImageData(src, 1600);
    var codeFrame = src && src.data && src.width ? src : await toImageData(src, 2400);   // barcode bars need full detail
    var cbuf = codeFrame.data.buffer.slice(0);
    var cr = await call('codes', { buffer: cbuf, width: codeFrame.width, height: codeFrame.height }, [cbuf]);
    if (cr.candidates.length) {
      var cl = cr.candidates.map(function (c) { return finish(c, 'barcode', cr.ms); });
      return { best: cl[0], candidates: cl, ms: cr.ms, passes: 0, barcodeErr: cr.barcodeErr, barcodeReader: cr.barcodeReader };
    }
    var buf = id.data.buffer.slice(0);
    var r = await call('photo', { buffer: buf, width: id.width, height: id.height, opts: opts || { budgetMs: 9000 } }, [buf]);
    var list = r.candidates.map(function (c) { return finish(c, 'photo', r.ms); });
    return { best: list[0] || null, candidates: list, ms: r.ms, passes: r.passes, barcodeErr: r.barcodeErr, barcodeReader: r.barcodeReader, codeErr: cr.barcodeErr, codeReader: cr.barcodeReader, codeMs: cr.ms, codeW: codeFrame.width, codeH: codeFrame.height };
  }

  /** Full decode (year / make / model / trim / engine) from the free NHTSA vPIC service. Needs internet. */
  async function lookup(vin) {
    vin = normalize(vin);
    var res = await fetch('https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/' + encodeURIComponent(vin) + '?format=json');
    if (!res.ok) throw new Error('NHTSA lookup failed (' + res.status + ')');
    var j = await res.json(), r = (j.Results && j.Results[0]) || {};
    var eng = [r.DisplacementL ? (+r.DisplacementL).toFixed(1) + 'L' : '', r.EngineCylinders ? r.EngineCylinders + '-cyl' : '', r.EngineModel || ''].filter(Boolean).join(' ');
    return {
      vin: vin, year: r.ModelYear ? +r.ModelYear : null, make: r.Make || null, model: r.Model || null, trim: r.Trim || r.Series || null,
      bodyClass: r.BodyClass || null, engine: eng || null, fuel: r.FuelTypePrimary || null, driveType: r.DriveType || null,
      transmission: r.TransmissionStyle || null, plantCountry: r.PlantCountry || null, errorCode: r.ErrorCode || null, raw: r
    };
  }

  /* ---------------- UI ---------------- */
  var CSS = [
    ':host{all:initial}',
    '*{box-sizing:border-box;margin:0;padding:0}',
    '.vs{position:fixed;inset:0;z-index:2147483000;background:#000;color:#fff;font-family:Montserrat,system-ui,-apple-system,"Segoe UI",sans-serif;display:flex;flex-direction:column;-webkit-user-select:none;user-select:none;touch-action:manipulation}',
    '.bar{flex:none;display:flex;align-items:center;justify-content:space-between;background:#000;border-bottom:6px solid #fff;padding:calc(env(safe-area-inset-top,0px) + 12px) 16px 12px}',
    '.bar h1{font-size:15px;font-weight:300;letter-spacing:.42em;text-transform:uppercase}',
    '.x{width:44px;height:44px;background:none;border:1px solid #555;color:#fff;font-size:22px;line-height:1;cursor:pointer}',
    '.stage{position:relative;flex:1;min-height:0;overflow:hidden;background:#111}',
    'video{position:absolute;left:0;top:0;width:100%;height:100%;object-fit:cover;max-width:none;max-height:none}',
    '.shade{position:absolute;left:0;right:0;background:rgba(0,0,0,.55)}',
    '.frame{position:absolute;border:1px solid rgba(255,255,255,.55)}',
    '.frame i{position:absolute;width:26px;height:26px;border:0 solid #C8201F}',
    '.frame i:nth-child(1){left:-2px;top:-2px;border-left-width:4px;border-top-width:4px}',
    '.frame i:nth-child(2){right:-2px;top:-2px;border-right-width:4px;border-top-width:4px}',
    '.frame i:nth-child(3){left:-2px;bottom:-2px;border-left-width:4px;border-bottom-width:4px}',
    '.frame i:nth-child(4){right:-2px;bottom:-2px;border-right-width:4px;border-bottom-width:4px}',
    '.frame.hit{border-color:#C8201F;box-shadow:0 0 0 3px #C8201F inset}',
    '.hint{position:absolute;left:0;right:0;text-align:center;font-size:12px;font-weight:500;letter-spacing:.14em;text-transform:uppercase;padding:0 16px;text-shadow:0 1px 3px #000}',
    '.read{position:absolute;left:0;right:0;text-align:center;font-family:"JetBrains Mono",ui-monospace,Menlo,Consolas,monospace;font-size:15px;letter-spacing:.08em;color:#d6d6d6;text-shadow:0 1px 3px #000;min-height:20px;padding:0 10px}',
    '.nocam{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:28px;text-align:center;background:#111}',
    '.nocam p{font-size:14px;line-height:1.5;color:#cfcfcf;max-width:340px}',
    '.ctl{flex:none;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:8px;background:#000;padding:14px 14px calc(env(safe-area-inset-bottom,0px) + 14px)}',
    '.ctl .side{display:flex;gap:8px}.ctl .side.r{justify-content:flex-end}',
    '.btn{min-height:46px;padding:0 14px;background:#000;border:1px solid #6b6b6b;color:#fff;font:600 11px Montserrat,system-ui,sans-serif;letter-spacing:.16em;text-transform:uppercase;cursor:pointer}',
    '.btn:active{background:#222}.btn.on{background:#fff;color:#000}',
    '.btn.red{background:#C8201F;border-color:#C8201F}.btn.red:disabled{background:#555;border-color:#555;color:#aaa}',
    '.btn.wide{width:100%;min-height:52px;font-size:12px}',
    '.shutter{width:68px;height:68px;border-radius:50%;background:#fff;border:5px solid #000;outline:2px solid #fff;cursor:pointer}',
    '.shutter:active{background:#C8201F}',
    '.sheet{position:absolute;left:0;right:0;bottom:0;background:#fff;color:#000;border-top:10px solid #000;padding:18px 18px calc(env(safe-area-inset-bottom,0px) + 18px);max-height:92%;overflow:auto;-webkit-user-select:text;user-select:text}',
    '.sheet h2{font-size:12px;font-weight:300;letter-spacing:.4em;text-transform:uppercase;margin-bottom:4px}',
    '.tag{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;margin-bottom:12px}',
    '.tag.ok{color:#000}.tag.ok:before{content:"";display:inline-block;width:9px;height:9px;background:#000;margin-right:8px}',
    '.tag.warn{color:#C8201F}.tag.warn:before{content:"";display:inline-block;width:9px;height:9px;background:#C8201F;margin-right:8px}',
    '.vin{width:100%;font:600 clamp(17px,5.3vw,26px) "JetBrains Mono",ui-monospace,Menlo,Consolas,monospace;letter-spacing:.06em;padding:12px 10px;border:2px solid #000;border-radius:0;background:#f3f3f3;color:#000;text-transform:uppercase;outline:none}',
    '.vin:focus{background:#fff}.vin.bad{border-color:#C8201F}',
    '.meta{font-size:13px;color:#444;margin:10px 0 2px;min-height:18px;line-height:1.45}',
    '.meta b{color:#000;font-weight:700}',
    '.alts{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}',
    '.alts button{font:500 12px "JetBrains Mono",ui-monospace,monospace;padding:8px;border:1px solid #999;background:#fff;color:#000;cursor:pointer}',
    '.row{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px}',
    '.row .btn{background:#fff;color:#000;border-color:#000}.row .btn.red{background:#C8201F;color:#fff;border-color:#C8201F}.row .btn.red:disabled{background:#bbb;border-color:#bbb}',
    '.busy{position:absolute;inset:0;background:rgba(0,0,0,.72);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;font-size:12px;letter-spacing:.2em;text-transform:uppercase}',
    '.prog{width:60%;max-width:280px;height:6px;background:#333}.prog b{display:block;height:100%;width:0;background:#C8201F;transition:width .15s}',
    '[hidden]{display:none!important}',
    '@media (orientation:landscape) and (max-height:520px){.bar{padding-top:6px;padding-bottom:6px}.ctl{padding-top:8px;padding-bottom:8px}.shutter{width:54px;height:54px}}'
  ].join('');

  function ensureFonts() {
    if (document.querySelector('link[data-vinscan-fonts]')) return;
    var l = document.createElement('link'); l.rel = 'stylesheet'; l.setAttribute('data-vinscan-fonts', '');
    l.href = 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500;600&family=Montserrat:wght@300;500;600;700&display=swap';
    document.head.appendChild(l);
  }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  /**
   * Open the scanner. Resolves with the chosen VIN result, or null if closed.
   * opts: { title, live (default true), onResult(result) }
   */
  function open(opts) {
    opts = opts || {};
    ensureFonts();
    return new Promise(function (resolve) {
      var host = el('div'); host.setAttribute('data-vin-scanner', '');
      var rootEl = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
      var style = el('style'); style.textContent = CSS; rootEl.appendChild(style);
      var vs = el('div', 'vs'); vs.setAttribute('role', 'dialog'); vs.setAttribute('aria-label', 'VIN scanner'); rootEl.appendChild(vs);

      var bar = el('div', 'bar'); bar.appendChild(el('h1', '', opts.title || 'VIN Scan'));
      var xBtn = el('button', 'x', '×'); xBtn.setAttribute('aria-label', 'Close'); bar.appendChild(xBtn); vs.appendChild(bar);

      var stage = el('div', 'stage'); vs.appendChild(stage);
      var video = el('video'); video.setAttribute('playsinline', ''); video.setAttribute('autoplay', ''); video.muted = true; stage.appendChild(video);
      var shadeT = el('div', 'shade'), shadeB = el('div', 'shade'), frame = el('div', 'frame');
      for (var k = 0; k < 4; k++) frame.appendChild(el('i'));
      var hint = el('div', 'hint', 'Starting camera…'), read = el('div', 'read');
      stage.appendChild(shadeT); stage.appendChild(shadeB); stage.appendChild(frame); stage.appendChild(hint); stage.appendChild(read);

      var nocam = el('div', 'nocam'); nocam.hidden = true;
      var nocamMsg = el('p', '', '');
      var takeBtn = el('button', 'btn red wide', 'Take a photo of the VIN');
      var pickBtn2 = el('button', 'btn wide', 'Choose a photo');
      nocam.appendChild(nocamMsg); nocam.appendChild(takeBtn); nocam.appendChild(pickBtn2); stage.appendChild(nocam);

      var busy = el('div', 'busy'); busy.hidden = true;
      var busyTxt = el('div', '', ''), prog = el('div', 'prog'), progB = el('b'); prog.appendChild(progB);
      busy.appendChild(busyTxt); busy.appendChild(prog); stage.appendChild(busy);

      var ctl = el('div', 'ctl');
      var left = el('div', 'side'), right = el('div', 'side r');
      var pickBtn = el('button', 'btn', 'Photos'), typeBtn = el('button', 'btn', 'Type'), torchBtn = el('button', 'btn', 'Light'); torchBtn.hidden = true;
      var shutter = el('button', 'shutter'); shutter.setAttribute('aria-label', 'Take photo');
      left.appendChild(pickBtn); left.appendChild(torchBtn); right.appendChild(typeBtn);
      ctl.appendChild(left); ctl.appendChild(shutter); ctl.appendChild(right); vs.appendChild(ctl);

      var fileCam = el('input'); fileCam.type = 'file'; fileCam.accept = 'image/*'; fileCam.setAttribute('capture', 'environment'); fileCam.hidden = true;
      var filePick = el('input'); filePick.type = 'file'; filePick.accept = 'image/*'; filePick.hidden = true;
      vs.appendChild(fileCam); vs.appendChild(filePick);

      var sheet = el('div', 'sheet'); sheet.hidden = true;
      var sh2 = el('h2', '', 'VIN'), tag = el('div', 'tag ok', '');
      var vinIn = el('input', 'vin'); vinIn.setAttribute('maxlength', '20'); vinIn.setAttribute('autocapitalize', 'characters'); vinIn.setAttribute('autocomplete', 'off'); vinIn.setAttribute('autocorrect', 'off'); vinIn.setAttribute('spellcheck', 'false'); vinIn.setAttribute('aria-label', 'VIN');
      var meta = el('div', 'meta'), alts = el('div', 'alts');
      var row = el('div', 'row'), againBtn = el('button', 'btn', 'Scan again'), useBtn = el('button', 'btn red', 'Use this VIN');
      row.appendChild(againBtn); row.appendChild(useBtn);
      sheet.appendChild(sh2); sheet.appendChild(tag); sheet.appendChild(vinIn); sheet.appendChild(meta); sheet.appendChild(alts); sheet.appendChild(row);
      stage.appendChild(sheet);

      document.body.appendChild(host);
      var prevOverflow = document.documentElement.style.overflow; document.documentElement.style.overflow = 'hidden';

      var stream = null, track = null, running = false, closed = false, engineOk = false, scanning = false, tickN = 0;
      var votes = {}, current = null, torchOn = false, liveCanvas = document.createElement('canvas');
      var liveCtx = liveCanvas.getContext('2d', { willReadFrequently: true });

      // Phone turned sideways: browsers on iPhone can't lock rotation, so turn the scanner back so it stays
      // upright on the phone, and keep the camera picture level with the real world.
      function uiAngle() {
        if (!(('ontouchstart' in window) || navigator.maxTouchPoints > 0)) return 0;
        var o = (screen.orientation && typeof screen.orientation.angle === 'number') ? screen.orientation.angle
          : (typeof window.orientation === 'number' ? window.orientation : 0);
        o = ((o % 360) + 360) % 360; return o === 90 ? 90 : o === 270 ? -90 : 0;
      }
      function layout() {
        var a = uiAngle(), vpW = window.innerWidth, vpH = window.innerHeight;
        if (a && vpW > vpH) vs.style.cssText = 'right:auto;bottom:auto;width:' + vpH + 'px;height:' + vpW + 'px;left:' + ((vpW - vpH) / 2) + 'px;top:' + ((vpH - vpW) / 2) + 'px;transform:rotate(' + (-a) + 'deg)';
        else { a = 0; vs.style.cssText = ''; }
        var W = stage.clientWidth, H = stage.clientHeight; if (!W || !H) return;
        var fw = Math.min(W * 0.92, 900), fh = Math.max(64, Math.min(H * 0.3, fw * 0.3));
        var fx = (W - fw) / 2, fy = Math.max(46, H * 0.4 - fh / 2);
        frame.style.cssText = 'left:' + fx + 'px;top:' + fy + 'px;width:' + fw + 'px;height:' + fh + 'px';
        shadeT.style.cssText = 'top:0;height:' + fy + 'px'; shadeB.style.cssText = 'top:' + (fy + fh) + 'px;bottom:0';
        hint.style.top = Math.max(8, fy - 28) + 'px'; read.style.top = (fy + fh + 10) + 'px';
        frame._r = { x: fx, y: fy, w: fw, h: fh, W: W, H: H, a: a };
        // Size the camera picture ourselves so it always fills the screen. iPhone Safari sometimes stops
        // applying object-fit:cover when the camera switches orientation, leaving a narrow strip in the middle.
        var vw = video.videoWidth, vh = video.videoHeight;
        if (vw && vh) {
          var sc = a ? Math.max(W / vh, H / vw) : Math.max(W / vw, H / vh), dw = Math.ceil(vw * sc), dh = Math.ceil(vh * sc);
          video.style.cssText = 'left:' + Math.floor((W - dw) / 2) + 'px;top:' + Math.floor((H - dh) / 2) + 'px;width:' + dw + 'px;height:' + dh + 'px' + (a ? ';transform:rotate(' + a + 'deg)' : '');
        }
      }
      var onResize = function () { layout(); };
      window.addEventListener('resize', onResize); window.addEventListener('orientationchange', onResize);
      if (screen.orientation && screen.orientation.addEventListener) screen.orientation.addEventListener('change', onResize);
      try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('portrait').catch(function () {}); } catch (e) {}
      video.addEventListener('resize', onResize);   // camera picture changed size (e.g. turned to portrait)
      video.addEventListener('playing', onResize);
      if (window.ResizeObserver) { try { new ResizeObserver(onResize).observe(stage); } catch (e) {} }

      function close(result) {
        if (closed) return; closed = true; running = false;
        if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
        window.removeEventListener('resize', onResize); window.removeEventListener('orientationchange', onResize);
        if (screen.orientation && screen.orientation.removeEventListener) screen.orientation.removeEventListener('change', onResize);
        try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (e) {}
        document.documentElement.style.overflow = prevOverflow;
        host.remove();
        if (result && opts.onResult) { try { opts.onResult(result); } catch (e) { setTimeout(function () { throw e; }); } }
        resolve(result || null);
      }

      function describe(vin) {
        var d = decode(vin); if (!d) return '';
        var parts = [];
        if (d.year) parts.push('<b>' + d.year + '</b>');
        if (d.make) parts.push('<b>' + d.make + '</b>');
        if (d.country) parts.push('Built in ' + d.country);
        return parts.join(' · ');
      }
      function refreshSheet() {
        var v = normalize(vinIn.value), src = current ? current.source : 'manual';
        var ok = checkDigitOk(v), formed = isWellFormed(v);
        vinIn.classList.toggle('bad', v.length > 0 && !ok);
        var fromScan = current && current.vin === v;
        if (!v.length) { tag.className = 'tag warn'; tag.textContent = 'Enter the 17-character VIN'; }
        else if (v.length !== 17) { tag.className = 'tag warn'; tag.textContent = v.length + ' of 17 characters'; }
        else if (!formed) { tag.className = 'tag warn'; tag.textContent = 'Not a valid VIN'; }
        else if (ok && (!fromScan || current.verified)) { tag.className = 'tag ok'; tag.textContent = 'Check digit verified'; }
        else if (ok) { tag.className = 'tag warn'; tag.textContent = 'Best guess — compare with the car'; }
        else { tag.className = 'tag warn'; tag.textContent = 'Check digit does not match — re-check each character'; }
        meta.innerHTML = formed ? describe(v) : '';
        useBtn.disabled = !formed;
        useBtn.textContent = formed && !ok ? 'Use anyway' : (fromScan && !current.verified ? 'I checked \u2014 use it' : 'Use this VIN');
        sheet._src = src;
      }
      vinIn.addEventListener('input', function () {
        var p = vinIn.selectionStart; vinIn.value = vinIn.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 17);
        try { vinIn.setSelectionRange(p, p); } catch (e) {}
        refreshSheet();
      });
      function showSheet(res, others) {
        current = res; running = false;
        sh2.textContent = res ? 'VIN found' : 'Enter VIN';
        vinIn.value = res ? res.vin : '';
        alts.innerHTML = '';
        (others || []).slice(0, 3).forEach(function (o) {
          if (!res || o.vin === res.vin) return;
          var b = el('button', '', o.vin); b.addEventListener('click', function () { vinIn.value = o.vin; current = o; refreshSheet(); }); alts.appendChild(b);
        });
        sheet.hidden = false; refreshSheet();
        if (!res) setTimeout(function () { vinIn.focus(); }, 50);
      }
      function hideSheet() {
        sheet.hidden = true; current = null; votes = {}; read.textContent = ''; frame.classList.remove('hit');
        if (stream) { running = true; loop(); }
      }
      againBtn.addEventListener('click', hideSheet);
      useBtn.addEventListener('click', function () {
        var v = normalize(vinIn.value); if (!isWellFormed(v)) return;
        var res = current && current.vin === v ? current : { vin: v, verified: false, checkDigitOk: checkDigitOk(v), corrected: false, confidence: null, decoded: decode(v), source: 'manual' };
        if (!(current && current.vin === v)) res.source = current ? current.source + '+edited' : 'manual';
        res.confirmedByUser = true;
        close(res);
      });
      xBtn.addEventListener('click', function () { close(null); });
      typeBtn.addEventListener('click', function () { showSheet(null); });

      function setBusy(text, frac) {
        if (text == null) { busy.hidden = true; return; }
        busy.hidden = false; busyTxt.textContent = text; prog.hidden = frac == null; if (frac != null) progB.style.width = Math.round(frac * 100) + '%';
      }

      async function handlePhoto(source, label) {
        if (scanning) return; scanning = true; var wasRunning = running; running = false;
        try {
          setBusy('Reading photo…');
          var id = source && source.data ? source : await toImageData(source, 1600);
          var r = await scanImage(id, { budgetMs: 9000 });
          setBusy(null);
          if (r.best) { r.candidates.forEach(function (c) { c.source = label; }); buzz(r.best.verified);
            if (opts.autoReturn !== false && r.best.checkDigitOk) { running = false; r.best.autoReturned = true; close(r.best); return; }
            showSheet(r.best, r.candidates); }
          else {
            hint.textContent = 'No VIN found — get closer, avoid glare, or type it';
            nocamMsg.textContent = 'No VIN found in that photo. Fill the picture with the VIN, avoid glare, and try again — or type it in.';
            running = wasRunning; if (running) loop();
          }
        } catch (e) {
          setBusy(null); hint.textContent = 'Scanner error: ' + e.message; nocamMsg.textContent = 'Scanner error: ' + e.message; running = wasRunning; if (running) loop();
        }
        scanning = false;
      }
      function onFile(inp) { return function () { var f = inp.files && inp.files[0]; inp.value = ''; if (f) handlePhoto(f, 'photo'); }; }
      fileCam.addEventListener('change', onFile(fileCam)); filePick.addEventListener('change', onFile(filePick));
      pickBtn.addEventListener('click', function () { filePick.click(); });
      pickBtn2.addEventListener('click', function () { filePick.click(); });
      takeBtn.addEventListener('click', function () { fileCam.click(); });
      shutter.addEventListener('click', function () {
        if (!stream || !video.videoWidth) { fileCam.click(); return; }
        var shot = shownImage();
        var c = document.createElement('canvas'), s = Math.min(1, 1920 / Math.max(shot.w, shot.h));
        c.width = Math.round(shot.w * s); c.height = Math.round(shot.h * s);
        var cx = c.getContext('2d', { willReadFrequently: true }); cx.drawImage(shot.src, 0, 0, c.width, c.height);
        handlePhoto(cx.getImageData(0, 0, c.width, c.height), 'photo');
      });
      torchBtn.addEventListener('click', function () {
        torchOn = !torchOn;
        track.applyConstraints({ advanced: [{ torch: torchOn }] }).then(function () { torchBtn.classList.toggle('on', torchOn); }, function () { torchOn = false; });
      });
      function buzz(strong) { try { if (navigator.vibrate) navigator.vibrate(strong ? [60, 40, 60] : 40); } catch (e) {} }

      // ---- live preview loop ----
      var rotCanvas = document.createElement('canvas'), rotCtx = rotCanvas.getContext('2d', { willReadFrequently: true });
      function shownImage() {
        var vw = video.videoWidth, vh = video.videoHeight, a = (frame._r && frame._r.a) || 0;
        if (!vw || !a) return { src: video, w: vw, h: vh };
        var k = Math.min(1, 1920 / Math.max(vw, vh)), w = Math.round(vw * k), h = Math.round(vh * k);
        rotCanvas.width = h; rotCanvas.height = w;
        rotCtx.setTransform(1, 0, 0, 1, 0, 0); rotCtx.translate(h / 2, w / 2); rotCtx.rotate(a * Math.PI / 180);
        rotCtx.drawImage(video, -w / 2, -h / 2, w, h); rotCtx.setTransform(1, 0, 0, 1, 0, 0);
        return { src: rotCanvas, w: h, h: w };
      }
      function grab(full) {
        var r = frame._r; if (!video.videoWidth || !r) return null;
        var img = shownImage(), vw = img.w, vh = img.h;
        var scale = Math.max(r.W / vw, r.H / vh), offX = (vw - r.W / scale) / 2, offY = (vh - r.H / scale) / 2;
        var sx, sy, sw, sh;
        if (full) { sx = offX; sy = offY; sw = r.W / scale; sh = r.H / scale; }
        else {
          var mx = r.w * 0.04, my = r.h * 0.35;       // read a little outside the frame so near-misses still count
          sx = offX + (r.x - mx) / scale; sy = offY + (r.y - my) / scale; sw = (r.w + 2 * mx) / scale; sh = (r.h + 2 * my) / scale;
        }
        sx = Math.max(0, sx); sy = Math.max(0, sy); sw = Math.min(vw - sx, sw); sh = Math.min(vh - sy, sh);
        var k = Math.min(1, 1280 / Math.max(sw, sh));
        liveCanvas.width = Math.round(sw * k); liveCanvas.height = Math.round(sh * k);
        liveCtx.drawImage(img.src, sx, sy, sw, sh, 0, 0, liveCanvas.width, liveCanvas.height);
        return liveCtx.getImageData(0, 0, liveCanvas.width, liveCanvas.height);
      }
      async function loop() {
        if (!running || closed || scanning || !engineOk) return;
        scanning = true;
        try {
          tickN++;
          var full = tickN % 4 === 0, id = grab(full);
          if (id) {
            var buf = id.data.buffer;
            var r = await call('scan', { buffer: buf, width: id.width, height: id.height, opts: { detLimit: full ? 960 : 736, maxBoxes: full ? 10 : 6, codes: true } }, [buf]);
            if (running && !closed) onLive(r);
          }
        } catch (e) { hint.textContent = 'Scanner error: ' + e.message; running = false; }
        scanning = false;
        if (running && !closed) setTimeout(loop, 30);
      }
      function onLive(r) {
        var now = Date.now(), top = r.candidates[0];
        for (var key in votes) if (now - votes[key].t > 4000) delete votes[key];
        r.candidates.forEach(function (c) {
          var v = votes[c.vin] || (votes[c.vin] = { n: 0, t: now, c: c });
          v.n++; v.t = now; if (c.score > v.c.score) v.c = c;
        });
        var pick = null, sure = false;
        r.candidates.forEach(function (c) {
          if (pick) return;
          var v = votes[c.vin];
          if ((c.verified && (c.confidence >= 0.93 || v.n >= 2)) || (c.checkDigitOk && !c.corrected && c.plausible && c.kind !== 'loose' && v.n >= 2)) { pick = v.c; sure = true; }
        });
        if (!pick) {          // a repaired or check-digit-less read that keeps coming back: offer it, flagged
          for (var k2 in votes) { var w = votes[k2]; if (w.n >= 4 && (!pick || w.n > votes[pick.vin].n)) pick = w.c; }
        }
        if (pick) {
          frame.classList.add('hit'); buzz(sure);
          var res = finish(pick, 'live', r.ms); res.verified = sure;
          if (opts.autoReturn !== false) {   // found one: go straight back with it (the portal flags unsure reads to compare)
            running = false; read.textContent = res.vin.replace(/(.{3})(.{6})(.{8})/, '$1 $2 $3') + ' \u2713';
            setTimeout(function () { res.confirmedByUser = false; res.autoReturned = true; close(res); }, 350);
            return;
          }
          var others = Object.keys(votes).map(function (k3) { return finish(votes[k3].c, 'live'); });
          showSheet(res, others);
        } else if (top) { read.textContent = top.vin.replace(/(.{3})(.{6})(.{8})/, '$1 $2 $3') + ' ?'; }
        else if (r.lines && r.lines.length) { read.textContent = ''; }
      }

      // ---- start ----
      layout();
      // Live camera only works on a real https page of its own. Inside an embedded or sandboxed frame
      // (such as a chat preview) the browser refuses the camera no matter what the phone allows.
      var frameProblem = null;
      try { if (window.self !== window.top) frameProblem = 'Live camera is turned off in this preview. Open the scanner from teams.citeamotors.com, or take a photo of the VIN now.'; } catch (e) { frameProblem = 'Live camera is turned off in this preview. Open the scanner from teams.citeamotors.com, or take a photo of the VIN now.'; }
      if (!frameProblem && !window.isSecureContext) frameProblem = 'Live camera needs a secure (https) page. Take a photo of the VIN now.';
      var wantLive = opts.live !== false && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && !frameProblem;
      function noCamera(msg) {
        video.hidden = shadeT.hidden = shadeB.hidden = frame.hidden = hint.hidden = read.hidden = true;
        nocam.hidden = false; nocamMsg.textContent = msg; shutter.hidden = true; pickBtn.hidden = true;
      }
      setBusy('Loading scanner…', 0);
      preload(function (f) { if (!busy.hidden && !scanning) setBusy('Loading scanner…', f); }).then(function () {
        engineOk = true; if (!scanning) setBusy(null);
        if (running) { hint.textContent = 'Line the VIN up inside the frame'; loop(); }
      }, function (e) {
        setBusy(null); hint.textContent = 'Scanner could not load'; nocamMsg.textContent = 'The scanner could not load (' + e.message + '). You can still type the VIN.';
      });
      if (wantLive) {
        navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } }).then(function (s) {
          if (closed) { s.getTracks().forEach(function (t) { t.stop(); }); return; }
          stream = s; track = s.getVideoTracks()[0]; video.srcObject = s;
          var p = video.play(); if (p && p.catch) p.catch(function () {});
          try {
            var caps = track.getCapabilities ? track.getCapabilities() : {};
            if (caps.torch) torchBtn.hidden = false;
            if (caps.focusMode && caps.focusMode.indexOf('continuous') >= 0) track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(function () {});
          } catch (e) {}
          video.addEventListener('loadedmetadata', function () { layout(); running = true; hint.textContent = engineOk ? 'Line the VIN up inside the frame' : 'Loading scanner…'; loop(); }, { once: true });
        }).catch(function (err) {
          var why = err && err.name;
          noCamera(why === 'NotAllowedError' || why === 'SecurityError'
            ? 'The browser did not give this page camera access. On iPhone: Settings > Apps > Safari (or your browser) > Camera > Allow, then reload this page. You can also take a photo of the VIN now.'
            : why === 'NotFoundError' || why === 'OverconstrainedError'
              ? 'No camera was found on this device. Take a photo of the VIN instead.'
              : 'Live camera could not start' + (why ? ' (' + why + ')' : '') + '. Take a photo of the VIN instead.');
        });
      } else {
        noCamera(frameProblem || 'Take or choose a photo of the VIN — door-jamb sticker or the plate at the base of the windshield.');
      }
    });
  }

  /**
   * Wire a VIN text input: adds a "Scan VIN" button after it (or uses opts.button),
   * fills the input, fires input/change events, then calls opts.onResult(result).
   */
  function attach(input, opts) {
    opts = opts || {};
    if (typeof input === 'string') input = document.querySelector(input);
    var btn = opts.button ? (typeof opts.button === 'string' ? document.querySelector(opts.button) : opts.button) : null;
    if (!btn) {
      btn = document.createElement('button'); btn.type = 'button'; btn.textContent = opts.label || 'Scan VIN'; btn.className = opts.className || 'vin-scan-btn';
      input.insertAdjacentElement('afterend', btn);
    }
    btn.addEventListener('click', function () {
      open(opts.scanner).then(function (res) {
        if (!res) return;
        input.value = res.vin;
        input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }));
        if (opts.onResult) opts.onResult(res);
      });
    });
    if (opts.preload) preload().catch(function () {});
    return btn;
  }

  api.configure = function (o) { for (var k in o) cfg[k] = o[k]; return api; };
  api.preload = preload; api.open = open; api.attach = attach; api.scanImage = scanImage; api.lookup = lookup;
  return api;
});
