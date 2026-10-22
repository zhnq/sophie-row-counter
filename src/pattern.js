/* A configurable counting plan, not a complete knitting pattern. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SophiePattern = api;
})(this, function () {
  'use strict';
  var LEGACY_DEFAULTS = { name: '我的苏菲小围巾', mode: 'full', start: 6, max: 26, end: 6,
    interval: 8, firstInc: 8, firstDec: 8, center: 0, tail: 7, slip: 3, resume: 0,
    gaugeRows: 42, yarn: '', needle: '', incLead: 3, decLead: 3, incLayout: 'single', incFirst: 'start' };
  // Width and final plain rows come from the knitter's own pattern, not a guessed size.
  var DEFAULTS = Object.assign({}, LEGACY_DEFAULTS, { rules: 3, max: '', tail: '',
    incMethod: 'stitch', incSlant: 'right', incLead: 2, firstIncLead: 2, lastDecLead: 2,
    decLayout: 'follow', decFirst: 'start', finish: 'bindoff', gaugeStitches: 22, yarnColor: 'berry', turnAfterRow: 0 });
  var COLORS = [{key:'berry',name:'莓红',hex:'#ad596c'}, {key:'cream',name:'奶油',hex:'#e5d7ba'},
    {key:'oat',name:'燕麦',hex:'#b29a7d'}, {key:'blue',name:'雾蓝',hex:'#809fae'},
    {key:'moss',name:'苔绿',hex:'#778575'}, {key:'charcoal',name:'墨灰',hex:'#62646d'}];
  var MAX_ROWS = 4000;
  function integer(value, label, min, max) {
    if ((typeof value !== 'number' && typeof value !== 'string') ||
        (typeof value === 'string' && !value.trim()) || !Number.isInteger(Number(value)) || Number(value) < min || Number(value) > max)
      throw new Error(label + '须为 ' + min + '–' + max + ' 之间的整数');
    return Number(value);
  }
  function normalize(raw) {
    var p = Object.assign({}, DEFAULTS, raw);
    if (['full', 'increase', 'decrease'].indexOf(p.mode) < 0) throw new Error('请选择计数范围');
    if (['single', 'alternating'].indexOf(p.incLayout) < 0) throw new Error('请选择加针方式');
    if (['start', 'end'].indexOf(p.incFirst) < 0) throw new Error('请选择加针位置');
    if (['stitch', 'between'].indexOf(p.incMethod) < 0) throw new Error('请选择加针手法');
    if (['pattern', 'left', 'right'].indexOf(p.incSlant) < 0) throw new Error('请选择挑横线方向');
    if (['follow', 'single', 'alternating'].indexOf(p.decLayout) < 0) throw new Error('请选择减针方式');
    if (['start', 'end'].indexOf(p.decFirst) < 0) throw new Error('请选择首次减针位置');
    if (['none', 'bindoff'].indexOf(p.finish) < 0) throw new Error('请选择收针记录');
    p.rules = 3;
    p.name = String(p.name || '').trim().slice(0, 30) || DEFAULTS.name;
    ['start', 'max', 'end'].forEach(function (key) { p[key] = integer(p[key], {start:'起针数',max:'最宽针数',end:'结束针数'}[key], 6, 200); });
    p.interval = integer(p.interval, '间隔行数', 2, 40);
    p.firstInc = integer(p.firstInc, '首次加针行', 1, 100);
    p.firstDec = integer(p.firstDec, '减针段首次减针行', 1, 100);
    p.turnAfterRow = integer(p.turnAfterRow, '转折行号', 0, MAX_ROWS);
    ['center', 'tail'].forEach(function (key) { p[key] = integer(p[key], key === 'center' ? '中间平织行数' : '末尾平织行数', 0, 500); });
    p.slip = integer(p.slip, '末尾滑针数', 0, 5);
    var leadLabels = {incLead:'加针行首下针数', decLead:'减针行首下针数', firstIncLead:'首个加针行下针数', lastDecLead:'末次减针行下针数'};
    Object.keys(leadLabels).forEach(function (key) { p[key] = integer(p[key], leadLabels[key], 0, 199); });
    p.resume = integer(p.resume, '已连续完成行数', 0, MAX_ROWS);
    p.gaugeRows = Number(p.gaugeRows);
    if (!Number.isFinite(p.gaugeRows) || p.gaugeRows <= 0 || p.gaugeRows > 200) throw new Error('行密度须大于 0 且不超过 200');
    if ((typeof p.gaugeStitches !== 'number' && typeof p.gaugeStitches !== 'string') ||
        (typeof p.gaugeStitches === 'string' && !p.gaugeStitches.trim())) throw new Error('针密度须大于 0 且不超过 100');
    p.gaugeStitches = Number(p.gaugeStitches);
    if (!Number.isFinite(p.gaugeStitches) || p.gaugeStitches <= 0 || p.gaugeStitches > 100) throw new Error('针密度须大于 0 且不超过 100');
    if (!COLORS.some(function(color){return color.key === p.yarnColor;})) throw new Error('请选择围巾颜色');
    p.yarn = String(p.yarn || '').slice(0, 60); p.needle = String(p.needle || '').slice(0, 30);
    if (p.max <= p.start && p.mode !== 'decrease') throw new Error('最宽针数须大于起针数');
    if (p.max <= p.end && p.mode !== 'increase') throw new Error('最宽针数须大于结束针数');
    if (Math.min(p.start, p.end, p.max) < p.slip) throw new Error('滑针数不能超过行内针数');
    if (p.turnAfterRow) {
      if (p.mode !== 'full') throw new Error('转折记录只适用于整条围巾');
      var lastIncrease = p.firstInc + (p.max - p.start - 1) * p.interval;
      if (p.turnAfterRow < lastIncrease || p.turnAfterRow >= lastIncrease + p.interval) throw new Error('转折行号与最宽针数不一致');
    }
    if (p.mode === 'decrease' && p.decLayout === 'follow') p.decLayout = 'single';
    if (p.mode === 'increase') p.finish = 'none';
    return p;
  }
  // Fixed cloth sides, viewed in the first row's right-to-left orientation.
  // Turning the work changes start/end, but never renames the cloth edges.
  function fabricSide(edge) { return edge === 0 ? '左侧' : edge === 1 ? '右侧' : ''; }
  function operations(before, delta, p, position, lead, last, edge) {
    var result = [];
    function knit(n) { if (n > 0) result.push({ kind: 'knit', count: n, text: n + ' 下针' }); }
    if (!delta) knit(before - p.slip);
    else {
      var consumed = delta > 0 ? (p.incMethod === 'stitch' ? 1 : 0) : 2;
      // Never truncate knit counts to fit an invalid shaping position.
      if (before < lead + p.slip + consumed) throw new Error((delta > 0 ? '加针' : (last ? '末次减针' : '减针')) + '行的下针、变针和滑针超过 ' + before + ' 针，请核对下针数');
      knit(lead);
      var location = position === 'start' ? '行首' : '行尾';
      var middleCount = before - lead - p.slip - consumed;
      var changeAfter = position === 'end' ? lead + middleCount : lead;
      if (delta > 0 && p.incMethod === 'between' && (changeAfter < 1 || changeAfter >= before))
        throw new Error('挑横线加针须在两针之间，请核对加针前下针数和末尾滑针数');
      var increaseText = p.incMethod === 'stitch' ? '第 ' + (changeAfter + 1) + ' 针 +1' :
        changeAfter + '、' + (changeAfter + 1) + ' 针间 +1';
      var change = { kind: delta > 0 ? 'increase' : 'decrease',
        text: delta > 0 ? increaseText : location + '减针',
        note: delta > 0 ? location : '−1', consumed: consumed };
      if (delta > 0) { change.method = p.incMethod; change.slant = p.incMethod === 'between' ? p.incSlant : null; }
      var middle = { kind: 'knit', count: middleCount, text: middleCount + ' 下针' };
      if (position === 'end') { if (middleCount > 0) result.push(middle); result.push(change); }
      else { result.push(change); if (middleCount > 0) result.push(middle); }
    }
    if (p.slip) result.push({ kind: 'slip', count: p.slip, text: p.slip + ' 滑针' });
    return result;
  }
  function generate(raw) {
    var p = normalize(raw), rows = [], stitches = p.mode === 'decrease' ? p.max : p.start;
    var lastIncreaseEdge = null, decreaseAnchor = null;
    // Edge 0/1 is a fabric edge. Row direction changes after every row.
    function positionFor(id, edge) { return (edge ^ (id % 2)) ? 'end' : 'start'; }
    function add(phase, local, delta, changes, last) {
      var before = stitches, id = rows.length + 1, position = null, edge = null;
      var lead = delta > 0 ? (changes === 1 ? p.firstIncLead : p.incLead) : (last ? p.lastDecLead : p.decLead);
      if (delta > 0) {
        edge = (p.firstInc % 2) ^ (p.incFirst === 'end' ? 1 : 0) ^ (p.incLayout === 'alternating' ? (changes - 1) % 2 : 0);
        lastIncreaseEdge = edge;
      } else if (delta < 0) {
        if (decreaseAnchor === null) decreaseAnchor = p.decLayout === 'follow' ? lastIncreaseEdge : ((id % 2) ^ (p.decFirst === 'end' ? 1 : 0));
        var decAlternating = p.decLayout === 'alternating' || (p.decLayout === 'follow' && p.incLayout === 'alternating');
        edge = decreaseAnchor ^ (decAlternating ? (changes - 1) % 2 : 0);
      }
      if (delta) position = positionFor(id, edge);
      var segments = operations(before, delta, p, position, lead, last, edge);
      stitches += delta;
      rows.push({ id: id, phase: phase, local: local, before: before, stitches: stitches,
        increasePosition: delta > 0 ? position : null, decreasePosition: delta < 0 ? position : null, fabricEdge: edge,
        segments: segments, delta: delta, color: delta ? 'blue' : ((changes + (phase === '减针段' ? 1 : 0)) % 2 ? 'green' : 'yellow'),
        label: delta > 0 ? '加 1 针' : delta < 0 ? '减 1 针' : '针数不变',
        instruction: delta ? (position === 'start' ? '行首' : '行尾') + (delta > 0 ? '加针' : '减针') : (stitches - p.slip) + ' 下针',
        edge: p.slip ? '末尾 ' + p.slip + ' 滑针' : '无滑针提示' });
      if (rows.length > MAX_ROWS) throw new Error('表格超过 4000 行，请调整针数或间隔');
    }
    function taper(phase, count, first, direction) {
      var total = first + (count - 1) * p.interval, changes = 0;
      for (var r = 1; r <= total; r++) {
        var event = r >= first && (r - first) % p.interval === 0;
        if (event) changes++;
        add(phase, r, event ? direction : 0, changes, direction < 0 && event && changes === count);
      }
    }
    if (p.mode !== 'decrease') taper('加针段', p.max - p.start, p.firstInc, 1);
    while (rows.length < p.turnAfterRow) add('加针段', rows.length + 1, 0, p.max - p.start);
    if (p.mode === 'full') for (var c = 1; c <= p.center; c++) add('中间平织', c, 0, p.max - p.start);
    if (p.mode !== 'increase') taper('减针段', p.max - p.end, p.firstDec, -1);
    for (var t = 1; t <= p.tail; t++) add('末尾平织', t, 0, p.mode === 'increase' ? p.max - p.start : p.max - p.end + 1);
    if (p.finish === 'bindoff') {
      rows.push({id:rows.length + 1, phase:'收针', local:1, before:stitches, stitches:0, delta:0, color:'finish',
        increasePosition:null, decreasePosition:null, fabricEdge:null, label:'收针', instruction:'收 ' + stitches + ' 针',
        segments:[{kind:'bindoff', count:stitches, text:'收 ' + stitches + ' 针'}]});
    }
    if (rows.length > MAX_ROWS) throw new Error('表格超过 4000 行，请调整针数或间隔');
    if (p.resume > rows.length) throw new Error('已完成行数不能超过总行数 ' + rows.length);
    return { params: p, rows: rows, total: rows.length, estimatedLength: Math.round((rows.length - (p.finish === 'bindoff' ? 1 : 0)) / p.gaugeRows * 100) / 10 };
  }
  function progress(plan, completed) {
    var valid = {}, count = 0, contiguous = 0;
    (completed || []).forEach(function (id) { if (Number.isInteger(id) && id > 0 && id <= plan.total && !valid[id]) { valid[id] = true; count++; } });
    while (valid[contiguous + 1]) contiguous++;
    return { completed: Object.keys(valid).map(Number).sort(function(a,b){return a-b;}), count: count,
      contiguous: contiguous, current: contiguous < plan.total ? contiguous + 1 : null,
      percent: Math.round(count / plan.total * 100), gaps: count > contiguous };
  }
  function toggle(plan, completed, id) {
    if (!Number.isInteger(id) || id < 1 || id > plan.total) throw new Error('行号超出范围');
    var next = progress(plan, completed).completed, index = next.indexOf(id);
    if (index < 0) next.push(id); else next.splice(index, 1);
    return progress(plan, next);
  }
  function turnInfo(plan, completed) {
    if (!plan || !plan.params || !Array.isArray(plan.rows) ||
        (completed !== undefined && completed !== null && !Array.isArray(completed)) ||
        ['full', 'increase'].indexOf(plan.params.mode) < 0 || plan.params.turnAfterRow) return null;
    var p = progress(plan, completed), current = p.current ? plan.rows[p.current - 1] : null;
    if (!p.contiguous || !current || current.phase !== '加针段') return null;
    var row = plan.rows[p.contiguous - 1];
    if (!row || row.phase !== '加针段' || row.stitches <= plan.params.end) return null;
    var lastIncrease = null;
    for (var i = p.contiguous - 1; i >= 0; i--) {
      if (plan.rows[i].delta > 0) { lastIncrease = plan.rows[i]; break; }
    }
    if (!lastIncrease) return null;
    return {row:row.id, stitches:row.stitches, nextDecrease:lastIncrease.id + plan.params.interval,
      minFirstDecrease:row.id + 1, maxFirstDecrease:row.id + 100,
      removed:p.completed.filter(function(id){return id > row.id;})};
  }
  function operationSignature(row) {
    if (!Array.isArray(row.segments)) return null;
    var result = [];
    for (var i = 0; i < row.segments.length; i++) {
      var segment = row.segments[i], item = {kind:segment.kind};
      if (['knit', 'slip', 'bindoff'].indexOf(segment.kind) >= 0) {
        // Restored plans have explicit counts; old generated rows can still be compared.
        var match = String(segment.text || '').match(/^(?:滑 |收 )?(\d+) (?:下针|滑针|针)$/);
        item.count = segment.count === undefined && match ? Number(match[1]) : segment.count;
        if (!Number.isInteger(item.count) || item.count < 0) return null;
      } else if (segment.kind === 'increase' || segment.kind === 'decrease') {
        item.consumed = segment.consumed;
        if (segment.kind === 'increase') {
          item.method = segment.method || (segment.consumed === 1 ? 'stitch' : 'between');
          item.slant = item.method === 'between' ? (segment.slant || 'pattern') : null;
        }
      } else return null;
      var previous = result[result.length - 1];
      if (item.kind === 'knit' && previous && previous.kind === 'knit') previous.count += item.count;
      else result.push(item);
    }
    return result;
  }
  function sameRowOperations(oldRow, newRow) {
    if (!oldRow || !newRow) return false;
    var keys = ['id', 'before', 'stitches', 'delta', 'fabricEdge', 'increasePosition', 'decreasePosition'];
    if (keys.some(function(key){return oldRow[key] !== newRow[key];})) return false;
    var oldOperations = operationSignature(oldRow), newOperations = operationSignature(newRow);
    return oldOperations !== null && newOperations !== null && JSON.stringify(oldOperations) === JSON.stringify(newOperations);
  }
  function makeTurn(plan, completed, firstDecrease) {
    var info = turnInfo(plan, completed);
    if (!info) throw new Error('当前进度不能转入减针');
    var first = firstDecrease === undefined ? info.nextDecrease : integer(firstDecrease, '首次减针行', info.minFirstDecrease, info.maxFirstDecrease);
    var candidate = generate(Object.assign({}, plan.params, {mode:'full', max:info.stitches,
      turnAfterRow:info.row, center:0, firstDec:first - info.row, resume:info.row}));
    for (var i = 0; i < info.row; i++) {
      var old = plan.rows[i], next = candidate.rows[i];
      if (!sameRowOperations(old, next))
        throw new Error('转折会改变已织行，请核对计数表');
    }
    return {plan:candidate, completed:progress(plan, completed).completed.filter(function(id){return id <= info.row;}),
      removed:info.removed.slice(), anchor:info.row, firstDecrease:first};
  }
  function restore(saved) {
    if (!saved || saved.version !== 1 || !Array.isArray(saved.completed)) throw new Error('进度数据无法读取');
    var raw = saved.params;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('进度参数无法读取');
    if (raw.rules === undefined) {
      // Preserve every legacy row; migrate only operation details. Do not append a finishing row.
      raw = Object.assign({}, LEGACY_DEFAULTS, raw);
      raw = Object.assign({}, raw, {rules:3, incMethod:'stitch', decLayout:'follow', decFirst:'start', finish:'none',
        incLead:raw.incLead === null || raw.incLead === '' ? 2 : raw.incLead,
        decLead:raw.decLead === null || raw.decLead === '' ? 3 : raw.decLead,
        firstIncLead:Number(raw.start) === 6 && Number(raw.slip) === 3 ? 2 : (raw.incLead === null || raw.incLead === '' ? 2 : raw.incLead),
        lastDecLead:Number(raw.end) === 6 && Number(raw.slip) === 3 ? 2 : (raw.decLead === null || raw.decLead === '' ? 3 : raw.decLead)});
    } else if (raw.rules === 3) {
      if (!Object.prototype.hasOwnProperty.call(raw, 'turnAfterRow')) throw new Error('转折记录无法读取');
    } else if (raw.rules !== 2) throw new Error('织法版本无法读取');
    // Old M1 records did not select a lean. Preserve that distinction from a new default.
    if (!Object.prototype.hasOwnProperty.call(raw, 'incSlant')) raw = Object.assign({}, raw, {incSlant:'pattern'});
    var plan = generate(raw);
    return { plan: plan, progress: progress(plan, saved.completed) };
  }
  return { DEFAULTS: DEFAULTS, COLORS: COLORS, generate: generate, progress: progress, toggle: toggle, restore: restore,
    turnInfo:turnInfo, makeTurn:makeTurn, sameRowOperations:sameRowOperations, fabricSide:fabricSide };
});
