/* Draft-only recommendations. Opening saved settings never changes the row plan. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./pattern'));
  else root.SophieSettings = factory(root.SophiePattern);
})(this, function (pattern) {
  'use strict';
  var AUTO_KEYS = ['firstInc', 'end', 'firstDec', 'tail'];
  var NEW_WEAVE_DEFAULTS = {firstIncLead:2, incLead:3, decLead:3, lastDecLead:2, slip:3};
  var ANCHOR_KEYS = ['start', 'max', 'interval', 'firstInc', 'turnAfterRow'];
  var INACTIVE_KEYS = ['start','firstInc','firstIncLead','incLead','end','firstDec','decLead','lastDecLead','center'];
  var RANGES = {
    start:[6,200,'起针数'], max:[6,200,'最宽针数'], end:[6,200,'结束针数'], interval:[2,40,'间隔行数'],
    firstInc:[1,100,'首次加针行'], firstDec:[1,100,'首次减针行'], center:[0,500,'中间平织行数'],
    tail:[0,500,'平织行数'], slip:[0,5,'末尾滑针数'], firstIncLead:[0,199,'首个加针前下针数'],
    incLead:[0,199,'后续加针前下针数'], decLead:[0,199,'减针行首下针数'],
    lastDecLead:[0,199,'末次减针前下针数'], resume:[0,4000,'已连续完成行数'], turnAfterRow:[0,4000,'转折行号']
  };
  function number(value, min, max) {
    if ((typeof value !== 'number' && typeof value !== 'string') ||
        (typeof value === 'string' && !value.trim()) || !Number.isInteger(Number(value))) return null;
    var n = Number(value);
    return n >= min && n <= max ? n : null;
  }
  function val(draft, key) { var range = RANGES[key]; return number(draft[key], range[0], range[1]); }
  function own(obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); }
  function validGuidance(raw) { return raw && raw.version === 1 && raw.auto && typeof raw.auto === 'object' && !Array.isArray(raw.auto); }
  function stateCopy(state) {
    var copy = {version:1, auto:{}};
    if (state && state.weave === 'linked') copy.weave = 'linked';
    AUTO_KEYS.forEach(function(key) { copy.auto[key] = !!(state && state.auto && state.auto[key] === true); });
    if (state && own(state, 'firstDecrease')) copy.firstDecrease = state.firstDecrease;
    if (state && state.targets && typeof state.targets === 'object') {
      var targets = {};
      ['full','decrease'].forEach(function(mode) {
        if (own(state.targets, mode) && (typeof state.targets[mode] === 'string' || typeof state.targets[mode] === 'number')) targets[mode] = state.targets[mode];
      });
      if (Object.keys(targets).length) copy.targets = targets;
    }
    if (state && copy.weave !== 'linked' && state.decreaseModes && typeof state.decreaseModes === 'object') {
      var modes = {};
      ['full','decrease'].forEach(function(mode) {
        var saved = state.decreaseModes[mode];
        if (saved && ['follow','single','alternating'].indexOf(saved.layout) >= 0 && ['start','end'].indexOf(saved.first) >= 0)
          modes[mode] = {layout:saved.layout, first:saved.first};
      });
      if (Object.keys(modes).length) copy.decreaseModes = modes;
    }
    if (state && state.inactive && typeof state.inactive === 'object') {
      var inactive = {};
      INACTIVE_KEYS.forEach(function(key) {
        var value = state.inactive[key];
        if (own(state.inactive, key) && (value === null || ['number','string','boolean'].indexOf(typeof value) >= 0)) inactive[key] = value;
      });
      if (Object.keys(inactive).length) copy.inactive = inactive;
    }
    return copy;
  }
  function draftCopy(draft) {
    var copy = Object.assign({}, draft);
    if (draft.guidance) copy.guidance = stateCopy(draft.guidance);
    return copy;
  }
  function persist(draft, state) {
    draft.guidance = {version:1, auto:Object.assign({}, state.auto)};
    if (state.weave === 'linked') draft.guidance.weave = 'linked';
    if (state.targets && Object.keys(state.targets).length) draft.guidance.targets = Object.assign({}, state.targets);
    if (state.decreaseModes) draft.guidance.decreaseModes = stateCopy(state).decreaseModes;
    if (state.inactive && Object.keys(state.inactive).length) draft.guidance.inactive = Object.assign({}, state.inactive);
    return {draft:draft, state:state};
  }
  function rememberDecrease(state, mode, target) {
    if (mode !== 'full' && mode !== 'decrease') return;
    if (!state.targets) state.targets = {};
    state.targets[mode] = target;
  }
  function rememberDecreaseWeave(state, mode, draft) {
    if (state.weave === 'linked') return;
    if (mode !== 'full' && mode !== 'decrease') return;
    if (!state.decreaseModes) state.decreaseModes = {};
    state.decreaseModes[mode] = {layout:draft.decLayout, first:draft.decFirst};
  }
  function linkDecreaseWeave(draft, state) {
    state.weave = 'linked';
    delete state.decreaseModes;
    // A full table follows the last actual increase edge, including row parity.
    // A decrease-only table has no preceding increase event; use the retained
    // increase layout and its first row position as the source instead.
    draft.decLayout = draft.mode === 'decrease' ? draft.incLayout : 'follow';
    if (draft.mode === 'decrease') draft.decFirst = draft.incFirst;
  }
  function switchDecreaseWeave(draft, state, oldMode, nextMode) {
    if (state.weave === 'linked') { linkDecreaseWeave(draft, state); return; }
    rememberDecreaseWeave(state, oldMode, draft);
    // Increase-only hides these fields; retain its original full-scarf defaults
    // before entering a decrease-only table that cannot use "follow".
    if (oldMode === 'increase' && !(state.decreaseModes && state.decreaseModes.full))
      rememberDecreaseWeave(state, 'full', draft);
    var saved = state.decreaseModes && state.decreaseModes[nextMode];
    if (saved) { draft.decLayout = saved.layout; draft.decFirst = saved.first; }
    if (nextMode === 'decrease' && draft.decLayout === 'follow') draft.decLayout = 'single';
    rememberDecreaseWeave(state, nextMode, draft);
  }
  function hiddenKeys(mode) {
    if (mode === 'decrease') return ['start','firstInc','firstIncLead','incLead','center'];
    if (mode === 'increase') return ['end','firstDec','decLead','lastDecLead','center'];
    return [];
  }
  function restoreActiveInputs(draft, state) {
    if (!state.inactive) return;
    var hidden = hiddenKeys(draft.mode);
    Object.keys(state.inactive).forEach(function(key) {
      if (hidden.indexOf(key) >= 0) return;
      draft[key] = state.inactive[key];
      delete state.inactive[key];
    });
    if (!Object.keys(state.inactive).length) delete state.inactive;
  }
  function parkInactiveInputs(draft, state) {
    hiddenKeys(draft.mode).forEach(function(key) {
      if (val(draft, key) !== null) return;
      if (!state.inactive) state.inactive = {};
      // Keep invalid manual input for the mode where it can be corrected. The
      // generator still receives valid hidden numbers and keeps strict validation.
      state.inactive[key] = draft[key] === undefined ? null : draft[key];
      draft[key] = pattern.DEFAULTS[key];
    });
  }
  function lastIncrease(draft) {
    var start = val(draft, 'start'), max = val(draft, 'max'), first = val(draft, 'firstInc'), interval = val(draft, 'interval');
    if (start === null || max === null || max <= start || first === null || interval === null) return null;
    return first + (max - start - 1) * interval;
  }
  function anchor(draft) {
    var last = lastIncrease(draft), turn = val(draft, 'turnAfterRow'), interval = val(draft, 'interval');
    if (last === null || turn === null || (turn && (turn < last || turn >= last + interval))) return null;
    return Math.max(last, turn);
  }
  function firstDecrease(draft, state) {
    if (state && own(state, 'firstDecrease')) return state.firstDecrease;
    var first = val(draft, 'firstDec');
    if (draft.mode !== 'full') return first === null ? '' : first;
    var base = anchor(draft), center = val(draft, 'center');
    return base === null || first === null || center === null ? '' : base + center + first;
  }
  function recommendation(draft, key) {
    var interval = val(draft, 'interval'), first = val(draft, 'firstInc'), start = val(draft, 'start'), base = anchor(draft);
    if (key === 'firstInc') return draft.mode !== 'decrease' ? interval : null;
    if (key === 'end') return draft.mode === 'full' ? start : null;
    if (key === 'tail') return draft.mode === 'full' ? (first === null ? null : first - 1) : 0;
    if (key === 'firstDec') {
      if (draft.mode === 'increase' || interval === null) return null;
      return draft.mode === 'full' ? (base === null ? null : base + interval) : interval;
    }
    return null;
  }
  function setDecrease(draft, state, target) {
    var n = number(target, 1, 4000);
    if (draft.mode === 'full') {
      var base = anchor(draft), turned = val(draft, 'turnAfterRow'), limit = turned ? 100 : 600;
      if (n === null || base === null || n - base < 1 || n - base > limit) {
        state.firstDecrease = target;
        return false;
      }
      var gap = n - base;
      draft.firstDec = Math.min(gap, 100);
      draft.center = gap - draft.firstDec;
    } else {
      // A decrease-only table starts its own row count at 1.
      if (n === null || n > 100) { state.firstDecrease = target; return false; }
      draft.firstDec = n;
    }
    delete state.firstDecrease;
    return true;
  }
  function applyAutomatic(draft, state, changed, oldDecrease) {
    var next;
    if (state.auto.firstInc && draft.mode !== 'decrease' && ['interval','mode'].indexOf(changed) >= 0) {
      next = recommendation(draft, 'firstInc');
      if (next !== null) draft.firstInc = next;
    }
    if (state.auto.end && draft.mode === 'full' && ['start','mode'].indexOf(changed) >= 0) {
      next = recommendation(draft, 'end');
      if (next !== null) draft.end = next;
    }
    if (state.auto.tail && ['firstInc','interval','mode'].indexOf(changed) >= 0) {
      // An invalid interval must not cascade through a retained firstInc.
      if (changed !== 'interval' || val(draft, 'interval') !== null) {
        next = recommendation(draft, 'tail');
        if (next !== null) draft.tail = next;
      }
    }
    if (state.auto.firstDec && (ANCHOR_KEYS.indexOf(changed) >= 0 || changed === 'mode')) {
      next = recommendation(draft, 'firstDec');
      if (next !== null) {
        setDecrease(draft, state, next);
        if (draft.mode === 'full') { draft.center = 0; draft.firstDec = val(draft, 'interval'); }
      }
    } else if (!state.auto.firstDec && draft.mode === 'full' && ANCHOR_KEYS.indexOf(changed) >= 0 && oldDecrease !== '') {
      // Keep a manually chosen total row stable when its upstream anchor moves.
      rememberDecrease(state, 'full', oldDecrease);
      setDecrease(draft, state, oldDecrease);
    }
  }
  function init(raw, isNew) {
    var newWeave = isNew && !(raw && validGuidance(raw.guidance));
    var draft = Object.assign({}, pattern.DEFAULTS, newWeave ? NEW_WEAVE_DEFAULTS : {}, raw || {}), state = stateCopy(validGuidance(draft.guidance) ? draft.guidance : null);
    if (isNew && !validGuidance(draft.guidance)) {
      linkDecreaseWeave(draft, state);
      AUTO_KEYS.forEach(function(key) { state.auto[key] = true; });
      var interval = val(draft, 'interval'), start = val(draft, 'start');
      if (draft.mode !== 'decrease' && interval !== null) draft.firstInc = interval;
      if (draft.mode === 'full' && start !== null) draft.end = start;
      if (draft.mode === 'full' && val(draft, 'firstInc') !== null) draft.tail = val(draft, 'firstInc') - 1;
      else if (draft.mode !== 'full') draft.tail = 0;
      if (draft.mode !== 'increase' && interval !== null) { draft.firstDec = interval; if (draft.mode === 'full') draft.center = 0; }
    }
    if (!state.auto.firstDec && state.targets && own(state.targets, draft.mode)) {
      var storedTarget = state.targets[draft.mode], actual = firstDecrease(draft);
      // A hidden mode can retain an invalid manual target. Opening displays it
      // without rewriting the raw row plan; editing can then resolve the conflict.
      if (String(storedTarget) !== String(actual)) state.firstDecrease = storedTarget;
    }
    return persist(draft, state);
  }
  function change(rawDraft, rawState, key, value) {
    var draft = draftCopy(rawDraft), state = stateCopy(rawState), oldDecrease = firstDecrease(rawDraft, rawState);
    if (key === 'mode' && !state.auto.firstDec && (oldDecrease !== '' || (rawState && own(rawState, 'firstDecrease'))))
      rememberDecrease(state, rawDraft.mode, oldDecrease);
    if (key === 'firstDecrease') {
      state.auto.firstDec = false;
      rememberDecrease(state, draft.mode, value);
      setDecrease(draft, state, value);
    } else {
      draft[key] = value;
      if (AUTO_KEYS.indexOf(key) >= 0) state.auto[key] = false;
      if (key === 'center' && draft.mode === 'full') state.auto.firstDec = false;
      if (key === 'incLayout' || key === 'incFirst') linkDecreaseWeave(draft, state);
      if (key === 'mode' && value !== rawDraft.mode) switchDecreaseWeave(draft, state, rawDraft.mode, value);
      if (key === 'decLayout' || key === 'decFirst') rememberDecreaseWeave(state, draft.mode, draft);
      if (key === 'mode' || key === 'firstDec' || key === 'center') delete state.firstDecrease;
      if (key === 'mode' && value !== rawDraft.mode) restoreActiveInputs(draft, state);
      applyAutomatic(draft, state, key, oldDecrease);
      if (key === 'mode' && !state.auto.firstDec && state.targets && own(state.targets, draft.mode))
        setDecrease(draft, state, state.targets[draft.mode]);
      if (key === 'firstDec' && !state.auto.firstDec) rememberDecrease(state, draft.mode, firstDecrease(draft, state));
      if (key === 'center' && draft.mode === 'full') {
        var editedDecrease = firstDecrease(draft, state);
        rememberDecrease(state, 'full', editedDecrease);
        if (editedDecrease === '') state.firstDecrease = '';
      }
      if (key === 'mode' && value !== rawDraft.mode) parkInactiveInputs(draft, state);
    }
    return persist(draft, state);
  }
  function adopt(rawDraft, rawState, displayKey) {
    var draft = draftCopy(rawDraft), state = stateCopy(rawState), key = displayKey === 'firstDecrease' ? 'firstDec' : displayKey;
    if (AUTO_KEYS.indexOf(key) < 0) return persist(draft, state);
    var next = recommendation(draft, key);
    if (next === null) return persist(draft, state);
    state.auto[key] = true;
    if (key === 'firstDec') {
      delete state.targets;
      setDecrease(draft, state, next);
      if (draft.mode === 'full') { draft.center = 0; draft.firstDec = val(draft, 'interval'); }
    } else {
      var oldDecrease = firstDecrease(draft, state);
      draft[key] = next;
      applyAutomatic(draft, state, key, oldDecrease);
    }
    return persist(draft, state);
  }
  function listEvents(first, count, interval) {
    var result = [], show = Math.min(count, 4);
    for (var i = 0; i < show; i++) result.push(first + i * interval);
    if (count > show) result.push('…', first + (count - 1) * interval);
    return result.join('、');
  }
  function feedback(rawDraft, state) {
    var draft = Object.assign({}, pattern.DEFAULTS, rawDraft), hints = {}, errors = {}, suggestions = {};
    var mode = draft.mode, start = val(draft, 'start'), max = val(draft, 'max'), end = val(draft, 'end');
    var first = val(draft, 'firstInc'), interval = val(draft, 'interval'), tail = val(draft, 'tail'), slip = val(draft, 'slip');
    var last = lastIncrease(draft), base = anchor(draft), decrease = firstDecrease(draft, state), dec = number(decrease, 1, 4000);
    var currentState = stateCopy(state || draft.guidance);
    Object.keys(RANGES).forEach(function(key) {
      // Hidden segment inputs keep their existing values but are not editing targets.
      if (key === 'firstDec' || key === 'center' || (mode === 'decrease' && ['start','firstInc','firstIncLead','incLead'].indexOf(key) >= 0) ||
          (mode === 'increase' && ['end','decLead','lastDecLead'].indexOf(key) >= 0)) return;
      if (draft[key] === '' || draft[key] === null || draft[key] === undefined) return;
      var range = RANGES[key];
      if (val(draft, key) === null) errors[key] = range[2] + '须为 ' + range[0] + '–' + range[1] + ' 的整数';
    });
    if (mode !== 'decrease' && start !== null && max !== null && max <= start) errors.max = '最宽针数须大于起针数';
    if (mode !== 'increase' && end !== null && max !== null && max <= end) errors.end = '结束针数须小于最宽针数';
    if (val(draft, 'turnAfterRow') && last !== null && base === null) errors.turnAfterRow = '转折行号与最宽针数不一致';
    if (mode !== 'increase') {
      if (state && own(state, 'firstDecrease') && dec === null) errors.firstDecrease = String(decrease).trim() ? '首次减针行须为整数' : '请填写首次减针行';
      else if (mode === 'decrease' && dec !== null && dec > 100) errors.firstDecrease = '首次减针行须为 1–100 的整数';
      else if (mode === 'full' && base !== null && dec !== null) {
        // Older valid turned records could store a separate center wait. Leave it
        // readable until the total row is explicitly edited; new edits still use 100.
        var legacyWait = val(draft, 'center') > 0 && !(state && own(state, 'firstDecrease'));
        var maximum = base + (val(draft, 'turnAfterRow') && !legacyWait ? 100 : 600);
        if (dec <= base) errors.firstDecrease = '还未到最宽处，首次减针最早第 ' + (base + 1) + ' 行';
        else if (dec > maximum) errors.firstDecrease = '首次减针最晚第 ' + maximum + ' 行';
      }
    }
    AUTO_KEYS.forEach(function(key) {
      if (currentState.auto[key]) return;
      var proposed = recommendation(draft, key);
      if (proposed !== null) suggestions[key === 'firstDec' ? 'firstDecrease' : key] = proposed;
    });
    hints.mode = mode === 'increase' ? '只记录加针段，从第 1 行开始。' : mode === 'decrease' ? '从最宽针数开始减针，行号从 1 开始。' : '记录加针、减针与收尾。';
    if (start !== null && mode !== 'decrease') hints.start = '由 ' + start + ' 针开始。';
    if (max !== null) {
      if (mode === 'decrease') hints.max = '由 ' + max + ' 针开始减针。';
      else if (start !== null && max > start) hints.max = '从 ' + start + ' 针加到 ' + max + ' 针，共加 ' + (max - start) + ' 次。';
    }
    if (interval !== null) hints.interval = '相邻两次' + (mode === 'increase' ? '加针' : mode === 'decrease' ? '减针' : '加针或减针') + '相隔 ' + interval + ' 行。';
    if (first !== null && mode !== 'decrease') {
      hints.firstInc = '前 ' + (first - 1) + ' 行不加针，第 ' + first + ' 行加第一针。';
      if (interval !== null && start !== null && max !== null && max > start)
        hints.firstInc += ' 加针行：' + listEvents(first, max - start, interval) + '。';
    }
    if (end !== null && mode !== 'increase') hints.end = '减针结束时保留 ' + end + ' 针。';
    if (mode === 'full' && base !== null && dec !== null && !errors.firstDecrease)
      hints.firstDecrease = '第 ' + base + ' 行' + (val(draft, 'turnAfterRow') ? '转折' : '到 ' + max + ' 针') + '；再平织 ' + (dec - base - 1) + ' 行，第 ' + dec + ' 行减针。';
    if (mode === 'decrease' && dec !== null && !errors.firstDecrease)
      hints.firstDecrease = '前 ' + (dec - 1) + ' 行不减针，第 ' + dec + ' 行减第一针。';
    if (mode === 'full' && base === null && !errors.firstDecrease)
      hints.firstDecrease = '填好针数和首次加针行后，自动计算。';
    if (tail !== null) {
      hints.tail = (mode === 'increase' ? '最后一次加针' : '最后一次减针') + '后再织 ' + tail + ' 行' +
        (mode !== 'increase' && draft.finish === 'bindoff' ? '，再收针。' : '，再结束记录。');
      if (mode === 'full' && first !== null) hints.tail += ' 开头平织 ' + (first - 1) + ' 行，末尾 ' + tail + ' 行。';
    }
    var resume = val(draft, 'resume');
    if (resume !== null) hints.resume = '从第 ' + (resume + 1) + ' 行继续。';
    hints.incLayout = draft.incLayout === 'alternating' ? '两条布边交替，每个加针行共加 1 针。' : '固定同一条布边，每次加 1 针。';
    hints.incMethod = draft.incMethod === 'between' ? '在相邻两针之间挑横线加 1 针。' : '在同一针上织出两针。';
    hints.incSlant = '针目倾斜方向，与加针在哪条布边分别选择。';
    hints.incFirst = '第一次加针在' + (draft.incFirst === 'end' ? '末尾滑针前。' : '这一行开头。');
    hints.firstIncLead = '首个加针位于行首时，先织的下针数。';
    hints.incLead = '后续加针位于行首时，先织的下针数。';
    hints.decLayout = draft.decLayout === 'follow' ? '从最后加针的布边开始，沿用单侧或交替。' : draft.decLayout === 'alternating' ? '两条布边交替，每个减针行共减 1 针。' : '固定同一条布边，每次减 1 针。';
    hints.decFirst = '首次减针在' + (draft.decFirst === 'end' ? '末尾滑针前。' : '这一行开头。');
    hints.decLead = '减针位于行首时，先织的下针数。';
    hints.lastDecLead = '最后一次减针位于行首时，先织的下针数。';
    if (slip !== null) hints.slip = '每行末尾 ' + slip + ' 针滑过不织。';
    hints.gaugeRows = '小样每 10 cm 的行数，只影响尺寸估算。';
    hints.gaugeStitches = '小样每 10 cm 的针数，只影响尺寸估算。';
    hints.finish = draft.finish === 'bindoff' ? '最后多记 1 行收针。' : '表格不另记收针行。';
    var firstLead = val(draft, 'firstIncLead'), lead = val(draft, 'incLead'), consumed = draft.incMethod === 'stitch' ? 1 : 0;
    if (mode !== 'decrease' && start !== null && max !== null && max > start && slip !== null) {
      if (firstLead !== null && start < firstLead + slip + consumed)
        errors.firstIncLead = start + ' 针放不下这些下针、加针和滑针；加针前最多 ' + Math.max(0,start - slip - consumed) + ' 下针。';
      if (max - start > 1 && lead !== null && start + 1 < lead + slip + consumed)
        errors.incLead = '后续加针前下针数过多，请核对最早一次加针行。';
      if (draft.incMethod === 'between' && first !== null && interval !== null &&
          ['start','end'].indexOf(draft.incFirst) >= 0 && ['single','alternating'].indexOf(draft.incLayout) >= 0) {
        for (var event = 0; event < Math.min(max - start, 3); event++) {
          var atEnd = (draft.incFirst === 'end' ? 1 : 0) ^ ((event * interval) % 2) ^
            (draft.incLayout === 'alternating' ? event % 2 : 0);
          var positionLead = event === 0 ? firstLead : lead, positionKey = event === 0 ? 'firstIncLead' : 'incLead';
          if (!atEnd && positionLead === 0) errors[positionKey] = '行首挑横线加针前至少织 1 下针。';
          if (atEnd && slip === 0) errors.slip = '行尾挑横线加针后须保留原针，请核对末尾滑针数。';
        }
      }
    }
    var decLead = val(draft, 'decLead'), lastLead = val(draft, 'lastDecLead');
    if (mode !== 'increase' && end !== null && max !== null && max > end && slip !== null) {
      if (lastLead !== null && end + 1 < lastLead + slip + 2)
        errors.lastDecLead = '末次减针前下针数过多；最多 ' + Math.max(0,end - slip - 1) + ' 下针。';
      if (max - end > 1 && decLead !== null && end + 2 < decLead + slip + 2)
        errors.decLead = '减针前下针数过多，请核对减针行。';
    }
    var result = {hints:hints, errors:errors, suggestions:suggestions, firstDecrease:decrease};
    if (!Object.keys(errors).length) {
      try {
        result.plan = pattern.generate(draft);
        hints.finish = '共 ' + result.plan.total + ' 行' + (result.plan.params.finish === 'bindoff' ? '，含最后 1 行收针。' : '。');
        if (resume === result.plan.total) hints.resume = '已完成全部 ' + result.plan.total + ' 行。';
      } catch (error) {
        var message = String(error.message || error);
        if (message.indexOf('4000') >= 0) errors.total = message;
        else if (message.indexOf('已完成行数') >= 0) errors.resume = message;
        // Missing inputs remain quiet until the user asks to preview; the normal generator reports them then.
      }
    }
    return result;
  }
  return {init:init, change:change, adopt:adopt, feedback:feedback};
});
