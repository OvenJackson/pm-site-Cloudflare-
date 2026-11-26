/* =========================================================
   产品项目管理 · 应用逻辑
   纯静态：数据来自 data/data.js，修改存于 localStorage
   ========================================================= */
(function () {
  'use strict';

  var D = window.PM_DATA;
  if (!D) return;

  var WBS_REMOVED = ['TPU降单耗/提生产效率/降制造', 'PETG、PETG-Basic原料替代', 'PLA-哑光、PLA-Basic、PLA+、PLA-ST国产化3代项目', 'PLA金属免喷涂性能优化'];

  /* 兼容新版 build_data.py 生成的字段（key / out / month 等） */
  (function normalizeData() {
    if (!D.meta) D.meta = {};
    if (!D.keyProjects && D.key) D.keyProjects = D.key;
    if (!D.outsourcing && D.out) D.outsourcing = D.out;
    D.meta.snapshot = D.meta.snapshot || D.meta.today || D.meta.generated || '';

    // 从 WBS 任务清单中移除指定项目
    D.wbs = (D.wbs || []).filter(function (w) { return WBS_REMOVED.indexOf(w.name) < 0; });

    // 统一 PETG丝绸 名称，确保重点项目 / 年度 MAP 与 WBS 一致
    (function alignPetgSilk() {
      var canon = 'PETG丝绸';
      var wbsHit = (D.wbs || []).some(function (w) { return w.name === canon; });
      if (!wbsHit) return;
      var isVariant = function (n) {
        n = String(n || '').trim();
        return n === canon || (n.indexOf('PETG丝绸') >= 0 && n.indexOf('PLA') < 0);
      };
      [D.keyProjects, D.pool].forEach(function (arr) {
        (arr || []).forEach(function (x) { if (isVariant(x.name)) x.name = canon; });
      });
      (D.map || []).forEach(function (g) {
        (g.items || []).forEach(function (it) {
          if (isVariant(it.text) || isVariant(it.match) || it.text === canon) { it.text = canon; it.raw = canon; it.match = canon; }
        });
      });
      var seen = {};
      D.keyProjects = (D.keyProjects || []).filter(function (k) {
        if (k.name !== canon) return true;
        if (seen[k.name]) return false;
        seen[k.name] = true; return true;
      });
      var pseen = {};
      D.pool = (D.pool || []).filter(function (p) {
        if (p.name !== canon) return true;
        if (pseen[p.name]) return false;
        pseen[p.name] = true; return true;
      });
    })();

    // 合并 TPU-90A / TPU-85A 为 TPU85A/90A
    (function mergeTpuNames() {
      var canon = 'TPU85A/90A';
      var aliases = ['TPU-90A', 'TPU-85A', 'TPU90A/85A'];
      var primary = null;
      (D.pool || []).forEach(function (p) { if (!primary && aliases.indexOf(p.name) >= 0) primary = p; });
      if (primary) primary.name = canon;
      var seen = false;
      D.pool = (D.pool || []).filter(function (p) {
        if (aliases.indexOf(p.name) >= 0) return false;
        if (p.name === canon) { if (seen) return false; seen = true; }
        return true;
      });
      (D.keyProjects || []).forEach(function (k) { if (aliases.indexOf(k.name) >= 0) k.name = canon; });
      var kseen = false;
      D.keyProjects = (D.keyProjects || []).filter(function (k) {
        if (k.name !== canon) return true;
        if (kseen) return false;
        kseen = true;
        return true;
      });
      (D.map || []).forEach(function (g) {
        (g.items || []).forEach(function (it) {
          if (aliases.indexOf(it.text) >= 0 || it.text === canon) { it.text = canon; it.raw = canon; it.match = canon; }
        });
      });
    })();

    // 合并 rPET 系列重复项目：保留唯一 rPETG，删除 rPET / rPLA / rPET-rPETG-rPLA 冗余项
    (function mergeRPetNames() {
      var canon = 'rPETG';
      var pool = D.pool || [];
      var combined = pool.filter(function (p) { return p.name === 'rPET/rPETG/rPLA'; })[0];
      var hasCanon = pool.some(function (p) { return p.name === canon; });
      if (combined && !hasCanon) { combined.name = canon; combined.isKey = true; hasCanon = true; }
      var seen = false;
      D.pool = pool.filter(function (p) {
        if (p.name === 'rPET' || p.name === 'rPLA' || p.name === 'rPET/rPETG/rPLA') return false;
        if (p.name === canon) { if (seen) return false; seen = true; }
        return true;
      });
      (D.keyProjects || []).forEach(function (k) {
        if (k.name === 'rPET/rPETG/rPLA' || k.name === 'rPET' || k.name === 'rPLA') k.name = canon;
      });
      var keySeen = false;
      D.keyProjects = (D.keyProjects || []).filter(function (k) {
        if (k.name !== canon) return true;
        if (keySeen) return false;
        keySeen = true;
        return true;
      });
      (D.map || []).forEach(function (g) {
        (g.items || []).forEach(function (it) {
          if (it.text === 'rPET' || it.text === 'rPLA' || it.text === 'rPET/rPETG/rPLA' || it.text === canon) {
            it.text = canon; it.raw = canon; it.match = canon;
          }
        });
      });
    })();

    // 以重点项目表中的同名项目校准计划时间，避免出现失真的超长延期
    var keyByName = {};
    (D.keyProjects || []).forEach(function (k) { keyByName[k.name] = k; });
    (D.pool || []).forEach(function (p) {
      var k = keyByName[p.name];
      if (!k) return;
      if (k.plan && (!p.plan || k.plan > p.plan)) {
        p.planRaw = p.plan;
        p.plan = k.plan;
        p.reconciled = true;
      }
      if (!p.priority && k.priority) p.priority = k.priority;
      if (p.done === '已完成' && !p.actual && k.actual) p.actual = k.actual;
    });
    // 已完成但无计划完成时间的项目，按实际完成时间展示
    (D.keyProjects || []).concat(D.pool || []).forEach(function (x) {
      if (x && x.done === '已完成' && !x.plan && x.actual) x.plan = x.actual;
    });
    var monthMap = {};
    var addMonth = function (key) {
      if (!key) return;
      var m = String(key).match(/(\d{4})\D?(\d{1,2})/);
      if (!m) return;
      var k = m[1] + '-' + String(m[2]).padStart(2, '0');
      var y = +m[1], mo = +m[2];
      monthMap[k] = { key: k, label: k.replace('-', '.'), year: y, short: mo + '月', cn: y + '年' + mo + '月' };
    };
    for (var y = 2026; y <= 2027; y++) {
      for (var m = 1; m <= 12; m++) {
        if (y === 2027 && m > 4) break;
        addMonth(y + '-' + String(m).padStart(2, '0'));
      }
    }
    (D.meta.months || []).forEach(function (m) { addMonth(m.key || m.month || m.label); });
    D.meta.months = Object.keys(monthMap).sort().map(function (k) { return monthMap[k]; });

    var norm = function (s) {
      return String(s || '').replace(/[（(].*?[)）]/g, '').replace(/[\s\-_/、，,。·.]+/g, '').toLowerCase();
    };
    var poolMap = {};
    (D.pool || []).forEach(function (p) { poolMap[norm(p.name)] = p; });
    var findPool = function (text) {
      var t = norm(text);
      if (!t) return null;
      if (poolMap[t]) return poolMap[t];
      var hit = null;
      Object.keys(poolMap).forEach(function (k) {
        if (!hit && k && (k.indexOf(t) >= 0 || t.indexOf(k) >= 0) && Math.min(k.length, t.length) >= 4) hit = poolMap[k];
      });
      return hit;
    };
    (D.map || []).forEach(function (g) {
      (g.items || []).forEach(function (it) {
        if (it.col == null) {
          var idx = 0;
          for (var i = 0; i < D.meta.months.length; i++) { if (D.meta.months[i].key === it.month) { idx = i; break; } }
          it.col = idx;
        }
        if (!it.status) {
          var p = findPool(it.text);
          if (String(it.raw || '').indexOf('*延期') === 0) it.status = 'delay';
          else if (p) {
            it.match = p.name;
            if (p.status === '暂停') it.status = 'paused';
            else if (p.status === '取消') it.status = 'cancel';
            else if (p.done === '已完成') it.status = 'done';
            else if (p.status === '未开展') it.status = 'planned';
            else it.status = 'active';
          } else it.status = 'active';
        }
      });
    });
    (D.wbs || []).forEach(function (w) {
      (w.phases || []).forEach(function (ph) {
        (ph.tasks || []).forEach(function (t) {
          if (!t.taskKey) t.taskKey = w.name + '|' + t.seq;
        });
      });
    });
  })();

  /* ---------------- 基础工具 ---------------- */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var pad = function (n) { return String(n).padStart(2, '0'); };
  var esc = function (v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var iso = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  var TODAY = iso(new Date());
  var parse = function (s) { return s ? new Date(s + 'T00:00:00') : null; };
  var diffDays = function (a, b) {
    if (!a || !b) return null;
    return Math.round((parse(b) - parse(a)) / 86400000);
  };
  var fmt = function (s) { return s ? String(s).replace(/-/g, '.') : '—'; };
  var fmtCN = function (s) {
    if (!s) return '—';
    var p = String(s).split('-');
    return p[0] + '年' + Number(p[1]) + '月' + Number(p[2]) + '日';
  };
  var uniq = function (arr) { return Array.from(new Set(arr.filter(Boolean))); };
  var clamp = function (n, a, b) { return Math.max(a, Math.min(b, n)); };
  var pct = function (a, b) { return b ? Math.round((a / b) * 100) : 0; };

  var COLORS = {
    done: '已完成', active: '进行中', delay: '延期', paused: '暂停', planned: '未开展', cancel: '取消'
  };
  var chip = function (state, text) {
    return '<span class="chip ' + state + '"><i class="dot"></i>' + esc(text || COLORS[state] || state) + '</span>';
  };
  var tag = function (text, cls) { return '<span class="tag ' + (cls || '') + '">' + esc(text) + '</span>'; };

  /* ---------------- 本地修改（localStorage） ---------------- */
  var OV_KEY = 'pm_overrides_v1';
  var TS_KEY = 'pm_last_save';
  var localTs = parseInt(localStorage.getItem(TS_KEY) || '0', 10) || 0;
  var filePayload = window.PM_LOCAL_FILE || null;
  var serverPayload = window.PM_LOCAL_SAVE || null;
  var onlinePayload = window.PM_ONLINE_STATE || null;
  var onlineMode = !!window.PM_ONLINE_MODE;
  var onlineEnabled = !!onlinePayload || onlineMode;
  var onlinePollTimer = null;
  var ONLINE_TOKEN = '';
  try {
    var usp = new URLSearchParams(location.search);
    ONLINE_TOKEN = usp.get('edit') || '';
    if (ONLINE_TOKEN) {
      localStorage.setItem('pm_edit_token', ONLINE_TOKEN);
      if (history.replaceState) history.replaceState(null, '', location.pathname + location.hash);
    } else ONLINE_TOKEN = localStorage.getItem('pm_edit_token') || '';
  } catch (e) {}
  var onlineReadOnly = !!(onlineEnabled && window.PM_ONLINE_REQUIRED && !ONLINE_TOKEN);
  var payloads = [filePayload, serverPayload].filter(Boolean);
  var lastSaveTs = localTs;
  payloads.forEach(function (p) { lastSaveTs = Math.max(lastSaveTs, Number(p.ts || 0)); });
  if (onlinePayload) lastSaveTs = Math.max(lastSaveTs, Number(onlinePayload.ts || 0));
  function touchSave() {
    lastSaveTs = Date.now();
    try { localStorage.setItem(TS_KEY, String(lastSaveTs)); } catch (e) {}
  }
  var OV = {};
  try { OV = JSON.parse(localStorage.getItem(OV_KEY) || '{}') || {}; } catch (e) { OV = {}; }
  var hasLocalOv = !!localStorage.getItem(OV_KEY);
  payloads.forEach(function (p) {
    if (!hasLocalOv && p.ov) OV = mergeOverrideData(OV, p.ov, Number(p.ts || 0) > localTs);
  });
  if (onlinePayload && onlinePayload.ov) OV = mergeOverrideData(OV, onlinePayload.ov, Number(onlinePayload.ts || 0) >= localTs);
  var SERVER_API = 'http://127.0.0.1:8765/api/save-overrides';
  var serverEnabled = typeof window.PM_LOCAL_SAVE !== 'undefined';
  var serverSaveTimer = null;
  function scheduleServerSave() {
    if (!serverEnabled) return;
    if (serverSaveTimer) clearTimeout(serverSaveTimer);
    serverSaveTimer = setTimeout(function () {
      try {
        fetch(SERVER_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ app: APP, ov: OV, ts: lastSaveTs })
        });
      } catch (e) {}
    }, 250);
  }
  var onlineSaveTimer = null, onlineLastSave = 0, onlineRoNotified = false;
  function scheduleOnlineSave() {
    if (!onlineEnabled) return;
    if (onlineReadOnly) {
      if (!onlineRoNotified) { onlineRoNotified = true; toast('当前为只读模式，请使用带编辑口令的链接'); }
      return;
    }
    if (onlineSaveTimer) clearTimeout(onlineSaveTimer);
    onlineSaveTimer = setTimeout(function () {
      onlineSaveTimer = null;
      onlineLastSave = Date.now();
      try {
        fetch('/api/state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Edit-Token': ONLINE_TOKEN },
          body: JSON.stringify({ app: APP, ov: OV, ts: lastSaveTs })
        }).then(function (r) { if (!r.ok) toast('在线保存失败，请检查编辑权限'); }).catch(function () {});
      } catch (e) {}
    }, 300);
  }
  function storeOnlineState(s) {
    try {
      localStorage.setItem(APP_KEY, JSON.stringify(s.app || {}));
      localStorage.setItem(OV_KEY, JSON.stringify(s.ov || {}));
      localStorage.setItem(TS_KEY, String(Number(s.ts || 0)));
    } catch (e) {}
  }
  function startOnlinePolling() {
    if (!onlineMode || onlinePollTimer) return;
    onlinePollTimer = setInterval(function () {
      fetch('api/state', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (s) {
        if (!s) return;
        if (s.required && !ONLINE_TOKEN) onlineReadOnly = true;
        if (Number(s.ts || 0) > lastSaveTs) {
          storeOnlineState(s);
          location.reload();
        }
      }).catch(function () {});
    }, 5000);
  }
  function bootstrapOnline() {
    if (!onlineMode) return;
    fetch('api/state', { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('no api');
      return r.json();
    }).then(function (s) {
      if (s.required && !ONLINE_TOKEN) {
        onlineReadOnly = true;
        if (!onlineRoNotified) { onlineRoNotified = true; toast('当前为只读模式，请使用带编辑口令的链接'); }
      } else {
        onlineReadOnly = false;
      }
      var sts = Number(s.ts || 0);
      if (sts > lastSaveTs) {
        storeOnlineState(s);
        location.reload();
        return;
      }
      if (!onlineReadOnly && localTs > sts && (localStorage.getItem(APP_KEY) || localStorage.getItem(OV_KEY))) scheduleOnlineSave();
      startOnlinePolling();
    }).catch(function () {});
  }
  function initOnlineSync() {
    if (!onlinePayload || !window.EventSource) return;
    try {
      var es = new EventSource('/api/events');
      es.addEventListener('state', function () {
        if (Date.now() - onlineLastSave < 2000) return;
        fetch('/api/state').then(function (r) { return r.json(); }).then(function (s) {
          if (Number(s.ts || 0) > lastSaveTs) location.reload();
        }).catch(function () {});
      });
    } catch (e) {}
  }

  function uniqList(arr) {
    var seen = {}, out = [];
    (arr || []).forEach(function (v) { var k = String(v); if (!seen[k]) { seen[k] = 1; out.push(v); } });
    return out;
  }
  function mergeByKey(secondary, primary, keyFn) {
    var map = {}, order = [];
    (secondary || []).forEach(function (it) { var k = keyFn(it); if (!(k in map)) order.push(k); map[k] = it; });
    (primary || []).forEach(function (it) { var k = keyFn(it); if (!(k in map)) order.push(k); map[k] = it; });
    return order.map(function (k) { return map[k]; });
  }
  function mergeOverrideData(a, b, primaryIsB) {
    var primary = primaryIsB ? b : a, secondary = primaryIsB ? a : b;
    var out = {};
    Object.keys(secondary || {}).forEach(function (scope) { out[scope] = Object.assign({}, secondary[scope] || {}); });
    Object.keys(primary || {}).forEach(function (scope) { out[scope] = Object.assign({}, out[scope] || {}, primary[scope] || {}); });
    return out;
  }
  function mergeAppData(a, b, primaryIsB) {
    var primary = primaryIsB ? b : a, secondary = primaryIsB ? a : b;
    var out = {};
    Object.keys(secondary || {}).forEach(function (k) { out[k] = secondary[k]; });
    Object.keys(primary || {}).forEach(function (k) { out[k] = primary[k]; });
    ['poolPatches', 'keyPatches', 'wbsOverride', 'mapPlan', 'wbsNotDo', 'wbsHidden'].forEach(function (k) {
      out[k] = Object.assign({}, (secondary && secondary[k]) || {}, (primary && primary[k]) || {});
    });
    out.poolAdded = mergeByKey(secondary && secondary.poolAdded, primary && primary.poolAdded, function (p) { return p && p.id; });
    out.recycle = mergeByKey(secondary && secondary.recycle, primary && primary.recycle, function (r) { return r && r.project ? r.project.id : JSON.stringify(r); });
    out.purged = uniqList([].concat((secondary && secondary.purged) || [], (primary && primary.purged) || []));
    out.purgedNames = uniqList([].concat((secondary && secondary.purgedNames) || [], (primary && primary.purgedNames) || []));
    out.unkeyed = uniqList([].concat((secondary && secondary.unkeyed) || [], (primary && primary.unkeyed) || []));
    return out;
  }

  var ovCount = function () {
    return Object.keys(OV).reduce(function (n, k) {
      return n + (OV[k] && typeof OV[k] === 'object' ? Object.keys(OV[k]).length : 0);
    }, 0);
  };
  var saveOV = function () { touchSave(); try { localStorage.setItem(OV_KEY, JSON.stringify(OV)); } catch (e) {} updateOvBadge(); scheduleServerSave(); scheduleFileSave(); scheduleOnlineSave(); };
  var setOV = function (scope, id, patch) {
    OV[scope] = OV[scope] || {};
    OV[scope][id] = Object.assign({}, OV[scope][id] || {}, patch);
    saveOV();
  };
  var updateOvBadge = function () {
    var el = $('#ovBadge'); if (!el) return;
    var n = ovCount();
    el.hidden = !n;
    el.textContent = '本地修改 ' + n;
    el.title = '修改记录保存在本浏览器，可点击侧栏“导出修改”备份';
  };
  var toast = function (msg) {
    var t = $('#toast'); if (!t) return;
    t.textContent = msg; t.hidden = false;
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.hidden = true; }, 2200);
  };

  /* ---------------- 可编辑数据（新增/编辑/删除/回收站/排期） ---------------- */
  var APP_KEY = 'pm_app_v1';
  var APP = { poolAdded: [], poolPatches: {}, keyPatches: {}, recycle: [], purged: [], purgedNames: [], unkeyed: [], wbsOverride: {}, mapPlan: {}, wbsNotDo: {}, wbsHidden: {} };
  try {
    var _app = JSON.parse(localStorage.getItem(APP_KEY) || '{}') || {};
    Object.keys(APP).forEach(function (k) { if (_app[k] != null) APP[k] = _app[k]; });
    delete APP.clearBuiltinKeys;
    delete APP.clearBuiltinWbs;
    delete APP.clearedKeyWbs;
  } catch (e) {}
  var hasLocalApp = !!localStorage.getItem(APP_KEY);
  payloads.forEach(function (p) {
    if (hasLocalApp || !p.app) return;
    var mergedApp = mergeAppData(APP, p.app, Number(p.ts || 0) > localTs);
    Object.keys(mergedApp).forEach(function (k) { APP[k] = mergedApp[k]; });
  });
  if (onlinePayload && onlinePayload.app) {
    var onlineApp = mergeAppData(APP, onlinePayload.app, Number(onlinePayload.ts || 0) >= localTs);
    Object.keys(onlineApp).forEach(function (k) { APP[k] = onlineApp[k]; });
  }
  function appSave() { touchSave(); try { localStorage.setItem(APP_KEY, JSON.stringify(APP)); } catch (e) {} scheduleServerSave(); scheduleFileSave(); scheduleOnlineSave(); }
  function cloneObj(o) { return JSON.parse(JSON.stringify(o)); }
  function uid(prefix) { return (prefix || 'x') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  var PROJECT_TYPES = ['新产品开发', '性能优化', '原料替代', '行业应用/大客户', '配件', '呆滞料处理'];
  function isShortType(t) { return t === '原料替代' || t === '性能优化'; }

  function applyCustomData() {
    var recycleIds = {};
    (APP.recycle || []).forEach(function (r) { if (r && r.project) recycleIds[r.project.id] = true; });
    var purgedIds = {};
    (APP.purged || []).forEach(function (id) { purgedIds[id] = true; });
    var unkeyed = {};
    (APP.unkeyed || []).forEach(function (n) { unkeyed[n] = true; });
    var recycleNames = {};
    (APP.recycle || []).forEach(function (r) { if (r && r.project) recycleNames[r.project.name] = true; });
    var purgedNames = {};
    (APP.purgedNames || []).forEach(function (n) { purgedNames[n] = true; });

    (APP.poolAdded || []).forEach(function (p) {
      if (!D.pool.some(function (x) { return x.id === p.id; })) D.pool.push(cloneObj(p));
    });
    Object.keys(APP.poolPatches || {}).forEach(function (id) {
      var p = D.pool.filter(function (x) { return x.id === id; })[0];
      if (p) Object.assign(p, APP.poolPatches[id]);
    });
    D.pool = D.pool.filter(function (p) { return !recycleIds[p.id] && !purgedIds[p.id]; });

    Object.keys(APP.keyPatches || {}).forEach(function (id) {
      var k = D.keyProjects.filter(function (x) { return x.id === id; })[0];
      var patch = APP.keyPatches[id];
      if (k && patch && (patch.name === k.name || id.indexOf('kp') === 0)) Object.assign(k, patch);
    });
    D.keyProjects = D.keyProjects.filter(function (k) {
      return !unkeyed[k.name] && !purgedIds[k.id] && !recycleIds[k.id] && !recycleNames[k.name] && !purgedNames[k.name];
    });
    var keyIds = {};
    D.keyProjects = D.keyProjects.filter(function (k) {
      if (keyIds[k.id]) return false;
      keyIds[k.id] = true;
      return true;
    });
    D.pool.forEach(function (p) {
      if (p.isKey && !unkeyed[p.name] && !D.keyProjects.some(function (k) { return k.name === p.name; })) {
        D.keyProjects.push(poolToKey(p));
      }
    });

    Object.keys(APP.mapPlan || {}).forEach(function (name) {
      D.pool.forEach(function (p) { if (p.name === name) p.plan = APP.mapPlan[name]; });
      D.keyProjects.forEach(function (k) { if (k.name === name) k.plan = APP.mapPlan[name]; });
    });

    Object.keys(APP.wbsOverride || {}).forEach(function (name) {
      var phases = APP.wbsOverride[name];
      var w = D.wbs.filter(function (x) { return x.name === name; })[0];
      if (w) w.phases = cloneObj(phases);
      else D.wbs.push({ name: name, priority: '', phases: cloneObj(phases) });
    });
    D.wbs = D.wbs.filter(function (w) { return WBS_REMOVED.indexOf(w.name) < 0; });
    Object.keys(APP.wbsHidden || {}).forEach(function (name) {
      D.wbs = D.wbs.filter(function (w) { return w.name !== name; });
    });
  }

  function poolToKey(p) {
    return {
      type: p.type, status: p.status, done: p.done, name: p.name, owner: p.owner,
      founded: p.founded, started: p.started, plan: p.plan, actual: p.actual,
      priority: p.priority, note: p.note, link: '', id: 'kp' + p.id.replace(/^p/, '')
    };
  }

  /* ---------- 工作日与 WBS 排期（与 project-dev-schedule 技能一致） ---------- */
  var HOLIDAYS = {};
  (function () {
    var ranges = [[2026,1,1,3],[2026,2,15,23],[2026,4,4,6],[2026,5,1,5],[2026,6,19,21],[2026,9,25,27],[2026,10,1,7],[2027,1,1,3],[2027,2,5,13]];
    ranges.forEach(function (r) {
      var d = new Date(r[0], r[1] - 1, r[2]);
      var end = new Date(r[0], r[1] - 1, r[3]);
      while (d <= end) { HOLIDAYS[iso(d)] = true; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1); }
    });
  })();
  function isWorkdayDate(d) { return !HOLIDAYS[iso(d)] && d.getDay() !== 0 && d.getDay() !== 6; }
  function nextWd(d) { d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1); while (!isWorkdayDate(d)) d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1); return d; }
  function prevWd(d) { d = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1); while (!isWorkdayDate(d)) d = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1); return d; }
  function addWdBack(end, n) { var d = new Date(end.getFullYear(), end.getMonth(), end.getDate()), c = 1; while (c < n) { d = prevWd(d); c++; } return d; }
  function workdaysBetween(s, e) { var d = new Date(s.getFullYear(), s.getMonth(), s.getDate()), c = 0; while (d <= e) { if (isWorkdayDate(d)) c++; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1); } return c; }
  function firstWd(y, m) { var d = new Date(y, m - 1, 1); while (!isWorkdayDate(d)) d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1); return d; }
  function lastWd(y, m) { var d = new Date(y, m, 0); while (!isWorkdayDate(d)) d = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1); return d; }
  function addMonthsDate(d, n) { var y = d.getFullYear(), m = d.getMonth() + n, last = new Date(y, m + 1, 0).getDate(); return new Date(y, m, Math.min(d.getDate(), last)); }

  var WBS_TPL = {
    3: { budgets: [1, 1, 1], stages: [
      { name: '一、产品计划阶段', tasks: [['2.1','原料路线与技术方案设计（预研）','3D产品开发部',13,'',false,'-'],['2.2','TR2 设计方案评审','3D产品开发部',1,'2.1',true,'-'],['2.3','产品立项评估','产品部',5,'2.2',false,'《产品立项建议书》'],['2.4','PDCP 产品立项决策评审','产品部',1,'2.3',true,'《产品立项决议书》'],['2.5','制定项目计划','产品部',1,'2.4',false,'《项目开发计划书》'],['2.6','项目立项','3D产品开发部',1,'2.5',true,'']] },
      { name: '二、产品开发小试阶段', tasks: [['3.1','小试制样及内部分析检测','3D产品开发部',21,'2.6',false,'线条/样条测试报告'],['3.2','TR3 小试技术评审','发展部/3D产品开发部',1,'3.1',true,'《小试样品验收评审报告》']] },
      { name: '三、产品开发中试阶段', tasks: [['4.1','中试制样及内部分析检测','工艺部/3D产品开发部',21,'3.2',false,'-'],['4.2','TR4 中试技术评审','3D产品开发部',1,'4.1',true,'《产品中试报告》']] }
    ] },
    4: { budgets: [1, 1, 1, 1, 1], stages: [
      { name: '一、产品规划设计阶段', tasks: [['1.1','需求评估','产品部',15,'',false,'《产品需求调研分析报告》'],['1.2','TR1 需求评审','产品部',1,'1.1',true,'《产品机会卡》'],['1.3','产品规划设计方案','产品部',5,'1.2',false,'《产品概念建议书》'],['1.4','CDCP 产品概念决策评审','产品部',1,'1.3',true,'']] },
      { name: '二、产品计划阶段', tasks: [['2.1','原料路线与技术方案设计（预研）','3D产品开发部',13,'1.4',false,'-'],['2.2','TR2 设计方案评审','3D产品开发部',1,'2.1',true,'-'],['2.3','产品立项评估','产品部',5,'2.2',false,'《产品立项建议书》'],['2.4','PDCP 产品立项决策评审','产品部',1,'2.3',true,'《产品立项决议书》'],['2.5','制定项目计划','产品部',1,'2.4',false,'《项目开发计划书》'],['2.6','项目立项','3D产品开发部',1,'2.5',true,'']] },
      { name: '三、产品开发小试阶段', tasks: [['3.1','小试制样及内部分析检测','3D产品开发部',21,'2.6',false,'线条/样条测试报告'],['3.2','TR3 小试技术评审','发展部/3D产品开发部',1,'3.1',true,'《小试样品验收评审报告》']] },
      { name: '四、产品开发中试阶段', tasks: [['4.1','中试制样及内部分析检测','工艺部/3D产品开发部',21,'3.2',false,'-'],['4.2','TR4 中试技术评审','3D产品开发部',1,'4.1',true,'《产品中试报告》']] },
      { name: '五、产品开发试产阶段', tasks: [['5.1','首批量产生产及内部分析检测','工艺部/生产部/3D产品开发部',15,'4.2',false,'《小批量试产报告》'],['5.2','TR5 量产技术评审','3D产品开发部',1,'5.1',true,''],['5.3','产品验收/结题','3D产品开发部',5,'5.2',false,'《产品验收报告》'],['5.4','ADCP 产品中试转产评审','3D产品开发部',1,'5.3',true,'']] }
    ] },
    6: { budgets: [1, 1, 2, 2, 1], stages: [
      { name: '一、产品规划设计阶段', tasks: [['1.1','需求评估','产品部',15,'',false,'《产品需求调研分析报告》'],['1.2','TR1 需求评审','产品部',1,'1.1',true,'《产品机会卡》'],['1.3','产品规划设计方案','产品部',5,'1.2',false,'《产品概念建议书》'],['1.4','CDCP 产品概念决策评审','产品部',1,'1.3',true,'']] },
      { name: '二、产品计划阶段', tasks: [['2.1','原料路线与技术方案设计（预研）','3D产品开发部',13,'1.4',false,'-'],['2.2','TR2 设计方案评审','3D产品开发部',1,'2.1',true,'-'],['2.3','产品立项评估','产品部',5,'2.2',false,'《产品立项建议书》'],['2.4','PDCP 产品立项决策评审','产品部',1,'2.3',true,'《产品立项决议书》'],['2.5','制定项目计划','产品部',1,'2.4',false,'《项目开发计划书》'],['2.6','项目立项','3D产品开发部',1,'2.5',true,'']] },
      { name: '三、产品开发小试阶段', tasks: [['3.1','小试制样及内部分析检测','3D产品开发部',30,'2.6',false,'线条/样条测试报告'],['3.2','外发小试','产品部',13,'3.1',false,'小试外发测试报告'],['3.3','TR3 小试技术评审','发展部/3D产品开发部',1,'3.2',true,'《小试样品验收评审报告》']] },
      { name: '四、产品开发中试阶段', tasks: [['4.1','中试制样及内部分析检测','工艺部/3D产品开发部',43,'3.3',false,'-'],['4.2','TR4 中试技术评审','3D产品开发部',1,'4.1',true,'《产品中试报告》']] },
      { name: '五、产品开发试产阶段', tasks: [['5.1','首批量产生产及内部分析检测','工艺部/生产部/3D产品开发部',15,'4.2',false,'《小批量试产报告》'],['5.2','TR5 量产技术评审','3D产品开发部',1,'5.1',true,''],['5.3','产品验收/结题','3D产品开发部',5,'5.2',false,'《产品验收报告》'],['5.4','ADCP 产品中试转产评审','3D产品开发部',1,'5.3',true,'']] }
    ] }
  };

  function buildWbsProject(name, months, planDate) {
    var tpl = WBS_TPL[months] || WBS_TPL[4];
    var planEnd = planDate ? parse(planDate) : null;
    if (!planEnd) return null;
    if (!isWorkdayDate(planEnd)) planEnd = prevWd(planEnd);
    var cdcpMonth = addMonthsDate(planEnd, -months);
    var cursor = { y: cdcpMonth.getFullYear(), m: cdcpMonth.getMonth() + 1 };
    var phases = [];
    tpl.stages.forEach(function (st, si) {
      var n = tpl.budgets[si];
      var sy = cursor.y, sm = cursor.m, ey = sy, em = sm + n - 1;
      while (em > 12) { em -= 12; ey++; }
      var bstart = firstWd(sy, sm), bend = lastWd(ey, em);
      if (si === tpl.stages.length - 1) bend = planEnd;
      var cap = workdaysBetween(bstart, bend);
      var orig = st.tasks.map(function (x) { return x[3]; });
      var durs = orig.slice();
      function total(a) { return a.reduce(function (s, v) { return s + v; }, 0); }
      while (total(durs) > cap) {
        var idx = -1;
        for (var k = 0; k < durs.length; k++) {
          if (orig[k] > 1 && durs[k] > Math.max(1, Math.ceil(orig[k] / 3))) {
            if (idx < 0 || durs[k] > durs[idx]) idx = k;
          }
        }
        if (idx < 0) break;
        durs[idx] -= 1;
      }
      var tasks = [];
      var end = bend;
      for (var k = st.tasks.length - 1; k >= 0; k--) {
        var def = st.tasks[k], dur = durs[k];
        var s = addWdBack(end, dur);
        tasks.unshift({
          seq: def[0], name: def[1], status: '正常', done: '未完成', dept: def[2], days: dur,
          prev: def[4], month: s.getFullYear() + '年' + (s.getMonth() + 1) + '月',
          start: iso(s), end: iso(end), actual: null, milestone: def[5], output: def[6] === '-' ? '' : def[6],
          note: dur !== orig[k] ? '工时压缩 ' + orig[k] + '→' + dur : '',
          taskKey: name + '|' + def[0]
        });
        end = prevWd(s);
      }
      phases.push({ name: st.name, tasks: tasks });
      cursor = { y: ey, m: em + 1 };
      if (cursor.m > 12) { cursor.m -= 12; cursor.y++; }
    });
    return { name: name, priority: '', phases: phases };
  }

  function findWbs(name) { return D.wbs.filter(function (w) { return w.name === name; })[0] || null; }
  function findWbsAny(name) { return findWbs(name) || (name ? wbsFor(name) : null); }
  function hideWbs(name) {
    var w = findWbsAny(name);
    if (!w) return;
    APP.wbsHidden[name] = cloneObj(w.phases);
    delete APP.wbsOverride[name];
    D.wbs = D.wbs.filter(function (x) { return x.name !== w.name; });
    delete WBS_BY_NORM[normalize(w.name)];
    appSave();
  }
  function restoreWbs(name) {
    var phases = APP.wbsHidden[name];
    if (!phases) return false;
    if (!findWbs(name)) D.wbs.push({ name: name, priority: '', phases: cloneObj(phases) });
    APP.wbsOverride[name] = cloneObj(phases);
    WBS_BY_NORM[normalize(name)] = findWbs(name);
    delete APP.wbsHidden[name];
    appSave();
    return true;
  }
  function toggleNotDo(taskKey) {
    var w = D.wbs.filter(function (x) { return flattenWbs(x).some(function (t) { return t.taskKey === taskKey; }); })[0] ||
      D.wbs.filter(function (x) { return x.name === state.wbs.proj; })[0];
    if (!w) return;
    var phase = w.phases.filter(function (ph) { return ph.tasks.some(function (t) { return t.taskKey === taskKey; }); })[0];
    if (!phase) return;
    var target = phase.tasks.filter(function (t) { return t.taskKey === taskKey; })[0];
    var eff = taskEff(target);
    var ends = phase.tasks.map(taskEff).map(function (t) { return t.end; }).filter(Boolean).sort();
    var phaseEnd = ends.length ? ends[ends.length - 1] : null;

    if (!eff.notDo) {
      var orig = {};
      phase.tasks.forEach(function (t) { orig[t.taskKey] = taskEff(t).days; });
      var active = phase.tasks.filter(function (t) { return t.taskKey !== taskKey && !taskEff(t).notDo; });
      var poolDays = +(eff.days || 0);
      if (active.length && poolDays > 0) {
        var base = Math.floor(poolDays / active.length), rem = poolDays % active.length;
        active.forEach(function (t, i) {
          var nd = (taskEff(t).days || 0) + base + (i < rem ? 1 : 0);
          setOV('wbs', t.taskKey, { days: nd });
        });
      }
      setOV('wbs', taskKey, { notDo: true, done: '未完成' });
      APP.wbsNotDo[taskKey] = { origDays: orig };
    } else {
      var entry = APP.wbsNotDo[taskKey];
      if (entry) {
        phase.tasks.forEach(function (t) {
          if (entry.origDays[t.taskKey] != null) setOV('wbs', t.taskKey, { days: entry.origDays[t.taskKey] });
        });
      }
      setOV('wbs', taskKey, { notDo: false });
      delete APP.wbsNotDo[taskKey];
    }

    if (phaseEnd) {
      var end = parse(phaseEnd);
      for (var i = phase.tasks.length - 1; i >= 0; i--) {
        var t = phase.tasks[i], e = taskEff(t);
        if (e.notDo) continue;
        var dur = Math.max(1, +(e.days || 1));
        var s = addWdBack(end, dur);
        setOV('wbs', t.taskKey, { start: iso(s), end: iso(end) });
        end = prevWd(s);
      }
    }
    appSave();
    var y = window.scrollY;
    render();
    window.scrollTo(0, y);
  }

  function shiftWbsMonths(name, delta) {
    if (!delta) return;
    var w = findWbs(name);
    if (!w) return;
    w.phases.forEach(function (ph) {
      ph.tasks.forEach(function (t) {
        if (t.start) t.start = iso(addMonthsDate(parse(t.start), delta));
        if (t.end) t.end = iso(addMonthsDate(parse(t.end), delta));
        if (t.actual) t.actual = iso(addMonthsDate(parse(t.actual), delta));
        if (t.start) t.month = parse(t.start).getFullYear() + '年' + (parse(t.start).getMonth() + 1) + '月';
      });
    });
    APP.wbsOverride[name] = cloneObj(w.phases);
    appSave();
  }

  function upsertWbs(name, months, planDate) {
    var w = buildWbsProject(name, months, planDate);
    if (!w) return null;
    if (OV.wbs) {
      var changed = false;
      Object.keys(OV.wbs).forEach(function (k) {
        if (k.indexOf(name + '|') === 0) { delete OV.wbs[k]; changed = true; }
      });
      if (changed) saveOV();
    }
    var old = findWbs(name);
    if (old) { old.phases = w.phases; }
    else D.wbs.push(w);
    APP.wbsOverride[name] = cloneObj(w.phases);
    WBS_BY_NORM[normalize(name)] = old || w;
    appSave();
    return w;
  }

  function monthDelta(a, b) {
    if (!a || !b) return 0;
    var da = parse(a), db = parse(b);
    return (db.getFullYear() - da.getFullYear()) * 12 + (db.getMonth() - da.getMonth());
  }

  /* ---------------- 数据派生 ---------------- */
  function normalize(s) {
    return String(s || '').replace(/[（(].*?[)）]/g, '').replace(/[\s\-_/、，,。·.]+/g, '').toLowerCase();
  }

  var WBS_ALIAS = {
    'PC阻燃（无卤阻燃）': 'PC阻燃',
    'PLA-Metal性能优化（金/铜）': 'PLA金属免喷涂性能优化',
    'PETG哑光白点优化': 'PETG哑光白点析出优化',
    'PA6玻纤': 'PA6-GF',
    'TPU-85A': 'TPU85A/90A',
    'TPU-90A': 'TPU85A/90A',
    'TPU-75A（2.85mm)': 'TPU75A(2.85mm)',
    'PLA-哑光、PLA-Basic、PLA+国产化2026年3代': 'PLA-哑光、PLA-Basic、PLA+、PLA-ST国产化3代项目'
  };
  applyCustomData();

  var WBS_BY_NORM = {};
  D.wbs.forEach(function (w) { WBS_BY_NORM[normalize(w.name)] = w; });

  function wbsFor(name) {
    if (!name) return null;
    if (WBS_ALIAS[name]) {
      var alias = WBS_ALIAS[name];
      var hit = D.wbs.filter(function (w) { return w.name === alias; })[0];
      if (hit) return hit;
    }
    var n = normalize(name);
    if (WBS_BY_NORM[n]) return WBS_BY_NORM[n];
    var contain = D.wbs.filter(function (w) {
      var wn = normalize(w.name);
      return wn && (wn.indexOf(n) >= 0 || n.indexOf(wn) >= 0) && Math.min(wn.length, n.length) >= 4;
    });
    return contain[0] || null;
  }

  function flattenWbs(proj) {
    var out = [];
    proj.phases.forEach(function (ph) {
      ph.tasks.forEach(function (t) { out.push(Object.assign({}, t, { phase: ph.name, project: proj.name })); });
    });
    return out;
  }
  function taskEff(t) {
    var o = (OV.wbs || {})[t.taskKey] || {};
    var notDo = !!(o.notDo || t.notDo);
    var done = notDo ? '未完成' : (o.done || t.done);
    var actual = Object.prototype.hasOwnProperty.call(o, 'actual') ? o.actual : t.actual;
    var start = o.start || t.start, end = o.end || t.end;
    return Object.assign({}, t, {
      done: done, actual: actual, status: o.status || t.status,
      days: o.days != null ? o.days : t.days,
      start: start, end: end, notDo: notDo,
      late: !notDo && done !== '已完成' && end && end < TODAY
    });
  }
  function taskRisk(t) {
    if (!t || t.done === '已完成' || t.notDo || !t.end) return false;
    var d = diffDays(TODAY, t.end);
    return d != null && d >= 0 && d <= 7;
  }
  function taskStatus(t) {
    if (t.notDo) return { cls: 'gray', text: '不开展' };
    if (t.late) return { cls: 'rust', text: '延期' };
    if (taskRisk(t)) return { cls: 'amber', text: '延期风险' };
    return { cls: 'teal', text: '正常' };
  }
  function statusSelectHtml(t) {
    var stVal = t.notDo ? 'notdo' : t.late ? 'delay' : taskRisk(t) ? 'risk' : 'normal';
    var opts = [['normal', '正常'], ['notdo', '不开展'], ['delay', '延期'], ['risk', '延期风险']].map(function (o) {
      var dis = o[0] === 'delay' || o[0] === 'risk';
      return '<option value="' + o[0] + '"' + (dis ? ' disabled' : '') + (stVal === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
    }).join('');
    return '<select class="status-select" data-wbsstatus="' + esc(t.taskKey) + '">' + opts + '</select>';
  }

  var CN_NUM = '一二三四五六七八九';
  function cnNum(s) {
    if (s === '十') return 10;
    var m = s.match(/^十([一二三四五六七八九])$/);
    if (m) return 10 + CN_NUM.indexOf(m[1]) + 1;
    m = s.match(/^([一二三四五六七八九])十([一二三四五六七八九])?$/);
    if (m) return (CN_NUM.indexOf(m[1]) + 1) * 10 + (m[2] ? CN_NUM.indexOf(m[2]) + 1 : 0);
    return CN_NUM.indexOf(s) + 1;
  }
  function phaseRank(name) {
    var m = String(name || '').match(/^\s*([一二三四五六七八九十]+)\s*[、.．]/);
    return m ? cnNum(m[1]) : 999;
  }
  function sortedPhases(proj) {
    return proj.phases.slice().sort(function (a, b) { return phaseRank(a.name) - phaseRank(b.name); });
  }

  function wbsStats(proj) {
    var tasks = flattenWbs(proj).map(taskEff);
    var active = tasks.filter(function (t) { return !t.notDo; });
    var done = active.filter(function (t) { return t.done === '已完成'; }).length;
    var late = active.filter(function (t) { return t.late; }).length;
    var next = active.filter(function (t) { return t.done !== '已完成'; })
      .sort(function (a, b) { return String(a.start || '').localeCompare(String(b.start || '')); })[0] || null;
    return { total: active.length, done: done, late: late, pct: pct(done, active.length), next: next, tasks: tasks };
  }

  function poolState(p) {
    if (p.done === '已完成') return p.status === '取消' ? 'cancel' : 'done';
    if (p.status === '取消') return 'cancel';
    if (p.status === '暂停') return 'paused';
    if (p.status === '未开展') return 'planned';
    if (p.status === '延期') return 'delay';
    if (p.plan && p.plan < TODAY) return 'delay';
    var d = leftDays(p);
    if (d != null && d >= 0 && d <= 7) return 'delay';
    return 'active';
  }
  function displayStatus(p) {
    var s = poolState(p);
    if (s === 'done') return p.status === '延期' ? { key: 'delay', cls: 'delay', text: '延期' } : { key: 'active', cls: 'active', text: '正常' };
    if (s === 'delay') {
      var d = leftDays(p);
      if (p.status !== '延期' && d != null && d >= 0 && d <= 7) return { key: 'risk', cls: 'risk', text: '延期风险' };
      return { key: 'delay', cls: 'delay', text: '延期' };
    }
    if (s === 'paused') return { key: 'paused', cls: 'paused', text: '暂停' };
    if (s === 'planned') return { key: 'planned', cls: 'planned', text: '未开展' };
    if (s === 'cancel') return { key: 'cancel', cls: 'cancel', text: '取消' };
    return { key: 'active', cls: 'active', text: '正常' };
  }
  function displayStatusChip(p) { var d = displayStatus(p); return chip(d.cls, d.text); }
  function stateChip(p) {
    var s = poolState(p);
    if (s === 'delay' && p.status !== '延期') {
      var d = leftDays(p);
      if (d != null && d >= 0 && d <= 7) return chip('risk', '延期风险');
      return chip('delay', '延期');
    }
    if (s === 'done' && p.status === '延期') return chip('done', '延期完成');
    return chip(s);
  }
  function keyRiskInfo(k) {
    if (k.done === '已完成' || k.status === '取消') return null;
    var d = leftDays(k);
    if (k.status === '延期' || (d != null && d < 0)) return { kind: 'delay', days: d };
    if (d != null && d >= 0 && d <= 7) return { kind: 'window', days: d };
    return null;
  }
  function personTag(name) {
    if (!name || name === '—') return '<span class="person-tag empty">—</span>';
    var icon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-4.4 0-8 2.7-8 6v1h16v-1c0-3.3-3.6-6-8-6z"/></svg>';
    return '<span class="person-tag"><i class="p-avatar">' + icon + '</i>' + esc(name) + '</span>';
  }
  function doneTag(status) {
    var cls = status === '已完成' ? 'done' : status === '取消' ? 'cancel' : '';
    return '<span class="done-tag ' + cls + '">' + esc(status || '未完成') + '</span>';
  }
  var TYPE_CLASS = {
    '新产品开发': 'blue',
    '性能优化': 'purple',
    '原料替代': 'green',
    '行业应用/大客户': 'orange',
    '配件': 'gray',
    '呆滞料处理': 'brown'
  };
  function typeTag(type) {
    if (!type) return '';
    var cls = TYPE_CLASS[type] || 'gray';
    return '<span class="type-tag ' + cls + '">' + esc(type) + '</span>';
  }
  function leftDays(p) {
    if (!p.plan) return null;
    return diffDays(TODAY, p.plan);
  }
  function leftHTML(p) {
    if (p.done === '已完成') {
      var cycle = p.actual && p.started ? diffDays(p.started, p.actual) : null;
      return '<span class="num days-done">' + (cycle != null ? '周期 ' + cycle + ' 天' : '已完成') + '</span>';
    }
    if (p.status === '取消' || p.status === '暂停' || p.status === '未开展') return '<span class="num faint">—</span>';
    var d = leftDays(p);
    if (d == null) return '<span class="num faint">未定</span>';
    if (d < 0) return '<span class="num days-hot">延期 ' + Math.abs(d) + ' 天</span>';
    if (d <= 21) return '<span class="num days-hot">剩 ' + d + ' 天</span>';
    return '<span class="num days-ok">剩 ' + d + ' 天</span>';
  }
  function planRange(p) {
    if (!p.plan) return '—';
    return fmt(p.plan);
  }

  /* ---------------- 汇总数字 ---------------- */
  function counts() {
    var poolActive = D.pool.filter(function (p) { return p.done !== '已完成' && ['正常', '延期'].indexOf(p.status) >= 0; });
    var poolDone = D.pool.filter(function (p) { return p.done === '已完成'; });
    var keyActive = D.keyProjects.filter(function (k) { return k.done !== '已完成' && k.status !== '取消'; });
    var keyRisk = keyActive.filter(keyRiskInfo);
    var allTasks = [];
    D.wbs.forEach(function (w) { allTasks = allTasks.concat(flattenWbs(w).map(taskEff)); });
    var wbsDone = allTasks.filter(function (t) { return t.done === '已完成'; }).length;
    var wbsLate = allTasks.filter(function (t) { return t.late; }).length;
    var colorDoing = D.colors.filter(function (c) { return c.done !== '已完成' && ['暂停', '取消'].indexOf(c.status) < 0; });
    var outDoing = D.outsourcing.filter(function (o) { return o.progress !== '完成引进' && o.progress !== '不引进'; });
    return {
      poolActive: poolActive, poolDone: poolDone, keyActive: keyActive, keyRisk: keyRisk,
      allTasks: allTasks, wbsDone: wbsDone, wbsLate: wbsLate, colorDoing: colorDoing, outDoing: outDoing
    };
  }
  function monthKeyOf(s) {
    if (!s) return null;
    var m = String(s).match(/(\d{4})\D+(\d{1,2})/);
    return m ? m[1] + '-' + pad(m[2]) : null;
  }
  function currentMonthKey() { return TODAY.slice(0, 7); }

  /* ---------------- 路由与页面元信息 ---------------- */
  var VIEWS = {
    overview: { eyebrow: 'COMMAND OVERVIEW', title: '项目总览' },
    map: { eyebrow: 'ANNUAL ROADMAP · 2026—2027', title: '年度开发 MAP' },
    pool: { eyebrow: 'PROJECT WORK POOL', title: '项目工作池' },
    key: { eyebrow: 'KEY PROJECTS · MONITORED', title: '重点项目' },
    wbs: { eyebrow: 'WORK BREAKDOWN STRUCTURE', title: 'WBS 进度' },
    outsource: { eyebrow: 'OUTSOURCING PIPELINE', title: '外协引进' },
    color: { eyebrow: 'COLOR DEVELOPMENT', title: '配色管理' }
  };
  var mapDrag = null, mapSuppressClick = false;
  var state = {
    map: { type: '', q: '', status: '', pri: '', done: '' },
    pool: { q: '', type: '', status: '', priority: '', done: '', key: '', sort: 'risk' },
    key: { q: '', type: '', pri: '', only: '', done: '', month: '', sort: 'risk' },
    out: { q: '', type: '' },
    color: { q: '', spu: '', status: '', dept: '' },
    wbs: { proj: D.wbs[0] ? D.wbs[0].name : '', mode: 'list', only: 'all', month: '', closed: {} }
  };

  function render() {
    var id = (location.hash || '').replace(/^#\/?/, '') || 'overview';
    if (!VIEWS[id]) id = 'overview';
    closeDrawer();
    document.title = VIEWS[id].title + ' · 产品项目管理';
    $$('.nav-item').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-nav') === id); });
    $('#pageEyebrow').textContent = VIEWS[id].eyebrow;
    $('#pageTitle').textContent = VIEWS[id].title;
    var view = $('#view');
    var railScroll = null;
    if (id === 'wbs') {
      var railOld = document.querySelector('.wbs-rail');
      if (railOld) railScroll = railOld.scrollTop;
    }
    var html = '';
    if (id === 'overview') html = viewOverview();
    else if (id === 'map') html = viewMap();
    else if (id === 'pool') html = viewPool();
    else if (id === 'key') html = viewKey();
    else if (id === 'wbs') html = viewWbs();
    else if (id === 'outsource') html = viewOutsource();
    else if (id === 'color') html = viewColor();
    view.innerHTML = html;
    bindView(id);
    if (railScroll != null) {
      var railNew = document.querySelector('.wbs-rail');
      if (railNew) railNew.scrollTop = railScroll;
    }
    updateNav();
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }

  function rerender(focusId) {
    var caret = null;
    if (focusId) {
      var old = document.getElementById(focusId);
      if (old && old.selectionStart != null) caret = old.selectionStart;
    }
    render();
    if (focusId) {
      var el = document.getElementById(focusId);
      if (el) {
        el.focus();
        if (caret != null) {
          try { el.setSelectionRange(caret, caret); } catch (e) {}
        }
      }
    }
  }

  // 中文输入法在 composition 期间不能重绘，否则会丢失候选词输入
  function bindTextSearch(input, store, key, focusId) {
    if (!input) return;
    var composing = false;
    input.addEventListener('compositionstart', function () {
      composing = true;
      clearTimeout(input._searchTimer);
    });
    input.addEventListener('compositionend', function () {
      composing = false;
      clearTimeout(input._searchTimer);
      store[key] = this.value;
      rerender(focusId);
    });
    input.addEventListener('input', function () {
      store[key] = this.value;
      if (composing) return;
      var self = this;
      clearTimeout(self._searchTimer);
      self._searchTimer = setTimeout(function () { rerender(focusId); }, 220);
    });
  }

  function resetBtn(scope) {
    return '<button class="reset-btn" data-act="reset-filters" data-scope="' + scope + '" title="重置筛选"><span class="rst-ico">⟳</span>重置</button>';
  }
  function ovMonthHtml(plan) {
    var s = plan ? String(plan) : '';
    var big = s ? (+s.slice(5, 7)) + '月' : '待定';
    var small = s ? s.slice(0, 4) + '年' : '';
    return '<span class="ov-month"><b>' + big + '</b><span>' + small + '</span></span>';
  }

  function renderOvMonthPanel() {
    var months = D.meta.months || [];
    if (!months.length) return '';
    var projects = D.keyProjects || [];
    var cur = currentMonthKey();
    var curDate = parse(cur + '-01');
    var nextKey = curDate ? iso(addMonthsDate(curDate, 1)).slice(0, 7) : cur;
    var chartMonths = months.filter(function (m) { return m.key <= nextKey; });
    if (!chartMonths.length) chartMonths = months;
    var data = chartMonths.map(function (m) {
      var planned = projects.filter(function (k) { return monthKeyOf(k.plan) === m.key; });
      var done = planned.filter(function (k) { return k.done === '已完成'; }).length;
      var actual = done;
      return { key: m.key, label: m.label, planned: planned.length, done: done, actual: actual, rate: planned.length ? Math.round(done / planned.length * 100) : 0, doneItems: planned.filter(function (k) { return k.done === '已完成'; }), pendingItems: planned.filter(function (k) { return k.done !== '已完成'; }) };
    });
    var W = 760, H = 300, L = 30, R = 16, T = 20, B = 34, cw = W - L - R, ch = H - T - B;
    var maxC = Math.max(1, data.reduce(function (a, d) { return Math.max(a, d.planned, d.actual); }, 0));
    var step = cw / data.length;
    var bars = '', pts = '', dots = '';
    for (var g = 0; g <= 2; g++) {
      var gy = T + ch - ch * g / 2;
      bars += '<line x1="' + L + '" y1="' + gy + '" x2="' + (W - R) + '" y2="' + gy + '" stroke="#EAE6DC"></line>';
    }
    data.forEach(function (d, i) {
      var x = L + i * step, bw = Math.max(3, step * 0.24);
      var px = x + step * 0.16;
      var ph = d.planned / maxC * ch, ah = d.actual / maxC * ch;
      var doneNames = d.doneItems.map(function (k) { return k.name; }).join('、') || '无';
      var pendingNames = d.pendingItems.map(function (k) { return k.name; }).join('、') || '无';
      var pTip = d.label + ' 计划完成：' + d.planned + ' 项\n已完成：' + d.done + ' 项（' + doneNames + '）\n未完成：' + d.pendingItems.length + ' 项（' + pendingNames + '）';
      var aTip = d.label + ' 实际完成：' + d.actual + ' 项\n已完成项目：' + doneNames;
      var rTip = d.label + ' 完成率：' + d.rate + '%（' + d.done + '/' + d.planned + '）\n已完成：' + doneNames + '\n未完成：' + pendingNames;
      bars += '<rect data-ovm="' + esc(pTip) + '" x="' + px + '" y="' + (T + ch - ph) + '" width="' + bw + '" height="' + ph + '" fill="#8FA3B8"><title>' + esc(pTip) + '</title></rect>';
      bars += '<rect data-ovm="' + esc(aTip) + '" x="' + (px + bw + 2) + '" y="' + (T + ch - ah) + '" width="' + bw + '" height="' + ah + '" fill="#107C10"><title>' + esc(aTip) + '</title></rect>';
      var cy = T + ch - d.rate / 100 * ch;
      pts += (i ? ' ' : '') + (x + step / 2) + ',' + cy;
      dots += '<circle data-ovm="' + esc(rTip) + '" cx="' + (x + step / 2) + '" cy="' + cy + '" r="2.6" fill="#CA5010"><title>' + esc(rTip) + '</title></circle>';
      bars += '<text x="' + (x + step / 2) + '" y="' + (H - 8) + '" font-size="9.5" text-anchor="middle" fill="#4B4A47">' + d.label.slice(2) + '</text>';
    });
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="重点项目月度完成情况">' + bars +
      '<polyline points="' + pts + '" fill="none" stroke="#CA5010" stroke-width="1.8"></polyline>' + dots +
      '<text x="' + (L - 4) + '" y="' + (T + 4) + '" font-size="9.5" text-anchor="end" fill="#4B4A47">' + maxC + '</text>' +
      '<text x="' + (L - 4) + '" y="' + (T + ch) + '" font-size="9.5" text-anchor="end" fill="#4B4A47">0</text></svg>';

    var idx = months.findIndex(function (m) { return m.key === cur; });
    if (idx < 0) idx = 0;
    var focus = [months[idx - 1], months[idx], months[idx + 1]].filter(Boolean);
    var focusH = '';
    focus.forEach(function (m) {
      var items = projects.filter(function (k) { return monthKeyOf(k.plan) === m.key; });
      focusH += '<div class="ovm-month"><b>' + m.label + '</b>';
      if (!items.length) focusH += '<span class="faint" style="font-size:10px">无项目</span>';
      else {
        var groups = {};
        items.forEach(function (k) { var t = k.type || '未分类'; (groups[t] = groups[t] || []).push(k); });
        Object.keys(groups).forEach(function (t) {
          focusH += '<div class="ovm-type"><span class="ovm-type-tag">' + esc(t) + '</span><div class="ovm-chips">' + groups[t].map(function (k) {
            return '<span class="ovm-chip ' + mapKeyState(k) + '" title="' + esc(k.name + ' · ' + fmt(k.plan)) + '">' + esc((k.done === '已完成' ? '✓ ' : '') + k.name) + '</span>';
          }).join('') + '</div></div>';
        });
      }
      focusH += '</div>';
    });
    return '<div class="ovm-row">' +
      '<div class="panel ov-month-panel"><div class="panel-head"><div class="ph-l"><h3>重点项目月度完成情况</h3><span class="ph-sub">柱形为计划 / 实际完成项目数，折线为完成率</span></div></div><div class="panel-body"><div class="ovm-chart">' +
      '<div class="legend" style="margin-bottom:2px"><span><i style="background:#8FA3B8"></i>计划完成</span><span><i style="background:#107C10"></i>实际完成</span><span><i style="background:#CA5010"></i>完成率</span></div>' + svg +
      '<div class="ovm-tip" hidden></div></div></div></div>' +
      '<div class="panel ov-map-panel"><div class="panel-head"><div class="ph-l"><h3>年度 MAP</h3></div></div><div class="panel-body"><div class="ovm-focus">' + focusH + '</div></div></div>' +
      '</div>';
  }

  /* ---------------- 页面：总览 ---------------- */
  function viewOverview() {
    var c = counts();
    var all = c.allTasks.length;
    var curM = currentMonthKey();
    var monthTasks = c.allTasks.filter(function (t) { return monthKeyOf(t.end || t.month) === curM; });
    var monthDone = monthTasks.filter(function (t) { return t.done === '已完成'; }).length;

    var months = [];
    var ends = c.allTasks.map(function (t) { return monthKeyOf(t.end || t.month); }).filter(Boolean).sort();
    if (ends.length) {
      var first = ends[0], last = ends[ends.length - 1];
      var fy = +first.slice(0, 4), fm = +first.slice(5, 7);
      var ly = +last.slice(0, 4), lm = +last.slice(5, 7);
      var cursor = new Date(fy, fm - 1, 1);
      var stop = new Date(ly, lm - 1, 1);
      while (cursor <= stop && months.length < 18) {
        var dk = cursor.getFullYear() + '-' + pad(cursor.getMonth() + 1);
        months.push({ key: dk, label: (cursor.getMonth() + 1) + '月', year: cursor.getFullYear() });
        cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      }
    }
    var mstat = months.map(function (m) {
      var ts = c.allTasks.filter(function (t) { return monthKeyOf(t.end || t.month) === m.key; });
      return { m: m, total: ts.length, done: ts.filter(function (t) { return t.done === '已完成'; }).length };
    });
    var maxM = Math.max.apply(null, mstat.map(function (x) { return x.total; }).concat([1]));

    var funnel = ['寻源中', '一轮测试', '二轮测试', '完成引进', '不引进'].map(function (stage) {
      return { stage: stage, n: D.outsourcing.filter(function (o) { return o.progress === stage; }).length };
    });
    var maxF = Math.max.apply(null, funnel.map(function (f) { return f.n; }).concat([1]));

    var colorDone = D.colors.filter(function (x) { return x.done === '已完成'; }).length;
    var colorDoing = D.colors.filter(function (x) { return x.done !== '已完成' && x.status === '正常'; }).length;
    var colorPaused = D.colors.filter(function (x) { return x.done !== '已完成' && x.status === '暂停'; }).length;
    var colorOff = D.colors.length - colorDone - colorDoing - colorPaused;
    var colorPct = pct(colorDone, D.colors.length);
    var colorDoingPct = pct(colorDone + colorDoing, D.colors.length);

    var poolDone = D.pool.filter(function (p) { return p.done === '已完成'; }).length;
    var poolRate = pct(poolDone, D.pool.length);
    var keyTotal = D.keyProjects.length;
    var keyDone = D.keyProjects.filter(function (k) { return k.done === '已完成'; }).length;
    var keyOpen = D.keyProjects.filter(function (k) { return k.done !== '已完成' && k.status !== '取消'; }).length;
    var keyRate = pct(keyDone, keyTotal);
    var keyRisk = D.keyProjects.filter(keyRiskInfo).length;
    var keyDelayed = D.keyProjects.filter(function (k) {
      var info = keyRiskInfo(k);
      return info && info.kind === 'delay';
    }).length;
    var keyWindow = D.keyProjects.filter(function (k) {
      var info = keyRiskInfo(k);
      return info && info.kind === 'window';
    }).length;
    var keyMonth = D.keyProjects.filter(function (k) {
      return k.done !== '已完成' && k.status !== '取消' && k.plan && k.plan.slice(0, 7) === curM;
    }).length;

    var risks = collectRisks();
    var keyRisks = risks.filter(function (r) { return r.kind === '重点'; });
    var wbsRisks = risks.filter(function (r) { return r.kind === 'WBS'; });

    var keyList = c.keyActive.slice().sort(function (a, b) {
      var ma = monthKeyOf(a.plan) || '9999-99', mb = monthKeyOf(b.plan) || '9999-99';
      if (ma !== mb) return ma.localeCompare(mb);
      var rank = function (k) {
        var sk = displayStatus(k).key;
        return sk === 'delay' ? 0 : sk === 'risk' ? 1 : sk === 'active' ? 2 : 3;
      };
      var ra = rank(a), rb = rank(b);
      if (ra !== rb) return ra - rb;
      var pa = (a.priority || 'P9'), pb = (b.priority || 'P9');
      if (pa !== pb) return pa.localeCompare(pb);
      return String(a.plan || '').localeCompare(String(b.plan || ''));
    });

    var riskRow = function (r, i) {
      var daysTxt = r.days == null ? '—' : (r.days < 0 ? '延期 ' + Math.abs(r.days) + ' 天' : '剩 ' + r.days + ' 天');
      var isWbs = r.kind === 'WBS';
      var statusChip = isWbs ? (r.days != null && r.days >= 0 ? chip('risk', '延期风险') : chip('delay', '延期')) : stateChip({ status: r.status, done: r.done, plan: r.plan });
      var planLabel = isWbs ? '计划结束 ' : '计划完成 ';
      var title;
      if (isWbs) {
        title = '<span class="wbs-task">' + esc(r.task || r.name) + '</span>' +
          '<span class="wbs-product">（' + esc(r.name) + '）</span>' +
          personTag(r.owner || '—');
      } else {
        title = esc(r.name) + (r.type ? typeTag(r.type) : '') + (r.owner ? personTag(r.owner) : '') +
          (r.priority ? tag(r.priority, r.priority === 'P0' ? 'rust' : r.priority === 'P1' ? 'amber' : 'gray') : '');
      }
      return '<div class="mini-row key-row" data-act="' + r.act + '" data-id="' + esc(r.id) + '" style="cursor:pointer">' +
        '<span class="mr-idx">' + pad((i || 0) + 1) + '</span>' + ovMonthHtml(r.plan) +
        '<div class="mr-main"><div class="mr-name">' + title + '</div></div>' +
        '<div class="mr-right"><div class="ov-statusline">' + statusChip + '<span class="plan-chip">' + planLabel + fmt(r.plan) + '</span></div>' +
        '<span class="mr-days hot">' + daysTxt + '</span></div></div>';
    };
    var emptyGroup = '<div class="empty"><b>当前没有相关风险项</b></div>';

    var h = '';
    h += '<div class="overview-hero" data-act="goto-pool">';
    h += '<div class="oh-l"><h2>26-27年总项目池</h2></div>';
    h += '<div class="oh-r">';
    h += '<div><span>项目总数</span><b>' + D.pool.length + '<em>项</em></b></div>';
    h += '<div><span>已完成</span><b>' + poolDone + '<em>项</em></b></div>';
    h += '<div><span>完成率</span><b>' + poolRate + '<em>%</em></b></div>';
    h += '</div></div>';

    h += '<div class="kpis">';
    h += kpi('重点项目总数', keyTotal, '项', 'info', '01', '占项目池 ' + keyTotal + ' / ' + D.pool.length + ' · ' + pct(keyTotal, D.pool.length) + '%', 'goto-key', '', '', '');
    h += kpi('未完成', keyOpen, '项', 'warm', '02', '占重点项目 ' + pct(keyOpen, keyTotal) + '%', 'goto-key', '', '', 'open');
    h += kpi('延期风险项目总数', keyWindow, '项', 'ok', '03', '7 天内到期 ' + keyWindow + ' 项', 'goto-key', 'risk', '');
    h += kpi('已延期项目总数', keyDelayed, '项', 'warn', '04', '占重点项目 ' + pct(keyDelayed, keyTotal) + '%', 'goto-key', 'delay', '');
    h += kpi('本月重点关注', keyMonth, '项', 'mute', '05', '本月 WBS 任务 ' + monthTasks.length + ' 条', 'goto-key', '', 'current');
    h += '</div>';

    h += renderOvMonthPanel();
    h += '<div class="grid-2">';
    h += '<div class="panel"><div class="panel-head"><div class="ph-l"><h3>重点项目推进</h3><span class="ph-sub">仅展示未完成 · 共 ' + keyList.length + ' 项 · 滚动查看全部</span></div><button class="panel-link" data-nav="key">全部重点项目 →</button></div><div class="panel-body tight"><div class="key-scroll">';
    if (!keyList.length) h += '<div class="empty"><b>暂无未完成重点项目</b></div>';
    keyList.forEach(function (k, i) {
      var w = wbsFor(k.name);
      var st = w ? wbsStats(w) : null;
      var risk = keyRiskInfo(k);
      var d = leftDays(k);
      h += '<div class="mini-row key-row" data-act="open-key" data-id="' + k.id + '" style="cursor:pointer">';
      h += '<span class="mr-idx">' + pad(i + 1) + '</span>';
      h += ovMonthHtml(k.plan);
      h += '<div class="mr-main"><div class="mr-name">' + esc(k.name) + typeTag(k.type) + personTag(k.owner) +
        (k.priority ? tag(k.priority, k.priority === 'P0' ? 'rust' : k.priority === 'P1' ? 'amber' : 'gray') : '') + '</div>';
      h += '<div class="mr-sub"><span class="mr-sub-base">' + (st ? 'WBS ' + st.pct + '% · ' + st.done + '/' + st.total + ' 任务' : esc(k.phase || '未建立 WBS')) + '</span>' +
        (st && st.next ? '<span class="mr-next"><i>下一任务</i>' + esc(st.next.name) + ' · ' + fmt(st.next.start) + '</span>' : '') + '</div>';
      if (st) {
        h += '<div class="kc-prog" style="margin-top:7px"><div class="bar thin"><i class="' + (st.late ? 'delay' : '') + '" style="width:' + st.pct + '%"></i></div><b style="font-size:10px;color:var(--faint)">' + st.pct + '%</b></div>';
      }
      h += '</div>';
      h += '<div class="mr-right"><div class="ov-statusline">' + stateChip(k) + '<span class="plan-chip">计划完成 ' + fmt(k.plan) + '</span></div>';
      h += '<span class="mr-days ' + (risk ? 'hot' : '') + '">' + (d == null ? '' : (d < 0 ? '延期 ' + Math.abs(d) + ' 天' : '剩 ' + d + ' 天')) + '</span></div>';
      h += '</div>';
    });
    h += '</div></div></div>';

    h += '<div class="panel"><div class="panel-head"><div class="ph-l"><h3>风险与预警</h3><span class="ph-sub">按延期天数排序</span></div>';
    h += '<div class="risk-tools"><div class="risk-tabs"><button class="on" data-risk-dim="key">重点项目</button><button data-risk-dim="wbs">WBS</button></div><span class="risk-count" id="riskCount">' + keyRisks.length + ' 项</span></div></div>';
    h += '<div class="panel-body tight"><div class="risk-group" data-risk-dim="key" data-count="' + keyRisks.length + '">';
    h += keyRisks.length ? keyRisks.map(riskRow).join('') : emptyGroup;
    h += '</div><div class="risk-group" data-risk-dim="wbs" data-count="' + wbsRisks.length + '" hidden>';
    h += wbsRisks.length ? wbsRisks.map(riskRow).join('') : emptyGroup;
    h += '</div></div></div>';
    h += '</div>';

    /* 底部三栏 */
    h += '<div class="grid-3" style="margin-top:14px">';

    h += '<div class="panel"><div class="panel-head"><div class="ph-l"><h3>WBS 月度任务负荷</h3><span class="ph-sub">按计划结束月统计</span></div><span class="ph-r">' + (months.length ? months[0].key.replace('-', '.') + ' — ' + months[months.length - 1].key.replace('-', '.') : '—') + '</span></div><div class="panel-body">';
    h += '<div class="month-chart">';
    mstat.forEach(function (x) {
      var open = x.total - x.done;
      h += '<div class="mc ' + (x.m.key === curM ? 'now' : '') + '">';
      h += '<div class="mc-bars">';
      if (open > 0) h += '<i style="height:' + Math.max(2, Math.round(open / maxM * 84)) + 'px"></i>';
      if (x.done > 0) h += '<i class="done" style="height:' + Math.round(x.done / maxM * 84) + 'px"></i>';
      h += '</div><div class="mc-val">' + x.total + '</div><div class="mc-lbl">' + x.m.label + '</div></div>';
    });
    h += '</div>';
    h += '<div class="legend" style="margin-top:10px"><span><i class="lg-done"></i>已完成</span><span><i class="lg-active" style="background:#DCD5C4"></i>未完成</span><span><i style="background:#E7C3AE"></i>当前月份</span></div>';
    h += '</div></div>';

    h += '<div class="panel"><div class="panel-head"><div class="ph-l"><h3>外协引进漏斗</h3><span class="ph-sub">' + D.outsourcing.length + ' 个跟单记录</span></div><button class="panel-link" data-nav="outsource">查看 →</button></div><div class="panel-body">';
    h += '<div class="funnel">';
    funnel.forEach(function (f) {
      h += '<div class="funnel-row"><span>' + f.stage + '</span><div class="fbar"><i style="width:' + (f.n / maxF * 100) + '%"></i></div><b>' + f.n + '</b></div>';
    });
    h += '</div>';
    h += '<div style="margin-top:14px;font-size:10.5px;color:var(--faint);border-top:1px dashed var(--line-2);padding-top:9px">在跟 ' + c.outDoing.length + ' 项 · 已引进 ' + D.outsourcing.filter(function (o) { return o.adopted; }).length + ' 项</div>';
    h += '</div></div>';

    h += '<div class="panel"><div class="panel-head"><div class="ph-l"><h3>配色交付</h3><span class="ph-sub">' + D.colors.length + ' 条需求</span></div><button class="panel-link" data-nav="color">查看 →</button></div><div class="panel-body">';
    h += '<div class="donut-wrap"><div class="donut" style="background:conic-gradient(var(--teal) 0 ' + colorPct + '%,var(--blue) ' + colorPct + '% ' + colorDoingPct + '%,#DCD6C6 ' + colorDoingPct + '% 100%)"><b>' + colorPct + '<em>%</em></b></div>';
    h += '<div class="donut-legend"><div><i style="background:var(--teal)"></i>已完成<b>' + colorDone + '</b></div><div><i style="background:var(--blue)"></i>进行中<b>' + colorDoing + '</b></div><div><i style="background:#DCD6C6"></i>暂停 / 其他<b>' + colorPaused + '</b></div></div></div>';
    h += '<div style="margin-top:14px;font-size:10.5px;color:var(--faint);border-top:1px dashed var(--line-2);padding-top:9px">平均交付 ' + avgColorCycle() + ' 天 · 待交付 ' + c.colorDoing.length + ' 条</div>';
    h += '</div></div>';

    h += '</div>';
    return h;
  }

  function kpi(label, value, unit, tone, idx, foot, act, only, month, done) {
    var attr = act ? ' data-act="' + act + '" data-keyonly="' + (only || '') + '" data-keymonth="' + (month || '') + '" data-keydone="' + (done || '') + '"' : '';
    return '<div class="kpi ' + tone + '"' + attr + '><div class="k-top"><span class="k-label">' + label + '</span><span class="k-idx">' + idx + '</span></div>' +
      '<div class="k-value"><b>' + value + '</b><i>' + unit + '</i></div><div class="k-foot">' + foot + '</div></div>';
  }

  function avgColorCycle() {
    var list = D.colors.filter(function (c) { return c.done === '已完成' && c.request && c.finish; })
      .map(function (c) { return diffDays(c.request, c.finish); }).filter(function (n) { return n != null; });
    if (!list.length) return '—';
    return Math.round(list.reduce(function (a, b) { return a + b; }, 0) / list.length);
  }

  function wbsProjectMeta(name) {
    var all = D.keyProjects.concat(D.pool);
    for (var i = 0; i < all.length; i++) {
      var w = wbsFor(all[i].name);
      if (w && w.name === name) return all[i];
    }
    return null;
  }

  function wbsOrderMeta(w) {
    var st = wbsStats(w);
    var meta = wbsProjectMeta(w.name);
    var done = meta ? (meta.done === '已完成' || meta.status === '取消') : (st.total > 0 && st.done === st.total);
    var end = meta && meta.plan ? meta.plan : (st.tasks.map(function (t) { return t.end; }).filter(Boolean).sort().pop() || null);
    return { done: done ? 1 : 0, end: end || '9999-99-99', pri: w.priority || (meta && meta.priority) || 'P9' };
  }

  function sortWbsProjects(list) {
    return list.slice().sort(function (a, b) {
      var x = wbsOrderMeta(a), y = wbsOrderMeta(b);
      if (x.done !== y.done) return x.done - y.done;
      if (x.end !== y.end) return x.end.localeCompare(y.end);
      if (x.pri !== y.pri) return x.pri.localeCompare(y.pri);
      return a.name.localeCompare(b.name, 'zh');
    });
  }

  function collectRisks() {
    var risks = [];
    var riskyKey = {};
    D.keyProjects.forEach(function (k) {
      if (k.done === '已完成' || k.status === '取消') return;
      var info = keyRiskInfo(k);
      if (info) {
        riskyKey[k.name] = true;
        risks.push({
          kind: '重点', name: k.name, sub: k.phase || '重点项目',
          days: info.days == null ? -1 : info.days,
          plan: k.plan, type: k.type, owner: k.owner, priority: k.priority,
          status: k.status, done: k.done,
          act: 'open-key', id: k.id
        });
      }
    });
    D.pool.forEach(function (p) {
      if (p.done === '已完成' || ['取消', '暂停', '未开展'].indexOf(p.status) >= 0) return;
      if (riskyKey[p.name]) return;
      var d = leftDays(p);
      if (p.status === '延期' || (d != null && d <= 7)) {
        risks.push({
          kind: '项目池', name: p.name, sub: p.phase || p.type,
          days: d == null ? -1 : d,
          plan: p.plan, type: p.type, owner: p.owner, priority: p.priority,
          status: p.status, done: p.done,
          act: 'open-pool', id: p.id
        });
      }
    });
    D.wbs.forEach(function (w) {
      var meta = wbsProjectMeta(w.name);
      flattenWbs(w).map(taskEff).forEach(function (t) {
        if (t.done === '已完成' || !t.end || !t.milestone) return;
        var d = diffDays(TODAY, t.end);
        if (!t.late && !(d != null && d >= 0 && d <= 7)) return;
        risks.push({
          kind: 'WBS', name: w.name, sub: t.name + ' · ' + t.phase,
          task: t.name, phase: t.phase,
          days: d == null ? -1 : d, plan: t.end,
          type: meta ? meta.type : '', owner: meta ? meta.owner : '',
          priority: w.priority || (meta ? meta.priority : ''),
          status: '延期', done: t.done,
          act: 'goto-wbs', id: w.name
        });
      });
    });
    D.outsourcing.forEach(function (o) {
      if (!o.adopted && o.planAdopt && o.planAdopt < TODAY) {
        risks.push({
          kind: '外协', name: o.name, sub: o.progress + ' · ' + o.supplier,
          days: diffDays(TODAY, o.planAdopt), plan: o.planAdopt,
          type: o.ptype, owner: '', priority: '', status: '正常', done: o.adopted ? '已完成' : '未完成',
          act: 'open-out', id: o.id
        });
      }
    });
    return risks.sort(function (a, b) { return a.days - b.days; });
  }

  /* ---------------- 页面：年度 MAP ---------------- */
  function mapKeyState(k) {
    if (k.status === '取消') return 'cancel';
    if (k.done === '已完成') return 'done';
    var info = keyRiskInfo(k);
    if (info && info.kind === 'delay') return 'delay';
    if (info && info.kind === 'window') return 'risk';
    if (k.status === '未开展') return 'planned';
    if (k.status === '暂停') return 'paused';
    return 'active';
  }

  function viewMap() {
    var st = state.map;
    var q = (st.q || '').toLowerCase();
    var TYPE_ORDER = ['原料替代', '性能优化', '呆滞料处理', '新产品开发', '行业应用/大客户', '配件'];
    var TYPE_HEX = {
      '新产品开发': '#0078D4', '性能优化': '#8764B8', '原料替代': '#107C10',
      '行业应用/大客户': '#CA5010', '配件': '#8A8886', '呆滞料处理': '#8E562E'
    };
    var allTypes = uniq(D.keyProjects.map(function (k) { return k.type; })).sort(function (a, b) {
      var ia = TYPE_ORDER.indexOf(a), ib = TYPE_ORDER.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });

    var list = D.keyProjects.filter(function (k) {
      if (st.type && k.type !== st.type) return false;
      if (st.pri && (k.priority || '') !== st.pri) return false;
      if (st.status && displayStatus(k).key !== st.status) return false;
      if (st.done === 'done' && k.done !== '已完成') return false;
      if (st.done === 'open' && k.done === '已完成') return false;
      if (q && (k.name + ' ' + k.owner + ' ' + k.type + ' ' + (k.note || '')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });

    var hasUndef = D.keyProjects.some(function (k) { return !k.plan; });
    var months = D.meta.months;
    var curIdx = months.findIndex(function (m) { return m.label.replace('.', '-') === currentMonthKey(); });
    var keyOpen = D.keyProjects.filter(function (k) { return k.done !== '已完成' && k.status !== '取消'; }).length;
    var keyRiskN = D.keyProjects.filter(keyRiskInfo).length;

    var h = '<div class="page-head"><div><h2>26—27 年重点项目规划</h2>';
    h += '<p>横轴为月份，纵轴为产品开发类型；每个重点项目按计划完成月份落位，点击色块查看详情。</p></div>';
    h += '<div class="head-meta"><div><span>重点项目</span><b>' + D.keyProjects.length + '</b></div><div><span>未完成</span><b>' + keyOpen + '</b></div><div><span>延期与风险</span><b>' + keyRiskN + '</b></div></div></div>';

    h += '<div class="map-toolbar">';
    h += '<div class="field no-caret"><input id="map-q" type="search" placeholder="搜索项目 / 负责人" value="' + esc(st.q) + '"></div>';
    h += selectField('map-type', '全部类型', allTypes.map(function (t) { return [t, t]; }), st.type);
    h += selectField('map-status', '全部状态', [['active', '正常'], ['risk', '延期风险'], ['delay', '延期'], ['planned', '未开展'], ['paused', '暂停'], ['cancel', '取消']], st.status);
    h += selectField('map-pri', '全部优先级', [['P0', 'P0'], ['P1', 'P1'], ['P2', 'P2']], st.pri);
    h += selectField('map-done', '全部完成情况', [['done', '已完成'], ['open', '未完成']], st.done);
    h += resetBtn('map');
    h += '<span class="count-pill">显示 <b>' + list.length + '</b> / ' + D.keyProjects.length + '</span>';
    h += '<div class="legend" style="margin-left:auto"><span><i class="lg-kdone"></i>已完成</span><span><i class="lg-kactive"></i>进行中</span><span><i class="lg-krisk"></i>延期风险</span><span><i class="lg-kdelay"></i>延期</span><span><i class="lg-kplanned"></i>未开展</span><span><i class="lg-kpaused"></i>暂停 / 取消</span></div>';
    h += '</div>';

    var rows = allTypes.map(function (t) {
      var items = list.filter(function (k) { return k.type === t; });
      return { type: t, items: items };
    }).filter(function (g) { return g.items.length; });

    if (!rows.length) {
      h += '<div class="panel"><div class="empty"><b>没有匹配的重点项目</b>调整筛选条件试试</div></div>';
    } else {
      h += '<div class="map-shell"><div class="map-grid kg-grid' + (hasUndef ? ' with-undef' : '') + '">';
      h += '<div class="map-corner">开发类型 / 月份</div>';
      h += '<div class="map-year" style="grid-column:2 / span 12">2026</div>';
      h += '<div class="map-year y27" style="grid-column:14 / span 4">2027</div>';
      if (hasUndef) h += '<div class="map-undef" style="grid-column:' + (months.length + 2) + ';grid-row:1 / 3">窗口外 / 待定</div>';
      months.forEach(function (m, i) {
        h += '<div class="map-mh ' + ((i + 1) % 3 === 0 ? 'q-end ' : '') + (i === curIdx ? 'now' : '') + '" style="grid-column:' + (i + 2) + ';grid-row:2">' + m.short + (i === curIdx ? '<em>本月</em>' : '') + '</div>';
      });

      rows.forEach(function (g, gi) {
        var r = gi + 3;
        h += '<div class="map-type" style="grid-row:' + r + ';box-shadow:inset 3px 0 0 ' + (TYPE_HEX[g.type] || '#8A8886') + '"><b>' + esc(g.type) + '</b><em>共 ' + g.items.length + ' 项</em></div>';
        var cells = months.map(function () { return []; });
        var undef = [];
        g.items.slice().sort(function (a, b) {
          var ra = a.done === '已完成' ? 2 : (keyRiskInfo(a) ? 0 : 1);
          var rb = b.done === '已完成' ? 2 : (keyRiskInfo(b) ? 0 : 1);
          if (ra !== rb) return ra - rb;
          var pa = a.priority || 'P9', pb = b.priority || 'P9';
          if (pa !== pb) return pa.localeCompare(pb);
          return a.name.localeCompare(b.name, 'zh');
        }).forEach(function (k) {
          var mk = monthKeyOf(k.plan);
          var ci = mk ? months.findIndex(function (m) { return m.label.replace('.', '-') === mk; }) : -1;
          if (ci < 0 && k.done === '已完成' && k.actual) {
            var ak = monthKeyOf(k.actual);
            ci = ak ? months.findIndex(function (m) { return m.label.replace('.', '-') === ak; }) : -1;
          }
          if (ci < 0) undef.push(k); else cells[ci].push(k);
        });
        cells.forEach(function (items, ci) {
          h += '<div class="map-cell ' + ((ci + 1) % 3 === 0 ? 'q-end ' : '') + (ci === curIdx ? 'now' : '') + '" data-maptype="' + esc(g.type) + '" data-month="' + esc(months[ci].label) + '" style="grid-row:' + r + ';grid-column:' + (ci + 2) + '">';
          items.forEach(function (k) {
            h += mapChip(k);
          });
          h += '</div>';
        });
        if (hasUndef) {
          h += '<div class="map-cell" style="grid-row:' + r + ';grid-column:' + (months.length + 2) + '">';
          undef.forEach(function (k) { h += mapChip(k); });
          h += '</div>';
        }
      });
      h += '</div></div>';
    }

    h += '<div class="map-foot"><span>提示：项目按“计划完成时间”所在月份落位；颜色表示项目状态，悬停可查看负责人、优先级与具体日期。计划时间早于 2026.01、晚于 2027.04 或未填写的项目归入“窗口外 / 待定”；已完成项目若计划时间在窗口外，则按实际完成月份落位。</span><span>共 ' + D.keyProjects.length + ' 个重点项目 · 横向滚动查看 2026.01 — 2027.04</span></div>';
    return h;
  }

  function mapChip(k) {
    var st = mapKeyState(k);
    var dateTxt = k.plan ? fmt(k.plan) : '计划待定';
    var title = k.name + ' · ' + (k.type || '') + '\n负责人 ' + (k.owner || '—') +
      ' · 优先级 ' + (k.priority || '—') + '\n计划完成 ' + dateTxt +
      (k.done === '已完成' ? '\n已完成' + (k.actual ? '（实际 ' + fmt(k.actual) + '）' : '') : '');
    return '<button class="map-chip kg-chip ' + st + '" data-act="open-key" data-id="' + esc(k.id) + '" data-maptype="' + esc(k.type) + '" title="' + esc(title) + '">' +
      esc((k.done === '已完成' ? '✓ ' : '') + k.name) + '</button>';
  }

  function moveMapChip(id, type, label) {
    var k = D.keyProjects.filter(function (x) { return x.id === id; })[0];
    if (!k || k.type !== type) return;
    var parts = String(label).split('.');
    var newPlan = iso(lastWd(+parts[0], +parts[1]));
    var oldPlan = k.plan;
    if (oldPlan === newPlan) return;
    k.plan = newPlan;
    APP.mapPlan[k.name] = newPlan;
    var p = D.pool.filter(function (x) { return x.name === k.name; })[0];
    if (p) { p.plan = newPlan; APP.poolPatches[p.id] = cloneObj(p); }
    shiftWbsMonths(k.name, monthDelta(oldPlan, newPlan));
    appSave();
    var shell = document.querySelector('.map-shell');
    var shellLeft = shell ? shell.scrollLeft : 0, shellTop = shell ? shell.scrollTop : 0;
    var pageY = window.scrollY;
    render();
    var shell2 = document.querySelector('.map-shell');
    if (shell2) { shell2.scrollLeft = shellLeft; shell2.scrollTop = shellTop; }
    window.scrollTo(0, pageY);
    toast('已移动到 ' + label + '，WBS 任务排期已同步');
  }

  function parseCsvRows(text) {
    text = String(text || '').replace(/^\uFEFF/, '');
    var rows = [], row = [], cur = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += ch;
      } else {
        if (ch === '"') q = true;
        else if (ch === ',') { row.push(cur); cur = ''; }
        else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
        else if (ch !== '\r') cur += ch;
      }
    }
    row.push(cur);
    if (row.length > 1 || String(row[0]).trim()) rows.push(row);
    return rows.filter(function (r) { return r.some(function (c) { return String(c).trim(); }); });
  }
  function normImportDate(v) {
    var s = String(v || '').trim();
    if (!s) return '';
    var m = s.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
    return m ? m[1] + '-' + pad(m[2]) + '-' + pad(m[3]) : '';
  }
  function loadScript(url) {
    return new Promise(function (resolve, reject) {
      if (document.querySelector('script[src="' + url + '"]')) { resolve(); return; }
      var s = document.createElement('script');
      s.src = url; s.onload = resolve; s.onerror = function () { reject(new Error('加载组件失败')); };
      document.head.appendChild(s);
    });
  }
  function decodeTextBuf(buf) {
    var bytes = new Uint8Array(buf);
    var txt = '';
    if (bytes[0] === 0xFF && bytes[1] === 0xFE) { try { return new TextDecoder('utf-16le').decode(buf); } catch (e) {} }
    if (bytes[0] === 0xFE && bytes[1] === 0xFF) { try { return new TextDecoder('utf-16be').decode(buf); } catch (e) {} }
    try { txt = new TextDecoder('utf-8').decode(buf); } catch (e) {}
    if (!txt || txt.indexOf('\uFFFD') >= 0) { try { txt = new TextDecoder('gbk').decode(buf); } catch (e) {} }
    return txt;
  }
  function rowsFromText(text) {
    return String(text || '').split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean).map(function (l) {
      if (l.indexOf(',') >= 0) return parseCsvRows(l)[0] || [];
      if (l.indexOf('\t') >= 0) return l.split(/\t+/);
      if (/\s{2,}/.test(l)) return l.split(/\s{2,}/);
      return l.split(/\s+/);
    });
  }
  function handleImportFile(f) {
    var ext = (f.name.split('.').pop() || '').toLowerCase();
    var finish = function (rows) {
      rows = (rows || []).filter(function (r) { return r.some(function (c) { return String(c).trim(); }); });
      if (!rows.length) { toast('未识别到可导入的数据，请确认文件内容'); return; }
      openImportPreview(rows);
    };
    if (ext === 'csv' || ext === 'txt') {
      var r = new FileReader();
      r.onload = function () { finish(parseCsvRows(decodeTextBuf(r.result))); };
      r.readAsArrayBuffer(f);
    } else if (ext === 'xlsx' || ext === 'xls' || ext === 'xlsm') {
      toast('正在解析 Excel…');
      var parseExcel = function () {
        var r = new FileReader();
        r.onload = function () {
          try {
            var wb = XLSX.read(new Uint8Array(r.result), { type: 'array' });
            var ws = wb.Sheets[wb.SheetNames[0]];
            finish(XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }));
          } catch (err) { toast('Excel 解析失败：' + err.message); }
        };
        r.readAsArrayBuffer(f);
      };
      if (window.XLSX) parseExcel();
      else loadScript('assets/xlsx.full.min.js').then(parseExcel).catch(function () { loadScript('https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js').then(parseExcel).catch(function () { toast('Excel 解析组件加载失败'); }); });
    } else if (ext === 'pdf') {
      toast('正在解析 PDF…');
      loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js').then(function () {
        if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        var r = new FileReader();
        r.onload = function () {
          pdfjsLib.getDocument({ data: new Uint8Array(r.result) }).promise.then(function (pdf) {
            var texts = [];
            var next = function (p) {
              if (p > pdf.numPages) { finish(rowsFromText(texts.join('\n'))); return; }
              pdf.getPage(p).then(function (page) {
                page.getTextContent().then(function (tc) {
                  var cur = '';
                  tc.items.forEach(function (it) { cur += it.str; cur += it.hasEOL ? '\n' : ' '; });
                  texts.push(cur);
                  next(p + 1);
                });
              });
            };
            next(1);
          }).catch(function () { toast('PDF 解析失败'); });
        };
        r.readAsArrayBuffer(f);
      }).catch(function () { toast('PDF 解析组件加载失败，请联网'); });
    } else if (['png', 'jpg', 'jpeg', 'bmp', 'webp'].indexOf(ext) >= 0) {
      toast('正在识别图片文字…');
      loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js').then(function () {
        Tesseract.recognize(f, 'chi_sim+eng').then(function (res) {
          finish(rowsFromText(res && res.data ? res.data.text : ''));
        }).catch(function () { toast('图片识别失败'); });
      }).catch(function () { toast('图片识别组件加载失败，请联网'); });
    } else {
      toast('不支持的文件类型，请使用 Excel / CSV / PDF / 图片');
    }
  }
  function openImportPicker() {
    var inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.csv,.txt,.xls,.xlsx,.xlsm,.pdf,.png,.jpg,.jpeg,.bmp,.webp';
    inp.style.display = 'none'; inp.id = 'importFileInput';
    document.body.appendChild(inp);
    inp.addEventListener('change', function () {
      var f = inp.files && inp.files[0];
      if (f) handleImportFile(f);
      setTimeout(function () { if (inp.parentNode) inp.parentNode.removeChild(inp); }, 2000);
    });
    inp.click();
  }
  function openImportPreview(rows) {
    var headerRow = -1;
    for (var hi = 0; hi < Math.min(rows.length, 8); hi++) {
      var joined = rows[hi].map(function (c) { return String(c || '').replace(/\s+/g, ''); });
      if (joined.some(function (c) { return c.indexOf('项目名称') >= 0 || /^(项目名|产品名称|项目|名称)$/.test(c); })) { headerRow = hi; break; }
    }
    var headers = headerRow >= 0 ? rows[headerRow].map(function (h) { return String(h).replace(/\s+/g, ''); }) : [];
    function findIdx(test) { for (var i = 0; i < headers.length; i++) { if (test(headers[i])) return i; } return -1; }
    var idx = {
      name: findIdx(function (h) { return h.indexOf('项目名称') >= 0 || /^(项目名|产品名称|项目|名称)$/.test(h); }),
      type: findIdx(function (h) { return h.indexOf('产品开发类型') >= 0 || h === '类型'; }),
      status: findIdx(function (h) { return h.indexOf('项目状态') >= 0 || h === '状态'; }),
      owner: findIdx(function (h) { return h.indexOf('项目成员') >= 0 || h.indexOf('负责人') >= 0; }),
      plan: findIdx(function (h) { return h.indexOf('计划完成') >= 0; }),
      priority: findIdx(function (h) { return h.indexOf('优先级') >= 0; }),
      months: findIdx(function (h) { return h.indexOf('周期') >= 0; }),
      anchorDate: findIdx(function (h) { return h.indexOf('锚点完成日期') >= 0 || h.indexOf('锚定完成日期') >= 0; }),
      anchor: findIdx(function (h) { return h.indexOf('锚点任务') >= 0 || h.indexOf('锚定任务') >= 0; }),
      isKey: findIdx(function (h) { return h.indexOf('年度重点项目') >= 0; }),
      genWbs: findIdx(function (h) { return h.indexOf('WBS任务清单') >= 0; }),
      note: findIdx(function (h) { return h.indexOf('备注') >= 0; })
    };
    var dataRows = headerRow >= 0 ? rows.slice(headerRow + 1) : rows.slice();
    if (idx.name < 0) {
      var colN = dataRows.reduce(function (m, r) { return Math.max(m, r.length); }, 0);
      var best = 0, bestScore = -1;
      for (var c = 0; c < colN; c++) {
        var score = 0;
        dataRows.forEach(function (r) {
          var v = String(r[c] == null ? '' : r[c]).trim();
          if (!v || /^\d+(\.\d+)?$/.test(v)) return;
          score += Math.min(v.length, 30);
          if (/[\u4e00-\u9fa5A-Za-z]/.test(v)) score += 3;
        });
        if (score > bestScore) { bestScore = score; best = c; }
      }
      idx.name = best;
      if (headerRow < 0 && best === 0) {
        idx.type = 1; idx.status = 2; idx.owner = 3; idx.plan = 4; idx.priority = 5;
        idx.months = 6; idx.anchorDate = 8; idx.anchor = 7; idx.isKey = 9; idx.genWbs = 10; idx.note = 11;
      }
    }
    var items = dataRows.map(function (r) {
      var get = function (k) { var ix = idx[k]; return ix >= 0 ? String(r[ix] == null ? '' : r[ix]).trim() : ''; };
      var type = get('type') || '新产品开发';
      if (PROJECT_TYPES.indexOf(type) < 0) type = '新产品开发';
      var plan = normImportDate(get('plan'));
      var monthsRaw = get('months').match(/[346]/);
      var months = monthsRaw ? monthsRaw[0] : '';
      var anchorRaw = get('anchor').match(/([1-5])\.(\d)/);
      var anchor = anchorRaw ? anchorRaw[1] + '.' + anchorRaw[2] : '';
      var anchorDate = normImportDate(get('anchorDate'));
      if (plan && !anchorDate) anchorDate = plan;
      if (plan && !anchor) anchor = (isShortType(type) && months === '3') ? '4.2' : '5.4';
      var truthy = function (v) { return /^(是|y|yes|true|1|√|✓)$/i.test(String(v || '').trim()); };
      return {
        name: get('name'), type: type, status: get('status') || '未开展', owner: get('owner'),
        plan: plan, priority: get('priority'), months: months, anchor: anchor, anchorDate: anchorDate,
        isKey: truthy(get('isKey')), genWbs: truthy(get('genWbs')), note: get('note')
      };
    }).filter(function (x) { return x.name && x.name.indexOf('项目名称') < 0 && /[\u4e00-\u9fa5A-Za-z]/.test(x.name); });
    if (!items.length) { toast('未识别到项目名称列或数据为空'); return; }

    function sel(field, val, opts) {
      return '<select class="imp-inp" data-field="' + field + '">' + opts.map(function (o) {
        return '<option value="' + esc(o) + '"' + (val === o ? ' selected' : '') + '>' + esc(o) + '</option>';
      }).join('') + '</select>';
    }
    var typeOpts = PROJECT_TYPES;
    var statusOpts = ['正常', '未开展', '暂停', '取消'];
    var monthOpts = ['', '3', '4', '6'];
    var anchorOpts = ['', '1.4', '2.6', '3.2', '4.2', '5.4'];
    var priOpts = ['', 'P0', 'P1', 'P2'];
    var boolOpts = ['否', '是'];
    var h = '<div class="imp-bar"><span>共识别 <b>' + items.length + '</b> 个项目，请确认各维度后点击保存导入。</span><button type="button" class="btn" data-imp-template>下载 CSV 模板</button></div>';
    h += '<div class="imp-wrap"><table class="tbl imp-tbl"><thead><tr><th>导入</th><th>项目名称</th><th>产品开发类型</th><th>项目状态</th><th>项目成员</th><th>计划完成时间</th><th>优先级</th><th>WBS周期</th><th>锚点任务</th><th>锚点完成日期</th><th>年度重点项目</th><th>WBS任务清单</th><th>备注</th></tr></thead><tbody>';
    items.forEach(function (it) {
      h += '<tr>';
      h += '<td><input type="checkbox" class="imp-sel" checked></td>';
      h += '<td><input class="imp-inp imp-name" data-field="name" value="' + esc(it.name) + '"></td>';
      h += '<td>' + sel('type', it.type, typeOpts) + '</td>';
      h += '<td>' + sel('status', it.status, statusOpts) + '</td>';
      h += '<td><input class="imp-inp" data-field="owner" value="' + esc(it.owner) + '"></td>';
      h += '<td><input class="imp-inp" type="date" data-field="plan" value="' + esc(it.plan) + '"></td>';
      h += '<td>' + sel('priority', it.priority, priOpts) + '</td>';
      h += '<td>' + sel('months', it.months, monthOpts) + '</td>';
      h += '<td>' + sel('anchor', it.anchor, anchorOpts) + '</td>';
      h += '<td><input class="imp-inp" type="date" data-field="anchorDate" value="' + esc(it.anchorDate) + '"></td>';
      h += '<td>' + sel('isKey', it.isKey ? '是' : '否', boolOpts) + '</td>';
      h += '<td>' + sel('genWbs', it.genWbs ? '是' : '否', boolOpts) + '</td>';
      h += '<td><input class="imp-inp" data-field="note" value="' + esc(it.note) + '"></td>';
      h += '</tr>';
    });
    h += '</tbody></table></div>';
    h += '<div class="form-actions" style="margin-top:12px"><button type="button" class="btn" data-modal-close>取消</button><button type="button" class="btn primary" data-imp-save>保存导入</button></div>';
    openModal('批量导入项目', h);
    var modal = document.querySelector('.modal'); if (modal) modal.classList.add('wide');
    $$('#modalBody [data-imp-template]').forEach(function (b) { b.addEventListener('click', downloadImportTemplate); });
    $$('#modalBody [data-imp-save]').forEach(function (b) { b.addEventListener('click', saveImportedProjects); });
    var all = $('#modalBody .imp-sel-all');
  }
  function downloadImportTemplate() {
    var csv = '\uFEFF项目名称,产品开发类型,项目状态,项目成员,计划完成时间,优先级,WBS项目周期,WBS锚点任务,锚点完成日期,年度重点项目,WBS任务清单生成,备注\n示例项目,新产品开发,未开展,张三,2027-03-31,P1,6,5.4,2027-03-31,是,是,示例导入\n';
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = '批量导入项目模板.csv'; a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  function saveImportedProjects() {
    var trs = $$('#modalBody .imp-tbl tbody tr');
    var added = 0, skipped = 0, addedNames = {};
    trs.forEach(function (tr) {
      var chk = tr.querySelector('.imp-sel');
      if (chk && !chk.checked) return;
      var fv = function (f) { var el = tr.querySelector('[data-field="' + f + '"]'); return el ? (el.type === 'checkbox' ? el.checked : el.value.trim()) : ''; };
      var data = {
        name: fv('name'), type: fv('type'), status: fv('status'), owner: fv('owner'), plan: fv('plan'),
        priority: fv('priority'), months: fv('months'), anchor: fv('anchor'), anchorDate: fv('anchorDate'),
        isKey: fv('isKey') === '是', genWbs: fv('genWbs') === '是', note: fv('note')
      };
      if (!data.name || D.pool.some(function (p) { return p.name === data.name; }) || addedNames[data.name]) { skipped++; return; }
      if (PROJECT_TYPES.indexOf(data.type) < 0) data.type = '新产品开发';
      if (['正常', '未开展', '暂停', '取消'].indexOf(data.status) < 0) data.status = '未开展';
      if (isShortType(data.type) && (data.months === '6' || !data.months)) data.months = '3';
      if (!isShortType(data.type) && data.months === '3') data.months = '4';
      if (!data.plan && data.anchorDate && data.months) data.plan = planFromAnchor(+data.months, data.anchor, data.anchorDate) || '';
      if (data.plan && !data.anchorDate) data.anchorDate = data.plan;
      if (data.plan && !data.anchor) data.anchor = (isShortType(data.type) && data.months === '3') ? '4.2' : '5.4';
      var canGen = !!(data.plan && data.months && data.anchor && data.anchorDate);
      var gen = (data.genWbs || data.isKey) && canGen;
      var p = { id: uid('p'), type: data.type, status: data.status, done: '未完成', name: data.name, must: '□', owner: data.owner, founded: TODAY, started: TODAY, plan: data.plan || null, actual: null, priority: data.priority, phase: '', note: data.note, isKey: !!data.isKey };
      D.pool.push(p);
      APP.poolAdded.push(cloneObj(p));
      if (data.isKey) ensureKey(p);
      if (gen) upsertWbs(data.name, +data.months, data.plan);
      addedNames[data.name] = true; added++;
    });
    appSave();
    closeModal();
    render();
    toast('已导入 ' + added + ' 个项目' + (skipped ? '，跳过 ' + skipped + ' 个' : ''));
  }

  /* ---------------- 页面：工作池 ---------------- */
  function viewPool() {
    var st = state.pool;
    var types = uniq(D.pool.map(function (p) { return p.type; }));
    var list = D.pool.map(function (p) {
      var s = poolState(p);
      var d = leftDays(p);
      return { p: p, s: s, st: displayStatus(p).key, d: d };
    }).filter(function (x) {
      var p = x.p;
      if (st.q) {
        var hay = (p.name + ' ' + p.owner + ' ' + p.type + ' ' + p.note + ' ' + p.phase).toLowerCase();
        if (hay.indexOf(st.q.toLowerCase()) < 0) return false;
      }
      if (st.type && p.type !== st.type) return false;
      if (st.status && x.st !== st.status) return false;
      if (st.done === 'done' && p.done !== '已完成') return false;
      if (st.done === 'open' && p.done === '已完成') return false;
      if (st.priority && p.priority !== st.priority) return false;
      var keyProj = p.isKey || D.keyProjects.some(function (k) { return k.name === p.name; });
      if (st.key === 'key' && !keyProj) return false;
      if (st.key === 'normal' && keyProj) return false;
      return true;
    });
    if (st.sort === 'risk') {
      var rank = function (s) {
        if (s === 'delay') return 0;
        if (s === 'active') return 1;
        if (s === 'done') return 3;
        return 4;
      };
      list.sort(function (a, b) {
        var ra = rank(a.s), rb = rank(b.s);
        if (ra !== rb) return ra - rb;
        return (a.d == null ? 9999 : a.d) - (b.d == null ? 9999 : b.d);
      });
    } else if (st.sort === 'plan') {
      list.sort(function (a, b) { return String(a.p.plan || '9999').localeCompare(String(b.p.plan || '9999')); });
    } else if (st.sort === 'name') {
      list.sort(function (a, b) { return a.p.name.localeCompare(b.p.name, 'zh'); });
    }

    var stat = { done: 0, delay: 0, active: 0, paused: 0, planned: 0, cancel: 0 };
    D.pool.forEach(function (p) { stat[poolState(p)] = (stat[poolState(p)] || 0) + 1; });

    var h = '<div class="page-head"><div><h2>26—27 年全部项目规划</h2><p>覆盖新产品开发、性能优化、原料替代、行业应用、配件与呆滞料处理。</p></div><div class="head-meta"><div><span>项目总数</span><b>' + D.pool.length + '</b></div><div><span>已完成</span><b>' + stat.done + '</b></div><div><span>延期</span><b>' + stat.delay + '</b></div></div></div>';

    h += '<div class="toolbar">';
    h += '<div class="field no-caret"><input id="pool-q" type="search" placeholder="搜索产品 / 负责人 / 备注" value="' + esc(st.q) + '"></div>';
    h += selectField('pool-type', '全部类型', types.map(function (t) { return [t, t]; }), st.type);
    h += selectField('pool-status', '全部状态', [['active', '正常'], ['risk', '延期风险'], ['delay', '延期'], ['planned', '未开展'], ['paused', '暂停'], ['cancel', '取消']], st.status);
    h += selectField('pool-done', '全部完成情况', [['done', '已完成'], ['open', '未完成']], st.done);
    h += selectField('pool-pri', '全部优先级', [['P0', 'P0'], ['P1', 'P1'], ['P2', 'P2']], st.priority);
    h += selectField('pool-key', '全部项目', [['key', '重点项目'], ['normal', '非重点项目']], st.key);
    h += resetBtn('pool');
    h += '<button class="btn primary" data-act="add-pool">＋ 新增项目</button>';
    h += '<button class="btn" data-act="open-recycle">回收站' + (APP.recycle.length ? ' (' + APP.recycle.length + ')' : '') + '</button>';
    h += '<div class="spacer"></div><span class="count-pill">筛选 <b>' + list.length + '</b> / ' + D.pool.length + '</span>';
    h += '<div class="seg" style="margin-left:6px"><button class="' + (st.sort === 'risk' ? 'on' : '') + '" data-poolsort="risk">风险优先</button><button class="' + (st.sort === 'plan' ? 'on' : '') + '" data-poolsort="plan">计划时间</button><button class="' + (st.sort === 'name' ? 'on' : '') + '" data-poolsort="name">名称</button></div>';
    h += '</div>';

    h += '<div class="panel"><div class="panel-body flush"><div class="table-scroll"><table class="tbl"><thead><tr>';
    h += '<th>产品 / 项目</th><th>类型</th><th>负责人</th><th>优先级</th><th>阶段</th><th>项目启动</th><th>计划完成</th><th>剩余 / 周期</th><th>状态</th><th>完成情况</th><th>备注</th><th>操作</th>';
    h += '</tr></thead><tbody>';
    list.forEach(function (x) {
      var p = x.p;
      h += '<tr data-act="open-pool" data-id="' + p.id + '" class="' + (x.s === 'cancel' ? 'dim' : '') + '">';
      var isKeyProj = p.isKey || D.keyProjects.some(function (k) { return k.name === p.name; });
      h += '<td class="name">' + (isKeyProj ? '<span class="key-star">⭐</span>' : '') + esc(p.name) + (p.must === '✅' ? '<small>必做项</small>' : '') + '</td>';
      h += '<td class="nowrap">' + typeTag(p.type) + '</td>';
      h += '<td class="nowrap">' + personTag(p.owner) + '</td>';
      h += '<td>' + (p.priority ? tag(p.priority, p.priority === 'P0' ? 'rust' : p.priority === 'P1' ? 'amber' : 'gray') : '<span class="faint">—</span>') + '</td>';
      h += '<td class="nowrap muted">' + esc(p.phase || '—') + '</td>';
      var pStart = projectWbsInfo(p.name).firstStart || p.started;
      h += '<td class="num">' + fmt(pStart) + '</td>';
      h += '<td class="num">' + planRange(p) + '</td>';
      h += '<td>' + leftHTML(p) + '</td>';
      h += '<td>' + displayStatusChip(p) + '</td>';
      h += '<td class="nowrap">' + doneTag(p.done) + '</td>';
      h += '<td class="ellip" title="' + esc(p.note) + '">' + esc(p.note || '—') + '</td>';
      h += '<td><div class="row-actions"><button data-act="edit-pool" data-id="' + p.id + '">编辑</button><button data-act="del-pool" data-id="' + p.id + '">删除</button></div></td>';
      h += '</tr>';
    });
    if (!list.length) h += '<tr><td colspan="12"><div class="empty"><b>没有匹配的项目</b>调整筛选条件试试</div></td></tr>';
    h += '</tbody></table></div></div></div>';
    return h;
  }

  function selectField(id, allLabel, options, value) {
    var h = '<div class="field"><select id="' + id + '"><option value="">' + esc(allLabel) + '</option>';
    options.forEach(function (o) {
      h += '<option value="' + esc(o[0]) + '"' + (value === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
    });
    h += '</select></div>';
    return h;
  }

  /* ---------------- 页面：重点项目 ---------------- */
  function viewKey() {
    var st = state.key;
    var types = uniq(D.keyProjects.map(function (k) { return k.type; }));
    var keyMonths = uniq(D.keyProjects.map(function (k) { return monthKeyOf(k.plan); }).filter(Boolean).concat([currentMonthKey()])).sort();
    var list = D.keyProjects.filter(function (k) {
      if (st.type && k.type !== st.type) return false;
      if (st.pri && k.priority !== st.pri) return false;
      if (st.q && (k.name + ' ' + k.owner + ' ' + k.type + ' ' + (k.note || '')).toLowerCase().indexOf(st.q.toLowerCase()) < 0) return false;
      if (st.done === 'done' && k.done !== '已完成') return false;
      if (st.done === 'open' && k.done === '已完成') return false;
      if (st.month) {
        if (monthKeyOf(k.plan) !== st.month) return false;
      }
      if (st.only && displayStatus(k).key !== st.only) return false;
      return true;
    });
    if (st.sort === 'plan') {
      list.sort(function (a, b) { return String(a.plan || '9999').localeCompare(String(b.plan || '9999')); });
    } else if (st.sort === 'name') {
      list.sort(function (a, b) { return a.name.localeCompare(b.name, 'zh'); });
    } else {
      var riskRank = function (k) {
        if (k.done === '已完成') return k.status === '延期' ? 3 : 4;
        var dk = displayStatus(k).key;
        if (dk === 'delay') return 0;
        if (dk === 'risk') return 1;
        if (dk === 'cancel') return 6;
        return 2;
      };
      list.sort(function (a, b) {
        var ra = riskRank(a), rb = riskRank(b);
        if (ra !== rb) return ra - rb;
        var pa = String(a.plan || '9999-99-99'), pb = String(b.plan || '9999-99-99');
        if (pa !== pb) return pa.localeCompare(pb);
        if ((a.priority || 'P9') !== (b.priority || 'P9')) return (a.priority || 'P9').localeCompare(b.priority || 'P9');
        return a.name.localeCompare(b.name, 'zh');
      });
    }
    var keyOpenN = D.keyProjects.filter(function (k) { return k.done !== '已完成' && k.status !== '取消'; }).length;
    var riskN = D.keyProjects.filter(function (k) { return displayStatus(k).key === 'risk'; }).length;
    var delayN = D.keyProjects.filter(function (k) { return displayStatus(k).key === 'delay'; }).length;

    var h = '<div class="page-head"><div><h2>确认开展的重点监控项目</h2><p>与 WBS 拆解联动，显示任务完成率、下一任务与关键节点。</p></div><div class="head-meta"><div><span>重点项目</span><b>' + D.keyProjects.length + '</b></div><div><span>未完成</span><b>' + keyOpenN + '</b></div><div><span>延期风险</span><b>' + riskN + '</b></div><div><span>延期</span><b>' + delayN + '</b></div></div></div>';

    h += '<div class="toolbar">';
    h += '<div class="field no-caret"><input id="key-q" type="search" placeholder="搜索项目 / 负责人" value="' + esc(st.q) + '"></div>';
    h += selectField('key-type', '全部类型', types.map(function (t) { return [t, t]; }), st.type);
    h += selectField('key-status', '全部状态', [['active', '正常'], ['risk', '延期风险'], ['delay', '延期'], ['planned', '未开展'], ['paused', '暂停'], ['cancel', '取消']], st.only);
    h += selectField('key-pri', '全部优先级', [['P0', 'P0'], ['P1', 'P1'], ['P2', 'P2']], st.pri);
    h += selectField('key-done', '全部完成情况', [['done', '已完成'], ['open', '未完成']], st.done);
    h += selectField('key-month', '全部月份', keyMonths.map(function (m) { return [m, m.replace('-', '.')]; }), st.month);
    h += resetBtn('key');
    h += '<div class="spacer"></div><span class="count-pill">筛选 <b>' + list.length + '</b> / ' + D.keyProjects.length + '</span>';
    h += '<div class="seg" style="margin-left:6px"><button class="' + (st.sort === 'risk' ? 'on' : '') + '" data-keysort="risk">风险优先</button><button class="' + (st.sort === 'plan' ? 'on' : '') + '" data-keysort="plan">计划时间</button><button class="' + (st.sort === 'name' ? 'on' : '') + '" data-keysort="name">名称</button></div>';
    h += '</div>';

    h += '<div class="key-grid">';
    list.forEach(function (k) {
      var s = poolState({ status: k.status, done: k.done, plan: k.plan });
      var w = wbsFor(k.name);
      var ws = w ? wbsStats(w) : null;
      var d = leftDays(k);
      h += '<div class="key-card ' + s + '" data-act="open-key" data-id="' + k.id + '">';
      h += '<div class="kc-main">';
      var planStr = k.plan ? String(k.plan) : '';
      var mBig = planStr ? (+planStr.slice(5, 7)) + '月' : '待定';
      var mSmall = planStr ? planStr.slice(0, 4) + '年' : '计划完成';
      h += '<div class="kc-name-row">';
      h += '<div class="kc-month"><b>' + mBig + '</b><span>' + mSmall + '</span></div>';
      h += '<div class="kc-title-wrap">';
      h += '<h4 class="kc-name">' + esc(k.name) + (k.priority ? tag(k.priority, k.priority === 'P0' ? 'rust' : k.priority === 'P1' ? 'amber' : 'gray') : '') + typeTag(k.type) + personTag(k.owner) + '</h4>';
      var kSub = ws ? 'WBS ' + ws.pct + '% · ' + ws.done + '/' + ws.total + ' 任务' : '未建立 WBS';
      h += '<div class="kc-sub"><span class="kc-sub-base">' + kSub + '</span></div>';
      h += '</div></div>';
      h += '<div class="kc-prog"><div class="bar thin"><i class="' + (ws && ws.late ? 'delay' : ws && ws.tasks.filter(taskRisk).length ? 'risk' : '') + '" style="width:' + (ws ? ws.pct : 0) + '%"></i></div><b>' + (ws ? ws.pct + '%' : '—') + '</b></div>';
      if (ws && ws.next) h += '<div class="kc-note"><span class="mr-next">下一任务：' + esc(ws.next.name) + ' · 计划完成 ' + fmt(ws.next.end || ws.next.start) + '</span></div>';
      h += '</div>';
      h += '<div class="kc-right">';
      h += '<div class="ov-statusline">' + displayStatusChip(k) + doneTag(k.done) + '</div>';
      h += '<span class="plan-chip">计划完成 ' + fmt(k.plan) + '</span>';
      h += '<span class="plan-chip">实际完成 ' + fmt(k.actual) + '</span>';
      h += '<span class="mr-days ' + (keyRiskInfo(k) ? 'hot' : '') + '">' + (k.done === '已完成' ? leftHTML(k) : d == null ? '未设定计划' : d < 0 ? '延期 ' + Math.abs(d) + ' 天' : '剩 ' + d + ' 天') + '</span>';
      h += '<span class="row-actions"><button data-act="edit-key" data-id="' + k.id + '">编辑</button><button data-act="del-key" data-id="' + k.id + '">删除</button></span>';
      h += '</div></div>';
    });
    if (!list.length) h += '<div class="panel"><div class="empty"><b>没有匹配的重点项目</b>调整筛选条件试试</div></div>';
    h += '</div>';
    return h;
  }

  /* ---------------- 页面：外协 ---------------- */
  var OUT_STAGES = ['寻源中', '一轮测试', '二轮测试', '完成引进', '不引进'];
  function viewOutsource() {
    var st = state.out;
    var types = uniq(D.outsourcing.map(function (o) { return o.ptype; }));
    var list = D.outsourcing.filter(function (o) {
      if (st.type && o.ptype !== st.type) return false;
      if (st.q && (o.name + ' ' + o.supplier + ' ' + o.sample1 + ' ' + o.result1 + ' ' + o.result2).toLowerCase().indexOf(st.q.toLowerCase()) < 0) return false;
      return true;
    });
    var h = '<div class="page-head"><div><h2>外协产品引进进度</h2><p>从寻源、送样测试到确认引进的全流程跟踪；每条记录对应一个样品批次。</p></div><div class="head-meta"><div><span>跟单记录</span><b>' + D.outsourcing.length + '</b></div><div><span>已引进</span><b>' + D.outsourcing.filter(function (o) { return o.adopted; }).length + '</b></div><div><span>在测</span><b>' + D.outsourcing.filter(function (o) { return o.progress === '一轮测试' || o.progress === '二轮测试'; }).length + '</b></div></div></div>';

    h += '<div class="toolbar"><div class="field no-caret"><input id="out-q" type="search" placeholder="搜索产品 / 供应商 / 测试结果" value="' + esc(st.q) + '"></div>';
    h += selectField('out-type', '全部品类', types.map(function (t) { return [t, t]; }), st.type);
    h += '<div class="spacer"></div><span class="count-pill">显示 <b>' + list.length + '</b> / ' + D.outsourcing.length + '</span></div>';

    h += '<div class="kanban">';
    OUT_STAGES.forEach(function (stage) {
      var cards = list.filter(function (o) { return o.progress === stage; });
      h += '<div class="kcol"><div class="kcol-head"><b>' + stage + '</b><em>' + cards.length + '</em></div>';
      cards.forEach(function (o) {
        var idx = OUT_STAGES.indexOf(o.progress);
        h += '<div class="kcard" data-act="open-out" data-id="' + o.id + '">';
        h += '<h5>' + esc(o.name) + '</h5>';
        h += '<div class="k-sub">' + esc(o.supplier) + ' · ' + esc(o.ptype) + '</div>';
        if (o.sample1) h += '<div class="k-res">' + esc(o.sample1) + (o.result1 ? '<br>' + esc(o.result1) : '') + '</div>';
        h += '<div class="k-foot"><span>S1 · ' + fmt(o.sample1Date) + '</span><span>' + (o.planAdopt ? '目标 ' + fmt(o.planAdopt) : '&nbsp;') + '</span></div>';
        h += '<div class="steps">';
        for (var i = 0; i < 5; i++) {
          h += '<i class="' + (i < idx ? 'on' : i === idx ? 'now' : '') + '"></i>';
        }
        h += '</div></div>';
      });
      if (!cards.length) h += '<div class="empty" style="padding:18px 8px;font-size:10.5px">暂无记录</div>';
      h += '</div>';
    });
    h += '</div>';
    h += '<div style="margin-top:12px;font-size:10.5px;color:var(--faint)">阶段说明：寻源中 → 一轮测试 → 二轮测试 → 完成引进 / 不引进。点击卡片查看两次样品的时间与测试结论。</div>';
    return h;
  }

  /* ---------------- 页面：配色 ---------------- */
  function viewColor() {
    var st = state.color;
    var spus = uniq(D.colors.map(function (c) { return c.spu; }));
    var depts = uniq(D.colors.map(function (c) { return c.dept; }));
    var list = D.colors.filter(function (c) {
      var s = poolState({ status: c.status, done: c.done, plan: c.due });
      if (st.spu && c.spu !== st.spu) return false;
      if (st.status && s !== st.status) return false;
      if (st.dept && c.dept !== st.dept) return false;
      if (st.q && (c.spu + ' ' + c.color + ' ' + c.ctype + ' ' + c.ref + ' ' + c.note).toLowerCase().indexOf(st.q.toLowerCase()) < 0) return false;
      return true;
    });
    list.sort(function (a, b) {
      var sa = a.done === '已完成' ? 2 : 1, sb = b.done === '已完成' ? 2 : 1;
      if (sa !== sb) return sa - sb;
      return String(a.due || '9999').localeCompare(String(b.due || '9999'));
    });
    var done = D.colors.filter(function (c) { return c.done === '已完成'; }).length;
    var doing = D.colors.filter(function (c) { return c.done !== '已完成' && c.status === '正常'; }).length;
    var paused = D.colors.filter(function (c) { return c.status === '暂停'; }).length;

    var h = '<div class="page-head"><div><h2>产品配色需求与交付</h2><p>按需求部门与 SPU 跟踪配色进度，色卡色块仅按色名近似显示，最终以实物为准。</p></div><div class="head-meta"><div><span>需求总数</span><b>' + D.colors.length + '</b></div><div><span>已完成</span><b>' + done + '</b></div><div><span>平均周期</span><b>' + avgColorCycle() + ' 天</b></div></div></div>';

    h += '<div class="kpis" style="grid-template-columns:repeat(4,minmax(0,1fr))">';
    h += kpi('配色需求', D.colors.length, '条', 'info', '01', '覆盖 ' + spus.length + ' 个 SPU');
    h += kpi('已完成', done, '条', 'ok', '02', '完成率 ' + pct(done, D.colors.length) + '%');
    h += kpi('进行中', doing, '条', 'warm', '03', '正常推进中的需求');
    h += kpi('暂停', paused, '条', 'mute', '04', '等待原料或配方切换');
    h += '</div>';

    h += '<div class="toolbar"><div class="field no-caret"><input id="color-q" type="search" placeholder="搜索 SPU / 颜色 / 参考" value="' + esc(st.q) + '"></div>';
    h += selectField('color-spu', '全部 SPU', spus.map(function (s) { return [s, s]; }), st.spu);
    h += selectField('color-status', '全部状态', [['active', '进行中'], ['done', '已完成'], ['delay', '延期'], ['paused', '暂停']], st.status);
    h += selectField('color-dept', '全部需求部门', depts.map(function (s) { return [s, s]; }), st.dept);
    h += '<div class="spacer"></div><span class="count-pill">显示 <b>' + list.length + '</b> / ' + D.colors.length + '</span></div>';

    h += '<div class="panel"><div class="panel-body flush"><div class="table-scroll"><table class="tbl"><thead><tr>';
    h += '<th>SPU</th><th>颜色</th><th>项目类型</th><th>需求部门</th><th>期望交付</th><th>试色方式</th><th>完成时间</th><th>周期 / 剩余</th><th>状态</th><th>备注</th>';
    h += '</tr></thead><tbody>';
    list.forEach(function (c) {
      var s = poolState({ status: c.status, done: c.done, plan: c.due });
      var cyc = (c.request && c.finish) ? diffDays(c.request, c.finish) : null;
      var left = c.due ? diffDays(TODAY, c.due) : null;
      h += '<tr data-act="open-color" data-id="' + c.id + '">';
      h += '<td class="name">' + esc(c.spu) + '</td>';
      h += '<td><span class="swatch" style="' + colorStyle(c.color) + '"></span> <b style="font-weight:600">' + esc(c.color) + '</b>' + (c.ref ? '<small style="display:block;color:var(--faint);font-size:9.5px;margin-left:20px">' + esc(c.ref) + '</small>' : '') + '</td>';
      h += '<td class="muted nowrap">' + esc(c.ctype) + '</td>';
      h += '<td class="nowrap">' + esc(c.dept) + '</td>';
      h += '<td class="num">' + fmt(c.due) + '</td>';
      h += '<td class="muted nowrap">' + esc(c.trial || '—') + '</td>';
      h += '<td class="num">' + fmt(c.finish) + '</td>';
      h += '<td class="num ' + (c.done === '已完成' ? 'days-done' : (left != null && left < 0 ? 'days-hot' : '')) + '">' + (c.done === '已完成' ? (cyc != null ? cyc + ' 天' : '—') : left == null ? '—' : left < 0 ? '延期 ' + Math.abs(left) + ' 天' : '剩 ' + left + ' 天') + '</td>';
      h += '<td>' + stateChip({ status: c.status, done: c.done, plan: c.due }) + '</td>';
      h += '<td class="ellip" title="' + esc(c.note) + '">' + esc(c.note || '—') + '</td>';
      h += '</tr>';
    });
    if (!list.length) h += '<tr><td colspan="10"><div class="empty"><b>没有匹配的配色需求</b>调整筛选条件试试</div></td></tr>';
    h += '</tbody></table></div></div></div>';
    return h;
  }

  var COLOR_KEYS = [
    ['深灰', '#4B4B48'], ['浅灰', '#B9B9B1'], ['灰', '#8A8A82'], ['冷白', '#EEF0EA'], ['白', '#F2EFE4'],
    ['鎏金', '#C9A227'], ['金', '#C7A24B'], ['银', '#C2C6C4'], ['朱砂', '#B6402F'], ['消防红', '#C0392B'],
    ['红', '#BC3A2C'], ['桃粉', '#E9A6B4'], ['粉', '#E7A2B2'], ['黄', '#E0B32B'], ['杏', '#E7B98C'],
    ['橙', '#D97C2C'], ['天青', '#7FBFC4'], ['青', '#4A9E9B'], ['薄荷', '#8FD0B4'], ['绿', '#4C8A5F'],
    ['薰衣草', '#A997C9'], ['紫', '#7C5AA5'], ['咖啡', '#5C4232'], ['咖', '#5C4232'], ['棕', '#6E4B36'],
    ['米', '#E4D6B4'], ['灰棕', '#7A6653'], ['黑', '#1E1E1C']
  ];
  function colorStyle(name) {
    var n = String(name || '');
    if (n.indexOf('透') >= 0) {
      return 'background:repeating-linear-gradient(45deg,#E6E2D6 0 3px,#CBD8D1 3px 6px)';
    }
    for (var i = 0; i < COLOR_KEYS.length; i++) {
      if (n.indexOf(COLOR_KEYS[i][0]) >= 0) return 'background:' + COLOR_KEYS[i][1];
    }
    return 'background:#CFC8B6';
  }

  function isKeyWbsName(name) {
    return D.keyProjects.some(function (k) {
      if (k.name === name) return true;
      var kw = wbsFor(k.name);
      return kw && kw.name === name;
    });
  }
  function wbsPlanDate(w) {
    var meta = wbsProjectMeta(w.name);
    if (meta && meta.plan) return meta.plan;
    var ends = flattenWbs(w).map(taskEff).map(function (t) { return t.end; }).filter(Boolean).sort();
    return ends.length ? ends[ends.length - 1] : null;
  }
  function wbsMonthBlock(plan) {
    var s = plan ? String(plan) : '';
    var big = s ? (+s.slice(5, 7)) + '月' : '待定';
    var small = s ? s.slice(0, 4) + '年' : '';
    return '<span class="wbs-month"><b>' + big + '</b><span>' + small + '</span></span>';
  }

  /* ---------------- 页面：WBS ---------------- */
  function viewWbs() {
    var st = state.wbs;
    var proj = D.wbs.filter(function (w) { return w.name === st.proj; })[0] || D.wbs[0];
    if (!proj) return '<div class="empty">暂无 WBS 数据</div>';
    var stat = wbsStats(proj);
    var meta = wbsProjectMeta(proj.name);
    var riskN = stat.tasks.filter(taskRisk).length;

    var h = '<div class="page-head"><div><h2>项目 WBS 月度任务清单</h2><p>按阶段拆解到月，勾选完成情况可临时标记（保存在本浏览器），并自动刷新完成率。</p></div><div class="head-meta"><div><span>WBS 项目</span><b>' + D.wbs.length + '</b></div><div><span>任务总数</span><b>' + D.wbs.reduce(function (n, w) { return n + flattenWbs(w).length; }, 0) + '</b></div></div></div>';

    h += '<div class="wbs-layout">';

    h += '<div class="wbs-rail">';
    h += '<div class="wbs-dim-tabs"><button class="' + (st.mode === 'month' ? '' : 'on') + '" data-wbsdim="project">项目</button><button class="' + (st.mode === 'month' ? 'on' : '') + '" data-wbsdim="month">月度</button></div>';
    if (st.mode === 'month') {
      var monthList = (D.meta.months || []).map(function (m) { return { m: m, rows: monthTaskRows(m.key) }; }).filter(function (e) { return e.rows.length > 0; });
      var curM = st.month && monthList.some(function (e) { return e.m.key === st.month; }) ? st.month : (monthList[0] ? monthList[0].m.key : '');
      st.month = curM;
      monthList.forEach(function (e) {
        var names = uniq(e.rows.map(function (r) { return r.w.name; }));
        h += '<button class="wbs-proj month-item ' + (e.m.key === curM ? 'on' : '') + '" data-wbsmonth="' + e.m.key + '">';
        h += '<div class="wp-top"><b>' + e.m.label + '</b><em>' + e.rows.length + ' 条</em></div>';
        h += '<div class="wp-tags month-proj"><span class="mp-line">' + esc(names.join('、')) + '</span></div>';
        h += '</button>';
      });
    } else {
      D.wbs.map(function (w) {
        var s = wbsStats(w);
        var wm = wbsProjectMeta(w.name);
        var pe = wm && wm.plan ? wm.plan : (s.tasks.map(function (t) { return t.end; }).filter(Boolean).sort().pop() || null);
        var isDone = wm ? wm.done === '已完成' : (s.total > 0 && s.done === s.total);
        return { w: w, s: s, wm: wm, done: isDone ? 1 : 0, planEnd: pe, pri: (wm && wm.priority) || w.priority || 'P9' };
      }).sort(function (a, b) {
        if (a.done !== b.done) return a.done - b.done;
        var pa = String(a.planEnd || '9999'), pb = String(b.planEnd || '9999');
        if (pa !== pb) return pa.localeCompare(pb);
        if (a.pri !== b.pri) return a.pri.localeCompare(b.pri);
        return a.w.name.localeCompare(b.w.name, 'zh');
      }).forEach(function (r) {
        var w = r.w, s = r.s, wm = r.wm;
        var wr = s.tasks.filter(taskRisk).length;
        var stateCls = s.late ? ' has-late' : wr ? ' has-risk' : '';
        h += '<button class="wbs-proj' + stateCls + (w.name === proj.name ? ' on' : '') + '" data-wbsproj="' + esc(w.name) + '">';
        var wpri = (wm && wm.priority) || w.priority;
        h += '<div class="wp-top"><div class="wp-name-row">' + wbsMonthBlock(wbsPlanDate(w)) + '<b class="wp-title">' + (isKeyWbsName(w.name) ? '⭐' : '') + esc(w.name) + '</b></div>' + (wpri ? tag(wpri, wpri === 'P0' ? 'rust' : 'amber') : '') + '</div>';
        h += '<div class="wp-tags">' + (wm ? typeTag(wm.type) + personTag(wm.owner) : '') + '</div>';
        h += '<div class="wp-sub"><div class="bar thin"><i class="' + (s.late ? 'delay' : wr ? 'risk' : '') + '" style="width:' + s.pct + '%"></i></div><em>' + s.pct + '%</em></div>';
        h += '</button>';
      });
    }
    h += '</div>';

    h += '<div class="panel">';
    var projEnd = meta && meta.plan ? meta.plan : (stat.tasks.map(function (t) { return t.end; }).filter(Boolean).sort().pop() || null);
    h += '<div class="wbs-head"><div><div class="wbs-title"><h3>' + (st.mode === 'month' ? (st.month ? String(st.month).replace('-', '.') : '月度任务视图') : (isKeyWbsName(proj.name) ? '⭐' : '') + esc(proj.name)) + '</h3>' + (st.mode === 'month' ? '' : (meta ? typeTag(meta.type) + personTag(meta.owner) : '') + (riskN ? tag(riskN + ' 延期风险', 'amber') : '') + (stat.late ? tag(stat.late + ' 延期', 'rust') : '')) + '</div>';
    if (st.mode === 'month') {
      var mrows = st.month ? monthTaskRows(st.month) : [];
      var mActive = mrows.filter(function (r) { return !r.t.notDo; });
      var mDone = mActive.filter(function (r) { return r.t.done === '已完成'; }).length;
      h += '<div class="wh-meta">';
      h += '<div>涉及项目<b>' + uniq(mrows.map(function (r) { return r.w.name; })).length + '</b></div>';
      h += '<div>任务数<b>' + mrows.length + '</b></div>';
      h += '<div>完成率<b>' + (mActive.length ? Math.round(mDone / mActive.length * 100) : 0) + '%</b></div>';
      h += '</div>';
    } else {
      h += '<div class="wh-meta">';
      h += '<div>任务完成<b class="' + (stat.pct >= 60 ? 'ok' : '') + '">' + stat.done + ' / ' + stat.total + '</b></div>';
      h += '<div>完成率<b>' + stat.pct + '%</b></div>';
      h += '<div>计划完成<b>' + fmt(projEnd) + '</b></div>';
      h += '<div>下一任务<b>' + (stat.next ? esc(stat.next.name) + ' · ' + fmt(stat.next.start) : '全部完成') + '</b></div>';
      h += '</div>';
    }
    h += '</div>';
    if (st.mode !== 'month') {
      h += '<div class="wh-r"><div class="seg"><button class="' + (st.mode === 'list' ? 'on' : '') + '" data-wbsmode="list">任务清单</button><button class="' + (st.mode === 'gantt' ? 'on' : '') + '" data-wbsmode="gantt">时间轴</button></div>';
      h += '<div class="seg"><button class="' + ((st.only || 'all') === 'all' ? 'on' : '') + '" data-wbsonly="all">全部</button><button class="' + (st.only === 'month' ? 'on' : '') + '" data-wbsonly="month">本月</button><button class="' + (st.only === 'open' ? 'on' : '') + '" data-wbsonly="open">未完成</button><button class="' + (st.only === 'risk' ? 'on' : '') + '" data-wbsonly="risk">延期风险</button><button class="' + (st.only === 'late' ? 'on' : '') + '" data-wbsonly="late">延期</button></div>';
      h += '<span style="font-family:var(--num);font-size:9px;letter-spacing:.1em;color:var(--faint)">点击任务左侧方框标记完成</span></div>';
    }
    h += '</div>';

    if (st.mode === 'month') h += renderMonthWbs(st);
    else if (st.mode === 'gantt') h += renderGantt(proj, st.only);
    else h += renderTaskList(proj, st);
    h += '</div></div>';
    h += '<div style="margin-top:10px;font-size:10.5px;color:var(--faint)">提醒：页面修改仅保存在本机浏览器（可导出备份）。正式的项目记录请同步更新到《产品项目管理表.xlsx》，再运行 <code style="font-family:var(--num)">python tools/build_data.py</code> 刷新。</div>';
    return h;
  }

  function monthTaskRows(month) {
    var y = +month.slice(0, 4), mo = +month.slice(5, 7);
    var start = month + '-01', end = iso(new Date(y, mo, 0));
    var rows = [];
    D.wbs.slice().sort(function (a, b) { return a.name.localeCompare(b.name, 'zh'); }).forEach(function (w) {
      var wm = wbsProjectMeta(w.name);
      sortedPhases(w).forEach(function (ph) {
        ph.tasks.map(taskEff).forEach(function (t) {
          if (!t.start || !t.end) return;
          if (t.end < start || t.start > end) return;
          rows.push({ w: w, ph: ph, t: t, wm: wm });
        });
      });
    });
    return rows;
  }

  function renderMonthWbs(st) {
    var months = D.meta.months || [];
    if (!months.length) return '<div class="empty">暂无月份数据</div>';
    var month = st.month;
    if (!month || !months.some(function (m) { return m.key === month; })) {
      month = months.some(function (m) { return m.key === currentMonthKey(); }) ? currentMonthKey() : months[0].key;
    }
    st.month = month;
    var rows = monthTaskRows(month);
    var h = '<div class="panel-body">';
    h += '<div class="table-scroll"><table class="tbl task-tbl"><thead><tr><th style="width:96px">产品/项目</th><th style="width:52px">序号</th><th>任务</th><th style="width:120px">责任部门</th><th style="width:54px">工时</th><th style="width:168px">计划时间</th><th style="width:112px">实际完成</th><th style="width:104px">状态</th><th style="width:82px">完成情况</th></tr></thead><tbody>';
    rows.forEach(function (r) {
      var t = r.t, isDone = t.done === '已完成';
      h += '<tr class="' + (t.notDo ? 'notdo' : t.late ? 'overdue' : taskRisk(t) ? 'risk' : '') + '" data-act="goto-wbs" data-id="' + esc(r.w.name) + '">';
      h += '<td class="name" style="white-space:normal;word-break:break-all">' + (isKeyWbsName(r.w.name) ? '⭐' : '') + esc(r.w.name) + '</td>';
      h += '<td class="num faint">' + esc(t.seq) + '</td>';
      h += '<td class="t-name"><small>' + esc(r.ph.name) + '</small>' + (t.milestone ? '<span class="ms">★</span>' : '') + esc(t.name) + (t.output ? '<small>' + esc(t.output) + '</small>' : '') + '</td>';
      h += '<td class="muted" style="font-size:10.5px">' + esc(t.dept) + '</td>';
      h += '<td class="num">' + (t.days == null ? '—' : t.days) + '</td>';
      h += '<td class="num" style="font-size:10.5px">' + fmt(t.start) + '<span class="faint"> → </span>' + fmt(t.end) + '</td>';
      h += '<td><input class="date-in" type="date" value="' + esc(t.actual || '') + '" data-wbsactual="' + esc(t.taskKey) + '" title="点击选择实际完成日期"></td>';
      h += '<td class="nowrap">' + statusSelectHtml(t) + '</td>';
      h += '<td><button class="done-toggle ' + (isDone ? 'on' : '') + '" data-wbsdone="' + esc(t.taskKey) + '"' + (t.notDo ? ' disabled' : '') + '><span class="box"></span>' + (isDone ? '已完成' : '未完成') + '</button></td>';
      h += '</tr>';
    });
    if (!rows.length) h += '<tr><td colspan="9"><div class="empty"><b>该月没有任务</b>切换其它月份查看</div></td></tr>';
    h += '</tbody></table></div></div>';
    return h;
  }

  function filterWbsTasks(tasks, only) {
    if (only === 'month') return tasks.filter(function (t) { return monthKeyOf(t.end || t.month) === currentMonthKey(); });
    if (only === 'open') return tasks.filter(function (t) { return t.done !== '已完成'; });
    if (only === 'risk') return tasks.filter(function (t) { return taskRisk(t); });
    if (only === 'late') return tasks.filter(function (t) { return t.late; });
    return tasks;
  }

  function renderTaskList(proj, st) {
    var h = '';
    sortedPhases(proj).forEach(function (ph, pi) {
      var tasks = filterWbsTasks(ph.tasks.map(taskEff), st.only || 'all');
      if (!tasks.length) return;
      var activeTasks = tasks.filter(function (t) { return !t.notDo; });
      var done = activeTasks.filter(function (t) { return t.done === '已完成'; }).length;
      var late = activeTasks.filter(function (t) { return t.late; }).length;
      var risky = activeTasks.filter(taskRisk).length;
      var closed = st.closed[ph.name] ? ' closed' : '';
      h += '<div class="phase' + closed + '" data-phase="' + esc(ph.name) + '">';
      h += '<div class="phase-head" data-act="toggle-phase" data-phase="' + esc(ph.name) + '">';
      h += '<span class="ph-no">' + (pi + 1) + '</span><b>' + esc(ph.name) + '</b>';
      if (late) h += tag(late + ' 延期', 'rust');
      if (risky) h += tag(risky + ' 延期风险', 'amber');
      h += '<div class="bar thin"><i class="' + (late ? 'delay' : risky ? 'risk' : '') + '" style="width:' + pct(done, activeTasks.length) + '%"></i></div>';
      h += '<span class="ph-pct">' + pct(done, activeTasks.length) + '%</span><span class="caret"></span></div>';
      h += '<div class="phase-body"><table class="tbl task-tbl"><thead><tr><th style="width:52px">序号</th><th>任务</th><th style="width:120px">责任部门</th><th style="width:54px">工时</th><th style="width:168px">计划时间</th><th style="width:112px">实际完成</th><th style="width:104px">状态</th><th style="width:82px">完成情况</th></tr></thead><tbody>';
      tasks.forEach(function (t) {
        var isDone = t.done === '已完成';
        var stt = taskStatus(t);
        h += '<tr class="' + (t.notDo ? 'notdo' : t.late ? 'overdue' : taskRisk(t) ? 'risk' : '') + '">';
        h += '<td class="num faint">' + esc(t.seq) + '</td>';
        h += '<td class="t-name">' + (t.milestone ? '<span class="ms">★</span>' : '') + esc(t.name) + (t.output ? '<small>' + esc(t.output) + (t.note ? ' · ' + esc(t.note) : '') + '</small>' : (t.note ? '<small>' + esc(t.note) + '</small>' : '')) + '</td>';
        h += '<td class="muted" style="font-size:10.5px">' + esc(t.dept) + '</td>';
        h += '<td class="num">' + (t.days == null ? '—' : t.days) + '</td>';
        h += '<td class="num" style="font-size:10.5px">' + fmt(t.start) + '<span class="faint"> → </span>' + fmt(t.end) + '</td>';
        h += '<td><input class="date-in" type="date" value="' + esc(t.actual || '') + '" data-wbsactual="' + esc(t.taskKey) + '" title="点击选择实际完成日期"></td>';
        h += '<td class="nowrap">' + statusSelectHtml(t) + '</td>';
        h += '<td><button class="done-toggle ' + (isDone ? 'on' : '') + '" data-wbsdone="' + esc(t.taskKey) + '"' + (t.notDo ? ' disabled' : '') + '><span class="box"></span>' + (isDone ? '已完成' : '未完成') + '</button></td>';
        h += '</tr>';
      });
      h += '</tbody></table></div></div>';
    });
    return h;
  }

  function renderGantt(proj, only) {
    var tasks = filterWbsTasks(flattenWbs(proj).map(taskEff), only || 'all')
      .filter(function (t) { return t.start && t.end; });
    if (!tasks.length) return '<div class="empty">当前筛选条件下没有计划时间，无法生成时间轴</div>';
    var minD = tasks.reduce(function (a, t) { return t.start < a ? t.start : a; }, tasks[0].start);
    var maxD = tasks.reduce(function (a, t) { return t.end > a ? t.end : a; }, tasks[0].end);
    var min = parse(minD); min = new Date(min.getFullYear(), min.getMonth(), 1);
    var max = parse(maxD); max = new Date(max.getFullYear(), max.getMonth() + 2, 0);
    var total = diffDays(iso(min), iso(max)) + 1;
    var months = [];
    var cursor = new Date(min.getFullYear(), min.getMonth(), 1);
    while (cursor <= max) {
      var next = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      months.push({ label: cursor.getFullYear() + '.' + pad(cursor.getMonth() + 1), start: iso(cursor), frac: diffDays(iso(cursor), iso(next)) / total });
      cursor = next;
    }
    var h = '<div class="gantt"><div class="gantt-inner">';
    h += '<div class="gantt-head" style="--n:' + months.length + '"><div class="g-corner">任务 / 月份</div>';
    months.forEach(function (m) { h += '<div>' + m.label + '</div>'; });
    h += '</div>';

    var todayLeft = null;
    if (iso(min) <= TODAY && TODAY <= iso(max)) todayLeft = diffDays(iso(min), TODAY) / total * 100;

    sortedPhases(proj).forEach(function (ph, pi) {
      var rows = filterWbsTasks(ph.tasks.map(taskEff), only || 'all');
      if (!rows.length) return;
      h += '<div class="gantt-phase"><span class="num">' + (pi + 1) + '</span>' + esc(ph.name) + '</div>';
      rows.forEach(function (t) {
        h += '<div class="gantt-row" style="--n:' + months.length + '">';
        h += '<div class="g-label"><span class="seq">' + esc(t.seq) + '</span><b title="' + esc(t.name) + '">' + esc(t.name) + '</b></div>';
        h += '<div class="gantt-track" style="--n:' + months.length + '">';
        months.forEach(function (m) {
          var left = diffDays(iso(min), m.start) / total * 100;
          h += '<i class="gline" style="position:absolute;top:0;bottom:0;left:' + left + '%;width:1px;background:var(--line-2)"></i>';
        });
        if (todayLeft != null) h += '<div class="gantt-today" style="left:' + todayLeft + '%"></div>';
        if (t.start && t.end) {
          var l = diffDays(iso(min), t.start) / total * 100;
          var w = (diffDays(t.start, t.end) + 1) / total * 100;
          var cls = t.done === '已完成' ? 'done' : t.late ? 'late' : taskRisk(t) ? 'risk' : 'now';
          h += '<div class="gantt-bar ' + cls + '" style="left:' + l + '%;width:' + clamp(w, 0.6, 100) + '%" title="' + esc(t.name + ' ' + fmt(t.start) + ' → ' + fmt(t.end)) + '"><span>' + (t.days != null ? t.days + 'd' : '') + '</span></div>';
        }
        h += '</div></div>';
      });
    });
    h += '</div></div>';
    h += '<div class="legend" style="padding:10px 16px;border-top:1px solid var(--line-2)"><span><i style="background:var(--teal)"></i>已完成</span><span><i style="background:var(--blue)"></i>进行中 / 未开始</span><span><i style="background:var(--rust)"></i>已延期</span><span><i style="background:#F2C811"></i>延期风险</span><span><i style="background:var(--rust);opacity:.5"></i>今日</span></div>';
    return h;
  }

  /* ---------------- 抽屉详情 ---------------- */
  function openDrawer(kicker, html) {
    $('#drawerKicker').textContent = kicker;
    $('#drawerBody').innerHTML = html;
    $('#drawer').hidden = false;
    $('#drawerMask').hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeDrawer() {
    $('#drawer').hidden = true;
    $('#drawerMask').hidden = true;
    document.body.style.overflow = '';
  }

  /* ---------------- 编辑弹窗：项目 / 重点项目 / 回收站 ---------------- */
  function openModal(title, html) {
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = html;
    $('#modalMask').hidden = false;
  }
  function closeModal() {
    $('#modalMask').hidden = true;
    var m = document.querySelector('.modal'); if (m) m.classList.remove('wide');
  }

  var ANCHOR_STAGE = { '1.4': 0, '2.6': 1, '3.2': 2, '4.2': 3, '5.4': 4 };

  function planFromAnchor(months, code, dateStr) {
    var tpl = WBS_TPL[months];
    var stageMap = months === 3 ? { '2.6': 0, '3.2': 1, '4.2': 2 } : ANCHOR_STAGE;
    var idx = stageMap[code];
    if (!tpl || idx == null || !dateStr) return null;
    var anchorEnd = parse(dateStr);
    if (!isWorkdayDate(anchorEnd)) anchorEnd = prevWd(anchorEnd);
    var back = 0;
    for (var i = 1; i <= idx; i++) back += tpl.budgets[i];
    var cdcp = addMonthsDate(anchorEnd, -back);
    var target = addMonthsDate(cdcp, months);
    return iso(lastWd(target.getFullYear(), target.getMonth() + 1));
  }

  function ensureKey(p) {
    var k = D.keyProjects.filter(function (x) { return x.name === p.name; })[0];
    if (!k) { k = poolToKey(p); D.keyProjects.push(k); }
    p.isKey = true;
    APP.unkeyed = (APP.unkeyed || []).filter(function (n) { return n !== p.name; });
    APP.keyPatches[k.id] = cloneObj(k);
    return k;
  }
  function removeKeyByName(name) {
    D.keyProjects = D.keyProjects.filter(function (k) { return k.name !== name; });
    if (APP.unkeyed.indexOf(name) < 0) APP.unkeyed.push(name);
  }

  function openProjectForm(mode, id) {
    var isEdit = mode !== 'pool-add';
    var src = null;
    if (mode === 'pool-edit') src = D.pool.filter(function (x) { return x.id === id; })[0];
    else if (mode === 'key-edit') src = D.keyProjects.filter(function (x) { return x.id === id; })[0];
    var w = src ? findWbsAny(src.name) : null;
    var months = isEdit ? (src && isShortType(src.type) ? (w && w.phases.length >= 5 ? '4' : '3') : '6') : '';
    var anchorVal = '';
    var anchorDateVal = '';
    var genOn = !!(w || (src && src.isKey));
    var keyOn = !!(src && (src.isKey || mode === 'key-edit'));
    var typeOpts = PROJECT_TYPES.map(function (t) { return '<option value="' + esc(t) + '"' + (src && src.type === t ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('');
    var priOpts = ['', 'P0', 'P1', 'P2'].map(function (p) { return '<option value="' + p + '"' + (src && (src.priority || '') === p ? ' selected' : '') + '>' + (p || '无') + '</option>'; }).join('');
    var curStatus = src && src.status ? src.status : '未开展';
    var editableStatus = ['正常', '暂停', '取消', '未开展'];
    var statusOpts = editableStatus.map(function (s) { return '<option value="' + s + '"' + (curStatus === s ? ' selected' : '') + '>' + s + '</option>'; }).join('');
    if (editableStatus.indexOf(curStatus) < 0) statusOpts = '<option value="" selected disabled>—</option>' + statusOpts;
    function switchHtml(name, label, on) {
      return '<div class="toggle-field full"><span class="tf-label">' + label + '</span><div class="switch' + (on ? ' on' : '') + '" data-switch="' + name + '" role="switch" aria-checked="' + (on ? 'true' : 'false') + '"><span class="sw-opt yes">是</span><span class="sw-opt no">否</span><span class="sw-knob"></span></div><input type="checkbox" name="' + name + '"' + (on ? ' checked' : '') + ' hidden></div>';
    }
    var h = '<form id="projForm" class="form-grid">';
    h += '<div class="form-section full">项目信息</div>';
    h += '<label class="full">项目名称 *<input name="name" required value="' + esc(src ? src.name : '') + '"' + (mode === 'key-edit' ? ' readonly' : '') + '></label>';
    h += '<label>产品开发类型<select name="type">' + typeOpts + '</select></label>';
    h += '<label>项目状态<select name="status">' + statusOpts + '</select></label>';
    h += '<label>项目成员<input name="owner" value="' + esc(src ? src.owner || '' : '') + '"></label>';
    h += '<label>计划完成时间（中试转产）<input type="date" name="plan" value="' + esc(src && src.plan ? src.plan : '') + '"></label>';
    h += '<label>优先级<select name="priority">' + priOpts + '</select></label>';
    h += '<div class="form-section full">设置</div>';
    h += '<label>WBS 项目周期<select name="months"><option value="">请选择</option><option value="3"' + (months === '3' ? ' selected' : '') + '>3 个月（原料替代 / 性能优化）</option><option value="4"' + (months === '4' ? ' selected' : '') + '>4 个月</option><option value="6"' + (months === '6' ? ' selected' : '') + '>6 个月</option></select></label>';
    h += '<label>WBS 锚点任务（可选）<select name="anchor"><option value="">—</option>' + ['1.4|CDCP 产品概念决策评审', '2.6|项目立项', '3.2|TR3 小试技术评审', '4.2|TR4 中试技术评审', '5.4|ADCP 产品中试转产评审'].map(function (x) { var a = x.split('|'); return '<option value="' + a[0] + '"' + (anchorVal === a[0] ? ' selected' : '') + '>' + a[0] + ' ' + a[1] + '</option>'; }).join('') + '</select></label>';
    h += '<label>锚点完成日期（可选）<input type="date" name="anchorDate" value="' + esc(anchorDateVal) + '"></label>';
    h += switchHtml('isKey', '年度重点项目', keyOn);
    h += switchHtml('genWbs', 'WBS 任务清单生成', genOn);
    h += '<label class="full">备注<textarea name="note" rows="2">' + esc(src ? src.note || '' : '') + '</textarea></label>';
    h += '<div class="form-help">项目名称必填，其余选填。年度重点项目与 WBS 任务清单均需点击“保存”后生效；WBS 需填写计划完成时间、WBS 周期、锚点任务与锚点日期后才能开启。</div>';
    h += '<div class="form-actions"><button type="button" class="btn imp-open-btn" data-imp-open><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 3.5h4l1.4 1.6H14.5v8H1.5z"/></svg>批量导入</button><button type="button" class="btn" data-modal-close>取消</button><button type="submit" class="btn primary">保存</button></div>';
    h += '</form>';
    openModal(mode === 'pool-add' ? '新增项目' : (mode === 'key-edit' ? '编辑重点项目' : '编辑项目'), h);
    var form = $('#projForm');
    var planEl = form.elements['plan'], anchorEl = form.elements['anchor'], anchorDateEl = form.elements['anchorDate'], typeEl = form.elements['type'], monthsEl = form.elements['months'];
    var isKeyEl = form.elements['isKey'], genWbsEl = form.elements['genWbs'];
    var swKey = form.querySelector('[data-switch="isKey"]'), swGen = form.querySelector('[data-switch="genWbs"]');
    function setSwitch(name, on) {
      var input = name === 'isKey' ? isKeyEl : genWbsEl;
      var sw = name === 'isKey' ? swKey : swGen;
      input.checked = !!on;
      sw.classList.toggle('on', !!on);
      sw.setAttribute('aria-checked', on ? 'true' : 'false');
    }
    function canGen() { return !!(monthsEl.value && anchorEl.value && anchorDateEl.value); }
    function refreshGen() { if (genWbsEl.checked && !canGen()) setSwitch('genWbs', false); }
    var syncAnchor = function () {
      if (planEl.value) {
        anchorDateEl.value = planEl.value;
        anchorEl.value = (isShortType(typeEl.value) && monthsEl.value === '3') ? '4.2' : '5.4';
      } else {
        anchorDateEl.value = '';
        anchorEl.value = '';
      }
      refreshGen();
    };
    planEl.addEventListener('input', syncAnchor);
    planEl.addEventListener('change', syncAnchor);
    var opt3 = monthsEl.querySelector('option[value="3"]'), opt4 = monthsEl.querySelector('option[value="4"]'), opt6 = monthsEl.querySelector('option[value="6"]');
    var syncMonths = function () {
      var short = isShortType(typeEl.value);
      opt3.disabled = !short;
      opt4.disabled = false;
      opt6.disabled = short;
      if (short && (monthsEl.value === '6' || !monthsEl.value)) monthsEl.value = '3';
      else if (!short && monthsEl.value === '3') monthsEl.value = isEdit ? '6' : '';
      syncAnchor();
    };
    typeEl.addEventListener('change', syncMonths);
    monthsEl.addEventListener('change', syncAnchor);
    function onYes(name) {
      if (name === 'isKey') {
        setSwitch('isKey', true);
        if (canGen()) setSwitch('genWbs', true);
      } else {
        if (!canGen()) { toast('请先填写 WBS 项目周期、锚点任务与锚点完成日期'); setSwitch('genWbs', false); return; }
        setSwitch('genWbs', true);
      }
    }
    function onNo(name) { setSwitch(name, false); }
    function bindSwitch(name) {
      var sw = name === 'isKey' ? swKey : swGen;
      sw.querySelector('.sw-opt.yes').addEventListener('click', function (e) { e.stopPropagation(); onYes(name); });
      sw.querySelector('.sw-opt.no').addEventListener('click', function (e) { e.stopPropagation(); onNo(name); });
      sw.addEventListener('click', function (e) {
        if (e.target.classList.contains('sw-opt')) return;
        var r = sw.getBoundingClientRect();
        if (e.clientX < r.left + r.width / 2) onYes(name); else onNo(name);
      });
    }
    bindSwitch('isKey'); bindSwitch('genWbs');
    var impBtn = form.querySelector('[data-imp-open]');
    if (impBtn) impBtn.addEventListener('click', function () { openImportPicker(); });
    syncMonths();
    setSwitch('isKey', keyOn);
    setSwitch('genWbs', genOn);
    if (genWbsEl.checked && !canGen()) setSwitch('genWbs', false);
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var el = form.elements;
      var data = {
        name: el['name'].value.trim(), type: el['type'].value, status: el['status'].value, owner: el['owner'].value.trim(),
        plan: el['plan'].value || '', priority: el['priority'].value, months: el['months'].value,
        anchor: el['anchor'].value, anchorDate: el['anchorDate'].value || '', isKey: el['isKey'].checked,
        genWbs: el['genWbs'].checked, note: el['note'].value.trim()
      };
      if (!data.name) { toast('请输入项目名称'); return; }
      if (isShortType(data.type) && (data.months === '6' || !data.months)) data.months = '3';
      if (!isShortType(data.type) && data.months === '3') data.months = '6';
      if (!data.plan && data.anchorDate && data.months) data.plan = planFromAnchor(+data.months, data.anchor, data.anchorDate) || '';
      if (data.plan && !/^\d{4}-\d{2}-\d{2}$/.test(data.plan)) { toast('计划完成时间格式应为 YYYY-MM-DD'); return; }
      saveProjectForm(mode, id, data);
    });
  }

  function saveProjectForm(mode, id, data) {
    if (mode === 'pool-add') {
      if (D.pool.some(function (x) { return x.name === data.name; })) { toast('已存在同名项目，请更换项目名称'); return; }
      var p = { id: uid('p'), type: data.type, status: data.status || '未开展', done: '未完成', name: data.name, must: '□', owner: data.owner, founded: TODAY, started: TODAY, plan: data.plan || null, actual: null, priority: data.priority, phase: '', note: data.note, isKey: !!data.isKey };
      D.pool.push(p);
      APP.poolAdded.push(cloneObj(p));
      if (data.isKey) ensureKey(p);
      if (data.genWbs && data.plan) upsertWbs(data.name, +(data.months || '4'), data.plan);
    } else if (mode === 'pool-edit') {
      var p = D.pool.filter(function (x) { return x.id === id; })[0];
      if (!p) return;
      var oldName = p.name, oldPlan = p.plan, wasKey = !!p.isKey;
      p.name = data.name; p.type = data.type; p.status = data.status || '正常'; p.owner = data.owner; p.plan = data.plan || null; p.priority = data.priority; p.note = data.note; p.isKey = !!data.isKey;
      APP.poolPatches[p.id] = cloneObj(p);
      var k = D.keyProjects.filter(function (x) { return x.name === oldName; })[0];
      if (data.isKey) {
        if (!k) k = ensureKey(p);
        else { k.name = p.name; k.type = p.type; k.status = p.status; k.owner = p.owner; k.plan = p.plan; k.priority = p.priority; k.note = p.note; APP.keyPatches[k.id] = cloneObj(k); }
      } else if (k) { removeKeyByName(oldName); }
      if (oldName !== data.name) {
        var w0 = findWbs(oldName);
        if (w0) {
          w0.name = data.name;
          w0.phases.forEach(function (ph) { ph.tasks.forEach(function (t) { t.taskKey = data.name + '|' + t.seq; }); });
          APP.wbsOverride[data.name] = cloneObj(w0.phases);
          delete APP.wbsOverride[oldName];
          WBS_BY_NORM[normalize(data.name)] = w0;
        }
        APP.mapPlan[data.name] = p.plan;
      }
      syncWbsPlan(data.name, oldPlan, p.plan, data);
    } else if (mode === 'key-edit') {
      var k = D.keyProjects.filter(function (x) { return x.id === id; })[0];
      if (!k) return;
      var oldPlan = k.plan;
      k.type = data.type; k.status = data.status || '正常'; k.owner = data.owner; k.plan = data.plan || null; k.priority = data.priority; k.note = data.note;
      APP.keyPatches[k.id] = cloneObj(k);
      var p = D.pool.filter(function (x) { return x.name === k.name; })[0];
      if (p) { p.type = k.type; p.status = k.status; p.owner = k.owner; p.plan = k.plan; p.priority = k.priority; p.note = k.note; p.isKey = !!data.isKey; APP.poolPatches[p.id] = cloneObj(p); }
      if (!data.isKey) removeKeyByName(k.name);
      syncWbsPlan(k.name, oldPlan, k.plan, data);
    }
    appSave();
    closeModal();
    render();
    toast('已保存');
  }

  function detectMonths(name) {
    var w = findWbs(name);
    if (!w) return '4';
    return w.phases.some(function (ph) { return ph.tasks.some(function (t) { return String(t.name).indexOf('外发小试') >= 0; }); }) ? '6' : '4';
  }

  function syncWbsPlan(name, oldPlan, newPlan, data) {
    if (!newPlan) return;
    var w = findWbsAny(name);
    var short = isShortType(data.type);
    var genMonths = data.months || (short ? '3' : '4');
    var expectPhases = genMonths === '3' ? 3 : 5;
    if (data.genWbs) {
      if (APP.wbsHidden[name]) { restoreWbs(name); APP.mapPlan[name] = newPlan; return; }
      if (!w || (short && w.phases.length !== expectPhases)) { upsertWbs(name, +genMonths, newPlan); APP.mapPlan[name] = newPlan; return; }
    } else if (w) {
      hideWbs(name);
    }
    if (oldPlan !== newPlan && findWbsAny(name)) shiftWbsMonths(name, monthDelta(oldPlan, newPlan));
    APP.mapPlan[name] = newPlan;
  }

  function deletePoolProject(id) {
    var p = D.pool.filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    if (!confirm('确定将“' + p.name + '”移入回收站？')) return;
    var k = D.keyProjects.filter(function (x) { return x.name === p.name; })[0];
    var w = findWbs(p.name);
    APP.recycle.push({ project: cloneObj(p), key: k ? cloneObj(k) : null, wbs: w ? cloneObj(w) : null, wasKey: !!k, custom: (APP.poolAdded || []).some(function (x) { return x.id === id; }) });
    D.pool = D.pool.filter(function (x) { return x.id !== id; });
    if (k) D.keyProjects = D.keyProjects.filter(function (x) { return x.id !== k.id; });
    if (w) { D.wbs = D.wbs.filter(function (x) { return x.name !== p.name; }); delete WBS_BY_NORM[normalize(p.name)]; delete APP.wbsOverride[p.name]; }
    appSave(); render(); toast('已移入回收站');
  }

  function deleteKeyProject(id) {
    var k = D.keyProjects.filter(function (x) { return x.id === id; })[0];
    if (!k) return;
    if (!confirm('确定取消“' + k.name + '”的年度重点项目标记？')) return;
    var p = D.pool.filter(function (x) { return x.name === k.name; })[0];
    if (p) { p.isKey = false; APP.poolPatches[p.id] = cloneObj(p); }
    removeKeyByName(k.name);
    appSave(); render(); toast('已从重点项目移除，可在工作池重新勾选');
  }

  function openRecycle() {
    var h = '<div style="font-size:11.5px;color:var(--text-2);margin-bottom:8px">删除的项目会暂存于此，可还原或彻底删除。</div>';
    if (!APP.recycle.length) h += '<div class="empty">回收站为空</div>';
    APP.recycle.forEach(function (r) {
      h += '<div class="recycle-item"><div><b>' + esc(r.project.name) + '</b><div class="rs-meta">' + esc(r.project.type || '—') + ' · ' + esc(r.project.owner || '—') + ' · 计划完成 ' + fmt(r.project.plan) + (r.wasKey ? ' · 年度重点项目' : '') + '</div></div>';
      h += '<div class="row-actions"><button data-rec="restore" data-rid="' + esc(r.project.id) + '">还原</button><button data-rec="purge" data-rid="' + esc(r.project.id) + '">彻底删除</button></div></div>';
    });
    openModal('回收站', h);
    $$('#modalBody [data-rec]').forEach(function (b) {
      b.addEventListener('click', function () {
        var rid = b.getAttribute('data-rid'), act = b.getAttribute('data-rec');
        var idx = APP.recycle.findIndex(function (r) { return r.project.id === rid; });
        if (idx < 0) return;
        if (act === 'restore') {
          var snap = APP.recycle.splice(idx, 1)[0];
          if (!D.pool.some(function (x) { return x.id === snap.project.id; })) D.pool.push(snap.project);
          if (snap.wasKey && snap.key && !D.keyProjects.some(function (x) { return x.id === snap.key.id; })) D.keyProjects.push(snap.key);
          if (snap.wbs && !D.wbs.some(function (x) { return x.name === snap.wbs.name; })) { D.wbs.push(snap.wbs); APP.wbsOverride[snap.wbs.name] = cloneObj(snap.wbs.phases); WBS_BY_NORM[normalize(snap.wbs.name)] = snap.wbs; }
          APP.purged = APP.purged.filter(function (x) { return x !== snap.project.id; });
          APP.purgedNames = (APP.purgedNames || []).filter(function (n) { return n !== snap.project.name; });
          APP.unkeyed = APP.unkeyed.filter(function (n) { return n !== snap.project.name; });
          appSave(); toast('已还原');
        } else {
          if (!confirm('彻底删除后不可恢复，确定删除“' + APP.recycle[idx].project.name + '”？')) return;
          var snap2 = APP.recycle.splice(idx, 1)[0];
          if (APP.purged.indexOf(snap2.project.id) < 0) APP.purged.push(snap2.project.id);
          APP.purgedNames = (APP.purgedNames || []).filter(function (n) { return n !== snap2.project.name; });
          APP.purgedNames.push(snap2.project.name);
          APP.poolAdded = (APP.poolAdded || []).filter(function (x) { return x.id !== snap2.project.id; });
          delete APP.wbsOverride[snap2.project.name];
          delete APP.mapPlan[snap2.project.name];
          appSave(); toast('已彻底删除');
        }
        openRecycle(); render();
      });
    });
  }

  function projectWbsInfo(name) {
    var w = wbsFor(name);
    if (!w) return { w: null, firstStart: null, kickActual: null };
    var tasks = flattenWbs(w).map(taskEff);
    var first = tasks.filter(function (t) { return t.start; }).sort(function (a, b) { return String(a.start).localeCompare(String(b.start)); })[0];
    var kick = tasks.filter(function (t) { return t.name.indexOf('项目立项') >= 0 || t.seq === '2.6'; })[0];
    return { w: w, firstStart: first ? first.start : null, kickActual: kick ? (kick.actual || null) : null };
  }

  function wbsDrawerSection(w) {
    if (!w) return '';
    var s = wbsStats(w);
    var h = '<div class="drawer-section"><div class="ds-title">WBS 进度</div>';
    h += '<div class="progress-line"><div class="bar"><i class="' + (s.late ? 'delay' : '') + '" style="width:' + s.pct + '%"></i></div><b>' + s.pct + '%</b><span class="faint" style="font-size:10.5px">' + s.done + '/' + s.total + ' 任务 · 延期 ' + s.late + '</span></div>';
    h += '<div class="timeline" style="margin-top:14px">';
    sortedPhases(w).forEach(function (ph) {
      var tt = ph.tasks.map(taskEff);
      var dd = tt.filter(function (t) { return t.done === '已完成'; }).length;
      var lateN = tt.some(function (t) { return t.late; });
      var risky = tt.some(taskRisk);
      var ends = tt.map(function (t) { return t.end; }).filter(Boolean).sort();
      var planEnd = ends.length ? ends[ends.length - 1] : null;
      h += '<div class="tl-item ' + (dd === tt.length ? 'done' : lateN ? 'delay' : risky ? 'risk' : '') + '">';
      h += '<span class="tl-dot"></span><div class="tl-main"><b>' + esc(ph.name) + '</b><span>' + dd + ' / ' + tt.length + ' 完成 · ' + pct(dd, tt.length) + '%' + (planEnd ? ' · 计划完成 ' + fmt(planEnd) : '') + '</span></div></div>';
    });
    h += '</div>';
    h += '<button class="btn" style="margin-top:6px;border:1px solid var(--line-strong);background:var(--card);padding:6px 12px;font-size:11.5px" data-act="goto-wbs" data-id="' + esc(w.name) + '">打开 WBS 任务清单 →</button>';
    h += '</div>';
    return h;
  }

  function openPool(id) {
    var p = D.pool.filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    var key = D.keyProjects.filter(function (k) { return k.name === p.name; })[0];
    var w = wbsFor(p.name);
    var pinfo = projectWbsInfo(p.name);
    var h = '<h3>' + esc(p.name) + '</h3><div class="drawer-tags">' + displayStatusChip(p) + typeTag(p.type) + (p.priority ? tag(p.priority, p.priority === 'P0' ? 'rust' : 'amber') : '') + (p.must === '✅' ? tag('必做项', 'teal') : '') + '</div>';
    if (p.note) h += '<div class="drawer-section"><div class="ds-title">备注 / 风险说明</div><div class="note-box">' + esc(p.note) + '</div></div>';
    h += '<div class="drawer-section"><div class="ds-title">项目信息</div><dl class="kv">';
    h += '<dt>负责人</dt><dd>' + personTag(p.owner) + '</dd>';
    h += '<dt>启动时间</dt><dd><input class="date-in" type="date" value="' + esc(pinfo.firstStart || p.started || '') + '" data-pooledit="start" data-id="' + p.id + '"></dd>';
    h += '<dt>立项时间</dt><dd><input class="date-in" type="date" value="' + esc(pinfo.kickActual || p.founded || '') + '" data-pooledit="kick" data-id="' + p.id + '"></dd>';
    h += '<dt>计划完成时间</dt><dd><input class="date-in" type="date" value="' + esc(p.plan || '') + '" data-pooledit="plan" data-id="' + p.id + '">' + (p.plan && p.done !== '已完成' ? ' <span class="faint">（' + (leftDays(p) < 0 ? '延期 ' + Math.abs(leftDays(p)) + ' 天' : '剩 ' + leftDays(p) + ' 天') + '）</span>' : '') + '</dd>';
    h += '<dt>实际完成时间</dt><dd><input class="date-in" type="date" value="' + esc(p.actual || '') + '" data-pooledit="actual" data-id="' + p.id + '"></dd>';
    h += '<dt>状态 / 完成情况</dt><dd>' + displayStatusChip(p) + doneTag(p.done) + '</dd>';
    h += '</dl></div>';
    h += wbsDrawerSection(w);
    if (key) h += '<div class="drawer-section"><div class="ds-title">重点项目</div><button class="panel-link" data-act="open-key" data-id="' + key.id + '">该产品已列入重点项目清单 →</button></div>';
    openDrawer('PROJECT DETAIL', h);
    bindPoolInline(p.id);
  }

  function bindPoolInline(id) {
    $$('[data-pooledit]').forEach(function (inp) {
      inp.addEventListener('click', function (ev) { ev.stopPropagation(); });
      inp.addEventListener('change', function () { updatePoolDate(id, this.getAttribute('data-pooledit'), this.value); });
    });
  }

  function updatePoolDate(id, kind, val) {
    var p = D.pool.filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    var key = D.keyProjects.filter(function (k) { return k.name === p.name; })[0];
    var w = wbsFor(p.name);
    if (kind === 'start') {
      p.started = val || null;
      if (w) {
        var first = flattenWbs(w).map(taskEff).filter(function (t) { return t.start; }).sort(function (a, b) { return String(a.start).localeCompare(String(b.start)); })[0];
        if (first && val) {
          var delta = diffDays(first.start, val);
          var newEnd = first.end ? iso(new Date(parse(first.end).getTime() + delta * 86400000)) : first.end;
          setOV('wbs', first.taskKey, { start: val, end: newEnd });
        }
      }
      if (key) { key.started = val || null; APP.keyPatches[key.id] = cloneObj(key); }
    } else if (kind === 'kick') {
      if (w) {
        var kick = flattenWbs(w).map(taskEff).filter(function (t) { return t.name.indexOf('项目立项') >= 0 || t.seq === '2.6'; })[0];
        if (kick) setOV('wbs', kick.taskKey, { actual: val || null, done: val ? '已完成' : kick.done });
      }
      if (key) { key.founded = val || null; APP.keyPatches[key.id] = cloneObj(key); }
    } else if (kind === 'plan') {
      var oldPlan = p.plan;
      p.plan = val || null;
      APP.mapPlan[p.name] = p.plan;
      if (key) { key.plan = p.plan; APP.keyPatches[key.id] = cloneObj(key); }
      if (w && p.plan) shiftWbsMonths(p.name, monthDelta(oldPlan, p.plan));
    } else if (kind === 'actual') {
      p.actual = val || null;
      if (val) p.done = '已完成';
      if (key) { key.actual = p.actual; if (val) key.done = '已完成'; APP.keyPatches[key.id] = cloneObj(key); }
    }
    APP.poolPatches[p.id] = cloneObj(p);
    appSave();
    render();
    openPool(id);
    toast('已更新');
  }

  function openKey(id) {
    var k = D.keyProjects.filter(function (x) { return x.id === id; })[0];
    if (!k) return;
    var w = wbsFor(k.name);
    var kinfo = projectWbsInfo(k.name);
    var h = '<h3>' + esc(k.name) + '</h3><div class="drawer-tags">' + displayStatusChip(k) + typeTag(k.type) + (k.priority ? tag(k.priority, k.priority === 'P0' ? 'rust' : 'amber') : '') + (w ? tag('WBS 已拆解', 'teal') : '') + '</div>';
    if (k.note) h += '<div class="drawer-section"><div class="ds-title">备注 / 跟踪说明</div><div class="note-box">' + esc(k.note) + '</div></div>';
    h += '<div class="drawer-section"><div class="ds-title">项目信息</div><dl class="kv">';
    h += '<dt>负责人</dt><dd>' + personTag(k.owner) + '</dd>';
    h += '<dt>启动时间</dt><dd>' + fmt(kinfo.firstStart) + '</dd>';
    h += '<dt>立项时间</dt><dd>' + fmt(kinfo.kickActual) + '</dd>';
    h += '<dt>计划完成时间</dt><dd>' + fmt(k.plan) + (k.plan && k.done !== '已完成' ? ' <span class="faint">（' + (leftDays(k) < 0 ? '延期 ' + Math.abs(leftDays(k)) + ' 天' : '剩 ' + leftDays(k) + ' 天') + '）</span>' : '') + '</dd>';
    h += '<dt>实际完成时间</dt><dd>' + fmt(k.actual) + '</dd>';
    h += '<dt>状态 / 完成情况</dt><dd>' + displayStatusChip(k) + doneTag(k.done) + '</dd>';
    h += '</dl></div>';
    h += wbsDrawerSection(w);
    openDrawer('KEY PROJECT DETAIL', h);
  }

  function openMap(type, text) {
    var group = D.map.filter(function (g) { return g.type === type; })[0];
    var item = group && group.items.filter(function (it) { return it.text === text; })[0];
    if (!item) return;
    var matched = item.match ? D.pool.filter(function (p) { return p.name === item.match; })[0] : null;
    var h = '<h3>' + esc(item.text) + '</h3><div class="drawer-tags">' + chip(item.status) + tag(type, 'plain') + '</div>';
    h += '<div class="drawer-section"><div class="ds-title">规划信息</div><dl class="kv">';
    h += '<dt>月份</dt><dd>' + esc(D.meta.months[item.col] ? D.meta.months[item.col].label : '—') + '</dd>';
    h += '<dt>原始标注</dt><dd>' + esc(item.raw) + '</dd>';
    h += '<dt>工作类型</dt><dd>' + esc(type) + '</dd>';
    h += '<dt>推导状态</dt><dd>' + chip(item.status) + '</dd>';
    h += '</dl></div>';
    if (matched) {
      h += '<div class="drawer-section"><div class="ds-title">匹配到工作池项目</div><div class="note-box" style="border-left-color:var(--blue)"><b>' + esc(matched.name) + '</b><br>' + esc(matched.owner) + ' · ' + esc(matched.type) + ' · 计划完成 ' + fmt(matched.plan) + '<br>状态：' + esc(matched.status) + ' · ' + esc(poolState(matched) === 'done' ? '已完成' : '未完成') + '</div>';
      h += '<button class="panel-link" style="margin-top:10px" data-act="open-pool" data-id="' + matched.id + '">打开项目详情 →</button></div>';
    } else {
      h += '<div class="drawer-section"><div class="ds-title">说明</div><div class="note-box">该规划条目未直接匹配到工作池项目，状态按原文推导。</div></div>';
    }
    openDrawer('ROADMAP ITEM', h);
  }

  function openOut(id) {
    var o = D.outsourcing.filter(function (x) { return x.id === id; })[0];
    if (!o) return;
    var stageIdx = OUT_STAGES.indexOf(o.progress);
    var h = '<h3>' + esc(o.name) + '</h3><div class="drawer-tags">' + chip(o.progress === '完成引进' ? 'done' : o.progress === '不引进' ? 'paused' : 'active', o.progress) + tag(o.ptype, 'plain') + (o.adopted ? tag('已引进', 'teal') : '') + '</div>';
    h += '<div class="drawer-section"><div class="ds-title">引进流程</div><div class="steps" style="margin-top:0">';
    for (var i = 0; i < 5; i++) h += '<i class="' + (i < stageIdx ? 'on' : i === stageIdx ? 'now' : '') + '"></i>';
    h += '</div><div style="display:flex;justify-content:space-between;font-size:9.5px;color:var(--faint);margin-top:6px"><span>寻源</span><span>一轮</span><span>二轮</span><span>引进</span><span>结束</span></div></div>';
    h += '<div class="drawer-section"><div class="ds-title">基本信息</div><dl class="kv">';
    h += '<dt>供应商</dt><dd>' + esc(o.supplier) + '</dd>';
    h += '<dt>产品类型</dt><dd>' + esc(o.ptype) + '</dd>';
    h += '<dt>状态</dt><dd>' + esc(o.status) + ' · ' + esc(o.progress) + '</dd>';
    h += '<dt>计划引进</dt><dd>' + fmt(o.planAdopt) + '</dd>';
    h += '<dt>确认引进</dt><dd>' + fmt(o.adoptDate) + '</dd>';
    h += '</dl></div>';
    h += '<div class="drawer-section"><div class="ds-title">样品与测试</div><div class="timeline">';
    h += '<div class="tl-item ' + (o.sample1Date ? '' : '') + '"><span class="tl-dot"></span><div class="tl-main"><b>第一次样品 · ' + esc(o.sample1 || '—') + '</b><span>接收 ' + fmt(o.sample1Date) + ' · 确认 ' + fmt(o.confirm1Date) + '</span>' + (o.result1 ? '<div class="task-meta" style="margin-top:4px;line-height:1.6">' + esc(o.result1) + '</div>' : '') + '</div></div>';
    if (o.round2 || o.sample2Date) {
      h += '<div class="tl-item ' + (o.adopted ? 'done' : '') + '"><span class="tl-dot"></span><div class="tl-main"><b>第二次样品</b><span>接收 ' + fmt(o.sample2Date) + (o.adopted ? ' · 已确认引进' : '') + '</span>' + (o.result2 ? '<div class="task-meta" style="margin-top:4px;line-height:1.6">' + esc(o.result2) + '</div>' : '') + '</div></div>';
    }
    h += '<div class="tl-item ' + (o.adopted ? 'done' : '') + '"><span class="tl-dot"></span><div class="tl-main"><b>引进决策</b><span>' + (o.adopted ? '已引进 · ' + fmt(o.adoptDate) : '未引进 · 目标 ' + fmt(o.planAdopt)) + '</span></div></div>';
    h += '</div></div>';
    openDrawer('OUTSOURCING DETAIL', h);
  }

  function openColor(id) {
    var c = D.colors.filter(function (x) { return x.id === id; })[0];
    if (!c) return;
    var s = poolState({ status: c.status, done: c.done, plan: c.due });
    var cyc = c.request && c.finish ? diffDays(c.request, c.finish) : null;
    var h = '<h3><span class="swatch" style="width:22px;height:22px;vertical-align:-3px;' + colorStyle(c.color) + '"></span> ' + esc(c.spu) + ' · ' + esc(c.color) + '</h3><div class="drawer-tags">' + chip(s) + tag(c.ctype, 'plain') + tag(c.dept, 'gray') + '</div>';
    h += '<div class="drawer-section"><div class="ds-title">需求信息</div><dl class="kv">';
    h += '<dt>需求提交</dt><dd>' + fmt(c.request) + '</dd>';
    h += '<dt>期望交付</dt><dd>' + fmt(c.due) + '</dd>';
    h += '<dt>试色类型</dt><dd>' + esc(c.trial || '—') + '</dd>';
    h += '<dt>完成时间</dt><dd>' + fmt(c.finish) + (cyc != null ? ' <span class="faint">（周期 ' + cyc + ' 天）</span>' : '') + '</dd>';
    h += '<dt>颜色参考</dt><dd>' + esc(c.ref || '—') + '</dd>';
    h += '<dt>项目类型</dt><dd>' + esc(c.ctype) + '</dd>';
    h += '</dl></div>';
    if (c.note) h += '<div class="drawer-section"><div class="ds-title">备注</div><div class="note-box">' + esc(c.note) + '</div></div>';
    openDrawer('COLOR REQUEST', h);
  }

  /* ---------------- 搜索 ---------------- */
  var SEARCH_INDEX = [];
  D.pool.forEach(function (p) { SEARCH_INDEX.push({ kind: '项目池', name: p.name, sub: p.type + ' · ' + p.owner, act: 'open-pool', id: p.id }); });
  D.keyProjects.forEach(function (k) { SEARCH_INDEX.push({ kind: '重点项目', name: k.name, sub: k.owner + ' · ' + k.status, act: 'open-key', id: k.id }); });
  D.wbs.forEach(function (w) { SEARCH_INDEX.push({ kind: 'WBS', name: w.name, sub: w.phases.length + ' 个阶段', act: 'goto-wbs', id: w.name }); });
  D.outsourcing.forEach(function (o) { SEARCH_INDEX.push({ kind: '外协', name: o.name, sub: o.supplier + ' · ' + o.progress, act: 'open-out', id: o.id }); });
  D.colors.forEach(function (c) { SEARCH_INDEX.push({ kind: '配色', name: c.spu + ' · ' + c.color, sub: c.dept + ' · ' + c.ctype, act: 'open-color', id: c.id }); });

  function doSearch(q) {
    var box = $('#searchResults');
    q = q.trim().toLowerCase();
    if (!q) { box.hidden = true; return; }
    var hits = SEARCH_INDEX.filter(function (x) {
      return (x.name + ' ' + x.sub).toLowerCase().indexOf(q) >= 0;
    }).slice(0, 14);
    if (!hits.length) { box.innerHTML = '<div class="sr-empty">没有找到匹配项</div>'; box.hidden = false; return; }
    var html = '', lastKind = '';
    hits.forEach(function (x) {
      if (x.kind !== lastKind) { html += '<div class="sr-group">' + x.kind + '</div>'; lastKind = x.kind; }
      html += '<button class="sr-item" data-act="' + x.act + '" data-id="' + esc(x.id) + '"><b>' + esc(x.name) + '</b><span>' + esc(x.sub) + '</span></button>';
    });
    box.innerHTML = html;
    box.hidden = false;
  }

  /* ---------------- 事件绑定 ---------------- */
  function bindView(id) {
    if (id === 'overview') {
      $$('.risk-tabs button').forEach(function (b) {
        b.addEventListener('click', function () {
          var dim = this.getAttribute('data-risk-dim');
          $$('.risk-tabs button').forEach(function (x) { x.classList.toggle('on', x === b); });
          $$('.risk-group').forEach(function (g) { g.hidden = g.getAttribute('data-risk-dim') !== dim; });
          var group = $('.risk-group[data-risk-dim="' + dim + '"]');
          var cnt = $('#riskCount');
          if (group && cnt) cnt.textContent = (group.getAttribute('data-count') || '0') + ' 项';
        });
      });
      var chart = $('.ovm-chart'), tip = chart && chart.querySelector('.ovm-tip');
      if (chart && tip) {
        $$('[data-ovm]', chart).forEach(function (el) {
          var show = function (ev) {
            tip.textContent = el.getAttribute('data-ovm');
            tip.hidden = false;
            var r = chart.getBoundingClientRect();
            var x = ev.clientX - r.left + 10, y = ev.clientY - r.top - 28;
            if (x > r.width - 370) x = Math.max(0, r.width - 370);
            if (y < 0) y = 0;
            tip.style.left = x + 'px';
            tip.style.top = y + 'px';
          };
          el.addEventListener('mouseenter', show);
          el.addEventListener('mousemove', show);
          el.addEventListener('mouseleave', function () { tip.hidden = true; });
        });
      }
    }
    if (id === 'map') {
      var mq = $('#map-q');
      bindTextSearch(mq, state.map, 'q', 'map-q');
      var mt = $('#map-type'); if (mt) mt.addEventListener('change', function () { state.map.type = this.value; render(); });
      var ms = $('#map-status'); if (ms) ms.addEventListener('change', function () { state.map.status = this.value; render(); });
      var mp = $('#map-pri'); if (mp) mp.addEventListener('change', function () { state.map.pri = this.value; render(); });
      var md = $('#map-done'); if (md) md.addEventListener('change', function () { state.map.done = this.value; render(); });
      $$('.map-chip').forEach(function (chip) {
        chip.addEventListener('pointerdown', function (ev) {
          if (ev.button != null && ev.button !== 0) return;
          mapDrag = { id: chip.getAttribute('data-id'), type: chip.getAttribute('data-maptype'), x: ev.clientX, y: ev.clientY, moved: false, chip: chip };
          try { chip.setPointerCapture(ev.pointerId); } catch (e) {}
        });
      });
    }
    if (id === 'pool') {
      var q = $('#pool-q');
      bindTextSearch(q, state.pool, 'q', 'pool-q');
      var t = $('#pool-type'); if (t) t.addEventListener('change', function () { state.pool.type = this.value; render(); });
      var s = $('#pool-status'); if (s) s.addEventListener('change', function () { state.pool.status = this.value; render(); });
      var dn = $('#pool-done'); if (dn) dn.addEventListener('change', function () { state.pool.done = this.value; render(); });
      var p = $('#pool-pri'); if (p) p.addEventListener('change', function () { state.pool.priority = this.value; render(); });
      var pk = $('#pool-key'); if (pk) pk.addEventListener('change', function () { state.pool.key = this.value; render(); });
      $$('[data-poolsort]').forEach(function (b) {
        b.addEventListener('click', function () { state.pool.sort = this.getAttribute('data-poolsort'); render(); });
      });
    }
    if (id === 'key') {
      var kq = $('#key-q');
      bindTextSearch(kq, state.key, 'q', 'key-q');
      var kt = $('#key-type'); if (kt) kt.addEventListener('change', function () { state.key.type = this.value; render(); });
      var ks = $('#key-status'); if (ks) ks.addEventListener('change', function () { state.key.only = this.value; render(); });
      var kp = $('#key-pri'); if (kp) kp.addEventListener('change', function () { state.key.pri = this.value; render(); });
      var kd = $('#key-done'); if (kd) kd.addEventListener('change', function () { state.key.done = this.value; render(); });
      var km = $('#key-month'); if (km) km.addEventListener('change', function () { state.key.month = this.value; render(); });
      $$('[data-keysort]').forEach(function (b) {
        b.addEventListener('click', function () { state.key.sort = this.getAttribute('data-keysort'); render(); });
      });
    }
    if (id === 'outsource') {
      var oq = $('#out-q');
      bindTextSearch(oq, state.out, 'q', 'out-q');
      var ot = $('#out-type'); if (ot) ot.addEventListener('change', function () { state.out.type = this.value; render(); });
    }
    if (id === 'color') {
      var cq = $('#color-q');
      bindTextSearch(cq, state.color, 'q', 'color-q');
      var cs = $('#color-spu'); if (cs) cs.addEventListener('change', function () { state.color.spu = this.value; render(); });
      var cst = $('#color-status'); if (cst) cst.addEventListener('change', function () { state.color.status = this.value; render(); });
      var cd = $('#color-dept'); if (cd) cd.addEventListener('change', function () { state.color.dept = this.value; render(); });
    }
    if (id === 'wbs') {
      $$('[data-wbsproj]').forEach(function (b) {
        b.addEventListener('click', function () {
          state.wbs.proj = this.getAttribute('data-wbsproj');
          state.wbs.closed = {};
          render();
        });
      });
      $$('[data-wbsmode]').forEach(function (b) {
        b.addEventListener('click', function () {
          state.wbs.mode = this.getAttribute('data-wbsmode');
          if (state.wbs.mode === 'month' && !state.wbs.month) state.wbs.month = currentMonthKey();
          render();
        });
      });
      $$('[data-wbsdim]').forEach(function (b) {
        b.addEventListener('click', function () {
          var dim = this.getAttribute('data-wbsdim');
          state.wbs.mode = dim === 'month' ? 'month' : 'list';
          if (state.wbs.mode === 'month' && !state.wbs.month) state.wbs.month = currentMonthKey();
          render();
        });
      });
      $$('[data-wbsmonth]').forEach(function (b) {
        b.addEventListener('click', function () { state.wbs.month = this.getAttribute('data-wbsmonth'); render(); });
      });
      $$('[data-wbsonly]').forEach(function (b) {
        b.addEventListener('click', function () { state.wbs.only = this.getAttribute('data-wbsonly'); render(); });
      });
      $$('[data-wbsdone]').forEach(function (b) {
        b.addEventListener('click', function (ev) {
          ev.stopPropagation();
          var key = this.getAttribute('data-wbsdone');
          var nowDone = this.classList.contains('on') ? '未完成' : '已完成';
          var patch = { done: nowDone, actual: nowDone === '已完成' ? TODAY : null };
          setOV('wbs', key, patch);
          toast(nowDone === '已完成' ? '已标记完成（本地）' : '已恢复为未完成（本地）');
          var y = window.scrollY; render(); window.scrollTo(0, y);
        });
      });
      $$('[data-wbsstatus]').forEach(function (sel) {
        sel.addEventListener('click', function (ev) { ev.stopPropagation(); });
        sel.addEventListener('change', function (ev) {
          ev.stopPropagation();
          var key = this.getAttribute('data-wbsstatus');
          var want = this.value === 'notdo';
          var cur = null;
          D.wbs.forEach(function (w) {
            w.phases.forEach(function (ph) {
              ph.tasks.forEach(function (x) { if (x.taskKey === key) cur = taskEff(x); });
            });
          });
          if (cur && !!cur.notDo !== want) toggleNotDo(key);
          else { var y = window.scrollY; render(); window.scrollTo(0, y); }
        });
      });
      $$('[data-wbsactual]').forEach(function (inp) {
        inp.addEventListener('click', function (ev) { ev.stopPropagation(); });
        inp.addEventListener('change', function () {
          var key = this.getAttribute('data-wbsactual');
          var v = this.value.trim();
          if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) { toast('请输入 YYYY-MM-DD 格式的日期'); this.value = this.defaultValue; return; }
          setOV('wbs', key, { actual: v || null });
          if (v) setOV('wbs', key, { done: '已完成' });
          toast(v ? '实际完成日期已更新' : '已清除实际完成日期');
          var y2 = window.scrollY; render(); window.scrollTo(0, y2);
        });
      });
    }
  }

  function bindGlobal() {
    $$('.nav-item').forEach(function (b) {
      b.addEventListener('click', function () {
        location.hash = '#/' + this.getAttribute('data-nav');
      });
    });
    document.addEventListener('pointermove', function (ev) {
      if (!mapDrag) return;
      var dx = ev.clientX - mapDrag.x, dy = ev.clientY - mapDrag.y;
      if (!mapDrag.moved && Math.sqrt(dx * dx + dy * dy) < 5) return;
      mapDrag.moved = true;
      mapDrag.chip.classList.add('dragging');
      document.body.style.userSelect = 'none';
      var el = document.elementFromPoint(ev.clientX, ev.clientY);
      var cell = el && el.closest ? el.closest('.map-cell[data-month]') : null;
      $$('.map-cell.drop-hover').forEach(function (c) { c.classList.remove('drop-hover'); });
      if (cell && cell.getAttribute('data-maptype') === mapDrag.type) cell.classList.add('drop-hover');
    });
    document.addEventListener('pointerup', function (ev) {
      if (!mapDrag) return;
      var d = mapDrag; mapDrag = null;
      d.chip.classList.remove('dragging');
      document.body.style.userSelect = '';
      var el = document.elementFromPoint(ev.clientX, ev.clientY);
      var cell = el && el.closest ? el.closest('.map-cell[data-month]') : null;
      $$('.map-cell.drop-hover').forEach(function (c) { c.classList.remove('drop-hover'); });
      if (d.moved) {
        mapSuppressClick = true;
        setTimeout(function () { mapSuppressClick = false; }, 250);
        if (cell && cell.getAttribute('data-maptype') === d.type) moveMapChip(d.id, d.type, cell.getAttribute('data-month'));
      }
    });

    document.addEventListener('click', function (ev) {
      if (mapSuppressClick) { mapSuppressClick = false; ev.stopPropagation(); return; }
      var t = ev.target.closest('[data-act]');
      if (t) {
        var act = t.getAttribute('data-act');
        var id = t.getAttribute('data-id');
        if (act === 'open-pool') { openPool(id); }
        else if (act === 'open-key') { openKey(id); }
        else if (act === 'open-map') { openMap(t.getAttribute('data-type'), t.getAttribute('data-text')); }
        else if (act === 'open-out') { openOut(id); }
        else if (act === 'open-color') { openColor(id); }
        else if (act === 'goto-wbs') {
          state.wbs.proj = id; state.wbs.mode = 'list';
          closeDrawer();
          if (location.hash === '#/wbs') render(); else location.hash = '#/wbs';
        } else if (act === 'toggle-phase') {
          var ph = t.getAttribute('data-phase');
          state.wbs.closed[ph] = !state.wbs.closed[ph];
          var el = t.closest('.phase');
          if (el) el.classList.toggle('closed', state.wbs.closed[ph]);
        }         else if (act === 'close-drawer') { closeDrawer(); }
        else if (act === 'goto-pool') { location.hash = '#/pool'; }
        else if (act === 'reset-filters') {
          var sc = t.getAttribute('data-scope');
          if (sc === 'key') state.key = { q: '', type: '', pri: '', only: '', done: '', month: '', sort: 'risk' };
          else if (sc === 'map') state.map = { type: '', q: '', status: '', pri: '', done: '' };
          else if (sc === 'pool') state.pool = { q: '', type: '', status: '', priority: '', done: '', key: '', sort: 'risk' };
          render();
        }
        else if (act === 'goto-key') {
          state.key.only = t.getAttribute('data-keyonly') || '';
          state.key.done = t.getAttribute('data-keydone') || '';
          var mv = t.getAttribute('data-keymonth') || '';
          state.key.month = mv === 'current' ? currentMonthKey() : mv;
          if (location.hash === '#/key') render(); else location.hash = '#/key';
        }
        else if (act === 'add-pool') { openProjectForm('pool-add'); }
        else if (act === 'import-pool') { openImportPicker(); }
        else if (act === 'edit-pool') { openProjectForm('pool-edit', id); }
        else if (act === 'del-pool') { deletePoolProject(id); }
        else if (act === 'open-recycle') { openRecycle(); }
        else if (act === 'edit-key') { openProjectForm('key-edit', id); }
        else if (act === 'del-key') { deleteKeyProject(id); }
        

        else if (act === 'print') { window.print(); }
        $('#searchResults').hidden = true;
        ev.stopPropagation();
        return;
      }
      if (ev.target.closest('[data-nav]')) {
        ev.preventDefault();
        location.hash = '#/' + ev.target.closest('[data-nav]').getAttribute('data-nav');
        return;
      }
      if (!ev.target.closest('#searchWrap')) $('#searchResults').hidden = true;
    });

    $('#drawerMask').addEventListener('click', closeDrawer);
    $('#modalMask').addEventListener('click', function (ev) {
      if (ev.target.id === 'modalMask' || ev.target.closest('[data-modal-close]')) closeModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closeDrawer(); $('#searchResults').hidden = true; }
      if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
        e.preventDefault(); $('#globalSearch').focus();
      }
    });

    var gs = $('#globalSearch');
    gs.addEventListener('input', function () { doSearch(this.value); });
    gs.addEventListener('focus', function () { if (this.value.trim()) doSearch(this.value); });
    gs.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        var first = $('#searchResults .sr-item');
        if (first) first.click();
      }
    });
  }

  function buildSyncedHtml() {
    var out = JSON.parse(JSON.stringify(D));
    (out.wbs || []).forEach(function (w) {
      (w.phases || []).forEach(function (ph) {
        (ph.tasks || []).forEach(function (t) {
          var e = taskEff(t);
          t.done = e.done; t.actual = e.actual; t.start = e.start; t.end = e.end;
          t.days = e.days; t.notDo = !!e.notDo;
        });
      });
    });
    var doc = document.documentElement.cloneNode(true);
    var view = doc.querySelector('#view'); if (view) view.innerHTML = '';
    var db = doc.querySelector('#drawerBody'); if (db) db.innerHTML = '';
    var mb = doc.querySelector('#modalBody'); if (mb) mb.innerHTML = '';
    var dr = doc.querySelector('#drawer'); if (dr) dr.hidden = true;
    var dm = doc.querySelector('#drawerMask'); if (dm) dm.hidden = true;
    var mm = doc.querySelector('#modalMask'); if (mm) mm.hidden = true;
    var md = doc.querySelector('.modal'); if (md) md.classList.remove('wide');
    var toastEl = doc.querySelector('#toast'); if (toastEl) toastEl.hidden = true;
    var imp = doc.querySelector('#importFileInput'); if (imp && imp.parentNode) imp.parentNode.removeChild(imp);
    var html = '<!DOCTYPE html>\n' + doc.outerHTML;
    var json = JSON.stringify(out).replace(/<\/script/gi, '<\\/script');
    var start = html.indexOf('window.PM_DATA');
    var end = html.indexOf('</script>', start);
    if (start >= 0 && end >= 0) html = html.slice(0, start) + 'window.PM_DATA = ' + json + ';\n' + html.slice(end);
    return html;
  }

  var autoSyncCapable = Array.prototype.slice.call(document.scripts).some(function (s) { return !s.src && s.textContent.indexOf('window.PM_DATA') >= 0; });
  var fileDirHandle = null, fileDirAsked = false, fileWriteTimer = null;
  function saveDirHandle(h) {
    idbOpen().then(function (db) { db.transaction('kv', 'readwrite').objectStore('kv').put(h, 'dir'); }).catch(function () {});
  }
  function loadDirHandle() {
    return idbOpen().then(function (db) {
      return new Promise(function (resolve) {
        var rq = db.transaction('kv', 'readonly').objectStore('kv').get('dir');
        rq.onsuccess = function () { resolve(rq.result || null); };
        rq.onerror = function () { resolve(null); };
      });
    });
  }
  function writeLocalOverrides() {
    if (!fileDirHandle) return;
    var payload = { app: APP, ov: OV, ts: lastSaveTs };
    var js = 'window.PM_LOCAL_FILE = ' + JSON.stringify(payload).replace(/<\/script/gi, '<\\/script') + ';\n';
    fileDirHandle.getDirectoryHandle('data', { create: true }).then(function (d) {
      return d.getFileHandle('local_overrides.js', { create: true });
    }).then(function (fh) {
      return fh.createWritable();
    }).then(function (w) {
      return w.write(js).then(function () { return w.close(); });
    }).catch(function () {});
  }
  function scheduleFileSave() {
    if (location.protocol !== 'file:') return;
    if (fileWriteTimer) clearTimeout(fileWriteTimer);
    fileWriteTimer = setTimeout(function () { fileWriteTimer = null; if (fileDirHandle) writeLocalOverrides(); }, 300);
  }
  function askFileDirHandle() {
    if (location.protocol !== 'file:' || !window.showDirectoryPicker) return;
    fileDirAsked = true;
    try {
      window.showDirectoryPicker({ mode: 'readwrite' }).then(function (h) {
        fileDirHandle = h;
        saveDirHandle(h);
        toast('已开启自动保存，修改会写入网站目录');
        writeLocalOverrides();
      }).catch(function (err) {
        if (!err || err.name !== 'AbortError') fileDirAsked = false;
      });
    } catch (e) { fileDirAsked = false; }
  }
  function initFileSync() {
    if (location.protocol !== 'file:' || !window.showDirectoryPicker) return;
    loadDirHandle().then(function (h) {
      if (!h) return;
      fileDirHandle = h;
      h.queryPermission({ mode: 'readwrite' }).then(function (p) {
        if (p === 'granted') { writeLocalOverrides(); return; }
        document.addEventListener('pointerdown', function once() {
          h.requestPermission({ mode: 'readwrite' }).then(function (pp) {
            if (pp === 'granted') { fileDirHandle = h; writeLocalOverrides(); }
          });
        }, { once: true });
      }).catch(function () {});
    }).catch(function () {});
  }

  var autoSyncHandle = null, autoSyncAsked = false, autoSyncTimer = null, autoSyncBusy = false, autoSyncPending = false;
  function idbOpen() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open('pm_autosync', 1);
      req.onupgradeneeded = function () { req.result.createObjectStore('kv'); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }
  function saveHandleToIdb(h) {
    idbOpen().then(function (db) {
      var tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(h, 'handle');
    }).catch(function () {});
  }
  function loadHandleFromIdb() {
    return idbOpen().then(function (db) {
      return new Promise(function (resolve) {
        var tx = db.transaction('kv', 'readonly');
        var rq = tx.objectStore('kv').get('handle');
        rq.onsuccess = function () { resolve(rq.result || null); };
        rq.onerror = function () { resolve(null); };
      });
    });
  }
  function autoWrite() {
    if (!autoSyncHandle) return;
    if (autoSyncBusy) { autoSyncPending = true; return; }
    autoSyncBusy = true;
    var h = autoSyncHandle;
    h.queryPermission({ mode: 'readwrite' }).then(function (p) {
      if (p === 'granted') return p;
      return h.requestPermission({ mode: 'readwrite' });
    }).then(function (p) {
      if (p !== 'granted') { autoSyncBusy = false; return null; }
      return h.createWritable().then(function (w) {
        return w.write(buildSyncedHtml()).then(function () { return w.close(); });
      });
    }).then(function () {
      autoSyncBusy = false;
      if (autoSyncPending) { autoSyncPending = false; setTimeout(autoWrite, 200); }
    }).catch(function () { autoSyncBusy = false; });
  }
  function scheduleAutoSync() {
    if (autoSyncTimer) clearTimeout(autoSyncTimer);
    autoSyncTimer = setTimeout(function () { autoSyncTimer = null; autoWrite(); }, 500);
    if (!autoSyncHandle && !autoSyncAsked) askAutoSyncHandle();
  }
  function askAutoSyncHandle() {
    if (!autoSyncCapable || !window.showSaveFilePicker) return;
    autoSyncAsked = true;
    try {
      window.showSaveFilePicker({ suggestedName: '产品项目管理-同步版.html', types: [{ description: 'HTML', accept: { 'text/html': ['.html'] } }] }).then(function (h) {
        autoSyncHandle = h;
        saveHandleToIdb(h);
        toast('已开启自动同步，后续修改会自动写入该文件');
        autoWrite();
      }).catch(function (err) {
        if (!err || err.name !== 'AbortError') autoSyncAsked = false;
      });
    } catch (e) { autoSyncAsked = false; }
  }
  function initAutoSync() {
    if (!autoSyncCapable) return;
    window.addEventListener('pagehide', function () { if (autoSyncHandle) autoWrite(); });
    window.addEventListener('beforeunload', function () { if (autoSyncHandle) autoWrite(); });
    loadHandleFromIdb().then(function (h) {
      if (!h) {
        document.addEventListener('click', function once(ev) {
          if (autoSyncHandle || autoSyncAsked) return;
          var t = ev.target && ev.target.closest ? ev.target.closest('[data-act="add-pool"],[data-act="edit-pool"],[data-act="edit-key"],[data-act="del-pool"],[data-act="del-key"],[data-wbsdone],[data-wbsactual],[data-wbsstatus],[data-pooledit],[data-imp-save],#projForm button[type="submit"]') : null;
          if (t) askAutoSyncHandle();
        }, true);
        return;
      }
      autoSyncHandle = h;
      h.queryPermission({ mode: 'readwrite' }).then(function (p) {
        if (p !== 'granted') {
          document.addEventListener('pointerdown', function once() {
            h.requestPermission({ mode: 'readwrite' }).then(function (pp) { if (pp !== 'granted') autoSyncHandle = null; });
          }, { once: true });
        }
      }).catch(function () {});
    }).catch(function () {});
  }

  
  function updateNav() {
    var c = counts();
    $('#navCountPool').textContent = D.pool.length;
    $('#navCountMap').textContent = D.keyProjects.length;
    $('#navCountKey').textContent = c.keyActive.length;
    $('#navCountOut').textContent = c.outDoing.length;
    $('#navCountColor').textContent = c.colorDoing.length;
    $('#navCountOverview').textContent = '';
    $('#snapshotDate').textContent = fmt(D.meta.snapshot);
    $('#snapshotSource').textContent = D.meta.source;
    $('#footSource').textContent = D.meta.source;
    $('#todayText').textContent = fmt(TODAY);
  }

  /* ---------------- 启动 ---------------- */
  updateOvBadge();
  updateNav();
  bindGlobal();
  bootstrapOnline();
  initOnlineSync();
  if (onlineEnabled && !onlineReadOnly && localTs > Number((onlinePayload && onlinePayload.ts) || 0) && (localStorage.getItem(APP_KEY) || localStorage.getItem(OV_KEY))) scheduleOnlineSave();
  if (serverEnabled && serverPayload) { touchSave(); scheduleServerSave(); }

  window.addEventListener('pagehide', function () {
    if (!serverEnabled) return;
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(SERVER_API, new Blob([JSON.stringify({ app: APP, ov: OV, ts: lastSaveTs })], { type: 'application/json' }));
      }
    } catch (e) {}
  });
  if (!location.hash) location.hash = '#/overview';
  window.addEventListener('hashchange', render);
  render();
})();


