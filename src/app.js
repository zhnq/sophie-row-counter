(function () {
  'use strict';
  var app = window.SophieCounter, container = document.getElementById('app');
  var offsets = [], heights = [], totalHeight = 0, topSpace = 0, bottomSpace = 0, scrollFrame = 0, viewedRow = 1, rowMotionFrame = 0;
  function escape(value) {
    return String(value === undefined || value === null ? '' : value).replace(/[&<>"']/g, function (c) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function button(action, text, cls, disabled) {
    return '<button type="button" data-action="' + action + '" class="' + (cls || '') + '"' + (disabled || app.data.busy || app.data.loading ? ' disabled' : '') + '>' + escape(text) + '</button>';
  }
  function projectButton(action, id, text, cls, disabled, label, role) {
    return '<button type="button" data-action="' + action + '" data-id="' + escape(id) + '" class="' + (cls || '') + '"' + (label ? ' aria-label="' + escape(label) + '"' : '') + (role ? ' role="' + role + '"' : '') + (disabled || app.data.busy || app.data.loading ? ' disabled' : '') + '>' + escape(text) + '</button>';
  }
  function homeHTML(d) {
    var scarves = d.scarves || [];
    var s = '<div class="screen"><section class="home-page"><header class="home-heading"><h1>我的围巾</h1><span class="library-count">' + scarves.length + ' / 3 条</span></header>';
    if (d.libraryError) s += '<div class="home-notice"><div class="error" role="alert">' + escape(d.libraryError) + '</div>' + button('retryLibrary','重新读取','library-retry') + '</div>';
    if (d.error && d.error !== d.libraryError) s += '<div class="home-notice"><div class="error" role="alert">' + escape(d.error) + '</div></div>';
    s += '<div class="scarf-list" aria-label="已保存的围巾">';
    if (d.loading) s += '<p class="library-status" role="status">读取中…</p>';
    if (!scarves.length && !d.loading && !d.libraryError) s += '<div class="library-empty"><p>还没有围巾</p></div>';
    scarves.forEach(function(item, i){
      s += '<article class="scarf-entry' + (i === 0 ? ' recent' : '') + (item.broken ? ' broken' : '') + (item.status === 'complete' ? ' scarf-complete' : '') + '" data-scarf="' + escape(item.id) + '"><div class="scarf-heading"><h2 title="' + escape(item.name) + '">' + escape(item.name) + '</h2>';
      if (item.status === 'complete') s += '<span class="completion-badge"><span class="badge-check" aria-hidden="true">✓</span>' + escape(item.completionBadge) + '</span>';
      s += '<button type="button" class="text-button scarf-more" data-action="toggleHomeMenu" data-id="' + escape(item.id) + '" aria-label="' + escape(item.name) + '更多操作" aria-haspopup="menu" aria-expanded="' + (d.homeMenuId === item.id) + '"' + (d.busy || d.loading ? ' disabled' : '') + '>⋯</button>';
      if (d.homeMenuId === item.id) {
        s += '<div class="scarf-menu" role="menu">' + projectButton('openScarfSettings',item.id,'围巾设置','',item.broken,null,'menuitem') + projectButton('deleteScarf',item.id,'删除围巾','danger',false,null,'menuitem') + '</div>';
      }
      s += '</div>';
      if (item.broken) s += '<div class="scarf-unreadable">记录无法读取</div>';
      else s += '<canvas class="scarf-thumbnail" data-preview-id="' + escape(item.id) + '" role="img" aria-label="' + escape(item.name) + '，围巾形状示意">围巾形状示意</canvas>';
      s += '<div class="scarf-footer"><span class="scarf-progress">' + escape(item.status === 'complete' ? item.count + ' / ' + item.total + ' 行' : item.progressText || '') + '</span>';
      s += item.broken ? button('retryLibrary','重试','scarf-continue') : projectButton('openScarf',item.id,item.current ? '继续织' : '查看记录','scarf-continue' + (i === 0 && item.current ? ' primary' : ''));
      s += '</div></article>';
    });
    s += '</div><footer class="home-actions">' + button(scarves.length >= 3 ? 'openManage' : 'startNew',scarves.length >= 3 ? '管理围巾' : scarves.length ? '新建围巾' : '开始一条围巾','primary',!!d.libraryError);
    return s + '<p class="privacy">进度仅保存在本机。</p></footer></section></div>' + (d.manageOpen || d.switchOpen ? librarySheetHTML(d) : '');
  }
  function librarySheetHTML(d) {
    var manage = !!d.manageOpen, close = manage ? 'closeManage' : 'closeSwitch';
    var title = manage ? '管理围巾' : '切换围巾';
    var s = '<div class="library-overlay" data-close-action="' + close + '"><section class="library-sheet" role="dialog" aria-modal="true" aria-labelledby="library-title" tabindex="-1"><div class="turn-heading"><h1 id="library-title">' + title + '</h1><button type="button" class="text-button turn-close" data-action="' + close + '" aria-label="关闭' + title + '"' + (d.busy ? ' disabled' : '') + '>×</button></div>';
    if (manage) s += '<p class="library-hint">最多保存 3 条围巾</p>';
    if (d.error) s += '<div class="error" role="alert">' + escape(d.error) + '</div>';
    (d.scarves || []).forEach(function(item){
      var color = item.params && window.SophiePattern.COLORS.filter(function(c){return c.key === item.params.yarnColor;})[0];
      var detail = item.broken ? '记录无法读取' : item.progressText;
      if (manage) {
        s += '<div class="library-item"><div class="library-item-copy"><strong>' + escape(item.name) + '</strong><span>' + escape(detail) + '</span></div>' + projectButton('deleteScarf',item.id,'删除','delete-button',false,'删除' + item.name) + '</div>';
      } else {
        s += '<button type="button" class="library-switch-item" data-action="openScarf" data-id="' + escape(item.id) + '"' + (item.broken || d.busy ? ' disabled' : '') + '>';
        if (color) s += '<span class="library-color" style="background:' + color.hex + '" aria-hidden="true"></span>';
        s += '<span class="library-item-copy"><strong>' + escape(item.name) + (item.id === d.activeId ? '<small>当前</small>' : '') + '</strong><span>' + escape(detail) + '</span></span></button>';
      }
    });
    return s + '</section></div>';
  }
  function drawHome() {
    var canvases = container.querySelectorAll('[data-preview-id]');
    Array.prototype.forEach.call(canvases,function(canvas){
      var id = canvas.getAttribute('data-preview-id');
      var item = (app.data.scarves || []).filter(function(scarf){return scarf.id === id;})[0];
      if (item && item.plan) window.SophiePreview.draw(canvas,item.plan);
    });
  }
  function input(key, value, numeric, max, label, readonly) {
    return '<input aria-label="' + escape(label || {name:'围巾名称',yarn:'线材备注',needle:'针号备注'}[key] || key) + '" data-key="' + key + '" type="' + (numeric ? 'number' : 'text') + '"' + (numeric ? ' inputmode="numeric"' : '') + ' value="' + escape(value) + '"' + (max ? ' maxlength="' + max + '"' : '') + (readonly ? ' readonly' : '') + '>';
  }
  var settingFeedback, folds = {}, settingsInputActive = false;
  var settingNames = {mode:'计数范围',start:'起针数',max:'最宽针数',end:'结束针数',interval:'加减针间隔（行）',firstInc:'首次加针行',firstDecrease:'首次减针行',tail:'减针后平织行数',incMethod:'加针手法',incSlant:'针目倾斜',incLayout:'加针方式',incFirst:'首次加针位置',firstIncLead:'首个加针前下针数',incLead:'后续加针前下针数',decLayout:'减针方式',decFirst:'首次减针位置',decLead:'减针行首下针数',lastDecLead:'末次减针行首下针数',slip:'末尾滑针数',gaugeRows:'每 10 cm 行数',gaugeStitches:'每 10 cm 针数',finish:'收针记录',resume:'已连续完成行数'};
  function feedback() { return window.SophieSettings.feedback(app.data.draft, app.data.guidance); }
  function helpButton(key, label) {
    return '<button type="button" class="setting-help" data-help="' + key + '" aria-label="了解' + escape(label || settingNames[key]) + '" aria-haspopup="dialog">?</button>';
  }
  function autoKey(key) { return key === 'firstDecrease' ? 'firstDec' : key; }
  function metaHTML(key, fb) {
    if (key === 'end' && app.data.draft.mode !== 'full') return '';
    var state = app.data.guidance, automatic = state && state.auto && state.auto[autoKey(key)];
    var sources = {firstInc:'跟随间隔',end:'与起针相同',firstDecrease:app.data.draft.mode === 'decrease' ? '跟随间隔' : '跟随加针节奏',tail:app.data.draft.mode === 'full' ? '首尾平织相同' : '默认平织行数'};
    if (app.fixedInput(autoKey(key)) || !sources[key]) return '';
    if (automatic) return '<span class="auto-source">' + sources[key] + '</span>';
    var suggestion = fb.suggestions[key];
    if (suggestion === undefined || suggestion === null) return '';
    var current = key === 'firstDecrease' ? fb.firstDecrease : app.data.draft[key];
    return '<span>' + (String(current) === String(suggestion) ? '已手动设置' : '建议 ' + escape(suggestion)) + '</span><button type="button" class="adopt-suggestion" data-adopt="' + key + '">' + (String(current) === String(suggestion) ? '跟随建议' : '采用建议') + '</button>';
  }
  function fieldNotes(key, fb) {
    return '<div class="field-hint" id="hint-' + key + '">' + escape(fb.hints[key] || '') + '</div><div class="field-link" id="meta-' + key + '">' + metaHTML(key, fb) + '</div><div class="field-error" id="error-' + key + '">' + escape(fb.errors[key] || '') + '</div>';
  }
  function field(item) {
    var key = item.key, fb = settingFeedback, label = item.label || settingNames[key];
    if (key === 'firstDecrease' && app.data.draft.mode === 'full') label = '首次减针行（整条）';
    if (key === 'tail' && app.data.draft.mode === 'increase') label = '加针后平织行数';
    var locked = app.fixedInput(key), value = key === 'firstDecrease' ? fb.firstDecrease : app.data.draft[key];
    var range = {start:[6,200],max:[6,200],end:[6,200],interval:[2,40],firstInc:[1,100],tail:[0,500],resume:[0,4000],firstIncLead:[0,199],incLead:[0,199],decLead:[0,199],lastDecLead:[0,199],slip:[0,5],gaugeRows:[0.1,200],gaugeStitches:[0.1,100]}[key];
    return '<div class="field guided-field" data-setting="' + key + '"><div class="field-top"><div class="field-title"><label class="field-label" for="setting-' + key + '">' + escape(label) + '</label>' + helpButton(key,label) + '</div><input id="setting-' + key + '" aria-label="' + escape(label) + '" aria-describedby="hint-' + key + ' meta-' + key + ' error-' + key + '" aria-invalid="' + !!fb.errors[key] + '" data-key="' + key + '" type="number" inputmode="' + (key.indexOf('gauge') === 0 ? 'decimal' : 'numeric') + '"' + (range ? ' min="' + range[0] + '" max="' + range[1] + '"' : '') + ' step="' + (key.indexOf('gauge') === 0 ? 'any' : '1') + '" value="' + escape(value) + '"' + (locked ? ' readonly' : '') + '></div>' + fieldNotes(key,fb) + '</div>';
  }
  function select(action, label, options, index, disabledFirst, key) {
    key = key || {onMode:'mode',onMethod:'incMethod',onSlant:'incSlant',onLayout:'incLayout',onPosition:'incFirst',onDecLayout:'decLayout',onDecPosition:'decFirst',onFinish:'finish'}[action];
    var locked = app.fixedInput(key);
    return '<div class="field guided-field" data-setting="' + key + '"><div class="field-title"><label class="field-label" for="setting-' + key + '">' + escape(label) + '</label>' + helpButton(key,label) + '</div><select id="setting-' + key + '" data-change="' + action + '" aria-describedby="hint-' + key + ' error-' + key + '"' + (locked ? ' disabled' : '') + '>' + options.map(function (option, i) {
      return '<option value="' + i + '"' + (i === index ? ' selected' : '') + (disabledFirst && i === 0 ? ' disabled' : '') + '>' + escape(option) + '</option>';
    }).join('') + '</select>' + fieldNotes(key,settingFeedback) + '</div>';
  }
  function colorHTML(d) {
    return '<div class="color-options" role="group" aria-label="围巾颜色">' + d.colorOptions.map(function(color){
      var selected = color.key === d.draft.yarnColor;
      return '<button type="button" class="color-option' + (selected ? ' selected' : '') + '" data-color="' + color.key + '" aria-pressed="' + selected + '" aria-label="' + color.name + '"><span class="color-dot" aria-hidden="true" style="background:' + color.hex + '">' + (selected ? '✓' : '') + '</span><span>' + color.name + '</span></button>';
    }).join('') + '</div>';
  }
  function setupHTML(d) {
    settingFeedback = feedback();
    var s = '<div class="screen"><section class="setup"><h1 class="title">' + (d.editing ? '围巾设置' : '新建围巾') + '</h1>';
    if (d.draft.turnAfterRow > 0) s += '<div class="turn-status">第 ' + d.draft.turnAfterRow + ' 行织完后转折，已织参数固定。</div>';
    s += '<p class="setup-intro">按织图填写，起针不计行。</p><div class="form-card">' + select('onMode', '计数范围', d.modeOptions, d.modeIndex) + '</div>';
    s += '<section class="setup-group"><h2>针数</h2><div class="form-card">';
    if (d.draft.mode !== 'decrease') s += field({key:'start'});
    s += field({key:'max'});
    if (d.draft.mode === 'decrease') s += field({key:'end'});
    s += '</div></section><section class="setup-group"><h2>' + (d.draft.mode === 'decrease' ? '减针节奏' : '加针节奏') + '</h2><div class="form-card">' + field({key:'interval'});
    if (d.draft.mode !== 'decrease') s += field({key:'firstInc'});
    else s += field({key:'firstDecrease'});
    s += '</div></section>';
    if (d.draft.mode !== 'decrease') {
      s += '<section class="setup-group"><h2>加针怎么织</h2><div class="form-card">';
      s += select('onLayout', '加针方式', d.layoutOptions, d.layoutIndex);
      s += select('onMethod', '加针手法', d.methodOptions, d.methodIndex);
      if (d.draft.incMethod === 'between') s += select('onSlant', '针目倾斜', d.slantOptions, d.slantIndex);
      s += select('onPosition', '首次加针位置', d.positionOptions, d.positionIndex);
      s += '<div class="position-heading">行首加针位置</div>' + field({key:'firstIncLead'}) + field({key:'incLead'}) + '<p class="group-note">行尾加针在末尾滑针前。</p></div></section>';
    }
    if (d.draft.mode !== 'increase') {
      s += '<section class="setup-group"><h2>减针怎么织</h2><div class="form-card">';
      if (d.draft.mode === 'full') s += field({key:'end'}) + field({key:'firstDecrease'});
      else s += select('onLayout', '原加针方式', d.layoutOptions, d.layoutIndex);
      s += decreaseRuleHTML(d) + '</div></section>';
    }
    s += '<section class="setup-group"><h2>收尾</h2><div class="form-card">' + field({key:'tail'});
    if (d.draft.mode !== 'increase') s += select('onFinish', '收针记录', d.finishOptions, d.finishIndex);
    s += '</div></section>';
    s += '<section class="setup-group"><h2>这条围巾</h2><div class="form-card"><label class="field name-field"><span class="field-label">围巾名称</span>' + input('name', d.draft.name, false, 30) + '</label><div class="field"><span class="field-label">围巾颜色</span>' + colorHTML(d) + '</div></div></section>';
    s += '<details class="setup-details" data-section="progress"' + (folds.progress ? ' open' : '') + '><summary><span>' + (d.editing ? '调整续织行数' : '已经开始织了') + '</span><span class="details-summary" data-progress-summary>' + (Number(d.draft.resume) ? '已连续织完 ' + escape(d.draft.resume) + ' 行' : '从第 1 行开始') + '</span></summary><div class="form-card">' + field({key:'resume'}) + '</div></details>';
    s += '<details class="setup-details" data-section="notes"' + (folds.notes ? ' open' : '') + '><summary><span>线材与针号备注</span></summary><div class="form-card"><label class="field"><span class="field-label">线材</span>' + input('yarn', d.draft.yarn, false, 60) + '</label><label class="field"><span class="field-label">针号</span>' + input('needle', d.draft.needle, false, 30) + '</label><p class="group-note">备注不改变计数表。</p></div></details>';
    s += '<div class="field-error setup-cross-error" data-cross-error>' + escape(settingFeedback.errors.total || settingFeedback.errors.turnAfterRow || '') + '</div>';
    s += '<div class="error setup-error" data-setup-error role="alert">' + escape(d.error) + '</div>';
    s += button('generate', '预览围巾', 'primary generate');
    s += button('cancelSettings', d.editing ? '返回' : '取消新建', 'cancel');
    return s + '<div class="privacy">进度仅保存在本机。</div></section></div>';
  }
  function weaveSummary(d) {
    return escape(d.layoutOptions[d.layoutIndex]) + ' · ' + (d.draft.incMethod === 'stitch' ? 'KFB' : 'M1') + '<span>行首：首个前 ' + escape(d.draft.firstIncLead) + ' 下针 · 后续前 ' + escape(d.draft.incLead) + ' 下针</span>';
  }
  function decreaseRuleHTML(d) {
    var follow = d.draft.decLayout === 'follow', linked = d.guidance && d.guidance.weave === 'linked';
    var layout = follow ? d.draft.incLayout : d.draft.decLayout;
    var label = follow ? '沿用加针侧减针' : linked ? '沿用原加针方式' : '沿用原记录减针';
    var text = layout === 'alternating' ? '左右交替，每次减 1 针' : '固定同一条布边，每次减 1 针';
    return '<div class="field decrease-rule"><div class="field-top"><span class="field-label">' + label + '</span>' + helpButton('decLayout','减针侧别') + '</div><p class="group-note">' + text + '</p></div>';
  }
  function refreshSettings() {
    settingFeedback = feedback();
    Array.prototype.forEach.call(container.querySelectorAll('[data-setting]'),function(el){
      var key = el.getAttribute('data-setting'), control = el.querySelector('input');
      if (control) {
        if (document.activeElement !== control) control.value = key === 'firstDecrease' ? settingFeedback.firstDecrease : app.data.draft[key];
        control.setAttribute('aria-invalid',String(!!settingFeedback.errors[key]));
      }
      el.querySelector('.field-hint').textContent = settingFeedback.hints[key] || '';
      el.querySelector('.field-link').innerHTML = metaHTML(key,settingFeedback);
      el.querySelector('.field-error').textContent = settingFeedback.errors[key] || '';
    });
    var weave = container.querySelector('[data-weave-summary]'), slip = container.querySelector('[data-slip-summary]'), progress = container.querySelector('[data-progress-summary]'), cross = container.querySelector('[data-cross-error]');
    if (weave) weave.innerHTML = weaveSummary(app.data);
    if (slip) slip.textContent = '末尾 ' + app.data.draft.slip + ' 滑针';
    if (progress) progress.textContent = Number(app.data.draft.resume) ? '已连续织完 ' + app.data.draft.resume + ' 行' : '从第 1 行开始';
    if (cross) cross.textContent = settingFeedback.errors.total || settingFeedback.errors.turnAfterRow || '';
    var setupError = container.querySelector('[data-setup-error]');
    if (setupError) setupError.textContent = app.data.error || '';
  }
  var helpCopy = {
    mode:['计数范围','整条包括加针、减针和收尾；只记一段时，表内从第 1 行开始计数。','flow'],
    start:['起针数','第 1 行开始时的针数，包含边针。','outline'],
    max:['最宽针数','最宽的一行共有几针，包含边针。','outline'],
    end:['结束针数','减针到这个总针数后，再织尾段或收针。','outline'],
    interval:['加减针间隔','两次加针或两次减针相差几行。间隔越大，同样的针数变化需要织越多行。','timeline'],
    firstInc:['首次加针行','从起针后第 1 行开始数，在哪一行加第一针。起针本身不计行。','timeline'],
    firstDecrease:['首次减针行','整条围巾从第 1 行开始数。到最宽后，再织到这一行开始减针。','outline'],
    tail:['减针后平织行数','最后一次减针后，再织几行不加不减的行。收针另算一行。','outline'],
    incLayout:['加针方式','单侧固定同一条布边；左右交替每次换边，各加 1 针。左右按第 1 行从右向左织的朝向标记，翻面后按行首／行尾定位。','edges'],
    incMethod:['加针手法','KFB 在同一针上织出两针；M1 在相邻两针之间挑横线加一针。两种手法每次都加 1 针。','increase'],
    incSlant:['针目倾斜','M1L 的新针目左倾，M1R 右倾。“按原织图”保留方向提示。它与在哪条布边加针是两回事。','increase'],
    incFirst:['首次加针位置','第一次加针在这一行开头还是末尾。行尾加针在末尾滑针前；翻面后行首不一定是同一条布边。','increase'],
    firstIncLead:['首个加针前下针数','首个加针行在行首加针时，先织几针下针，再加针。行尾加针的位置以末尾滑针为准。','increase'],
    incLead:['后续加针前下针数','后续位于行首的加针，先织几针下针，再加针。这个数可以与首个加针行不同。','increase'],
    decLayout:['减针方式','沿用加针侧：第一次减针从最后一次加针所在的布边开始。加针左右交替时，减针也交替。','decrease-edges'],
    decFirst:['首次减针位置','独立设置减针侧时，选择第一次减针在这一行开头还是末尾。','decrease'],
    decLead:['减针行首下针数','位于行首的减针，先织几针下针，再把两针减为一针。','decrease'],
    lastDecLead:['末次减针行首下针数','末次减针行在行首减针时使用这个数，可以与前面的减针行不同。','last-decrease'],
    slip:['末尾滑针数','每行末尾有几针滑过、不织下针。它改变边针织法；形状预览不完整模拟边缘细节。','slip'],
    gaugeRows:['每 10 cm 行数','小样织好后，量出 10 cm 里有几行。行数越多，同样的表格织出来越短。','gauge'],
    gaugeStitches:['每 10 cm 针数','小样织好后，量出 10 cm 里有几针。针数越多，同样针数织出来越窄。','gauge'],
    finish:['收针记录','选择最后一行收针，表格就多一行收针。它不算在减针后的平织行数里。','finish'],
    resume:['已连续完成行数','从第 1 行起，连续织完了几行。不是零散勾选的总数；修改后按连续完成重建记录。','progress']
  };
  function validNumber(value,min,max) {
    var n = Number(value);
    return value !== '' && value !== null && value !== undefined && Number.isInteger(n) && n >= min && n <= max ? n : null;
  }
  function timelineHTML(points) {
    return '<div class="help-timeline">' + points.map(function(point){return '<div class="help-node' + (point.active ? ' change-node' : '') + '"><span class="timeline-dot" aria-hidden="true"></span><strong>' + escape(point.title) + '</strong><span>' + escape(point.note || '') + '</span></div>';}).join('') + '</div>';
  }
  function helpRowsHTML(plan,kind) {
    if (!plan) return '';
    var rows = plan.rows.filter(function(row){return kind === 'slip' ? row.phase !== '收针' && row.delta === 0 : kind === 'increase' ? row.delta > 0 : row.delta < 0;});
    if (kind === 'last-decrease') rows = rows.length > 1 ? [rows[0],rows[rows.length - 1]] : rows;
    else rows = rows.slice(0,2);
    if (!rows.length) return '';
    return '<p class="help-detail">' + (kind === 'increase' ? '加针行操作' : kind === 'slip' ? '平织行操作' : kind === 'last-decrease' ? '普通与末次减针' : '减针行操作') + '</p>' + rows.map(function(row){return '<div class="help-row"><div class="example-row">第 ' + row.id + ' 行 · ' + row.before + ' → ' + row.stitches + ' 针</div><div class="operation-blocks">' + operationBlocksHTML(row.segments,false) + '</div></div>';}).join('');
  }
  function schematicSVG(content,caption,height,label,outlineKind,purpose) {
    height = height || 154;
    var attributes = outlineKind ? ' data-outline-purpose="' + escape(purpose || 'width') + '" data-outline-kind="' + escape(outlineKind) + '"' : '';
    return '<div class="help-outline help-schematic"><span class="schematic-label">' + escape(label || '示意') + '</span><svg' + attributes + ' viewBox="0 0 320 ' + height + '" role="img" aria-label="' + escape(caption) + '">' + content + '<text x="160" y="' + (height - 12) + '" text-anchor="middle" fill="#68616a" font-size="12">' + escape(caption) + '</text></svg></div>';
  }
  // Keep teaching outlines simple. The first-decrease diagram also maps the
  // actual widest waiting span, so its marker cannot land on a decreasing slope.
  function outlineSchematicHTML(key,plan) {
    var p = app.data.draft, mode = p.mode, alternate = (mode === 'decrease' && p.decLayout !== 'follow' ? p.decLayout : p.incLayout) === 'alternating';
    var widthHelp = key === 'start' || key === 'max' || key === 'end';
    var edgeHelp = key === 'incLayout' || key === 'decLayout', purpose = widthHelp ? 'width' : edgeHelp ? 'edges' : 'flow';
    var outlineKind = mode === 'decrease' ? 'decrease' : mode === 'increase' ? 'increase' : alternate ? 'diamond' : 'triangle';
    var firstUpper = alternate ? 74 : 100, firstLower = alternate ? 86 : 112;
    var peakX = mode === 'decrease' ? 24 : mode === 'increase' ? 296 : 160;
    var leftUpper = mode === 'decrease' ? 30 : firstUpper, leftLower = mode === 'decrease' ? 112 : firstLower;
    var rightUpper = mode === 'increase' ? 30 : firstUpper, rightLower = mode === 'increase' ? 112 : firstLower;
    var increases = plan ? plan.rows.filter(function(row){return row.delta > 0;}) : [], decreases = plan ? plan.rows.filter(function(row){return row.delta < 0;}) : [];
    var decreaseX = 180, plainStartX = peakX, plainAttributes = '';
    if (key === 'firstDecrease' && mode !== 'increase') {
      var knitting = plan ? plan.rows.filter(function(row){return row.phase !== '收针';}) : [];
      if (decreases.length && knitting.length) {
        var firstDecreaseIndex = knitting.indexOf(decreases[0]);
        var lastIncrease = increases.length ? increases[increases.length - 1] : null;
        var widestBoundary = lastIncrease ? knitting.indexOf(lastIncrease) + 1 : 0;
        plainStartX = 24 + widestBoundary / knitting.length * 272;
        decreaseX = 24 + firstDecreaseIndex / knitting.length * 272;
        var plainEnd = firstDecreaseIndex ? knitting[firstDecreaseIndex - 1].id : 0;
        plainAttributes = ' data-plain-start-row="' + (lastIncrease ? lastIncrease.id : 0) + '" data-plain-end-row="' + plainEnd + '" data-plain-rows="' + (firstDecreaseIndex - widestBoundary) + '"';
      }
      plainAttributes += ' data-plain-start-x="' + plainStartX.toFixed(1) + '" data-plain-end-x="' + decreaseX.toFixed(1) + '"';
    }
    var polygon = '24,' + leftUpper + ' ' + peakX + ',30 296,' + rightUpper + ' 296,' + rightLower + ' ' + peakX + ',112 24,' + leftLower;
    if (key === 'firstDecrease' && mode !== 'increase') polygon = '24,' + leftUpper + ' ' + plainStartX.toFixed(1) + ',30 ' + decreaseX.toFixed(1) + ',30 296,' + rightUpper + ' 296,' + rightLower + ' ' + decreaseX.toFixed(1) + ',112 ' + plainStartX.toFixed(1) + ',112 24,' + leftLower;
    var caption = '第 1 行开始时的针数', content = '<polygon data-outline-kind="' + outlineKind + '" data-outline-purpose="' + purpose + '"' + plainAttributes + ' points="' + polygon + '" fill="#ecdce1" stroke="#c695a3" stroke-width="1.5" stroke-linejoin="round"></polygon>';
    if (key === 'start') { caption = validNumber(p.start,6,200) === null ? '第 1 行开始时的针数' : '第 1 行开始时 · ' + p.start + ' 针'; content += widthMarkerSVG(24,leftUpper,leftLower,validNumber(p.start,6,200) === null ? '针数' : p.start + ' 针',key); }
    if (key === 'max') { caption = validNumber(p.max,6,200) === null ? '最宽一行的针数' : '最宽一行 · ' + p.max + ' 针'; content += widthMarkerSVG(peakX,30,112,validNumber(p.max,6,200) === null ? '针数' : p.max + ' 针',key); }
    if (key === 'end') { caption = validNumber(p.end,6,200) === null ? '减针结束时的针数' : '减针结束时 · ' + p.end + ' 针'; content += widthMarkerSVG(296,rightUpper,rightLower,validNumber(p.end,6,200) === null ? '针数' : p.end + ' 针',key); }
    if (key === 'firstDecrease') { caption = decreases.length ? '第 ' + decreases[0].id + ' 行开始减针' : '首次减针所在的行'; content += rowMarkerSVG(decreaseX,decreases.length ? decreases[0].id : 'firstDecrease'); }
    if (key === 'tail') {
      var tail = validNumber(p.tail,0,500);
      caption = (mode === 'increase' ? '加针后' : '减针后') + (tail === null ? '再织平织行' : tail ? '平织 ' + tail + ' 行' : '不再平织');
      if (tail !== 0) content += '<path data-tail-rows="' + (tail === null ? '' : tail) + '" d="M278 ' + (rightLower - 15) + ' V' + (rightLower + 5) + ' H296 V' + (rightLower - 15) + '" fill="none" stroke="#b95f78" stroke-width="3"></path>';
    }
    var events, follow = key === 'decLayout' && p.decLayout === 'follow';
    if (edgeHelp) {
      var decreasing = key === 'decLayout', layout = decreasing && !follow ? p.decLayout : p.incLayout;
      caption = follow ? '末次加针与首次减针在同侧' : (layout === 'alternating' ? '两条布边轮流' : '同一条布边') + (decreasing ? '减针' : '加针');
      events = plan ? decreasing ? follow ? increases.slice(-1).concat(decreases.slice(0,2)) : decreases.slice(0,3) : increases.slice(0,3) : null;
      var marks = events || [0,1,2].map(function(i){return {fabricEdge:layout === 'alternating' && (follow ? i === 2 : i === 1) ? 1 : 0,delta:decreasing && (!follow || i > 0) ? -1 : 1};});
      var positions = mode !== 'full' ? [64,160,256] : follow ? [140,180,236] : decreasing ? [180,224,268] : [64,102,140];
      function edgeY(x,lower) {
        var left = lower ? leftLower : leftUpper, peak = lower ? 112 : 30, right = lower ? rightLower : rightUpper;
        if (peakX === 24) return peak + (right - peak) * (x - 24) / 272;
        if (peakX === 296) return left + (peak - left) * (x - 24) / 272;
        return x <= peakX ? left + (peak - left) * (x - 24) / (peakX - 24) : peak + (right - peak) * (x - peakX) / (296 - peakX);
      }
      marks.forEach(function(event,i){
        var cx = positions[i], cy = edgeY(cx,event.fabricEdge === 1);
        content += '<circle' + (event.id ? ' data-event-row="' + event.id + '"' : '') + ' data-fabric-edge="' + event.fabricEdge + '" cx="' + cx + '" cy="' + cy.toFixed(1) + '" r="7" fill="' + (event.delta > 0 ? '#5888ac' : '#b45d72') + '" stroke="white" stroke-width="2"></circle><text x="' + cx + '" y="' + (cy + 3).toFixed(1) + '" text-anchor="middle" fill="white" font-size="9">' + (event.delta > 0 ? '+1' : '−1') + '</text>';
      });
      content += '<text x="160" y="18" text-anchor="middle" fill="#68616a" font-size="11">左侧</text><text x="160" y="132" text-anchor="middle" fill="#68616a" font-size="11">右侧</text>';
    }
    if (key === 'mode') caption = mode === 'increase' ? '加针段' : mode === 'decrease' ? '减针段' : '加针 → 减针 → 收尾';
    return schematicSVG(content,caption,164,widthHelp ? '针数位置示意' : edgeHelp ? '布边示意' : '行程示意',outlineKind,purpose) + (events && events.length ? timelineHTML(events.map(function(e,i){return {title:'第 ' + e.id + ' 行',note:(follow ? ['末次加针 · ','首次减针 · ','下次减针 · '][i] : '') + window.SophiePattern.fabricSide(e.fabricEdge) + (e.delta > 0 ? '加针' : '减针'),active:true};})) : '');
  }
  function widthMarkerSVG(x,upper,lower,label,key) {
    var sx = Number(x).toFixed(1), top = Number(upper).toFixed(1), bottom = Number(lower).toFixed(1);
    var labelX = x > 270 ? x - 9 : x + 9, anchor = x > 270 ? 'end' : 'start';
    return '<g class="width-dimension"><line data-width-marker="' + key + '" x1="' + sx + '" x2="' + sx + '" y1="' + top + '" y2="' + bottom + '" stroke="#a64c69" stroke-width="3"></line><path d="M' + (x - 4).toFixed(1) + ' ' + top + ' H' + (x + 4).toFixed(1) + ' M' + (x - 4).toFixed(1) + ' ' + bottom + ' H' + (x + 4).toFixed(1) + '" fill="none" stroke="#a64c69" stroke-width="2"></path><text x="' + labelX.toFixed(1) + '" y="' + ((upper + lower) / 2 + 4).toFixed(1) + '" text-anchor="' + anchor + '" fill="#8d3e58" font-size="12" font-weight="600">' + escape(label) + '</text></g>';
  }
  function rowMarkerSVG(x,row) {
    return '<line data-row-marker="' + escape(row) + '" x1="' + x.toFixed(1) + '" x2="' + x.toFixed(1) + '" y1="20" y2="118" stroke="#a64c69" stroke-width="2"></line>';
  }
  function edgesSchematicHTML(key) {
    return outlineSchematicHTML(key);
  }
  function loopSVG(x,y,color) {
    return '<path d="M' + (x - 7) + ' ' + y + ' Q' + (x - 8) + ' ' + (y - 22) + ' ' + x + ' ' + (y - 22) + ' Q' + (x + 8) + ' ' + (y - 22) + ' ' + (x + 7) + ' ' + y + '" fill="none" stroke="' + color + '" stroke-width="3" stroke-linecap="round"></path>';
  }
  function needleSchematicHTML(key,kind) {
    var p = app.data.draft, content = '', caption, color = '#b45d72';
    if (key === 'incMethod') {
      content = '<rect x="' + (p.incMethod === 'between' ? 166 : 6) + '" y="5" width="148" height="126" rx="10" fill="#f4e9ed"></rect><text x="80" y="22" text-anchor="middle" fill="#68616a" font-size="13">KFB</text><text x="240" y="22" text-anchor="middle" fill="#68616a" font-size="13">M1</text>';
      content += loopSVG(80,104,'#8a7880') + loopSVG(66,60,color) + loopSVG(94,60,color) + '<path d="M80 80 L66 64 M80 80 L94 64" stroke="#b45d72" stroke-width="2" fill="none"></path>';
      content += loopSVG(216,104,'#8a7880') + loopSVG(264,104,'#8a7880') + '<path d="M223 89 Q240 98 257 89 M240 83 V62" fill="none" stroke="#b45d72" stroke-width="2"></path>' + loopSVG(216,60,'#8a7880') + loopSVG(240,60,color) + loopSVG(264,60,'#8a7880');
      content += '<text x="80" y="124" text-anchor="middle" fill="#68616a" font-size="11">同一针织出 2 针</text><text x="240" y="124" text-anchor="middle" fill="#68616a" font-size="11">两针之间新增 1 针</text>';
      caption = '两种手法，每次都加 1 针';
      return schematicSVG(content,caption,164);
    }
    if (key === 'incSlant') {
      content = loopSVG(96,83,color) + loopSVG(224,83,color) + '<path d="M103 83 L88 57 M217 83 L232 57" stroke="#b45d72" stroke-width="3" fill="none"></path><text x="96" y="108" text-anchor="middle" fill="#68616a" font-size="12">M1L 左倾</text><text x="224" y="108" text-anchor="middle" fill="#68616a" font-size="12">M1R 右倾</text>';
      return schematicSVG(content,'新针目倾斜方向');
    }
    var slipOnly = kind === 'slip', decreasing = kind === 'decrease' || kind === 'last-decrease';
    var end = key === 'incFirst' ? p.incFirst === 'end' : key === 'decFirst' ? p.decFirst === 'end' : false;
    var between = !decreasing && p.incMethod === 'between';
    var leadKey = key === 'incLead' ? 'incLead' : decreasing ? kind === 'last-decrease' ? 'lastDecLead' : 'decLead' : 'firstIncLead';
    var lead = validNumber(p[leadKey],0,199), slips = validNumber(p.slip,0,5);
    if (lead === null) lead = leadKey === 'incLead' || leadKey === 'decLead' ? 3 : 2;
    if (slips === null) slips = 3;
    var before = validNumber(decreasing ? kind === 'last-decrease' ? Number(p.end) + 1 : p.max : p.start,6,200);
    if (before === null) before = Math.max(6,lead + slips + (decreasing ? 2 : between ? 0 : 1));
    if (key === 'incLead') before++;
    var consumed = slipOnly ? 0 : decreasing ? 2 : between ? 0 : 1;
    if (end || slipOnly) lead = Math.max(0,before - slips - consumed);
    var middle = Math.max(0,before - lead - slips - consumed), slots = [];
    function addSlots(count,type,limit) {
      if (count > limit) { slots.push({type:type},{type:'ellipsis'},{type:type}); }
      else for (var i = 0; i < count; i++) slots.push({type:type});
    }
    addSlots(lead,'knit',6);
    var actionIndex = slots.length;
    addSlots(consumed,'change',2);
    addSlots(middle,'knit',3);
    var slipIndex = slots.length;
    addSlots(slips,'slip',5);
    var step = slots.length > 1 ? 272 / (slots.length - 1) : 24;
    function needleX(i) { return 24 + i * step; }
    var ordinal = decreasing ? (lead + 1) + ',' + (lead + 2) : between ? lead + ',' + (lead + 1) : String(lead + 1);
    content = '<g data-lead-count="' + lead + '" data-change-ordinal="' + ordinal + '" data-slip-count="' + slips + '">';
    slots.forEach(function(slot,i){
      if (slot.type === 'ellipsis') content += '<text x="' + needleX(i).toFixed(1) + '" y="75" text-anchor="middle" fill="#ba9c55" font-size="16">…</text>';
      else content += '<g data-needle-kind="' + slot.type + '">' + loopSVG(needleX(i),81,slot.type === 'slip' ? '#93989e' : slot.type === 'change' ? '#5888ac' : '#ba9c55') + '</g>';
    });
    if (!slipOnly) {
      var markX = between ? needleX(actionIndex) - step / 2 : needleX(actionIndex) + (decreasing ? step / 2 : 0);
      markX = Math.max(12,Math.min(308,markX));
      var arrowStart = between ? 46 : 35, arrowEnd = between ? 55 : 53;
      if (between) content += loopSVG(markX,43,color);
      content += '<path data-change-marker="' + ordinal + '" d="M' + markX.toFixed(1) + ' ' + arrowStart + ' V' + arrowEnd + ' M' + (markX - 4).toFixed(1) + ' ' + (arrowEnd - 6) + ' L' + markX.toFixed(1) + ' ' + arrowEnd + ' L' + (markX + 4).toFixed(1) + ' ' + (arrowEnd - 6) + '" stroke="#b45d72" stroke-width="2" fill="none"></path><text x="' + markX.toFixed(1) + '" y="' + (between ? 14 : 24) + '" text-anchor="middle" fill="#9d5068" font-size="12">' + (decreasing ? '−1' : '+1') + '</text>';
    }
    if (lead) content += '<text x="' + ((needleX(0) + needleX(actionIndex - 1)) / 2).toFixed(1) + '" y="110" text-anchor="middle" fill="#8e7540" font-size="12">' + lead + ' 下针</text>';
    if (slips) content += '<text x="' + ((needleX(slipIndex) + needleX(slots.length - 1)) / 2).toFixed(1) + '" y="110" text-anchor="middle" fill="#737980" font-size="12">' + slips + ' 滑针</text>';
    content += '</g>';
    caption = slipOnly ? lead + ' 下针 → ' + slips + ' 滑针' : lead + ' 下针 → ' + (decreasing ? '第 ' + (lead + 1) + '、' + (lead + 2) + ' 针 −1' : between ? lead + '、' + (lead + 1) + ' 针间 +1' : '第 ' + (lead + 1) + ' 针 +1') + ' → ' + slips + ' 滑针';
    return schematicSVG(content,caption);
  }
  function outlineHTML(plan,key) {
    return outlineSchematicHTML(key,plan);
  }
  function diagramHTML(key,kind,fb) {
    var p = app.data.draft, plan = fb.plan;
    if (key === 'firstDecrease') return outlineHTML(plan,key);
    if (key === 'incLayout' && p.mode === 'decrease') return plan ? outlineHTML(plan,'decLayout') : edgesSchematicHTML('decLayout');
    if (kind === 'outline') return outlineHTML(plan,key);
    if (kind === 'edges' || kind === 'decrease-edges') return plan ? outlineHTML(plan,key) : edgesSchematicHTML(key);
    if (['increase','decrease','last-decrease','slip'].indexOf(kind) >= 0) return needleSchematicHTML(key,kind) + helpRowsHTML(plan,kind);
    if (kind === 'timeline') {
      var decreasing = p.mode === 'decrease';
      var first = validNumber(decreasing ? fb.firstDecrease : p.firstInc,1,100), interval = validNumber(p.interval,2,40);
      if (first === null || interval === null) return timelineHTML([{title:'先平织',note:'针数不变'},{title:decreasing ? '首次减针' : '首次加针',note:decreasing ? '减 1 针' : '加 1 针',active:true},{title:'相隔若干行',note:'由间隔决定'},{title:decreasing ? '再次减针' : '再次加针',note:decreasing ? '减 1 针' : '加 1 针',active:true}]);
      var n = validNumber(p.max,6,200), start = validNumber(decreasing ? p.end : p.start,6,200), count = n !== null && start !== null && n > start ? Math.min(4,n - start) : 3;
      var nodes = first > 1 ? [{title:'前 ' + (first - 1) + ' 行',note:decreasing ? '不减针' : '不加针'}] : [];
      for (var i = 0; i < count; i++) nodes.push({title:'第 ' + (first + i * interval) + ' 行',note:decreasing ? '减 1 针' : '加 1 针',active:true});
      return timelineHTML(nodes);
    }
    if (kind === 'gauge') return '<div class="gauge-diagram"><div class="gauge-square" aria-hidden="true"></div><span class="gauge-width">10 cm · ' + escape(p.gaugeStitches) + ' 针</span><span class="gauge-height">10 cm<br>' + escape(p.gaugeRows) + ' 行</span></div><p class="help-detail">只影响预览尺寸，不改变计数表。</p>';
    if (kind === 'progress') { var resume = validNumber(p.resume,0,4000), complete = fb.plan && resume === fb.plan.total; return timelineHTML([{title:'第 1 行',note:'开始计数'},{title:resume ? '已织完 ' + resume + ' 行' : '还未织',note:'连续完成'},{title:complete ? '已完成' : '第 ' + ((resume || 0) + 1) + ' 行',note:complete ? '全部织完' : '接下来织',active:true}]); }
    if (kind === 'finish') { var last = plan && plan.rows.filter(function(row){return row.delta < 0;}).slice(-1)[0]; return timelineHTML([{title:last ? '第 ' + last.id + ' 行' : '最后一次减针',note:'减针'},{title:plan ? '再织 ' + p.tail + ' 行' : '平织尾段',note:'针数不变'},{title:p.finish === 'bindoff' ? plan ? '第 ' + plan.total + ' 行' : '另记 1 行' : '暂不计行',note:'收针',active:p.finish === 'bindoff'}]); }
    return outlineSchematicHTML('mode') + timelineHTML((p.mode === 'full' ? ['加针','减针','收尾'] : p.mode === 'increase' ? ['加针','加针后平织'] : ['减针','收尾']).map(function(t){return {title:t};}));
  }
  function showSettingsHelp(key) {
    var copy = helpCopy[key]; if (!copy || document.querySelector('.settings-help-overlay')) return;
    var fb = feedback(), description = copy[1];
    if (key === 'max' && app.data.draft.mode === 'decrease') description = '减针段第 1 行开始时的针数，包含边针。';
    if (key === 'firstDecrease' && app.data.draft.mode === 'decrease') description = '只记减针段时，从这张表的第 1 行开始数，在哪一行减第一针。';
    if (key === 'incLayout' && app.data.draft.mode === 'decrease') description = '减针沿用原来的加针方式，每次减 1 针。';
    if (key === 'tail' && app.data.draft.mode === 'increase') description = '最后一次加针后，再织几行针数不变的行。只记加针段时，不记录收针。';
    if (key === 'decLayout' && app.data.draft.decLayout !== 'follow') description = '单侧固定同一条布边减针；左右交替在两条布边轮流减针。每个减针行总共减 1 针。';
    var label = key === 'tail' && app.data.draft.mode === 'increase' ? '加针后平织行数' : copy[0];
    if (key === 'incLayout' && app.data.draft.mode === 'decrease') label = '原加针方式';
    var overlay = document.createElement('div'), trigger = document.activeElement, previousOverflow = document.body.style.overflow, previousHidden = container.getAttribute('aria-hidden');
    overlay.className = 'settings-help-overlay';
    var kind = copy[2];
    var current = ['max','end','firstDecrease','tail'].indexOf(key) >= 0 ? fb.hints[key] : '';
    overlay.innerHTML = '<section class="settings-help-sheet" role="dialog" aria-modal="true" aria-labelledby="settings-help-title" aria-describedby="settings-help-description" tabindex="-1"><header><h2 id="settings-help-title">' + escape(label) + '</h2><button type="button" class="help-close" aria-label="关闭帮助">×</button></header><p id="settings-help-description">' + escape(description) + '</p>' + diagramHTML(key,kind,fb) + (current ? '<p class="help-current">' + escape(current) + '</p>' : '') + (fb.errors[key] ? '<p class="field-error">' + escape(fb.errors[key]) + '</p>' : '') + '</section>';
    document.body.appendChild(overlay); document.body.style.overflow = 'hidden'; container.setAttribute('aria-hidden','true');
    var sheet = overlay.querySelector('section'), close = overlay.querySelector('button');
    function finish() {
      if (!overlay.parentNode) return;
      overlay.parentNode.removeChild(overlay); document.body.style.overflow = previousOverflow;
      if (previousHidden === null) container.removeAttribute('aria-hidden'); else container.setAttribute('aria-hidden',previousHidden);
      if (trigger && document.body.contains(trigger)) trigger.focus();
    }
    overlay.addEventListener('click',function(e){if (e.target === overlay || e.target.closest('.help-close')) finish();});
    overlay.addEventListener('keydown',function(e){if (e.key === 'Escape') { e.preventDefault(); finish(); } else if (e.key === 'Tab') {e.preventDefault();close.focus();}});
    sheet.focus();
  }
  var previewPointRow = 0, previewPointPlan = null, previewPoints = [];
  function previewHTML(d) {
    var plan = app.previewPlan, shape = window.SophieShape.build(plan), p = plan.params;
    var title = p.mode === 'increase' ? '加针段预览' : p.mode === 'decrease' ? '减针段预览' : '围巾预览';
    var name = d.colorOptions.filter(function(c){return c.key === d.draft.yarnColor;})[0].name;
    var ends = Math.round(shape.start.width) + ' → ' + shape.widest.stitches + ' → ' + Math.round(shape.end.width) + ' 针';
    if (p.mode === 'increase') ends = Math.round(shape.start.width) + ' → ' + shape.widest.stitches + ' 针';
    if (p.mode === 'decrease') ends = shape.widest.stitches + ' → ' + Math.round(shape.end.width) + ' 针';
    var action = d.turnPreview ? '保存调整' : (d.previewResets ? '替换计数表' : (d.editing ? '保存并继续' : '开始计数'));
    var back = d.turnPreview ? '修改转折' : '修改设置';
    var s = '<div class="screen"><section class="preview-page"><div class="preview-heading">' + button('backToSettings','‹ ' + back,'text-button') + '<h1>' + title + '</h1></div><div class="preview-content">';
    s += '<div class="scarf-card"><div class="scarf-caption"><span>' + escape(p.name) + '</span><span>' + name + '</span></div><div class="scarf-stage"><canvas id="scarf-preview" role="img" aria-label="形状示意，' + ends + '，' + name + '">围巾形状示意</canvas><div class="scarf-points" role="group" aria-label="加减针点"></div></div><div class="scarf-view-label">形状示意</div><div class="point-inspector" hidden><div class="point-nav"><span class="point-count"></span><div><button type="button" data-point-step="-1" aria-label="上一个加减针点">‹</button><button type="button" data-point-step="1" aria-label="下一个加减针点">›</button></div></div><div class="point-detail" aria-live="polite" aria-atomic="true"></div></div></div>';
    s += '<div class="plan-summary"><span>' + plan.total + ' 行</span><span>' + ends + '</span></div><div class="preview-color"><span class="field-label">围巾颜色</span>' + colorHTML(d) + '</div>';
    if (p.mode !== 'decrease' && !d.turnPreview) {
      var examples = plan.rows.filter(function(row){return row.delta > 0;}).slice(0,2);
      var method = p.incMethod === 'stitch' ? 'KFB' : (p.incSlant === 'left' ? 'M1L' : p.incSlant === 'right' ? 'M1R' : 'M1');
      if (examples.length) {
        s += '<section class="increase-examples"><div class="example-heading"><h2>加针示例</h2><span>' + method + '</span></div>';
        examples.forEach(function(row){
          s += '<div class="increase-example"><div class="example-row">第 ' + row.id + ' 行 · ' + row.before + ' → ' + row.stitches + ' 针</div><div class="operation-blocks">' + operationBlocksHTML(row.segments,false) + '</div></div>';
        });
        s += '</section>';
      }
    }
    s += '</div><div class="preview-save">';
    if (d.turnPreview) {
      s += '<div class="preserve-note">保留已完成的 ' + d.previewCompleted + ' 行 · 第 ' + escape(d.turnFirstDecrease) + ' 行首次减针</div>';
      if (d.turnRemoved) s += '<div class="reset-notice">清除第 ' + d.turnRow + ' 行之后的 ' + d.turnRemoved + ' 行勾选。</div>';
    } else if (d.previewResets) s += '<div class="reset-notice">' + (app.readFailed ? '本次保存将替换无法读取的旧记录。' : '原逐行记录将替换为连续完成 ' + p.resume + ' 行。') + '</div>';
    else if (d.editing) s += '<div class="preserve-note">保留已勾选的 ' + d.previewCompleted + ' 行</div>';
    if (d.error) s += '<div class="error" role="alert">' + escape(d.error) + '</div>';
    s += '<div class="preview-actions">' + button('confirmPreview',action,'primary') + button('backToSettings',back,'cancel') + '</div></div>';
    return s + '</section></div>';
  }
  function drawPreview() {
    var canvas = document.getElementById('scarf-preview');
    if (canvas && app.previewPlan) {
      window.SophiePreview.draw(canvas, app.previewPlan);
      var stage = container.querySelector('.scarf-stage'), rect = stage.getBoundingClientRect();
      var layer = container.querySelector('.scarf-points');
      // A fallback with no outline cannot provide meaningful point locations.
      if (canvas.sophieFallback && !canvas.sophieFallback.node.getAttribute('data-outline-kind')) {
        layer.innerHTML = ''; container.querySelector('.point-inspector').hidden = true; return;
      }
      if (previewPointPlan !== app.previewPlan) { previewPointRow = 0; previewPointPlan = app.previewPlan; }
      previewPoints = window.SophiePreview.shapingMarkers(app.previewPlan, rect.width, rect.height);
      if (!previewPoints.some(function(point) { return point.rowId === previewPointRow; }))
        previewPointRow = previewPoints.length ? previewPoints[0].rowId : 0;
      layer.innerHTML = previewPoints.map(function(point) {
        var label = '第 ' + point.rowId + ' 行，' +
          (point.kind === 'increase' ? '加针，' : '减针，') + (point.position === 'start' ? '行首' : '行尾') + '，' + point.before + ' 到 ' + point.stitches + ' 针';
        return '<button type="button" class="scarf-point point-' + point.kind + ' ' + (point.fabricEdge === 0 ? 'point-upper' : 'point-lower') +
          '" data-point-row="' + point.rowId + '" aria-label="' + label + '" style="left:' + point.x.toFixed(2) + 'px;top:' + point.y.toFixed(2) +
          'px"><span class="point-dot" aria-hidden="true"></span><span class="point-label" aria-hidden="true">第 ' + point.rowId + ' 行</span></button>';
      }).join('');
      selectPreviewPoint(previewPointRow);
    }
  }
  function selectPreviewPoint(id) {
    var index = previewPoints.findIndex(function(point) { return point.rowId === id; });
    var inspector = container.querySelector('.point-inspector');
    if (!inspector) return;
    inspector.hidden = index < 0;
    if (index < 0) return;
    previewPointRow = id;
    var point = previewPoints[index];
    inspector.classList.toggle('is-decrease', point.kind === 'decrease');
    Array.prototype.forEach.call(container.querySelectorAll('[data-point-row]'), function(node) {
      var active = Number(node.getAttribute('data-point-row')) === id;
      node.classList.toggle('selected', active); node.setAttribute('aria-pressed', String(active));
    });
    inspector.querySelector('.point-count').textContent = '加减针点 ' + (index + 1) + ' / ' + previewPoints.length;
    inspector.querySelector('[data-point-step="-1"]').disabled = index === 0;
    inspector.querySelector('[data-point-step="1"]').disabled = index === previewPoints.length - 1;
    inspector.querySelector('.point-detail').innerHTML = '<strong>第 ' + id + ' 行 · ' + (point.kind === 'increase' ? '加针' : '减针') + '</strong><span>' +
      (point.position === 'start' ? '行首' : '行尾') +
      '</span><span>' + point.before + ' → ' + point.stitches + ' 针</span>';
  }
  function turnHTML(d) {
    var s = '<div class="turn-overlay"><section class="turn-sheet" role="dialog" aria-modal="true" aria-labelledby="turn-title" tabindex="-1"><div class="turn-heading"><h1 id="turn-title">设为最宽处</h1><button type="button" class="text-button turn-close" data-action="cancelTurn" aria-label="取消调整">×</button></div>';
    s += '<div class="turn-anchor"><span>第 ' + d.turnRow + ' 行织完</span><strong>' + d.turnStitches + ' <small>针</small></strong></div>';
    s += '<p class="turn-hint">第 ' + d.current + ' 行已开始织时，先织完再设置。</p><label class="field field-top"><span class="field-label">首次减针行</span><input type="number" inputmode="numeric" aria-label="首次减针行" data-turn-input="true" min="' + d.turnMinFirst + '" max="' + d.turnMaxFirst + '" value="' + escape(d.turnFirstDecrease) + '"></label>';
    if (d.error) s += '<div class="error" role="alert">' + escape(d.error) + '</div>';
    s += '<div class="turn-actions">' + button('previewTurn','预览围巾','primary') + button('cancelTurn','取消','cancel') + '</div></section></div>';
    return s;
  }
  function toolbarHTML(d) {
    var s = '<div class="table-toolbar"><span>逐行记录</span><div class="toolbar-actions">' + (d.current ? button('centerCurrent','回到当前行','text-button') : '');
    if (d.canTurn) {
      s += '<button type="button" data-action="toggleMenu" class="text-button more-button" aria-label="更多操作" aria-haspopup="menu" aria-expanded="' + !!d.menuOpen + '">⋯</button>';
      if (d.menuOpen) s += '<div class="more-menu" role="menu"><button type="button" role="menuitem" data-action="openTurn">设为最宽处</button></div>';
    }
    return s + '</div></div>';
  }
  function completionButtonHTML(d) {
    if (!d.current && !d.recordedRow) return button('goHome','回到我的围巾','primary');
    var id = d.recordedRow || d.current;
    var row = id ? d.rows[id - 1] : null;
    var label = id ? '第 ' + id + ' 行' + (row && row.phase === '收针' ? '收好了' : '织好了') : '计数完成 ✓';
    return button('completeCurrent', label, 'primary' + (d.recordedRow ? ' confirming' : ''), !!d.recordedRow || !d.current);
  }
  function currentHeading(d) {
    var id = d.recordedStage === 'hold' ? d.recordedRow : d.current;
    return id ? '第 ' + id + ' 行' : d.completionText || '已完成';
  }
  function lastRecordHTML(record) {
    if (!record) return '<div class="last-record">暂无记录时间</div>';
    var at = new Date(record.at), today = new Date(), yesterday = new Date(today.getFullYear(),today.getMonth(),today.getDate() - 1);
    function pad(value) { return value < 10 ? '0' + value : String(value); }
    function sameDay(a,b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
    var time = pad(at.getHours()) + ':' + pad(at.getMinutes()) + ':' + pad(at.getSeconds());
    if (!sameDay(at,today)) time = (sameDay(at,yesterday) ? '昨天' : (at.getFullYear() === today.getFullYear() ? '' : at.getFullYear() + '/') + pad(at.getMonth()+1) + '/' + pad(at.getDate())) + ' ' + time;
    return '<div class="last-record">上次记录：<strong>第 ' + record.row + ' 行</strong><span class="record-separator">·</span><time datetime="' + at.toISOString() + '">' + time + '</time></div>';
  }
  function counterHTML(d) {
    var s = '<div class="screen"><section class="counter"><div class="project-bar">' + button('goHome','‹ 首页','text-button home-link') + '<button type="button" data-action="toggleSwitch" class="project-switch" aria-label="切换围巾，当前是' + escape(d.name) + '" aria-haspopup="dialog"' + (d.busy ? ' disabled' : '') + '><span>' + escape(d.name) + '</span><span aria-hidden="true">⌄</span></button></div><div class="info-line"><span class="info-current">' + escape(currentHeading(d)) + '</span><span>' + d.count + ' / ' + d.total + '</span><span class="info-save">' + escape(d.busy ? '保存中…' : d.savedText === '已保存到本机' ? '已保存' : d.savedText) + '</span>' + button('openSettings','设置','text-button') + '</div>' +
      (d.gaps ? '<div class="gap-hint">第 ' + d.current + ' 行未完成</div>' : '') +
      toolbarHTML(d) + '<div class="table-head"><span class="col-number">行</span><span class="col-body">织法</span><span class="col-stitches">织后针数</span><span class="col-check">完成</span></div><div id="row-scroll" class="row-scroll" aria-label="逐行计数"><div id="row-content"></div></div><div class="footer">' +
      (d.error ? '<div class="error" role="alert">' + escape(d.error) + '</div>' : '') +
      '<div class="jump"><input type="number" inputmode="numeric" aria-label="查看行号" data-jump="true" value="' + escape(d.jump) + '" placeholder="输入行号">' + button('jumpTo','查看','text-button') + '<span class="hint">点行勾选，再点恢复</span></div>' + lastRecordHTML(d.lastRecord) + '<div class="actions">' + button('undo','退回一行','undo',!d.contiguous) + '<span class="completion-control">' + completionButtonHTML(d) + '</span>' + '</div><span class="counter-announcement" role="status" aria-live="polite"></span></div></section></div>';
    return s + (d.turnSetup ? turnHTML(d) : '') + (d.switchOpen ? librarySheetHTML(d) : '');
  }
  function measureRows() {
    var scroll = document.getElementById('row-scroll');
    if (!scroll || !app.data.rows.length) { offsets = []; heights = []; return; }
    var narrow = container.getBoundingClientRect().width < 520;
    var small = container.getBoundingClientRect().width <= 350;
    function heightFor(row) { return small && longOperation(row) ? 182 : row.segments.length > 2 && narrow ? 122 : 78; }
    var rect = scroll.getBoundingClientRect();
    var height = heightFor(app.data.rows[0]);
    var midpoint = visibleHeight() / 2;
    var center = Math.max(rect.top + height / 2, Math.min(midpoint, rect.bottom - height / 2));
    topSpace = Math.max(0, center - rect.top - height / 2);
    bottomSpace = Math.max(0, rect.bottom - center - 39);
    offsets = []; heights = []; totalHeight = 0;
    app.data.rows.forEach(function (row) {
      offsets.push(totalHeight);
      var h = heightFor(row);
      heights.push(h); totalHeight += h;
    });
    document.getElementById('row-content').style.height = (topSpace + totalHeight + bottomSpace) + 'px';
  }
  function longOperation(row) {
    return row.segments.some(function(segment){return segment.kind === 'increase' && segment.text.length > 11;});
  }
  function operationBlocksHTML(segments, allowActions) {
    return segments.map(function (segment) {
      var interactive = allowActions && ['pending','tip','slip'].indexOf(segment.kind) >= 0;
      var tag = interactive ? 'button' : 'span';
      return '<' + tag + ' class="operation ' + segment.kind + (interactive ? ' operation-button' : '') + '"' + (interactive ? ' type="button" data-kind="' + segment.kind + '"' : '') + '><span class="operation-text">' + escape(segment.text) + '</span>' + (segment.note ? '<span class="operation-note">' + escape(segment.note) + '</span>' : '') + '</' + tag + '>';
    }).join('');
  }
  function rowTimeHTML(row) {
    var value = row.done && app.completedAt && app.completedAt[row.id];
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 8640000000000000) return '';
    var at = new Date(value), today = new Date();
    function pad(n) { return n < 10 ? '0' + n : String(n); }
    var time = pad(at.getHours()) + ':' + pad(at.getMinutes());
    var date = (at.getFullYear() === today.getFullYear() ? '' : at.getFullYear() + '/') + pad(at.getMonth()+1) + '/' + pad(at.getDate());
    var sameDay = at.getFullYear() === today.getFullYear() && at.getMonth() === today.getMonth() && at.getDate() === today.getDate();
    return '<time class="row-time" datetime="' + at.toISOString() + '" title="' + date + ' ' + time + '" aria-label="完成于 ' + date + ' ' + time + '"><span>' + time + '</span>' + (!sameDay ? '<span class="row-time-date">' + date + '</span>' : '') + '</time>';
  }
  function rowHTML(row, index) {
    var blocks = operationBlocksHTML(row.segments,true);
    var recorded = app.data.recordedRow === row.id;
    var holding = app.data.recordedStage === 'hold';
    var confirming = recorded && holding, leaving = recorded && app.data.recordedStage === 'moving';
    var finished = !app.data.current && app.data.count === app.data.total && row.id === app.data.total;
    var active = holding ? recorded : row.active || finished;
    var elapsed = Math.max(0, Date.now() - app.data.recordedAt);
    var tag = recorded || finished ? (row.phase === '收针' ? '已收好' : '已织好') : active ? '当前' : '';

    return '<div id="row-' + row.id + '" class="table-row ' + row.color + (longOperation(row) ? ' long-operation' : '') + (row.done ? ' done' : '') + (finished ? ' row-finished' : '') + (active ? ' active' : '') + (confirming ? ' row-confirming' : '') + (leaving ? ' row-leaving' : '') + '" role="checkbox" aria-checked="' + row.done + '" aria-label="第 ' + row.id + ' 行，' + escape(row.segments.map(function (s) { return s.text + (s.note ? '，' + s.note : ''); }).join('，')) + '" tabindex="0" data-row="' + row.id + '" style="position:absolute;top:' + (topSpace + offsets[index]) + 'px;height:' + heights[index] + 'px;' + (leaving ? 'animation-delay:-' + Math.max(0,elapsed - 350) + 'ms;' : '') + '"><div class="col-number row-number"><span>' + row.id + '</span>' + (tag ? '<span class="current-tag">' + tag + '</span>' : '') + '</div><div class="col-body operation-blocks">' + blocks + '</div><div class="col-stitches stitch-number">' + row.stitches + (row.delta ? '<span class="delta">' + (row.delta > 0 ? '+1' : '−1') + '</span>' : '') + '</div><div class="col-check"><span class="check"' + (confirming ? ' style="animation-delay:-' + elapsed + 'ms"' : '') + '>' + (row.done ? '✓' : '') + '</span>' + rowTimeHTML(row) + '</div></div>';
  }
  function findIndex(y) {
    var lo = 0, hi = offsets.length;
    while (lo < hi) { var mid = (lo + hi) >> 1; if (offsets[mid] + heights[mid] < y) lo = mid + 1; else hi = mid; }
    return lo;
  }
  function renderRows() {
    var scroll = document.getElementById('row-scroll');
    if (!scroll) return;
    var start = Math.max(0, findIndex(scroll.scrollTop - topSpace) - 4);
    var end = Math.min(app.data.rows.length, findIndex(scroll.scrollTop + scroll.clientHeight - topSpace) + 5);
    var html = '';
    for (var i = start; i < end; i++) html += rowHTML(app.data.rows[i], i);
    document.getElementById('row-content').innerHTML = html;
  }
  function render() {
    var old = document.getElementById('row-scroll'), oldTop = old ? old.scrollTop : 0;
    var oldList = container.querySelector('.scarf-list'), listTop = oldList ? oldList.scrollTop : 0;
    var oldSheet = container.querySelector('.library-sheet'), sheetTop = oldSheet ? oldSheet.scrollTop : 0;
    Array.prototype.forEach.call(container.querySelectorAll('details[data-section]'),function(el){folds[el.getAttribute('data-section')] = el.open;});
    var active = document.activeElement, focusedKey = active && active.getAttribute('data-key'), focusedChange = active && active.getAttribute('data-change'), focusedAdopt = active && active.getAttribute('data-adopt'), focusedColor = active && active.getAttribute('data-color'), isJump = active && active.hasAttribute('data-jump'), isTurnInput = active && active.hasAttribute('data-turn-input'), focusedLibrary = active && active.classList.contains('library-sheet');
    var hadDialog = !!container.querySelector('.turn-sheet'), hadLibrary = !!container.querySelector('.library-sheet'), hadMenu = !!container.querySelector('.more-menu'), hadHomeMenu = !!container.querySelector('.scarf-menu');
    cancelPress();
    container.innerHTML = app.data.home ? homeHTML(app.data) : app.data.preview ? previewHTML(app.data) : (app.data.setup ? setupHTML(app.data) : counterHTML(app.data));
    container.setAttribute('aria-busy',String(!!(app.data.busy || app.data.loading)));
    if (app.data.busy || app.data.loading) Array.prototype.forEach.call(container.querySelectorAll('input,select,button'),function(control){control.disabled = true;});
    if (app.data.home) drawHome();
    var newList = container.querySelector('.scarf-list'), newSheet = container.querySelector('.library-sheet');
    if (newList) newList.scrollTop = listTop;
    if (newSheet) newSheet.scrollTop = sheetTop;
    if (app.data.preview) drawPreview();
    if (!app.data.home && !app.data.setup) {
      measureRows(); var scroll = document.getElementById('row-scroll'); scroll.scrollTop = oldTop; renderRows();
      scroll.addEventListener('scroll', function () {
        if (scrollFrame) return;
        scrollFrame = requestAnimationFrame(function () { scrollFrame = 0; var currentScroll = document.getElementById('row-scroll'); if (currentScroll) { viewedRow = Math.min(app.data.rows.length, findIndex(currentScroll.scrollTop + currentScroll.clientHeight / 2 - topSpace) + 1); } renderRows(); });
      }, {passive:true});
    }
    var focus = focusedKey ? container.querySelector('[data-key="' + focusedKey + '"]') : focusedChange ? container.querySelector('[data-change="' + focusedChange + '"]') : focusedAdopt ? container.querySelector('[data-key="' + focusedAdopt + '"]') : focusedColor ? container.querySelector('[data-color="' + focusedColor + '"]') : isTurnInput ? container.querySelector('[data-turn-input]') : isJump ? container.querySelector('[data-jump]') : null;
    if (focusedLibrary && newSheet) focus = newSheet;
    if (app.data.turnSetup && !hadDialog) focus = container.querySelector('.turn-sheet');
    else if ((app.data.switchOpen || app.data.manageOpen) && !hadLibrary) focus = container.querySelector('.library-sheet');
    else if (app.data.homeMenuId && !hadHomeMenu) focus = container.querySelector('.scarf-menu button');
    else if (hadLibrary && !app.data.switchOpen && !app.data.manageOpen) focus = app.data.home ? container.querySelector('.home-actions button') : container.querySelector('.project-switch');
    else if (app.data.menuOpen && !hadMenu) focus = container.querySelector('.more-menu button');
    else if ((hadDialog || hadMenu) && !app.data.preview && !app.data.setup && !app.data.turnSetup && !app.data.menuOpen) focus = container.querySelector('.more-button');
    if (focus) { var pageTop = window.pageYOffset; focus.focus(); window.scrollTo(0, pageTop); }
  }
  function visibleHeight() { return window.visualViewport ? window.visualViewport.height : window.innerHeight; }
  function resize() {
    document.documentElement.style.setProperty('--app-height', visibleHeight() + 'px');
    if (app.data.preview) drawPreview();
    if (app.data.home) drawHome();
    if (!app.data.home && !app.data.setup && app.plan) { measureRows(); window.SophieUI.centerRow(viewedRow); }
  }
  // One short, non-interactive celebration; it lives outside row re-renders.
  var celebrationFrame = 0, celebrationCanvas = null;
  function cancelCelebration() {
    if (celebrationFrame) cancelAnimationFrame(celebrationFrame);
    celebrationFrame = 0;
    if (celebrationCanvas && celebrationCanvas.parentNode) celebrationCanvas.parentNode.removeChild(celebrationCanvas);
    celebrationCanvas = null;
  }
  function celebrate() {
    cancelCelebration();
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var screen = container.querySelector('.counter');
    if (!screen) return;
    var canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
    if (!ctx) return;
    var rect = screen.getBoundingClientRect(), width = rect.width, height = rect.height;
    var ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    canvas.className = 'completion-confetti'; canvas.setAttribute('aria-hidden','true');
    canvas.style.left = rect.left + 'px'; canvas.style.top = rect.top + 'px';
    canvas.style.width = width + 'px'; canvas.style.height = height + 'px';
    ctx.scale(ratio,ratio); document.body.appendChild(canvas); celebrationCanvas = canvas;
    var colors = ['#d83f68','#e6ad3f','#b95d7d','#6499b5','#e8c784'], particles = [];
    for (var i = 0; i < 76; i++) {
      var side = i % 2, spread = Math.random();
      particles.push({x:side ? width - 20 : 20, y:height - 70,
        travel:(side ? -1 : 1) * width * (.18 + spread * .68), vy:-height * (.88 + Math.random() * .28),
        delay:Math.random() * .18, ribbon:i % 4 === 0,
        size:7 + Math.random() * 6, rotation:Math.random() * Math.PI, spin:(Math.random() - .5) * 10,
        color:colors[i % colors.length]});
    }
    var started = null;
    function frame(time) {
      if (started === null) started = time;
      var elapsed = (time - started) / 1000;
      if (elapsed >= 2.4 || app.data.home || app.data.setup || app.data.current ||
          (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) { cancelCelebration(); return; }
      ctx.clearRect(0,0,width,height);
      ctx.globalAlpha = Math.min(1,(2.4 - elapsed) / .6);
      particles.forEach(function(p) {
        var t = elapsed - p.delay;
        if (t < 0) return;
        ctx.save(); ctx.translate(p.x + p.travel * (1 - Math.exp(-1.9 * t)), p.y + p.vy * t + height * .38 * t * t);
        ctx.rotate(p.rotation + p.spin * t); ctx.scale(1,.5 + Math.abs(Math.cos(t * 7 + p.rotation)) * .5);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2,-p.size / 2,p.size,p.size * (p.ribbon ? 1.7 : .7)); ctx.restore();
      });
      celebrationFrame = requestAnimationFrame(frame);
    }
    celebrationFrame = requestAnimationFrame(frame);
  }
  document.addEventListener('visibilitychange',function(){if (document.hidden) cancelCelebration();});
  window.SophieUI = {
    celebrate: celebrate,
    cancelCelebration: cancelCelebration,
    scrollToTop: function() { window.scrollTo(0,0); },
    showModal: function (options) {
      var overlay = document.createElement('div'), canCancel = options.showCancel !== false;
      overlay.className = 'library-overlay confirmation-overlay';
      overlay.innerHTML = '<section class="library-sheet confirmation-sheet" role="dialog" aria-modal="true" aria-labelledby="confirmation-title" tabindex="-1"><h1 id="confirmation-title">' + escape(options.title) + '</h1><p>' + escape(options.content) + '</p><div class="confirmation-actions">' + (canCancel ? '<button type="button" data-modal-choice="cancel">' + escape(options.cancelText || '取消') + '</button>' : '') + '<button type="button" class="primary" data-modal-choice="confirm">' + escape(options.confirmText || '知道了') + '</button></div></section>';
      document.body.appendChild(overlay);
      var sheet = overlay.querySelector('.confirmation-sheet'), settled = false;
      function restoreFocus() {
        if (document.querySelector('.confirmation-overlay')) return;
        var focus = container.querySelector('.library-sheet') || container.querySelector('.home-actions button') || container.querySelector('.project-switch');
        if (focus && !focus.disabled) focus.focus();
      }
      function finish(confirm) {
        if (settled) return;
        settled = true; overlay.parentNode.removeChild(overlay);
        var pending = options.success ? options.success({confirm:confirm}) : null;
        if (pending && typeof pending.then === 'function') pending.then(restoreFocus,restoreFocus);
        else restoreFocus();
      }
      overlay.addEventListener('click',function(e){
        var choice = e.target.closest('[data-modal-choice]');
        if (choice) finish(choice.getAttribute('data-modal-choice') === 'confirm');
        else if (e.target === overlay && canCancel) finish(false);
      });
      overlay.addEventListener('keydown',function(e){
        var controls = overlay.querySelectorAll('button'), first = controls[0], last = controls[controls.length - 1];
        if (e.key === 'Escape') { e.preventDefault(); finish(!canCancel); }
        else if (e.key === 'Tab') {
          if (e.shiftKey && (e.target === first || e.target === sheet)) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && e.target === last) { e.preventDefault(); first.focus(); }
        }
      });
      sheet.focus();
    },
    cancelRowMotion: function() {
      if (rowMotionFrame) cancelAnimationFrame(rowMotionFrame);
      rowMotionFrame = 0;
    },
    centerRow: function (id, smooth) {
      window.SophieUI.cancelRowMotion();
      viewedRow = id;
      var scroll = document.getElementById('row-scroll');
      if (!scroll || !offsets.length || !heights[id - 1]) return;
      var rect = scroll.getBoundingClientRect(), h = heights[id - 1];
      var center = Math.max(rect.top + h / 2, Math.min(visibleHeight() / 2, rect.bottom - h / 2));
      var target = Math.max(0, topSpace + offsets[id - 1] + h / 2 - (center - rect.top));
      var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!smooth || reduced) { scroll.scrollTop = target; renderRows(); return; }
      var from = scroll.scrollTop, started = null;
      function step(now) {
        if (document.getElementById('row-scroll') !== scroll) { rowMotionFrame = 0; return; }
        if (started === null) started = now;
        var t = Math.min(1, (now - started) / 250), ease = 1 - Math.pow(1 - t, 3);
        scroll.scrollTop = from + (target - from) * ease;
        renderRows();
        rowMotionFrame = t < 1 ? requestAnimationFrame(step) : 0;
      }
      rowMotionFrame = requestAnimationFrame(step);
    }
  };
  app.setData = function (patch, cb) {
    Object.keys(patch).forEach(function (key) {
      var parts = key.split('.'), target = app.data;
      for (var i = 0; i < parts.length - 1; i++) target = target[parts[i]];
      target[parts[parts.length - 1]] = patch[key];
    });
    // Typing changes state without rebuilding the input or closing the mobile keyboard.
    var typing = Object.keys(patch).every(function (key) { return key.indexOf('draft.') === 0 || key === 'jump' || key === 'turnFirstDecrease'; });
    var active = document.activeElement;
    var settingTyping = settingsInputActive && app.data.setup && !app.data.preview && active && active.hasAttribute('data-key') && (patch.draft || patch.guidance);
    var feedbackOnly = Object.keys(patch).every(function(key) { return ['recordedRow','recordedStage','recordedAt'].indexOf(key) >= 0; });
    var completionControl = container.querySelector('.completion-control');
    if (feedbackOnly) {
      if (completionControl) {
        completionControl.innerHTML = completionButtonHTML(app.data);
        var heading = container.querySelector('.info-current');
        if (heading) heading.textContent = currentHeading(app.data);
        renderRows();
      }
    }
    else if (settingTyping) refreshSettings();
    else if (!typing) render();
    var announcement = container.querySelector('.counter-announcement');
    if (announcement) announcement.textContent = app.data.recordedRow ? '第 ' + app.data.recordedRow + ' 行已记录' : !app.data.current ? app.data.completionText : '';
    if (cb) cb();
  };
  container.addEventListener('click', function (e) {
    if (app.data.busy || app.data.loading) return;
    var point = e.target.closest('[data-point-row]');
    if (point) { selectPreviewPoint(Number(point.getAttribute('data-point-row'))); return; }
    var pointStep = e.target.closest('[data-point-step]');
    if (pointStep && !pointStep.disabled) {
      var pointIndex = previewPoints.findIndex(function(item) { return item.rowId === previewPointRow; });
      var nextPoint = previewPoints[pointIndex + Number(pointStep.getAttribute('data-point-step'))];
      if (nextPoint) selectPreviewPoint(nextPoint.rowId);
      return;
    }
    var help = e.target.closest('[data-help]');
    if (help) { showSettingsHelp(help.getAttribute('data-help')); return; }
    var adopt = e.target.closest('[data-adopt]');
    if (adopt) { app.onAdoptSuggestion({currentTarget:{dataset:{key:adopt.getAttribute('data-adopt')}}}); return; }
    if (e.target.classList.contains('turn-overlay')) { app.cancelTurn(); return; }
    if (e.target.classList.contains('library-overlay')) { app[e.target.getAttribute('data-close-action')](); return; }
    var swatch = e.target.closest('[data-color]');
    if (swatch) { app.onColor({currentTarget:{dataset:{color:swatch.getAttribute('data-color')}}}); return; }
    var technique = e.target.closest('[data-kind]');
    if (technique) { app.onTechnique({currentTarget:{dataset:{kind:technique.getAttribute('data-kind')}}}); return; }
    var action = e.target.closest('[data-action]');
    if (action && !action.disabled) { app[action.getAttribute('data-action')]({currentTarget:{dataset:{id:action.getAttribute('data-id')}}}); return; }
    var row = e.target.closest('[data-row]');
    if (row) app.toggleRow(Number(row.getAttribute('data-row')));
    else if (app.data.menuOpen && !e.target.closest('.toolbar-actions')) app.closeMenu();
    else if (app.data.homeMenuId && !e.target.closest('.scarf-heading')) app.toggleHomeMenu({currentTarget:{dataset:{id:app.data.homeMenuId}}});
  });
  container.addEventListener('keydown', function (e) {
    suppressClick = false; cancelPress();
    if (app.data.busy || app.data.loading) return;
    if (e.key === 'Escape') {
      if (app.data.switchOpen) { e.preventDefault(); app.closeSwitch(); return; }
      if (app.data.manageOpen) { e.preventDefault(); app.closeManage(); return; }
      if (app.data.homeMenuId) { e.preventDefault(); app.toggleHomeMenu({currentTarget:{dataset:{id:app.data.homeMenuId}}}); return; }
      if (app.data.turnSetup) { e.preventDefault(); app.cancelTurn(); return; }
      if (app.data.menuOpen) { e.preventDefault(); app.closeMenu(); return; }
    }
    if ((app.data.turnSetup || app.data.switchOpen || app.data.manageOpen) && e.key === 'Tab') {
      var sheet = container.querySelector('.turn-sheet,.library-sheet');
      var controls = sheet.querySelectorAll('button:not(:disabled),input:not(:disabled)'), first = controls[0], last = controls[controls.length - 1];
      if (e.shiftKey && (e.target === first || e.target === sheet)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && e.target === last) { e.preventDefault(); first.focus(); }
    }
    if (e.target.hasAttribute('data-row') && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); app.toggleRow(Number(e.target.getAttribute('data-row'))); }
    if (e.target.hasAttribute('data-jump') && e.key === 'Enter') { e.preventDefault(); app.jumpTo(); }
  });
  container.addEventListener('input', function (e) {
    if (e.target.hasAttribute('data-turn-input')) app.onTurnInput({detail:{value:e.target.value}});
    if (e.target.hasAttribute('data-key')) {
      settingsInputActive = true;
      try { app.onInput({currentTarget:{dataset:{key:e.target.getAttribute('data-key')}},detail:{value:e.target.value}}); }
      finally { settingsInputActive = false; }
    }
    if (e.target.hasAttribute('data-jump')) app.onJumpInput({detail:{value:e.target.value}});
  });
  container.addEventListener('change', function (e) {
    var action = e.target.getAttribute('data-change');
    if (action) app[action]({detail:{value:e.target.value}});
  });
  container.addEventListener('toggle',function(e){if (e.target.hasAttribute('data-section')) folds[e.target.getAttribute('data-section')] = e.target.open;},true);
  var pressTimer = null, pressPoint = null, suppressClick = false;
  function cancelPress() { if (pressTimer !== null) window.clearTimeout(pressTimer); pressTimer = null; pressPoint = null; }
  function eligibleRow(target) {
    var row = target.closest('[data-row]');
    if (!row || !app.data.canTurn || app.data.home || app.data.setup || app.data.turnSetup || app.data.switchOpen || app.data.busy || target.closest('button,input')) return false;
    var id = Number(row.getAttribute('data-row'));
    return id === app.data.current || id === app.data.contiguous;
  }
  function startPress(e) {
    suppressClick = false; cancelPress();
    if ((e.type === 'pointerdown' && e.button !== 0) || (e.touches && e.touches.length !== 1) || !eligibleRow(e.target)) return;
    var point = e.touches ? e.touches[0] : e;
    pressPoint = {x:point.clientX,y:point.clientY};
    pressTimer = window.setTimeout(function(){ pressTimer = null; pressPoint = null; suppressClick = true; app.openTurn(); }, 600);
  }
  function movePress(e) {
    if (!pressPoint) return;
    var point = e.touches ? e.touches[0] : e;
    if (!point || Math.abs(point.clientX - pressPoint.x) > 10 || Math.abs(point.clientY - pressPoint.y) > 10) { suppressClick = true; cancelPress(); }
  }
  container.addEventListener('click', function(e){ if (suppressClick) { suppressClick = false; e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  if (window.PointerEvent) {
    container.addEventListener('pointerdown', startPress);
    container.addEventListener('pointermove', movePress);
    window.addEventListener('pointerup', cancelPress);
    window.addEventListener('pointercancel', cancelPress);
  } else {
    container.addEventListener('touchstart', startPress, {passive:true});
    container.addEventListener('touchmove', movePress, {passive:true});
    window.addEventListener('touchend', cancelPress);
    window.addEventListener('touchcancel', cancelPress);
  }
  container.addEventListener('scroll', cancelPress, true);
  container.addEventListener('contextmenu', function(e){
    if (app.data.turnSetup || suppressClick) { e.preventDefault(); return; }
    if (eligibleRow(e.target)) { e.preventDefault(); cancelPress(); suppressClick = true; app.openTurn(); }
  });
  window.addEventListener('resize', resize);
  window.addEventListener('storage',function(e){if (e.key === storage.KEY || e.key === null) app.onLibraryChange();});
  if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
  Promise.resolve(app.onLoad()).then(function(){resize();app.onReady();}).catch(function(){app.setData({loading:false,home:true,libraryError:'记录读取失败，请重新打开。'});});
  render(); resize();
  document.addEventListener('visibilitychange',function(){if (!document.hidden) app.onShow();});
})();
