/**
 * @license
 * shelly-porssisahko-15min
 * 
 * Clean, optimized, and memory-efficient version of the shelly-porssisahko script,
 * adapted to support 15-minute price intervals.
 * 
 * Original script (c) Jussi Isotalo - http://jisotalo.fi
 * Clean, memory-efficient adaptation and 15-minute extension by (c) Matias Kaski.
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
      h1: 0
    }
  }
};

let _ = {
  s: {
    v: "1.31",
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
  pb: [0, 0],
  h: [],
  c: { c: CNST.DEF_CFG.COM, i: [CNST.DEF_CFG.INST] }
};

let _i = 0, _j = 0, _k = 0, _inc = 0, _cnt = 0, _start = 0, _end = 0;
let cmd = [];
let prevEpoch = 0;
let loopRunning = false;

function getKvsKey(e) {
  let t = "porssi";
  return 0 <= e ? t + "-" + (e + 1) : t;
}

function isCurrentInterval(e, t, ptsPerHour) {
  let intervalSecs = 3600 / ptsPerHour;
  t -= e;
  return 0 <= t && t < intervalSecs;
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
  console.log("shelly-porssisahko-15min: " + e);
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
    _.pb[0] = 0;
    _.pb[1] = 0;
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
    if (CNST.DEF_CFG.COM || CNST.DEF_CFG.INST) {
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
      if (a >= CNST.INST_COUNT - 1) {
        // keep in memory for runtime reloads
      }
      if (0 < fixCount) {
        log("merged default config fields in RAM");
      }
      n(true);
    } else {
      n(true);
    }
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
    var dayChanged = getDate(new Date(1e3 * _.s.p[0].ts)) !== getDate(t);
    if (dayChanged) {
      _.s.p[1].ts = 0;
      _.p[1] = [];
      _.pb[1] = 0;
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
  var s = _.c.i[e] || {};
  if (1 != s.en) {
    _.h[e] = [];
    return false;
  }
  var currDate = new Date();
  var lastCheck = new Date(1e3 * t.chkTs);
  let last15 = Math.floor(lastCheck.getMinutes() / 15);
  let curr15 = Math.floor(currDate.getMinutes() / 15);

  let timeTrigger = false;
  if (0 == t.chkTs || lastCheck.getFullYear() != currDate.getFullYear()) {
    timeTrigger = true;
  } else if (s.h1 == 1) {
    timeTrigger = (lastCheck.getHours() != currDate.getHours());
  } else {
    timeTrigger = (last15 != curr15 || lastCheck.getHours() != currDate.getHours());
  }

  if (timeTrigger) {
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
        _.pb[g] = 0;
        _.s.p[g].avg = 0;
        _.s.p[g].high = -999;
        _.s.p[g].low = 999;

        let csvData = atob(o.body_b64);
        o.body_b64 = null;

        let startIdx = 1 + csvData.indexOf("\n");
        csvData = csvData.substring(startIdx);

        let lineStart = 0;

        while (lineStart >= 0) {
          let firstQuote = csvData.indexOf('"', lineStart);
          if (firstQuote < 0) break;
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

          // Store base timestamp of first entry, then only price values
          if (_.p[g].length === 0) _.pb[g] = ts;
          _.p[g].push(priceVal);
          _.s.p[g].avg += priceVal;
          if (priceVal > _.s.p[g].high) _.s.p[g].high = priceVal;
          if (priceVal < _.s.p[g].low) _.s.p[g].low = priceVal;
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
        _.pb[g] = 0;
      }
      o = null;
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
    _.pb[g] = 0;
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

    let ptsPerHour = _.p[0].length / 24;
    if (ptsPerHour < 1) ptsPerHour = 1;
    let intervalSecs = 3600 / ptsPerHour;

    let r = _.c.i[c] || {};
    if (!r.o) r.o = [0];
    if (!r.m0) r.m0 = { c: 0 };
    if (!r.m1) r.m1 = { l: 0 };
    if (!r.m2) r.m2 = { p: 24, c: 0, l: -999, s: 0, m: 999, ps: 0, pe: 23, ps2: 0, pe2: 23, c2: 0, l2: -999, m2: 999 };
    let instP0 = [];
    if (r && r.h1 == 1) {
      for (let e = 0; e < _.p[0].length; e++) {
        instP0.push(_.p[0][e]);
      }
      for (let h = 0; h < 24; h++) {
        let sum = 0;
        let startIdx = h * ptsPerHour;
        let endIdx = (h + 1) * ptsPerHour;
        if (endIdx > instP0.length) endIdx = instP0.length;
        let count = endIdx - startIdx;
        if (count > 0) {
          for (let idx = startIdx; idx < endIdx; idx++) {
            sum += instP0[idx];
          }
          let avg = sum / count;
          for (let idx = startIdx; idx < endIdx; idx++) {
            instP0[idx] = avg;
          }
        }
      }
    } else {
      instP0 = _.p[0];
    }

    let currIdx = -1;
    (function () {
      if (_.s.timeOK && 0 != _.s.p[0].ts) {
        var currentTs = epoch();
        for (let e = 0; e < instP0.length; e++) {
          if (isCurrentInterval(_.pb[0] + e * intervalSecs, currentTs, ptsPerHour)) {
            _.s.p[0].now = instP0[e];
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

    function commitOutput(e) {
      if (null == e) {
        loopRunning = false;
        return;
      }
      if (cmd[c] != e) i.st = 12;
      cmd[c] = e;
      if (r.i) cmd[c] = !cmd[c];

      log("logic for #" + (c + 1) + " done, cmd: " + e + " -> output: " + cmd[c]);

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
                if (i.cmd != cmd[c]) {
                  let historyLen = 0 < _.s.enCnt ? CNST.HIST_LEN / _.s.enCnt : CNST.HIST_LEN;
                  while (0 < CNST.HIST_LEN && _.h[c].length >= historyLen) {
                    _.h[c].splice(0, 1);
                  }
                  _.h[c].push([epoch(), cmd[c] ? 1 : 0, _.si[c].st]);
                }
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

    if (0 == r.mode) {
      cmd[c] = (1 == r.m0.c);
      i.st = 1;
    } else if (_.s.timeOK && 0 < _.s.p[0].ts && getDate(new Date(1e3 * _.s.p[0].ts)) === getDate(s)) {
      if (1 == r.mode) {
        cmd[c] = _.s.p[0].now <= ("avg" == r.m1.l ? _.s.p[0].avg : r.m1.l);
        i.st = cmd[c] ? 2 : 3;
      } else if (2 == r.mode) {
        cmd[c] = evaluateCheapestHoursMode(c, instP0);
        i.st = cmd[c] ? 5 : 4;
        let currHour = currIdx >= 0 ? Math.floor(currIdx / ptsPerHour) : s.getHours();
        let activeL = r.m2.l;
        let activeM = r.m2.m;
        if (-2 == r.m2.p && currHour >= r.m2.ps2 && currHour < r.m2.pe2) {
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
      cmd[c] = (1 == r.e);
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

function evaluateCheapestHoursMode(e, instP0) {
  var t = _.c.i[e];
  let ptsPerHour = instP0.length / 24;
  if (ptsPerHour < 1) ptsPerHour = 1;
  let intervalSecs = 3600 / ptsPerHour;

  let pricesToUse = instP0;
  let ptsPerHourToUse = ptsPerHour;
  let intervalSecsToUse = intervalSecs;

  if (t.h1 == 1 && ptsPerHour > 1) {
    pricesToUse = [];
    for (let h = 0; h < 24; h++) {
      let sum = 0;
      let startIdx = h * ptsPerHour;
      let endIdx = (h + 1) * ptsPerHour;
      if (endIdx > instP0.length) endIdx = instP0.length;
      let count = endIdx - startIdx;
      if (count > 0) {
        for (let idx = startIdx; idx < endIdx; idx++) {
          sum += instP0[idx];
        }
        pricesToUse.push(sum / count);
      } else {
        pricesToUse.push(0);
      }
    }
    ptsPerHourToUse = 1;
    intervalSecsToUse = 3600;
  }

  // Scale hourly settings to sub-hour intervals
  let p_scaled = t.m2.p * ptsPerHourToUse;
  let c_scaled = t.m2.c * ptsPerHourToUse;
  let c2_scaled = t.m2.c2 * ptsPerHourToUse;
  let ps_scaled = t.m2.ps * ptsPerHourToUse;
  let pe_scaled = t.m2.pe * ptsPerHourToUse;
  let ps2_scaled = t.m2.ps2 * ptsPerHourToUse;
  let pe2_scaled = t.m2.pe2 * ptsPerHourToUse;

  p_scaled = limit(-2 * ptsPerHourToUse, p_scaled, 24 * ptsPerHourToUse);
  c_scaled = limit(0, c_scaled, 0 < p_scaled ? p_scaled : pe_scaled - ps_scaled);
  c2_scaled = limit(0, c2_scaled, pe2_scaled - ps2_scaled);

  var selectedIntervals = [];
  _inc = p_scaled < 0 ? 1 : p_scaled;
  for (_i = 0; _i < pricesToUse.length; _i += _inc) {
    _cnt = (p_scaled < 0 && 1 <= _i) ? c2_scaled : c_scaled;
    if (_cnt <= 0) continue;

    var intervalIndices = [];
    _start = _i;
    _end = _i + p_scaled;
    if (p_scaled < 0 && 0 == _i) {
      _start = ps_scaled;
      _end = pe_scaled;
    } else if (p_scaled < 0 && 1 == _i) {
      _start = ps2_scaled;
      _end = pe2_scaled;
    }
    for (_j = _start; _j < _end && !(_j > pricesToUse.length - 1); _j++) {
      intervalIndices.push(_j);
    }

    if (t.m2.s) {
      _avg = 999;
      _startIndex = 0;
      for (_j = 0; _j <= intervalIndices.length - _cnt; _j++) {
        _sum = 0;
        for (_k = _j; _k < _j + _cnt; _k++) {
          _sum += pricesToUse[intervalIndices[_k]];
        }
        if (_sum / _cnt < _avg) {
          _avg = _sum / _cnt;
          _startIndex = _j;
        }
      }
      for (_j = _startIndex; _j < _startIndex + _cnt; _j++) {
        selectedIntervals.push(intervalIndices[_j]);
      }
    } else {
      for (_j = 0, _k = 1; _k < intervalIndices.length; _k++) {
        var val = intervalIndices[_k];
        for (_j = _k - 1; 0 <= _j && pricesToUse[val] < pricesToUse[intervalIndices[_j]]; _j--) {
          intervalIndices[_j + 1] = intervalIndices[_j];
        }
        intervalIndices[_j + 1] = val;
      }
      for (_j = 0; _j < _cnt; _j++) {
        selectedIntervals.push(intervalIndices[_j]);
      }
    }

    if (p_scaled < 0 && (t.m2.p == -1 || 1 <= _i)) break;
  }

  let currentTs = epoch();
  let match = false;
  for (let e = 0; e < selectedIntervals.length; e++) {
    if (isCurrentInterval(_.pb[0] + selectedIntervals[e] * intervalSecsToUse, currentTs, ptsPerHourToUse)) {
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
  _.h.push([]);
  cmd.push(false);
}
CNST.DEF_INST_ST = null;
prevEpoch = epoch();

HTTPServer.registerEndpoint("", function (s, n) {
  try {
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
      let incPrices = (o.p === "1" || o.prices === "1");
      if (incPrices && loopRunning) {
        n.code = 503;
        n.body = '{"error":"busy"}';
      } else if (0 <= i && i < CNST.INST_COUNT) {
        if (incPrices) {
          n.body = JSON.stringify({ s: _.s, si: _.si[i], c: _.c.c, ci: _.c.i[i], p: _.p, pb: _.pb });
        } else {
          n.body = JSON.stringify({ s: _.s, si: _.si[i], c: _.c.c, ci: _.c.i[i] });
        }
      } else {
        if (incPrices) {
          n.body = JSON.stringify({ s: _.s, si: _.si, c: _.c.c, ci: _.c.i, p: _.p, pb: _.pb });
        } else {
          n.body = JSON.stringify({ s: _.s, si: _.si, c: _.c.c, ci: _.c.i });
        }
      }
    } else if ("c" === o.r) {
      updateState();
      if (0 <= i && i < CNST.INST_COUNT) {
        n.body = JSON.stringify(_.c.i[i]);
      } else {
        n.body = JSON.stringify(_.c);
      }
    } else if ("h" === o.r) {
      if (0 <= i && i < CNST.INST_COUNT) {
        n.body = JSON.stringify(_.h[i]);
      } else {
        n.body = JSON.stringify(_.h);
      }
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
