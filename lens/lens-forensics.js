/* ═══════════════════════════════════════════════════════════════════
   LUNARA LENS — forensics that run on the phone
   ═══════════════════════════════════════════════════════════════════

   Free, private and offline: nothing here leaves the device. Each
   check returns findings of the same shape,

     { label, strength: 'strong'|'moderate'|'weak', points_to: 'ai'|'human'|'neither' }

   so the app can show them, speak them, and pass them to the model as
   evidence when the person has a licence.

   Order of trust, which the wording in the app follows:
     1. Provenance written into the file — C2PA content credentials, the
        IPTC "trainedAlgorithmicMedia" source type, generator tags,
        a Lunara Mark. The strongest evidence there is, when present.
     2. Camera metadata. Suggests a real capture, but is easy to fake
        and is stripped by most apps, so it is never decisive.
     3. Statistical signals (error levels, acoustics, text rhythm).
        Hints only. They are shown as hints.
   ═══════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  var F = function (label, strength, points_to) { return { label: label, strength: strength, points_to: points_to }; };

  /* Generator fingerprints: text a tool leaves in the files it makes. */
  var GENERATORS = [
    [/Steps: \d+, Sampler:|CFG scale:|sd-metadata|[Ss]table[- ]?[Dd]iffusion|AUTOMATIC1111|InvokeAI/, 'Stable Diffusion'],
    [/"class_type"|ComfyUI/, 'ComfyUI (Stable Diffusion / Flux)'],
    [/black-forest-labs|\bFLUX\.1/, 'Flux'],
    [/[Mm]idjourney|Job ID: [0-9a-f-]{20,}/, 'Midjourney'],
    [/DALL[·\-.]?E|dall-e|\bOpenAI\b|ChatGPT|gpt-image|GPT-4o/, 'OpenAI (DALL·E / ChatGPT)'],
    [/Adobe Firefly|\bFirefly\b/, 'Adobe Firefly'],
    [/\bImagen\b|\bGemini\b|Made with Google AI|SynthID|Nano Banana/, 'Google AI (Imagen / Gemini)'],
    [/\bMeta AI\b|Imagine with Meta/, 'Meta AI'],
    [/\bGrok\b|\bxAI\b/, 'xAI Grok'],
    [/Leonardo\.Ai|leonardo\.ai/, 'Leonardo.Ai'],
    [/\bIdeogram\b/, 'Ideogram'],
    [/\bNovelAI\b/, 'NovelAI'],
    [/\bRunwayML\b|\bRunway Gen-[234]/, 'Runway'],
    [/\bOpenAI Sora\b|\bSora\b(?= |$)/, 'OpenAI Sora'],
    [/\bGoogle Veo\b|\bVeo [23]\b/, 'Google Veo'],
    [/\bKling\b|Kuaishou/, 'Kling'],
    [/\bPika Labs\b/, 'Pika'],
    [/Luma (AI|Dream Machine)/, 'Luma'],
    [/ElevenLabs|Eleven Labs|elevenlabs\.|eleven_multilingual|eleven_v3/, 'ElevenLabs'],
    [/\bSuno\b/, 'Suno'],
    [/\bUdio\b/, 'Udio']
  ];
  /* Only readable runs of text are searched, as the Unix "strings" tool
     does. Searching raw bytes lets compressed data spell short names by
     chance: a voice file once "said" Emu. */
  function readable(bytes, from, to) {
    var s = latin1(bytes, from, to), m = s.match(/[\x20-\x7e]{5,}/g);
    return m ? m.join('\n') : '';
  }

  function latin1(bytes, from, to) {
    var s = '', end = Math.min(bytes.length, to);
    for (var i = from; i < end; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(end, i + 8192)));
    return s;
  }

  /* A light TIFF/EXIF reader: the handful of tags that matter here. */
  function readExif(b, start, len) {
    var out = {};
    try {
      var le = b[start] === 0x49;
      var u16 = function (o) { return le ? b[start + o] | (b[start + o + 1] << 8) : (b[start + o] << 8) | b[start + o + 1]; };
      var u32 = function (o) { return le ? (b[start + o] | (b[start + o + 1] << 8) | (b[start + o + 2] << 16) | (b[start + o + 3] << 24)) >>> 0 : ((b[start + o] << 24) | (b[start + o + 1] << 16) | (b[start + o + 2] << 8) | b[start + o + 3]) >>> 0; };
      var str = function (o, n) { var s = ''; for (var i = 0; i < n && start + o + i < b.length; i++) { var c = b[start + o + i]; if (!c) break; s += String.fromCharCode(c); } return s.trim(); };
      var NAMES = { 0x010F: 'make', 0x0110: 'model', 0x0131: 'software', 0x0132: 'datetime', 0x013B: 'artist', 0x8298: 'copyright', 0x9003: 'taken', 0xA434: 'lens', 0x010E: 'description' };
      var ifd = function (off, depth) {
        if (off + 2 > len || depth > 2) return;
        var n = u16(off);
        for (var i = 0; i < n && i < 200; i++) {
          var e = off + 2 + i * 12, tag = u16(e), type = u16(e + 2), cnt = u32(e + 4);
          if (tag === 0x8769) { ifd(u32(e + 8), depth + 1); continue; }
          if (NAMES[tag] && type === 2) out[NAMES[tag]] = cnt <= 4 ? str(e + 8, cnt) : str(u32(e + 8), cnt);
        }
      };
      ifd(u32(4), 0);
    } catch (e) { /* malformed EXIF is common and not evidence of anything */ }
    return out;
  }

  /* Scan any image, audio or video file's bytes for provenance. */
  function scanFile(bytes, name, type) {
    var findings = [], facts = {};
    var b = bytes;
    var head = latin1(b, 0, 262144);
    var text = readable(b, 0, 262144) + '\n' + (b.length > 262144 ? readable(b, b.length - 131072, b.length) : '');

    // C2PA content credentials: a JUMBF box labelled c2pa (JPEG APP11, PNG caBX, MP4 uuid).
    if (/jumb[\s\S]{0,64}c2pa|c2pa\.(actions|hash|claim)|caBX/.test(text)) {
      facts.c2pa = true;
      findings.push(F('Content Credentials (C2PA) are attached to this file', 'strong', 'neither'));
      if (/trainedAlgorithmicMedia|c2pa\.created[\s\S]{0,200}(AI|trained)/i.test(text)) {
        findings.push(F('Its Content Credentials declare it was generated by AI', 'strong', 'ai'));
        facts.declaredAI = true;
      }
      var who = /"author":\[\{"@type":"(?:Organization|Person)","name":"([^"]{2,60})"/.exec(text) || /claim_generator[^A-Za-z]{0,6}([A-Za-z][\w .\-/]{2,40})/.exec(text);
      if (who) { facts.c2paBy = who[1]; findings.push(F('The credentials name who made it: ' + who[1], 'strong', 'neither')); }
    }
    // IPTC digital source type, used by Google, Meta, Adobe, OpenAI and others.
    var dst = /digitalsourcetype[^a-z]{0,40}[^"<]*?(compositeWithTrainedAlgorithmicMedia|trainedAlgorithmicMedia|algorithmicMedia|compositeSynthetic|digitalCapture|virtualRecording|minorHumanEdits)/i.exec(text)
      || /(compositeWithTrainedAlgorithmicMedia|trainedAlgorithmicMedia)/.exec(text);
    if (dst) {
      var v = dst[1];
      facts.sourceType = v;
      if (/trainedAlgorithmic|compositeSynthetic|algorithmicMedia/i.test(v)) {
        findings.push(F('The file declares itself AI-generated (IPTC source type: ' + v + ')', 'strong', 'ai'));
        facts.declaredAI = true;
      } else if (/digitalCapture/i.test(v)) {
        findings.push(F('The file declares a camera capture (IPTC source type)', 'moderate', 'human'));
      }
    }
    // Generator tags.
    var seen = {};
    GENERATORS.forEach(function (g) {
      if (!seen[g[1]] && g[0].test(text)) { seen[g[1]] = 1; facts.generator = facts.generator || g[1]; findings.push(F('Generator tag found: ' + g[1], 'strong', 'ai')); }
    });
    // PNG text chunks: Stable Diffusion front-ends write the full prompt here.
    if (b[0] === 0x89 && b[1] === 0x50) {
      facts.format = 'PNG';
      var off = 8;
      while (off + 12 <= b.length) {
        var clen = ((b[off] << 24) | (b[off + 1] << 16) | (b[off + 2] << 8) | b[off + 3]) >>> 0;
        var ctype = latin1(b, off + 4, off + 8);
        if (ctype === 'IDAT' || ctype === 'IEND' || clen > b.length) break;
        if (ctype === 'tEXt' || ctype === 'iTXt') {
          var body = latin1(b, off + 8, off + 8 + Math.min(clen, 4000));
          var key = body.split('\0')[0];
          if (/^(parameters|prompt|workflow|Comment|Description|Software|Dream|sd-metadata)$/i.test(key)) {
            var val = body.slice(key.length + 1).replace(/^[\0\x00-\x1f]+/, '').replace(/[^\x20-\x7e]/g, ' ').trim();
            var aiKey = /^(parameters|prompt|workflow|Dream|sd-metadata)$/i.test(key);
            findings.push(F('The image carries a "' + key + '" text block' + (aiKey ? ', which AI image tools write' : '') + ': "' + val.slice(0, 90) + (val.length > 90 ? '…' : '') + '"', aiKey ? 'strong' : 'weak', aiKey ? 'ai' : 'neither'));
          }
        }
        off += 12 + clen;
      }
    }
    // JPEG EXIF.
    if (b[0] === 0xFF && b[1] === 0xD8) {
      facts.format = 'JPEG';
      var i = 2;
      while (i + 4 < b.length && b[i] === 0xFF) {
        var marker = b[i + 1], len = (b[i + 2] << 8) | b[i + 3];
        if (marker === 0xE1 && latin1(b, i + 4, i + 10) === 'Exif\0\0') { facts.exif = readExif(b, i + 10, len - 8); }
        if (marker === 0xDA) break;
        i += 2 + len;
      }
    }
    var ex = facts.exif || {};
    if (ex.make || ex.model) {
      findings.push(F('Camera details present: ' + [ex.make, ex.model].filter(Boolean).join(' ') + (ex.taken ? ', taken ' + ex.taken : ''), 'moderate', 'human'));
    }
    if (ex.software) {
      var sw = ex.software;
      var edit = /photoshop|lightroom|gimp|snapseed|picsart|canva|facetune|remini/i.test(sw);
      findings.push(F('Edited or saved with: ' + sw, edit ? 'moderate' : 'weak', edit ? 'neither' : 'neither'));
      if (/Generative Fill|Firefly|AI/i.test(sw)) findings.push(F('The editing software names an AI feature: ' + sw, 'moderate', 'ai'));
    }
    // A Lunara Mark in the XMP.
    var lm = /lunara:mark="([0-9A-Z]{8})"/.exec(text);
    if (lm) { facts.lunaraMark = lm[1]; findings.push(F('A Lunara Mark is recorded in the file: ' + lm[1], 'strong', 'neither')); }

    if (!findings.length) {
      findings.push(F('No provenance data in the file. That is normal: messaging apps and social networks remove it, so its absence proves nothing.', 'weak', 'neither'));
    }
    facts.bytes = b.length; facts.name = name || ''; facts.type = type || '';
    return { findings: findings, facts: facts };
  }

  /* Error level analysis: re-save at a known quality and look at what
     changes. Pasted or regenerated regions often recompress
     differently from the rest. A picture for a person to look at,
     never a verdict. */
  function ela(canvas, quality) {
    return new Promise(function (resolve) {
      var w = canvas.width, h = canvas.height;
      var img = new Image();
      img.onload = function () {
        var c2 = document.createElement('canvas'); c2.width = w; c2.height = h;
        var x = c2.getContext('2d'); x.drawImage(img, 0, 0);
        var a = canvas.getContext('2d').getImageData(0, 0, w, h).data, bb = x.getImageData(0, 0, w, h);
        var d = bb.data, sum = 0, n = w * h, cells = [], G = 8;
        for (var g = 0; g < G * G; g++) cells.push(0);
        for (var i = 0, p = 0; i < a.length; i += 4, p++) {
          var e = (Math.abs(a[i] - d[i]) + Math.abs(a[i + 1] - d[i + 1]) + Math.abs(a[i + 2] - d[i + 2])) / 3;
          sum += e;
          var v = Math.min(255, e * 18);
          d[i] = v; d[i + 1] = v * 0.78; d[i + 2] = v * 0.35; d[i + 3] = 255;
          cells[Math.min(G - 1, Math.floor((p % w) / w * G)) + G * Math.min(G - 1, Math.floor(Math.floor(p / w) / h * G))] += e;
        }
        x.putImageData(bb, 0, 0);
        var mean = sum / n, per = cells.map(function (c) { return c / (n / (G * G)); });
        var mu = per.reduce(function (s, v) { return s + v; }, 0) / per.length;
        var sd = Math.sqrt(per.reduce(function (s, v) { return s + (v - mu) * (v - mu); }, 0) / per.length);
        resolve({ canvas: c2, mean: mean, unevenness: mu ? sd / mu : 0 });
      };
      img.src = canvas.toDataURL('image/jpeg', quality || 0.9);
    });
  }

  function elaFindings(r) {
    var out = [];
    if (r.unevenness > 0.9) out.push(F('Compression levels are uneven across the picture, which can mean parts were pasted in or regenerated', 'weak', 'ai'));
    else out.push(F('Compression levels are even across the picture', 'weak', 'neither'));
    return out;
  }

  /* ── text ──────────────────────────────────────────────────────── */
  var STOCK = {
    en: ['delve', 'tapestry', 'testament to', 'in today\'s fast-paced', 'it\'s important to note', 'in conclusion', 'navigate the complexities', 'a rich tapestry', 'multifaceted', 'furthermore', 'moreover', 'seamlessly', 'unlock the potential', 'embark on', 'ever-evolving', 'plays a crucial role', 'in the realm of', 'let\'s dive', 'game-changer', 'elevate your'],
    es: ['en conclusión', 'cabe destacar', 'es importante destacar', 'en el mundo actual', 'sin lugar a dudas', 'desempeña un papel crucial', 'en el ámbito de', 'además', 'asimismo', 'un rico tapiz', 'sumergirnos', 'potenciar', 'en constante evolución', 'de manera eficiente', 'no solo', 'sino también']
  };

  function textStats(text, lang) {
    var t = String(text || '').trim();
    var words = t.split(/\s+/).filter(Boolean);
    var sentences = t.split(/(?<=[.!?¡¿])\s+/).map(function (s) { return s.split(/\s+/).filter(Boolean).length; }).filter(function (n) { return n > 0; });
    var mean = sentences.reduce(function (a, b) { return a + b; }, 0) / Math.max(1, sentences.length);
    var sd = Math.sqrt(sentences.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0) / Math.max(1, sentences.length));
    var burst = mean ? sd / mean : 0;
    var lower = t.toLowerCase(), hits = [];
    (STOCK[lang] || STOCK.en).concat(lang === 'es' ? STOCK.en : []).forEach(function (p) { if (lower.indexOf(p) >= 0) hits.push(p); });
    var uniq = {}; words.forEach(function (w) { uniq[w.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '')] = 1; });
    var ttr = words.length ? Object.keys(uniq).length / words.length : 0;
    var findings = [];
    if (words.length < 80) findings.push(F('Only ' + words.length + ' words. Short texts cannot be judged reliably by anyone', 'strong', 'neither'));
    if (sentences.length >= 5) {
      if (burst < 0.3) findings.push(F('Sentence lengths are very even (' + burst.toFixed(2) + '); people usually vary more', 'weak', 'ai'));
      else if (burst > 0.6) findings.push(F('Sentence lengths vary a lot, as people\'s writing usually does', 'weak', 'human'));
    }
    if (hits.length >= 3) findings.push(F('Several phrases common in AI writing: ' + hits.slice(0, 5).join(', '), 'moderate', 'ai'));
    else if (hits.length) findings.push(F('Phrase sometimes overused by AI: ' + hits.join(', '), 'weak', 'ai'));
    return { words: words.length, sentences: sentences.length, burstiness: burst, ttr: ttr, stock: hits, findings: findings };
  }

  /* ── audio ─────────────────────────────────────────────────────── */
  function fft(re, im) { // in place, radix-2
    var n = re.length;
    for (var i = 1, j = 0; i < n; i++) {
      var bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { var t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (var len = 2; len <= n; len <<= 1) {
      var ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (i = 0; i < n; i += len) {
        var cr = 1, ci = 0;
        for (var k = 0; k < len / 2; k++) {
          var ar = re[i + k], ai = im[i + k], br = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, bi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
          re[i + k] = ar + br; im[i + k] = ai + bi; re[i + k + len / 2] = ar - br; im[i + k + len / 2] = ai - bi;
          var nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
        }
      }
    }
  }

  /* Measurements of a voice recording. samples: Float32Array mono. */
  function audioStats(samples, rate) {
    var N = 2048, hop = 1024, frames = [];
    var win = new Float64Array(N);
    for (var i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
    var zeros = 0, clips = 0;
    for (i = 0; i < samples.length; i++) { var s = samples[i]; if (s === 0) zeros++; if (Math.abs(s) > 0.995) clips++; }
    for (var start = 0; start + N <= samples.length && frames.length < 4000; start += hop) {
      var re = new Float64Array(N), im = new Float64Array(N), e = 0;
      for (i = 0; i < N; i++) { var v = samples[start + i]; e += v * v; re[i] = v * win[i]; }
      var rms = Math.sqrt(e / N);
      fft(re, im);
      var mags = new Float64Array(N / 2), total = 0, logSum = 0;
      for (i = 1; i < N / 2; i++) { var m = re[i] * re[i] + im[i] * im[i]; mags[i] = m; total += m; logSum += Math.log(m + 1e-20); }
      var acc = 0, roll = 0;
      for (i = 1; i < N / 2; i++) { acc += mags[i]; if (acc >= 0.99 * total) { roll = i * rate / N; break; } }
      var flat = Math.exp(logSum / (N / 2 - 1)) / (total / (N / 2 - 1) + 1e-20);
      // pitch by autocorrelation, 70–400 Hz
      var pitch = 0;
      if (rms > 0.01) {
        var best = 0, lagBest = 0, minLag = Math.floor(rate / 400), maxLag = Math.floor(rate / 70);
        for (var lag = minLag; lag <= maxLag && lag < N; lag++) {
          var c = 0;
          for (i = 0; i + lag < N; i += 2) c += samples[start + i] * samples[start + i + lag];
          if (c > best) { best = c; lagBest = lag; }
        }
        if (best > 0.3 * e / 2) pitch = rate / lagBest;
      }
      frames.push({ rms: rms, db: 20 * Math.log10(rms + 1e-9), roll: roll, flat: flat, pitch: pitch });
    }
    if (frames.length < 20) return { tooShort: true, findings: [F('The recording is too short to measure. Record at least five seconds of speech.', 'strong', 'neither')] };
    var dbs = frames.map(function (f) { return f.db; }).sort(function (a, b) { return a - b; });
    var floor = dbs[Math.floor(dbs.length * 0.1)], loud = dbs[Math.floor(dbs.length * 0.9)];
    var thr = floor + (loud - floor) * 0.35;
    var voiced = frames.filter(function (f) { return f.db > thr; });
    var rolls = voiced.map(function (f) { return f.roll; }).sort(function (a, b) { return a - b; });
    var bandwidth = rolls.length ? rolls[Math.floor(rolls.length * 0.9)] : 0;
    var pitches = voiced.map(function (f) { return f.pitch; }).filter(Boolean);
    var pm = pitches.reduce(function (a, b) { return a + b; }, 0) / Math.max(1, pitches.length);
    var psd = Math.sqrt(pitches.reduce(function (a, b) { return a + (b - pm) * (b - pm); }, 0) / Math.max(1, pitches.length));
    var jit = 0; for (i = 1; i < pitches.length; i++) jit += Math.abs(pitches[i] - pitches[i - 1]);
    jit = pitches.length > 1 ? jit / (pitches.length - 1) / pm : 0;
    // pauses
    var pauses = [], run = 0;
    frames.forEach(function (f) { if (f.db <= thr) run++; else { if (run >= 4) pauses.push(run * hop / rate); run = 0; } });
    var pmn = pauses.reduce(function (a, b) { return a + b; }, 0) / Math.max(1, pauses.length);
    var pcv = pauses.length > 2 ? Math.sqrt(pauses.reduce(function (a, b) { return a + (b - pmn) * (b - pmn); }, 0) / pauses.length) / pmn : null;
    var quiet = frames.filter(function (f) { return f.db <= thr; });
    var quietVar = 0;
    if (quiet.length > 3) { var qm = quiet.reduce(function (a, f) { return a + f.db; }, 0) / quiet.length; quietVar = Math.sqrt(quiet.reduce(function (a, f) { return a + (f.db - qm) * (f.db - qm); }, 0) / quiet.length); }
    var stats = {
      seconds: samples.length / rate, bandwidthHz: Math.round(bandwidth), noiseFloorDb: Math.round(floor),
      pitchHz: Math.round(pm), pitchVariation: pm ? +(psd / pm).toFixed(3) : 0, jitter: +jit.toFixed(4),
      pauses: pauses.length, pauseRegularity: pcv === null ? null : +pcv.toFixed(2),
      digitalSilence: +(zeros / samples.length).toFixed(3), clipping: +(clips / samples.length).toFixed(4), quietVariation: +quietVar.toFixed(1)
    };
    var fs = [];
    if (stats.digitalSilence > 0.05) fs.push(F('Stretches of perfect digital silence, which microphones never record', 'moderate', 'ai'));
    if (stats.noiseFloorDb < -80) fs.push(F('Almost no background noise between words (' + stats.noiseFloorDb + ' dB)', 'weak', 'ai'));
    else if (stats.noiseFloorDb > -55) fs.push(F('Background noise between words. Recordings and phone lines add this, so it proves little', 'weak', 'neither'));
    if (stats.pitchHz && stats.pitchVariation < 0.08) fs.push(F('Voice pitch is unusually steady', 'weak', 'ai'));
    else if (stats.pitchHz && stats.pitchVariation > 0.18) fs.push(F('Voice pitch varies naturally. Modern voice clones do this too', 'weak', 'neither'));
    if (stats.pauseRegularity !== null && stats.pauseRegularity < 0.25) fs.push(F('Pauses are almost evenly spaced', 'weak', 'ai'));
    if (stats.bandwidthHz && stats.bandwidthHz < 3900) fs.push(F('Narrow bandwidth, like a phone line (' + stats.bandwidthHz + ' Hz). This hides many clues either way', 'moderate', 'neither'));
    if (stats.quietVariation && stats.quietVariation < 1.2 && quiet.length > 10) fs.push(F('The background is identical everywhere, as if pasted in', 'weak', 'ai'));
    stats.findings = fs.length ? fs : [F('No clear acoustic signs either way', 'weak', 'neither')];
    return stats;
  }

  /* ── video ─────────────────────────────────────────────────────── */
  function videoFrames(file, count, maxSide) {
    count = count || 6; maxSide = maxSide || 768;
    return new Promise(function (resolve, reject) {
      var v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.preload = 'auto';
      var url = URL.createObjectURL(file), out = [], i = 0;
      v.onerror = function () { URL.revokeObjectURL(url); reject(new Error('This video format cannot be opened on this phone.')); };
      v.onloadedmetadata = function () {
        var dur = v.duration || 1, sc = Math.min(1, maxSide / Math.max(v.videoWidth, v.videoHeight));
        var c = document.createElement('canvas'); c.width = Math.round(v.videoWidth * sc); c.height = Math.round(v.videoHeight * sc);
        var next = function () {
          if (i >= count) { URL.revokeObjectURL(url); resolve({ frames: out, duration: dur, width: v.videoWidth, height: v.videoHeight }); return; }
          v.currentTime = Math.min(dur - 0.05, dur * (i + 0.5) / count);
        };
        v.onseeked = function () {
          c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
          out.push(c.toDataURL('image/jpeg', 0.8)); i++; next();
        };
        next();
      };
      v.src = url;
    });
  }

  var api = { scanFile: scanFile, ela: ela, elaFindings: elaFindings, textStats: textStats, audioStats: audioStats, videoFrames: videoFrames, F: F };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LensForensics = api;
})(typeof self !== 'undefined' ? self : this);
