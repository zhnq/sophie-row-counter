var pattern = window.SophiePattern;
var storage = window.SophieStorage;
var settings = window.SophieSettings;
function sameSavedValue(a,b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  var keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(function(key) {
    return Object.prototype.hasOwnProperty.call(b,key) && sameSavedValue(a[key],b[key]);
  });
}
window.SophieCounter = {
  data: { home: true, loading: true, busy: false, scarves: [], scarfCount: 0, capacity: 3, libraryError: '', readOnly: false,
    homeMenuId: '', switchOpen: false, manageOpen: false, activeId: '', completionText: '', recordedRow: 0, recordedStage: '', recordedAt: 0, lastRecord: null,
    setup: false, editing: false, advanced: false, preview: false, previewResets: false, menuOpen:false, turnSetup:false, turnPreview:false, canTurn:false,
    turnRow:0, turnStitches:0, turnFirstDecrease:'', turnRemoved:0, turnMinFirst:0, turnMaxFirst:0, colorOptions:pattern.COLORS, draft: Object.assign({}, pattern.DEFAULTS),
    modeOptions: ['整条围巾', '仅加针段', '仅减针段'], modeIndex: 0,
    methodOptions: ['KFB 同一针加针', 'M1 挑横线加针'], methodIndex: 0,
    slantOptions: ['按原织图', '左倾（M1L）', '右倾（M1R）'], slantIndex: 2,
    layoutOptions: ['单侧加针', '左右交替加针'], layoutIndex: 0, positionOptions: ['行首', '行尾'], positionIndex: 0,
    decLayoutOptions: ['沿用加针侧', '单侧减针', '左右交替减针'], decLayoutIndex: 0, decPositionIndex: 0,
    finishOptions: ['最后一行收针', '暂不记收针'], finishIndex: 0, error: '', savedText: '',
    guidance: null, settingsHints: {}, settingsErrors: {}, settingsSuggestions: {}, settingsAuto: {}, firstDecrease: '',
    rows: [], current: null, count: 0, total: 0, percent: 0, scrollTop: 0, spacer: 120, bottomSpacer: 120, jump: '', gaps: false,
    fields: [{key:'start',label:'起针数'},{key:'max',label:'最宽针数'},{key:'interval',label:'加减针间隔（行）'},
      {key:'firstInc',label:'首次加针行'},{key:'firstDec',label:'减针段首次减针行'},
      {key:'tail',label:'末尾平织行数'},{key:'resume',label:'已完成行数'},
      {key:'firstIncLead',label:'首个加针前下针数'},{key:'incLead',label:'后续加针前下针数'},{key:'decLead',label:'减针行首下针数'}],
    extraFields: [{key:'end',label:'结束针数'},
      {key:'lastDecLead',label:'末次减针行下针数'},
      {key:'center',label:'中间平织行数'},{key:'slip',label:'末尾滑针数'},{key:'gaugeRows',label:'每 10 cm 行数'},{key:'gaugeStitches',label:'每 10 cm 针数'}] },
  onLoad: async function () {
    this.setData({home:true, loading:true, libraryError:'', error:''});
    try {
      if (typeof storage.initialize === 'function') await storage.initialize();
      this.setLibrary(storage.loadLibrary());
      this.setLibrary(await storage.ensureLibrary());
    } catch (err) {
      this.readFailed = true;
      this.setData({libraryError:err.message || '围巾读取失败，请重试。', readOnly:true});
    } finally { this.setData({loading:false}); }
  },
  onReady: function () { if (this.plan && !this.data.home) this.centerCurrent(); },
  onShow: function () { if (this.plan && !this.data.home && !this.data.setup) this.centerCurrent(); },
  completionText: function(plan) {
    return plan.params.mode === 'increase' ? '加针段已完成' : plan.params.mode === 'decrease' ? '减针段已完成' : '围巾织好了';
  },
  restoreScarf: function(item) { return pattern.restore({version:1, params:item.params, completed:item.completed}); },
  setLibrary: function(library) {
    if (!library || !Array.isArray(library.items)) throw new Error('围巾库无法读取，请重试。');
    this.library = library;
    var scarves = library.items.map(function(item) {
      var result = {id:item.id, name:item.name || (item.params && item.params.name) || '未命名围巾', broken:!!item.broken,
        error:item.error || '', params:item.params, revision:item.revision, lastOpenedAt:item.lastOpenedAt || 0,
        createdAt:item.createdAt || 0, plan:null, completed:[], count:0, total:0, current:null, percent:0, gaps:false,
        status:'broken', progressText:'记录无法读取'};
      if (!result.broken) {
        try {
          var restored = this.restoreScarf(item), p = restored.progress;
          Object.assign(result, {name:restored.plan.params.name, params:restored.plan.params, plan:restored.plan,
            completed:p.completed, count:p.count, total:restored.plan.total, current:p.current, percent:p.percent, gaps:p.gaps,
            status:p.current ? 'active' : 'complete',
            completionBadge:restored.plan.params.mode === 'increase' ? '加针段完成' : restored.plan.params.mode === 'decrease' ? '减针段完成' : '已织完',
            progressText:p.count + ' / ' + restored.plan.total + ' 行 · ' + (p.current ? '接下来第 ' + p.current + ' 行' : this.completionText(restored.plan))});
        } catch (err) { result.broken = true; result.error = err.message; }
      }
      return result;
    }, this).sort(function(a,b) { return b.lastOpenedAt - a.lastOpenedAt || a.createdAt - b.createdAt; });
    this.readFailed = !!library.readOnly;
    this.setData({scarves:scarves, scarfCount:scarves.length, readOnly:!!library.readOnly, libraryError:library.error || ''});
  },
  scarfId: function(e) { return e && e.currentTarget && e.currentTarget.dataset ? e.currentTarget.dataset.id : ''; },
  findScarf: function(id) { return this.data.scarves.find(function(item) { return item.id === id; }); },
  resetDraft: function() { this.clearRecorded(); this.previewPlan = null; this.turnCandidate = null; this.draftId = ''; },
  settingsPatch: function(result) {
    var draft = result.draft, feedback = settings.feedback(draft, result.state);
    return {draft:draft, guidance:result.state, settingsHints:feedback.hints, settingsErrors:feedback.errors,
      settingsSuggestions:feedback.suggestions, settingsAuto:result.state.auto, firstDecrease:feedback.firstDecrease,
      modeIndex:['full','increase','decrease'].indexOf(draft.mode),
      methodIndex:['stitch','between'].indexOf(draft.incMethod), slantIndex:['pattern','left','right'].indexOf(draft.incSlant),
      layoutIndex:['single','alternating'].indexOf(draft.incLayout), positionIndex:['start','end'].indexOf(draft.incFirst),
      decLayoutIndex:['follow','single','alternating'].indexOf(draft.decLayout),
      decPositionIndex:['start','end'].indexOf(draft.decFirst), finishIndex:['bindoff','none'].indexOf(draft.finish)};
  },
  updateSettings: function(result) { this.setData(Object.assign(this.settingsPatch(result), {error:''})); },
  changeSetting: function(key, value) {
    var state = this.data.guidance || settings.init(this.data.draft, false).state;
    this.updateSettings(settings.change(this.data.draft, state, key, value));
  },
  onAdoptSuggestion: function(e) {
    var key = e.currentTarget.dataset.key;
    if (this.data.busy || !this.data.setup || this.data.preview || this.fixedInput(key)) return;
    var state = this.data.guidance || settings.init(this.data.draft, false).state;
    this.updateSettings(settings.adopt(this.data.draft, state, key));
  },
  adoptSuggestion: function(e) { this.onAdoptSuggestion(e); },
  goHome: function() {
    if (this.data.busy || this.data.loading) return;
    this.resetDraft(); this.plan = null; this.completed = []; this.completedAt = {}; this.activeRevision = null; this.settingsSource = 'home';
    this.setData({home:true, setup:false, preview:false, editing:false, turnSetup:false, turnPreview:false,
      menuOpen:false, homeMenuId:'', switchOpen:false, manageOpen:false, activeId:'', error:'', jump:''});
    try { this.setLibrary(storage.loadLibrary()); }
    catch (err) { this.setData({libraryError:err.message || '围巾读取失败，请重试。', readOnly:true}); }
    if (window.SophieUI.scrollToTop) window.SophieUI.scrollToTop();
  },
  startNew: function() {
    if (this.data.busy || this.data.loading || !this.data.home || this.data.readOnly || this.data.libraryError) return;
    if (this.data.scarfCount >= this.data.capacity) { this.openManage(); return; }
    this.resetDraft(); this.draftId = storage.newId(); this.plan = null; this.completed = []; this.completedAt = {}; this.activeRevision = null; this.settingsSource = 'home';
    var result = settings.init({}, true), draft = result.draft;
    this.setData(Object.assign(this.settingsPatch(result), {home:false, setup:true, editing:false, preview:false, advanced:false, turnSetup:false, turnPreview:false,
      menuOpen:false, homeMenuId:'', switchOpen:false, manageOpen:false, activeId:'', draft:draft, modeIndex:0,
      methodIndex:['stitch','between'].indexOf(draft.incMethod), slantIndex:['pattern','left','right'].indexOf(draft.incSlant),
      layoutIndex:0, positionIndex:0, decLayoutIndex:0, decPositionIndex:0, finishIndex:0,
      error:'', savedText:'', previewResets:false, jump:''}));
    if (window.SophieUI.scrollToTop) window.SophieUI.scrollToTop();
  },
  activateScarf: async function(id, settings) {
    if (this.data.busy || this.data.loading || (!this.data.home && (this.data.setup || this.data.preview || this.data.turnSetup))) return;
    var fromHome = this.data.home;
    this.setData({busy:true});
    try {
      var library = storage.loadLibrary(), item = library.items.find(function(record) { return record.id === id; });
      if (!item) throw new Error('这条围巾已被删除，请返回首页。');
      if (item.broken) throw new Error(item.error || '这条围巾的记录无法读取，请重试。');
      var restored = this.restoreScarf(item), openingError = library.readOnly ? library.error || '' : '';
      if (!library.readOnly) {
        try {
          library = await storage.updateScarf(id, item.revision, {lastOpenedAt:Date.now()});
          item = library.items.find(function(record) { return record.id === id; });
          restored = this.restoreScarf(item);
        } catch (err) {
          // Row records remain readable when saving the recent-open order fails.
          // An externally deleted record must still stay closed.
          if (err.code === 'CONFLICT') throw err;
          openingError = err.message || '打开顺序保存失败，请稍后重试。';
        }
      }
      this.setLibrary(library); this.resetDraft(); this.plan = restored.plan; this.completed = restored.progress.completed; this.completedAt = item.completedAt || {};
      this.activeRevision = item.revision; this.settingsSource = settings && fromHome ? 'home' : 'counter';
      this.setData({activeId:id, home:false, switchOpen:false, manageOpen:false, homeMenuId:'', jump:''});
      this.renderProgress(true);
      if (settings) this.openSettings(true);
      if (openingError) this.setData({error:openingError});
    } catch (err) { this.setData({error:err.message || '围巾打开失败，请重试。'}); }
    finally { this.setData({busy:false}); }
  },
  openScarf: function(e) { return this.activateScarf(this.scarfId(e), false); },
  openScarfSettings: function(e) { return this.activateScarf(this.scarfId(e), true); },
  toggleHomeMenu: function(e) {
    if (this.data.busy || this.data.loading || !this.data.home) return;
    var id = this.scarfId(e); if (!this.findScarf(id)) return;
    this.setData({homeMenuId:this.data.homeMenuId === id ? '' : id});
  },
  toggleSwitch: function() {
    if (this.data.busy || this.data.home || this.data.setup || this.data.preview || this.data.turnSetup) return;
    this.setData({switchOpen:!this.data.switchOpen, menuOpen:false});
  },
  closeSwitch: function() { if (!this.data.busy) this.setData({switchOpen:false}); },
  openManage: function() { if (!this.data.busy && this.data.home) this.setData({manageOpen:true, homeMenuId:''}); },
  closeManage: function() { if (!this.data.busy) this.setData({manageOpen:false}); },
  deleteScarf: function(e) {
    if (this.data.busy || this.data.loading || !this.data.home || this.data.readOnly) return Promise.resolve(false);
    var id = this.scarfId(e), target = this.findScarf(id), self = this;
    if (!target) return Promise.resolve(false);
    this.setData({busy:true, homeMenuId:''});
    return new Promise(function(resolve) {
      try { window.SophieUI.showModal({title:'删除「' + target.name + '」？', content:'这条围巾的设置和进度将一起删除。', confirmText:'删除', cancelText:'取消',
        success:async function(result) {
          if (!result.confirm) { self.setData({busy:false}); resolve(false); return; }
          try {
            self.setLibrary(await storage.deleteScarf(id, target.revision));
            self.setData({error:'', manageOpen:self.data.manageOpen && self.data.scarfCount > 0});
            resolve(true);
          } catch (err) { self.setData({error:err.message || '删除失败，围巾仍已保留。'}); resolve(false); }
          finally { self.setData({busy:false}); }
        }}); }
      catch (err) { self.setData({busy:false, error:'删除确认无法打开，请重试。'}); resolve(false); }
    });
  },
  retryLibrary: async function() {
    if (this.data.busy || this.data.loading || !this.data.home) return;
    return this.onLoad();
  },
  onLibraryChange: function() {
    if (this.data.busy || this.data.loading) return;
    try { this.setLibrary(storage.loadLibrary()); }
    catch (err) { this.setData({libraryError:err.message || '围巾读取失败，请重试。', readOnly:true}); }
  },
  fixedInput: function(key) {
    return !!(this.data.draft.turnAfterRow && ['start','max','interval','incLead','firstInc','firstIncLead','slip','mode','incMethod','incSlant','incLayout','incFirst'].indexOf(key) >= 0);
  },
  onInput: function (e) {
    var key = e.currentTarget.dataset.key;
    if (this.data.busy || this.fixedInput(key)) return;
    this.changeSetting(key, e.detail.value);
  },
  onColor: function(e) {
    if (this.data.busy) return;
    var color = e.currentTarget.dataset.color;
    if (!pattern.COLORS.some(function(option){return option.key === color;})) return;
    if (this.previewPlan) this.previewPlan.params.yarnColor = color;
    this.setData({'draft.yarnColor':color, previewColor:color});
  },
  onMethod: function(e) {
    if (this.data.busy || this.data.draft.turnAfterRow) return;
    var i = Number(e.detail.value);
    if (!Number.isInteger(i) || i < 0 || i > 1) return;
    this.changeSetting('incMethod', ['stitch','between'][i]);
  },
  onSlant: function(e) {
    if (this.data.busy || this.data.draft.turnAfterRow) return;
    var i = Number(e.detail.value);
    if (!Number.isInteger(i) || i < 0 || i > 2) return;
    this.changeSetting('incSlant', ['pattern','left','right'][i]);
  },
  selectSetting: function(e, key, values) {
    var i = Number(e.detail.value);
    if (this.data.busy || this.fixedInput(key) || !Number.isInteger(i) || i < 0 || i >= values.length) return;
    this.changeSetting(key, values[i]);
  },
  onLayout: function (e) { this.selectSetting(e, 'incLayout', ['single','alternating']); },
  onPosition: function (e) { this.selectSetting(e, 'incFirst', ['start','end']); },
  onDecLayout: function (e) { this.selectSetting(e, 'decLayout', ['follow','single','alternating']); },
  onDecPosition: function (e) { this.selectSetting(e, 'decFirst', ['start','end']); },
  onFinish: function (e) { this.selectSetting(e, 'finish', ['bindoff','none']); },
  onMode: function (e) {
    if (this.data.busy || this.data.draft.turnAfterRow) return;
    this.selectSetting(e, 'mode', ['full','increase','decrease']);
  },
  toggleAdvanced: function () { if (!this.data.busy) this.setData({ advanced: !this.data.advanced }); },
  toggleMenu: function() { if (!this.data.busy) this.setData({menuOpen:!this.data.menuOpen}); },
  closeMenu: function() { this.setData({menuOpen:false}); },
  openTurn: function() {
    if (this.data.busy || this.data.home || this.data.setup || this.data.preview) return;
    var info = this.plan ? pattern.turnInfo(this.plan, this.completed) : null;
    if (!info) { this.closeMenu(); return; }
    this.clearRecorded();
    this.previewPlan = null; this.turnCandidate = null;
    this.setData({menuOpen:false, setup:false, preview:false, editing:false, turnSetup:true, turnPreview:false,
      turnRow:info.row, turnStitches:info.stitches, turnFirstDecrease:info.nextDecrease,
      turnRemoved:info.removed.length, turnMinFirst:info.minFirstDecrease, turnMaxFirst:info.maxFirstDecrease,
      draft:Object.assign({}, this.plan.params, {resume:info.row}), error:''});
  },
  cancelTurn: function() {
    if (this.data.busy) return;
    this.previewPlan = null; this.turnCandidate = null;
    this.setData({menuOpen:false, setup:false, preview:false, turnSetup:false, turnPreview:false, error:''}, this.centerCurrent.bind(this));
  },
  onTurnInput: function(e) { if (!this.data.busy) this.setData({turnFirstDecrease:e.detail.value}); },
  previewTurn: function() {
    if (this.data.busy || !this.data.turnSetup || !this.plan) return;
    var candidate;
    try { candidate = pattern.makeTurn(this.plan, this.completed, this.data.turnFirstDecrease); }
    catch (err) { this.setData({error:err.message}); return; }
    // Choosing a turn row explicitly fixes its first decrease, even for a scarf
    // originally created with an automatically suggested schedule.
    var guidedTurn = settings.init(candidate.plan.params, false);
    candidate.plan.params = settings.change(guidedTurn.draft, guidedTurn.state, 'firstDec', candidate.plan.params.firstDec).draft;
    candidate.plan.params.yarnColor = this.data.draft.yarnColor;
    this.turnCandidate = candidate; this.previewPlan = candidate.plan;
    this.setData({menuOpen:false, turnSetup:false, turnPreview:true, preview:true, setup:true, editing:true, error:'',
      turnFirstDecrease:candidate.firstDecrease, turnRemoved:candidate.removed.length,
      draft:Object.assign({}, candidate.plan.params), previewResets:false, previewCompleted:candidate.completed.length});
    if (window.SophieUI.scrollToTop) window.SophieUI.scrollToTop();
  },
  openSettings: function (internal) {
    if ((internal !== true && this.data.busy) || !this.plan || this.data.home) return;
    this.clearRecorded();
    if (internal !== true) this.settingsSource = 'counter';
    var result = settings.init(Object.assign({}, this.plan.params, { resume: pattern.progress(this.plan, this.completed).contiguous }), false), draft = result.draft;
    this.previewPlan = null; this.turnCandidate = null;
    this.setData(Object.assign(this.settingsPatch(result), { setup: true, preview:false, menuOpen:false, turnSetup:false, turnPreview:false, editing: true, draft: draft, modeIndex: ['full','increase','decrease'].indexOf(draft.mode), layoutIndex: ['single','alternating'].indexOf(draft.incLayout), positionIndex: ['start','end'].indexOf(draft.incFirst),
      methodIndex:['stitch','between'].indexOf(draft.incMethod), slantIndex:['pattern','left','right'].indexOf(draft.incSlant),
      decLayoutIndex:['follow','single','alternating'].indexOf(draft.decLayout),
      decPositionIndex:['start','end'].indexOf(draft.decFirst), finishIndex:['bindoff','none'].indexOf(draft.finish), error: '' }));
  },
  cancelSettings: function () {
    if (this.data.busy) return;
    this.previewPlan = null; this.turnCandidate = null;
    if (this.settingsSource === 'home' || this.draftId || !this.plan) { this.goHome(); return; }
    this.setData({setup:false, preview:false, menuOpen:false, turnSetup:false, turnPreview:false, error:''}, this.centerCurrent.bind(this));
  },
  generate: function () {
    if (this.data.busy || this.data.home || !this.data.setup || this.data.preview) return;
    var candidate;
    var feedback = settings.feedback(this.data.draft, this.data.guidance);
    if (feedback.errors.firstDecrease) { this.setData({error:feedback.errors.firstDecrease}); return; }
    try { candidate = pattern.generate(this.data.draft); } catch (err) { this.setData({ error: err.message }); return; }
    if (this.plan && !this.completedRowsMatch(candidate)) {
      this.previewPlan = null; this.turnCandidate = null;
      this.setData({setup:true, preview:false, error:'已织行不能更改，请保留原织法。'});
      return;
    }
    var compatible = this.isCompatible(candidate);
    this.previewPlan = candidate; this.turnCandidate = null;
    this.setData({preview:true, setup:true, menuOpen:false, turnSetup:false, turnPreview:false, error:'', previewResets:!!((this.plan || this.readFailed) && !compatible),
      previewCompleted:compatible ? this.completed.length : candidate.params.resume});
    if (window.SophieUI.scrollToTop) window.SophieUI.scrollToTop();
  },
  completedRowsMatch: function(candidate, completed) {
    return (completed || this.completed).every(function(id) {
      var old = this.plan.rows[id - 1], row = candidate.rows[id - 1];
      return !!(old && row && old.id === row.id && pattern.sameRowOperations(old, row));
    }, this);
  },
  isCompatible: function(candidate) {
    if (this.draftId) return false;
    return !!(this.plan && candidate.params.resume === pattern.progress(this.plan, this.completed).contiguous && this.completedRowsMatch(candidate));
  },
  backToSettings: function() {
    if (this.data.busy) return;
    this.previewPlan = null;
    if (this.data.turnPreview) {
      this.turnCandidate = null;
      this.setData({preview:false, setup:false, editing:false, turnPreview:false, turnSetup:true, error:''});
      if (window.SophieUI.scrollToTop) window.SophieUI.scrollToTop();
      return;
    }
    this.setData({preview:false, setup:true, error:''});
    if (window.SophieUI.scrollToTop) window.SophieUI.scrollToTop();
  },
  confirmPreview: async function() {
    var candidate = this.previewPlan;
    if (this.data.busy || !this.data.preview || !candidate) return;
    var checked;
    try { checked = pattern.generate(candidate.params); }
    catch (err) { this.setData({error:err.message}); return; }
    var completed;
    if (this.data.turnPreview) {
      if (!this.turnCandidate || this.turnCandidate.plan !== candidate) return;
      completed = this.turnCandidate.completed.slice();
    } else {
      var compatible = this.isCompatible(candidate);
      completed = compatible ? this.completed.slice() : [];
      if (!compatible) for (var i = 1; i <= candidate.params.resume; i++) completed.push(i);
    }
    var retained = this.data.turnPreview ? completed : this.completed;
    if (this.plan && (!this.completedRowsMatch(candidate, retained) || !this.completedRowsMatch(checked, retained))) {
      this.previewPlan = null; this.turnCandidate = null;
      this.setData({setup:true, preview:false, turnPreview:false, turnSetup:false, error:'已织行不能更改，请保留原织法。'});
      return;
    }
    if (candidate.total !== checked.total || candidate.rows.length !== checked.rows.length || !candidate.rows.every(function(row, i) {
      return row.id === checked.rows[i].id && pattern.sameRowOperations(row, checked.rows[i]);
    })) {
      this.previewPlan = null; this.turnCandidate = null;
      this.setData({setup:true, preview:false, turnPreview:false, turnSetup:false, error:'设置已更改，请重新预览。'});
      return;
    }
    if (!await this.persist(candidate.params, completed)) return;
    this.plan = candidate; this.completed = completed; this.previewPlan = null; this.turnCandidate = null; this.draftId = ''; this.readFailed = false;
    this.settingsSource = 'counter'; this.renderProgress(true);
  },
  lastRecord: function(completed, times) {
    var latest = null;
    completed.forEach(function(row) {
      var at = times && times[row];
      if (typeof at === 'number' && Number.isFinite(at) && at > 0 && at <= 8640000000000000 && (!latest || at >= latest.at)) latest = {row:row, at:at};
    });
    return latest;
  },
  persist: async function (params, completed, times) {
    if (this.data.busy) return false;
    var id = this.draftId || this.data.activeId, completedAt = {};
    var previousTimes = times || (this.draftId ? {} : this.completedAt) || {};
    completed.forEach(function(row) { if (Object.prototype.hasOwnProperty.call(previousTimes,row)) completedAt[row] = previousTimes[row]; });
    this.setData({busy:true});
    try {
      var library = this.draftId ? await storage.createScarf({id:id, params:params, completed:completed, completedAt:completedAt}) :
        await storage.updateScarf(id, this.activeRevision, {params:params, completed:completed, completedAt:completedAt});
      var item = library.items.find(function(record) { return record.id === id; });
      if (!item) throw new Error('保存的围巾无法读取，请重试。');
      if (!sameSavedValue(item.params,params) || !sameSavedValue(item.completed,completed) || !sameSavedValue(item.completedAt || {},completedAt))
        throw Object.assign(new Error('保存记录已变化，请返回首页重新打开'), {code:'CONFLICT'});
      this.setLibrary(library); this.activeRevision = item.revision; this.completedAt = item.completedAt || {};
      this.setData({activeId:id, savedText:'已保存到本机', error:''}); return true;
    } catch (err) {
      var message = err.code === 'CAPACITY' || err.code === 'CONFLICT' || err.code === 'READ_ONLY' || err.code === 'LOCK_UNAVAILABLE' || err.code === 'SDK_PENDING' ? err.message : '保存失败，本次未记录。';
      this.setData({error:message || '保存失败，本次未记录。', savedText:err.code === 'SDK_PENDING' ? '保存待确认' : '保存失败'}); return false;
    } finally { this.setData({busy:false}); }
  },
  renderProgress: function (center) {
    var p = pattern.progress(this.plan, this.completed), done = {};
    p.completed.forEach(function(id){done[id]=true;});
    var currentRow = p.current ? this.plan.rows[p.current - 1] : null;
    this.setData({ home:false, setup: false, preview:false, menuOpen:false, turnSetup:false, turnPreview:false,
      canTurn:!!pattern.turnInfo(this.plan, p.completed), editing: false, name: this.plan.params.name, rows: this.plan.rows.map(function(row){
      return Object.assign({}, row, { done: !!done[row.id], active: row.id === p.current });
    }), current: p.current, currentRow: currentRow, count: p.count, total: this.plan.total,
      percent: p.percent, gaps: p.gaps, contiguous: p.contiguous, lastRecord:this.lastRecord(p.completed,this.completedAt), completionText:this.completionText(this.plan), error: '', savedText: '已保存到本机',
      summary: this.plan.params.interval + ' 行一组 · 最宽 ' + this.plan.params.max + ' 针' },
      center ? this.centerCurrent.bind(this) : undefined);
  },
  onTechnique: function (e) {
    var kind = e.currentTarget.dataset.kind;
    if (kind === 'slip') { window.SophieUI.showModal({ title: '滑针', content: '线放前，按上针方向滑针。', showCancel: false, confirmText: '知道了' }); return; }
    if (kind === 'pending') { this.openSettings(); return; }
    if (kind === 'tip') { window.SophieUI.showModal({ title: '尖端行', content: '此行针数不足，需核对织图的起止针法。', showCancel: false, confirmText: '知道了' }); return; }

  },
  clearRecorded: function() {
    if (this.recordedTimer) window.clearTimeout(this.recordedTimer);
    if (this.recordedFinishTimer) window.clearTimeout(this.recordedFinishTimer);
    this.recordedTimer = null; this.recordedFinishTimer = null;
    this.recordedToken = (this.recordedToken || 0) + 1;
    if (window.SophieUI.cancelRowMotion) window.SophieUI.cancelRowMotion();
    if (window.SophieUI.cancelCelebration) window.SophieUI.cancelCelebration();
    if (this.data.recordedRow) this.setData({recordedRow:0, recordedStage:'', recordedAt:0});
  },
  showRecorded: function(id) {
    this.clearRecorded();
    this.data.recordedRow = id; this.data.recordedStage = 'hold'; this.data.recordedAt = Date.now();
    var self = this, token = this.recordedToken;
    this.recordedTimer = window.setTimeout(function() {
      if (self.recordedToken !== token) return;
      self.recordedTimer = null;
      self.setData({recordedStage:'moving'});
      if (self.data.current) self.centerRow(self.data.current, true);
      self.recordedFinishTimer = window.setTimeout(function() {
        if (self.recordedToken !== token) return;
        self.clearRecorded(); self.centerCurrent();
        if (!self.data.current && self.data.count === self.data.total) self.celebrateCompletion();
      }, 250);
    }, 350);
  },
  celebrateCompletion: function() {
    var id = this.data.activeId, now = Date.now();
    this.celebratedAt = this.celebratedAt || {};
    if (!id || this.data.home || this.data.setup || this.data.current ||
        (this.celebratedAt[id] && now - this.celebratedAt[id] < 30000)) return;
    this.celebratedAt[id] = now;
    if (window.SophieUI.celebrate) window.SophieUI.celebrate();
  },
  onRow: function (e) { return this.toggleRow(Number(e.currentTarget.dataset.id)); },
  toggleRow: async function (id) {
    if (this.data.busy || this.data.recordedRow || this.data.home || this.data.setup || this.data.preview || this.data.turnSetup || !this.plan) return;
    var recordingCurrent = id === this.data.current;
    var next = pattern.toggle(this.plan, this.completed, id);
    var times = Object.assign({}, this.completedAt || {});
    if (this.completed.indexOf(id) < 0) times[id] = Date.now();
    else delete times[id];
    if (!await this.persist(this.plan.params, next.completed, times)) return;
    this.completed = next.completed;
    if (window.SophieUI.cancelCelebration) window.SophieUI.cancelCelebration();
    if (recordingCurrent) this.showRecorded(id);
    this.renderProgress(true);
  },
  completeCurrent: function () { if (this.data.current) return this.toggleRow(this.data.current); },
  undo: function () {
    if (this.data.busy) return;
    this.clearRecorded();
    if (this.data.contiguous) return this.toggleRow(this.data.contiguous);
  },
  onJumpInput: function(e) { this.setData({ jump: e.detail.value }); },
  jumpTo: function() {
    if (this.data.busy || !this.plan || this.data.home || this.data.setup) return;
    var id = Number(this.data.jump);
    if (!Number.isInteger(id) || id < 1 || id > this.plan.total) { this.setData({ error: '输入 1–' + this.plan.total + ' 之间的行号' }); return; }
    this.clearRecorded(); this.setData({ error: '' }); this.centerRow(id);
  },
  centerCurrent: function () { if (this.plan) this.centerRow(this.data.recordedStage === 'hold' ? this.data.recordedRow : this.data.current || this.plan.total); },
  onScroll: function (e) { this.actualScroll = e.detail.scrollTop; },
  centerRow: function (id, smooth) {
    if (!this.data.home && !this.data.setup) window.SophieUI.centerRow(id, smooth);
  }
};
