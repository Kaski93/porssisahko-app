/**
 * @license
 * shelly-porssisahko-clean
 * 
 * Clean, optimized, and memory-efficient version of the shelly-porssisahko script.
 * Web UI assets have been completely removed and offloaded to the mobile Expo app.
 * Retains 100% of the core pricing, scheduling logic, and autonomous Elering price fetches.
 * 
 * Original script (c) Jussi Isotalo - http://jisotalo.fi
 * Clean, memory-efficient adaptation and Expo mobile app created by (c) Matias Kaski.
 * License: GNU Affero General Public License v3.0 
 */

const CNST = {
  INST_COUNT: typeof INSTANCE_COUNT === "undefined" ? 3 : INSTANCE_COUNT,
  HIST_LEN: typeof HIST_LEN === "undefined" ? 24 : HIST_LEN,
  ERR_LIMIT: 3,
  ERR_DELAY: 120,
  DEF_INST_ST: { chkTs: 0, st: 0, str: "", cmd: -1, configOK: 0, fCmdTs: 0, fCmd: 0 },
  DEF_CFG: {
    COM: { g: "fi", vat: 25.5, day: 0, night: 0, names: [] },
    INST: {
      en: 0,
      mode: 0,
      m0: { c: 0 },
      m1: { l: 0 },
      m2: { p: 24, c: 0, l: -999, s: 0, m: 999, ps: 0, pe: 23, ps2: 0, pe2: 23, c2: 0, l2: -999, m2: 999 },
      b: 0,
      e: 0,
      o: [0],
      f: 0,
      fc: 0,
      i: 0,
      m: 60,
      oc: 0,
      h1: 1
    }
  }
};

let _ = {
  s: {
    v: "1.35-avg",
    dn: "",
    configOK: 0,
    timeOK: 0,
    errCnt: 0,
    errTs: 0,
    upTs: 0,
    tz: "+02:00",
    tzh: 0,
    enCnt: 0,
    p: [
      { ts: 0, now: 0, low: 0, high: 0, avg: 0 },
      { ts: 0, now: 0, low: 0, high: 0, avg: 0 }
    ]
  },
  si: [CNST.DEF_INST_ST],
  p: [[], []],
  c: { c: CNST.DEF_CFG.COM, i: [CNST.DEF_CFG.INST] }
};

let _i = 0, _j = 0, _k = 0, _inc = 0, _cnt = 0, _start = 0, _end = 0;
let cmd = [];
let prevEpoch = 0;
let loopRunning = false;

function getKvsKey(e) {
  let sid = Shelly.getCurrentScriptId();
  let t = sid > 1 ? "porssi_s" + sid : "porssi";
  return 0 <= e ? t + "-" + (e + 1) : t;
}

function isCurrentHour(e, t) {
  t -= e;
  return 0 <= t && t < 3600;
}

function limit(e, t, s) {
  return Math.min(s, Math.max(e, t));
}

function epoch(e) {
  return Math.floor((e ? e.getTime() : Date.now()) / 1e3);
}

function getDate(e) {
  return e.getDate();
}

function updateTz(e) {
  let t = e.toString(), s = 0;
  if ("+0000" == (t = t.substring(3 + t.indexOf("GMT")))) {
    t = "Z";
    s = 0;
  } else {
    s = +t.substring(0, 3);
    t = t.substring(0, 3) + ":" + t.substring(3);
  }
  if (t != _.s.tz) {
    _.s.p[0].ts = 0;
  }
  _.s.tz = t;
  _.s.tzh = s;
}

function log(e) {
  console.log("shelly-porssisahko: " + e);
}

function reqLogic() {
  for (let e = 0; e < CNST.INST_COUNT; e++) _.si[e].chkTs = 0;
}

function updateState() {
  var e = new Date();
  _.s.timeOK = null != Shelly.getComponentStatus("sys").unixtime && 2000 < e.getFullYear();
  _.s.dn = Shelly.getComponentConfig("sys").device.name || "Shelly";
  var t = epoch(e);
  if (_.s.timeOK && 300 < Math.abs(t - prevEpoch)) {
    log("Time changed 5 min+ -> refresh");
    _.s.p[0].ts = 0;
    _.s.p[0].now = 0;
    _.s.p[1].ts = 0;
    _.p[0] = [];
    _.p[1] = [];
  }
  prevEpoch = t;
  _.s.enCnt = 0;
  for (_i = 0; _i < CNST.INST_COUNT; _i++) {
    if (_.c.i[_i] && _.c.i[_i].en) _.s.enCnt++;
  }
  if (!_.s.upTs && _.s.timeOK) {
    _.s.upTs = epoch(e);
  }
}

function getConfig(a) {
  var e = getKvsKey(a);
  Shelly.call("KVS.Get", { key: e }, function (t, e, s) {
    if (a < 0) {
      _.c.c = t ? JSON.parse(t.value) : {};
    } else {
      _.c.i[a] = t ? JSON.parse(t.value) : {};
    }
    if (typeof USER_CONFIG === "function") USER_CONFIG(a, true);

    var n = function (e) {
      if (a < 0) {
        _.s.configOK = e ? 1 : 0;
      } else {
        log("config for #" + (a + 1) + " read, enabled: " + _.c.i[a].en);
        _.si[a].configOK = e ? 1 : 0;
        _.si[a].chkTs = 0;
      }
      loopRunning = false;
      Timer.set(500, false, loop);
    };

    let fixCount = 0;
    var o, i = a < 0 ? CNST.DEF_CFG.COM : CNST.DEF_CFG.INST;
    var r = a < 0 ? _.c.c : _.c.i[a];
    for (o in i) {
      if (void 0 === r[o]) {
        r[o] = i[o];
        fixCount++;
      } else if ("object" === typeof i[o] && i[o] !== null) {
        for (var c in i[o]) {
          if (void 0 === r[o][c]) {
            r[o][c] = i[o][c];
            fixCount++;
          }
        }
      }
    }
    if (0 < fixCount) {
      log("merged default config fields in RAM");
    }
    n(true);
  });
}

function loop() {
  try {
    if (!loopRunning) {
      loopRunning = true;
      updateState();
      if (_.s.configOK) {
        if (pricesNeeded(0)) {
          getPrices(0);
        } else if (pricesNeeded(1)) {
          getPrices(1);
        } else {
          for (let e = 0; e < CNST.INST_COUNT; e++) {
            if (!_.si[e].configOK) {
              getConfig(e);
              return;
            }
          }
          for (let e = 0; e < CNST.INST_COUNT; e++) {
            if (shouldRunLogic(e)) {
              Timer.set(500, false, runLogicForInstance, e);
              return;
            }
          }
          if (typeof USER_LOOP === "function") USER_LOOP();
          loopRunning = false;
        }
      } else {
        getConfig(-1);
      }
    }
  } catch (e) {
    log("error at main loop: " + e);
    loopRunning = false;
  }
}

function pricesNeeded(e) {
  var t = new Date();
  let s = false;
  if (1 == e) {
    s = _.s.timeOK && 0 === _.s.p[1].ts && 15 <= t.getHours();
  } else {
    var dayChanged = Math.floor(_.s.p[0].ts / 86400) !== Math.floor(epoch(t) / 86400);
    if (dayChanged) {
      _.s.p[1].ts = 0;
      _.p[1] = [];
    }
    s = _.s.timeOK && (0 == _.s.p[0].ts || dayChanged);
  }

  if (_.s.errCnt >= CNST.ERR_LIMIT && epoch(t) - _.s.errTs < CNST.ERR_DELAY) {
    s = false;
  } else if (_.s.errCnt >= CNST.ERR_LIMIT) {
    _.s.errCnt = 0;
  }
  return s;
}

function shouldRunLogic(e) {
  var t = _.si[e];
  var s = _.c.i[e];
  if (1 != s.en) {
    return false;
  }
  var currDate = new Date();
  var lastCheck = new Date(1e3 * t.chkTs);
  if (0 == t.chkTs || lastCheck.getHours() != currDate.getHours() || lastCheck.getFullYear() != currDate.getFullYear()) {
    return true;
  }
  if (0 < t.fCmdTs && t.fCmdTs - epoch(currDate) < 0) {
    return true;
  }
  if (0 == t.fCmdTs && s.m < 60 && currDate.getMinutes() >= s.m && t.cmd + s.i == 1) {
    return true;
  }
  return false;
}

function getPrices(g) {
  try {
    log("fetching prices for day " + g);
    let p = new Date();
    updateTz(p);
    var s = 1 == g ? new Date(864e5 + new Date(p.getFullYear(), p.getMonth(), p.getDate()).getTime()) : p;
    let startStr = s.getFullYear() + "-" + (s.getMonth() < 9 ? "0" + (1 + s.getMonth()) : 1 + s.getMonth()) + "-" + (getDate(s) < 10 ? "0" + getDate(s) : getDate(s)) + "T00:00:00" + _.s.tz.replace("+", "%2b");
    var endStr = startStr.replace("T00:00:00", "T23:59:59");
    let t = {
      url: "https://dashboard.elering.ee/api/nps/price/csv?fields=" + _.c.c.g + "&start=" + startStr + "&end=" + endStr,
      timeout: 10,
      ssl_ca: "*"
    };
    p = null;
    startStr = null;
    Shelly.call("HTTP.GET", t, function (o, e, i) {
      t = null;
      try {
        if (0 !== e || null == o || 200 !== o.code || !o.body_b64) {
          throw Error(e + "(" + i + ") - " + JSON.stringify(o));
        }
        o.headers = null;
        o.message = null;
        _.p[g] = [];
        _.s.p[g].avg = 0;
        _.s.p[g].high = -999;
        _.s.p[g].low = 999;

        let csvData = atob(o.body_b64);
        o.body_b64 = null;

        let startIdx = 1 + csvData.indexOf("\n");
        csvData = csvData.substring(startIdx);

        let lineStart = 0;
        let count = 0;
        let currentHour = -1;
        let hourAcc = [-1, 0];

        function commitHour() {
          hourAcc[1] = hourAcc[1] / count;
          _.p[g].push(hourAcc);
          _.s.p[g].avg += hourAcc[1];
          if (hourAcc[1] > _.s.p[g].high) _.s.p[g].high = hourAcc[1];
          if (hourAcc[1] < _.s.p[g].low) _.s.p[g].low = hourAcc[1];
        }

        while (lineStart >= 0) {
          let firstQuote = csvData.indexOf('"', lineStart);
          if (firstQuote < 0) {
            if (count > 0) commitHour();
            break;
          }
          let secondQuote = csvData.indexOf('"', firstQuote + 1);
          let ts = +csvData.substring(firstQuote + 1, secondQuote);

          let nextLine = csvData.indexOf("\n", secondQuote);
          let searchEnd = nextLine >= 0 ? nextLine : csvData.length;

          let lastQuote = csvData.lastIndexOf('"', searchEnd);
          let priceStartQuote = csvData.lastIndexOf('"', lastQuote - 1);
          let priceVal = +csvData.substring(priceStartQuote + 1, lastQuote).replace(",", ".");

          priceVal = (priceVal / 10) * (100 + (priceVal > 0 ? _.c.c.vat : 0)) / 100;
          let d = new Date(1e3 * ts);
          let hr = d.getHours();
          let tf = _.c.c.night;
          let tType = _.c.c.t || 0;
          if (tType === 1) {
            let m = d.getMonth();
            let w = d.getDay();
            let isWinter = (m === 10 || m === 11 || m === 0 || m === 1 || m === 2);
            let isWorkday = (w >= 1 && w <= 6);
            let isDayHour = (7 <= hr && hr < 22);
            if (isWinter && isWorkday && isDayHour) {
              tf = _.c.c.day;
            }
          } else if (tType === 2) {
            tf = _.c.c.day;
          } else {
            if (7 <= hr && hr < 22) {
              tf = _.c.c.day;
            }
          }
          priceVal += tf;

          lineStart = nextLine >= 0 ? nextLine + 1 : -1;

          if (currentHour < 0) {
            hourAcc[0] = ts;
            currentHour = hr;
          }

          if (currentHour !== hr || lineStart < 0) {
            commitHour();
            hourAcc = [ts, 0];
            count = 0;
            currentHour = hr;
          }
          hourAcc[1] += priceVal;
          count++;
        }

        csvData = null;
        _.s.p[g].avg = _.p[g].length > 0 ? _.s.p[g].avg / _.p[g].length : 0;
        _.s.p[g].ts = epoch(new Date());

        if (_.p[g].length < 23) {
          throw Error("invalid data received");
        }
      } catch (err) {
        log("getting prices failed: " + err);
        _.s.errCnt += 1;
        _.s.errTs = epoch();
        _.s.p[g].ts = 0;
        _.p[g] = [];
      }
      o = null; // Free HTTP response object explicitly
      if (0 == g) reqLogic();
      loopRunning = false;
      Timer.set(500, false, loop);
    });
  } catch (err) {
    log("getting prices failed: " + err);
    _.s.errCnt += 1;
    _.s.errTs = epoch();
    _.s.p[g].ts = 0;
    _.p[g] = [];
    if (0 == g) reqLogic();
    loopRunning = false;
    Timer.set(500, false, loop);
  }
}

function runLogicForInstance(c) {
  try {
    if (typeof USER_CONFIG === "function") USER_CONFIG(c, false);
    cmd[c] = false;
    var s = new Date();
    updateTz(s);

    let currIdx = -1;
    (function () {
      if (_.s.timeOK && 0 != _.s.p[0].ts) {
        var currentTs = epoch();
        for (let e = 0; e < _.p[0].length; e++) {
          if (isCurrentHour(_.p[0][e][0], currentTs)) {
            _.s.p[0].now = _.p[0][e][1];
            currIdx = e;
            return;
          }
        }
        _.s.timeOK = false;
        _.s.p[0].ts = 0;
        _.s.errCnt += 1;
        _.s.errTs = epoch();
      } else {
        _.s.p[0].now = 0;
      }
    })();

    let i = _.si[c];
    let r = _.c.i[c] || {};
    if (!r.o) r.o = [0];
    if (!r.m0) r.m0 = { c: 0 };
    if (!r.m1) r.m1 = { l: 0 };
    if (!r.m2) r.m2 = { p: 24, c: 0, l: -999, s: 0, m: 999, ps: 0, pe: 23, ps2: 0, pe2: 23, c2: 0, l2: -999, m2: 999 };

    function commitOutput(e) {
      if (null == e) {
        loopRunning = false;
        return;
      }
      if (cmd[c] != e) i.st = 12;
      cmd[c] = e;
      if (r.i) cmd[c] = !cmd[c];

      log("logic for #" + (c + 1) + " - time: " + s.getHours() + ":" + (s.getMinutes() < 10 ? "0" + s.getMinutes() : s.getMinutes()) + " (tz: " + _.s.tz + "), status code: " + i.st + " - cmd: " + e + " -> output: " + cmd[c]);

      let allMatched = false;
      if (1 == r.oc) {
        allMatched = true;
        for (let e = 0; e < r.o.length; e++) {
          let swStatus = Shelly.getComponentStatus("switch:" + r.o[e]);
          let isSwOn = swStatus ? !!swStatus.output : false;
          if (isSwOn !== cmd[c]) {
            allMatched = false;
            break;
          }
        }
      }

      if (1 == r.oc && allMatched) {
        log("outputs already set for #" + (c + 1));
        i.cmd = cmd[c] ? 1 : 0;
        i.chkTs = epoch();
        loopRunning = false;
      } else {
        let totalOutputs = r.o.length;
        let callbackCount = 0;
        let successCount = 0;
        for (let e = 0; e < totalOutputs; e++) {
          (function (idx, outId, callback) {
            let payload = { id: outId, on: cmd[idx] ? true : false };
            Shelly.call("Switch.Set", payload, function (res, code, msg, cb) {
              if (0 != code) log("setting output " + outId + " failed: " + code + " - " + msg);
              cb(0 == code);
            }, callback);
          })(c, r.o[e], function (success) {
            callbackCount++;
            if (success) successCount++;
            if (callbackCount == totalOutputs) {
              if (successCount == callbackCount) {
                i.cmd = cmd[c] ? 1 : 0;
                i.chkTs = epoch();
                Timer.set(500, false, loop);
              }
              loopRunning = false;
            }
          });
        }
      }
    }

    if (0 === r.mode) {
      cmd[c] = (1 === r.m0.c);
      i.st = 1;
    } else if (_.s.timeOK && 0 < _.s.p[0].ts && Math.floor(_.s.p[0].ts / 86400) === Math.floor(epoch(s) / 86400)) {
      if (1 === r.mode) {
        cmd[c] = _.s.p[0].now <= ("avg" == r.m1.l ? _.s.p[0].avg : r.m1.l);
        i.st = cmd[c] ? 2 : 3;
      } else if (2 === r.mode) {
        cmd[c] = evaluateCheapestHoursMode(c);
        i.st = cmd[c] ? 5 : 4;
        let currHour = currIdx >= 0 ? currIdx : s.getHours();
        let activeL = r.m2.l;
        let activeM = r.m2.m;
        let inPeriod2 = false;
        if (r.m2.pe2 < r.m2.ps2) {
          inPeriod2 = (currHour >= r.m2.ps2 || currHour < r.m2.pe2);
        } else {
          inPeriod2 = (currHour >= r.m2.ps2 && currHour < r.m2.pe2);
        }
        if (-2 === r.m2.p && inPeriod2) {
          activeL = (void 0 !== r.m2.l2) ? r.m2.l2 : r.m2.l;
          activeM = (void 0 !== r.m2.m2) ? r.m2.m2 : r.m2.m;
        }
        if (_.s.p[0].now <= ("avg" == activeL ? _.s.p[0].avg : activeL)) {
          cmd[c] = true;
          i.st = 6;
        }
        if (cmd[c] && _.s.p[0].now > ("avg" == activeM ? _.s.p[0].avg : activeM)) {
          cmd[c] = false;
          i.st = 11;
        }
      }
    } else if (_.s.timeOK) {
      i.st = 7;
      let mask = 1 << s.getHours();
      if ((r.b & mask) == mask) {
        cmd[c] = true;
      }
    } else {
      cmd[c] = (1 === r.e);
      i.st = 8;
    }

    if (_.s.timeOK && 0 < r.f) {
      let mask = 1 << s.getHours();
      if ((r.f & mask) == mask) {
        cmd[c] = ((r.fc & mask) == mask);
        i.st = 10;
      }
    }

    if (cmd[c] && _.s.timeOK && s.getMinutes() >= r.m) {
      i.st = 13;
      cmd[c] = false;
    }

    if (_.s.timeOK && 0 < i.fCmdTs) {
      if (0 < i.fCmdTs - epoch(s)) {
        cmd[c] = (1 == i.fCmd);
        i.st = 9;
      } else {
        i.fCmdTs = 0;
      }
    }

    if (typeof USER_OVERRIDE === "function") {
      USER_OVERRIDE(c, cmd[c], commitOutput);
    } else {
      commitOutput(cmd[c]);
    }
  } catch (err) {
    log("error running logic: " + JSON.stringify(err));
    loopRunning = false;
  }
}

function evaluateCheapestHoursMode(e) {
  var t = _.c.i[e];
  t.m2.ps = limit(0, t.m2.ps, 23);
  t.m2.pe = limit(0, t.m2.pe, 24);
  t.m2.ps2 = limit(0, t.m2.ps2, 23);
  t.m2.pe2 = limit(0, t.m2.pe2, 24);

  // Get local start hour of the fetched price data
  let baseHour = new Date(1e3 * _.pb[0]).getHours();

  let ps = t.m2.ps;
  let pe = t.m2.pe;
  let ps2 = t.m2.ps2;
  let pe2 = t.m2.pe2;

  let periodSize = pe < ps ? (24 - ps + pe) : (pe - ps);
  t.m2.c = limit(0, t.m2.c, 0 < t.m2.p ? t.m2.p : periodSize);

  let periodSize2 = pe2 < ps2 ? (24 - ps2 + pe2) : (pe2 - ps2);
  t.m2.c2 = limit(0, t.m2.c2, periodSize2);

  var selectedHours = [];
  _inc = t.m2.p < 0 ? 1 : t.m2.p;
  for (_i = 0; _i < _.p[0].length; _i += _inc) {
    _cnt = (-2 == t.m2.p && 1 <= _i) ? t.m2.c2 : t.m2.c;
    if (_cnt <= 0) continue;

    var hourIndices = [];
    if (t.m2.p < 0) {
      let activePs = (0 == _i) ? ps : ps2;
      let activePe = (0 == _i) ? pe : pe2;
      for (_j = 0; _j < _.p[0].length; _j++) {
        let localH = (Math.floor(_j) + baseHour) % 24;
        if (localH >= activePs && localH < activePe) {
          hourIndices.push(_j);
        }
      }
    } else {
      _start = _i;
      _end = _i + t.m2.p;
      for (_j = _start; _j < _end && !(_j > _.p[0].length - 1); _j++) {
        hourIndices.push(_j);
      }
    }

    if (t.m2.s) {
      _avg = 999;
      _startIndex = 0;
      for (_j = 0; _j <= hourIndices.length - _cnt; _j++) {
        _sum = 0;
        for (_k = _j; _k < _j + _cnt; _k++) {
          _sum += _.p[0][hourIndices[_k]][1];
        }
        if (_sum / _cnt < _avg) {
          _avg = _sum / _cnt;
          _startIndex = _j;
        }
      }
      for (_j = _startIndex; _j < _startIndex + _cnt; _j++) {
        selectedHours.push(hourIndices[_j]);
      }
    } else {
      for (_j = 0, _k = 1; _k < hourIndices.length; _k++) {
        var val = hourIndices[_k];
        let valPrice = _.p[0][val][1];
        for (_j = _k - 1; 0 <= _j && valPrice < _.p[0][hourIndices[_j]][1]; _j--) {
          hourIndices[_j + 1] = hourIndices[_j];
        }
        hourIndices[_j + 1] = val;
      }
      for (_j = 0; _j < _cnt && _j < hourIndices.length; _j++) {
        selectedHours.push(hourIndices[_j]);
      }
    }

    if (-1 == t.m2.p || (-2 == t.m2.p && 1 <= _i)) break;
  }

  let currentTs = epoch();
  let match = false;
  for (let e = 0; e < selectedHours.length; e++) {
    let idx = selectedHours[e];
    if (isCurrentHour(_.p[0][idx][0], currentTs)) {
      match = true;
      break;
    }
  }
  return match;
}

let _avg = 999, _startIndex = 0, _sum = 0;
log("v." + _.s.v);
log("URL: http://" + (Shelly.getComponentStatus("wifi").sta_ip ?? "192.168.33.1") + "/script/" + Shelly.getCurrentScriptId() + "/?r=s");

_.c.i.pop();
_.si.pop();
for (let e = 0; e < CNST.INST_COUNT; e++) {
  _.si.push(Object.assign({}, CNST.DEF_INST_ST));
  _.c.i.push(Object.assign({}, CNST.DEF_CFG.INST));
  _.c.c.names.push("-");
  cmd.push(false);
}
CNST.DEF_INST_ST = null;
prevEpoch = epoch();

HTTPServer.registerEndpoint("", function (s, n) {
  try {
    if (loopRunning) {
      n.code = 503;
      n.send();
      return;
    }
    let queryStr = s.query || "";
    let o = {};
    let params = queryStr.split("&");
    for (let e = 0; e < params.length; e++) {
      let pair = params[e].split("=");
      if (pair.length === 2) o[pair[0]] = pair[1];
    }
    let i = parseInt(o.i);
    if (isNaN(i)) i = -1;

    n.code = 200;
    n.headers = [
      ["Content-Type", "application/json"],
      ["Access-Control-Allow-Origin", "*"],
      ["Access-Control-Allow-Methods", "GET, POST, OPTIONS"],
      ["Access-Control-Allow-Headers", "*"]
    ];

    if ("s" === o.r) {
      updateState();
      if (0 <= i && i < CNST.INST_COUNT) {
        n.body = JSON.stringify({ s: _.s, si: _.si[i], c: _.c.c, ci: _.c.i[i], p: _.p });
      } else {
        n.body = JSON.stringify({ s: _.s, si: _.si, c: _.c.c, ci: _.c.i, p: _.p });
      }
    } else if ("c" === o.r) {
      updateState();
      if (0 <= i && i < CNST.INST_COUNT) {
        n.body = JSON.stringify(_.c.i[i]);
      } else {
        n.body = JSON.stringify(_.c);
      }
    } else if ("h" === o.r) {
      n.body = "[]";
    } else if ("r" === o.r) {
      if (0 <= i && i < CNST.INST_COUNT) {
        log("config changed for #" + (i + 1));
        _.si[i].configOK = 0;
      } else {
        log("config changed");
        for (let e = 0; e < CNST.INST_COUNT; e++) _.si[e].configOK = 0;
      }
      _.s.configOK = 0;
      reqLogic();
      if (!loopRunning) {
        loopRunning = true;
        getConfig(i);
      }
      _.s.p[0].ts = 0;
      _.s.p[1].ts = 0;
      n.code = 204;
    } else if ("f" === o.r && o.ts) {
      if (0 <= i && i < CNST.INST_COUNT) {
        _.si[i].fCmdTs = +(o.ts);
        _.si[i].fCmd = +(o.c);
        _.si[i].chkTs = 0;
      }
      n.code = 204;
    } else {
      n.code = 404;
      n.body = '{"error":"Not Found"}';
    }
  } catch (e) {
    log("server error: " + e);
    n.code = 500;
    n.body = JSON.stringify({ error: e.toString() });
  }
  n.send();
});

Timer.set(10000, true, loop);
loop();
