(function (root) {
  'use strict';
  var KEY = 'sophie-minitool-v1';
  var LEGACY_KEY = 'sophie-preview-v1';
  var LIBRARY_KEY = 'sophie-scarves-v2';
  var CAPACITY = 3;
  var LOCK_DB = 'sophie-scarves-storage-lock';
  var LOCK_STORE = 'mutex';
  var LOCK_ERROR = '当前环境无法保存围巾，请重新打开。';
  var lockDatabasePromise = null;
  var backend = 'undecided', nativeSDK = null, nativeCache = null, nativeError = null;
  var selectionPromise = null, initializationPromise = null, nativeQueue = Promise.resolve();
  var nativePending = null, SDK_TIMEOUT = 15000;
  function validate(saved) {
    var params = saved && saved.params;
    if (!params || typeof params !== 'object' || Array.isArray(params)) throw new Error('进度参数无法读取');
    // Preserve the original row plan; newer display options may use compatible defaults.
    ['start', 'max', 'end', 'interval', 'firstInc', 'firstDec', 'tail'].forEach(function (key) {
      var value = params[key];
      if (!Object.prototype.hasOwnProperty.call(params, key) ||
          (typeof value !== 'number' && typeof value !== 'string') ||
          (typeof value === 'string' && !value.trim())) throw new Error('进度参数无法读取');
    });
    if (params.rules === 2 || params.rules === 3) {
      ['mode','center','slip','incLead','decLead','firstIncLead','lastDecLead','incMethod','incLayout','incFirst','decLayout','decFirst','finish'].forEach(function(key){
        if (!Object.prototype.hasOwnProperty.call(params, key)) throw new Error('进度参数无法读取');
      });
    }
    if (params.rules === 3 && !Object.prototype.hasOwnProperty.call(params, 'turnAfterRow')) throw new Error('转折记录无法读取');
    return root.SophiePattern.restore(saved);
  }
  function failure(code, message) {
    var error = new Error(message); error.code = code; return error;
  }
  function copy(value) { return JSON.parse(JSON.stringify(value)); }
  function sameValue(a,b) {
    if (a === b) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
    var keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every(function(key) {
      return Object.prototype.hasOwnProperty.call(b,key) && sameValue(a[key],b[key]);
    });
  }
  function integer(value) { return Number.isSafeInteger(value) && value >= 0; }
  function validId(value) { return typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value); }
  function timestamp(value) { return typeof value === 'number' && Number.isFinite(value) && value >= 0; }
  function completionTimes(completed, times) {
    var result = {};
    if (!times || typeof times !== 'object' || Array.isArray(times)) return result;
    completed.forEach(function(id) {
      if (Object.prototype.hasOwnProperty.call(times,id) && timestamp(times[id]) && times[id] > 0 && times[id] <= 8640000000000000)
        result[id] = times[id];
    });
    return result;
  }
  function snapshot(params, completed) {
    var saved = {version:1, params:params, completed:completed};
    var restored = validate(saved);
    for (var i = 0; i < completed.length; i++) {
      if (!Number.isInteger(completed[i]) || completed[i] < 1 || completed[i] > restored.plan.total)
        throw new Error('织行记录无法读取');
    }
    return restored;
  }
  function emptyLibrary() {
    return {version:2, revision:0, items:[], lastOpenedId:null, deletedIds:[], migration:{completed:true, source:null}};
  }
  function legacySource() {
    var raw = root.localStorage.getItem(KEY);
    if (raw !== null) return {key:KEY, raw:raw};
    raw = root.localStorage.getItem(LEGACY_KEY);
    return raw === null ? null : {key:LEGACY_KEY, raw:raw};
  }
  function legacyLibrary(source) {
    var saved = JSON.parse(source.raw);
    validate(saved);
    snapshot(saved.params, saved.completed);
    var now = timestamp(saved.updatedAt) ? saved.updatedAt : Date.now();
    var library = emptyLibrary();
    library.items.push({id:'legacy-scarf-v1', params:copy(saved.params), completed:copy(saved.completed),
      revision:0, createdAt:now, updatedAt:now, lastOpenedAt:now});
    library.lastOpenedId = 'legacy-scarf-v1';
    library.migration = {completed:true, source:source.key};
    return library;
  }
  function readRaw() {
    var raw = root.localStorage.getItem(LIBRARY_KEY);
    if (raw === null) {
      var source = legacySource();
      if (!source) return {library:emptyLibrary(), pending:true};
      try { return {library:legacyLibrary(source), pending:true}; }
      catch (error) { throw failure('READ_ONLY', '旧围巾记录无法读取，请重试'); }
    }
    return {library:parseLibrary(raw), pending:false};
  }
  function parseLibrary(raw) {
    var library;
    try { library = JSON.parse(raw); }
    catch (error) { throw failure('READ_ONLY', '围巾记录库无法读取，请重试'); }
    if (!library || library.version !== 2) throw failure('READ_ONLY', '围巾记录版本无法读取，请重试');
    if (!integer(library.revision) || !Array.isArray(library.items) || library.items.length > CAPACITY ||
        (library.lastOpenedId !== undefined && library.lastOpenedId !== null && !validId(library.lastOpenedId)) ||
        (library.deletedIds !== undefined && (!Array.isArray(library.deletedIds) || library.deletedIds.some(function(id){return !validId(id);}))))
      throw failure('READ_ONLY', '围巾记录库无法读取，请重试');
    var usedIds = Object.create(null);
    library.items.forEach(function(item, index) {
      var id = item && validId(item.id) ? item.id : brokenId(item,index);
      if (usedIds[id]) throw failure('READ_ONLY', '围巾记录编号重复，请重试');
      usedIds[id] = true;
    });
    return library;
  }
  function brokenId(item, index) {
    // Include the slot and its content: a stale delete cannot target a different corrupt entry after another delete.
    var raw = JSON.stringify(item), hash = 2166136261;
    for (var i = 0; i < raw.length; i++) { hash ^= raw.charCodeAt(i); hash = Math.imul(hash, 16777619); }
    return 'broken-slot-' + index + '-' + (hash >>> 0).toString(36);
  }
  function presentItem(item, index) {
    var id = item && validId(item.id) ? item.id : brokenId(item, index);
    var revision = item && integer(item.revision) ? item.revision : 0;
    try {
      if (!item || !validId(item.id) || !integer(item.revision) || !timestamp(item.createdAt) ||
          !timestamp(item.updatedAt) || !timestamp(item.lastOpenedAt)) throw new Error('作品记录无法读取');
      var restored = snapshot(item.params, item.completed);
      return Object.assign({}, copy(item), {name:restored.plan.params.name, completedAt:completionTimes(item.completed,item.completedAt)});
    } catch (error) {
      var name = item && item.params && typeof item.params.name === 'string' ? item.params.name.trim().slice(0,30) : '';
      return {id:id, revision:revision, name:name || '记录无法读取', broken:true, error:'这条围巾记录无法读取',
        createdAt:0, updatedAt:0, lastOpenedAt:0};
    }
  }
  function present(state) {
    var library = state.library;
    return {version:2, revision:library.revision, items:library.items.map(presentItem),
      lastOpenedId:library.lastOpenedId || null, migrationPending:state.pending, readOnly:state.pending};
  }
  function unreadable(error) {
    var source = null, pending = false;
    try { pending = root.localStorage.getItem(LIBRARY_KEY) === null; if (pending) source = legacySource(); } catch (ignored) {}
    return {version:2, revision:0, items:source ? [{id:'legacy-scarf-v1',name:'记录无法读取',revision:0,
      broken:true,error:'旧围巾记录无法读取',createdAt:0,updatedAt:0,lastOpenedAt:0}] : [],
      lastOpenedId:null, migrationPending:pending, readOnly:true, error:error.message || '围巾记录无法读取，请重试'};
  }
  function loadLibrary() {
    if (backend === 'native') {
      var result = nativeCache ? present({library:copy(nativeCache), pending:false}) : present({library:emptyLibrary(), pending:true});
      if (nativeError) { result.readOnly = true; result.error = nativeError.message; }
      return result;
    }
    try { return present(readRaw()); }
    catch (error) { return unreadable(error); }
  }
  function buildVersion(options) {
    var env = options && options.miniToolEnv, value = Number(env && env.buildVersion);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }
  function launchOptionsRequest(sdk) {
    var request;
    try { request = Promise.resolve(sdk.getLaunchOptions()); }
    catch (error) { return Promise.resolve(null); }
    if (typeof root.setTimeout !== 'function' || typeof root.clearTimeout !== 'function') return request;
    return new Promise(function(resolve) {
      var settled = false, timer = root.setTimeout(function(){settled = true;resolve(null);}, SDK_TIMEOUT);
      function done(value) { root.clearTimeout(timer); if (!settled) { settled = true; resolve(value); } }
      request.then(done,function(){done(null);});
    });
  }
  function selectBackend() {
    if (selectionPromise) return selectionPromise;
    selectionPromise = Promise.resolve().then(async function() {
      var xhs = root.xhs, sdk = xhs && xhs.miniTool;
      var version = buildVersion(xhs && xhs.launchOptions);
      if (!version && sdk && typeof sdk.getLaunchOptions === 'function') {
        try { version = buildVersion(await launchOptionsRequest(sdk)); } catch (ignored) {}
      }
      if (Math.floor(version / 1000) >= 9460 && sdk &&
          typeof sdk.getStorage === 'function' && typeof sdk.setStorage === 'function') {
        backend = 'native'; nativeSDK = sdk;
      } else { backend = 'browser'; }
    });
    return selectionPromise;
  }
  function nativeRequest(method, input) {
    if (nativePending) return Promise.reject(failure('SDK_PENDING', '存储仍在响应，请稍后重试。'));
    var request;
    try { request = Promise.resolve(input === undefined ? nativeSDK[method]() : nativeSDK[method](input)); }
    catch (error) { return Promise.reject(error); }
    if (typeof root.setTimeout !== 'function' || typeof root.clearTimeout !== 'function') return request;
    var pending = {}; nativePending = pending;
    return new Promise(function(resolve,reject) {
      var settled = false;
      var timer = root.setTimeout(function() {
        settled = true;
        reject(failure('SDK_PENDING', method === 'setStorage' ? '保存状态待确认，请稍后重试。' : '围巾读取较慢，请稍后重试。'));
      }, SDK_TIMEOUT);
      function done(failed,value) {
        root.clearTimeout(timer);
        if (nativePending === pending) nativePending = null;
        if (!settled) { settled = true; if (failed) reject(value); else resolve(value); }
      }
      // The SDK request cannot be cancelled. After a timeout, reject later operations until it settles;
      // the next attempt must reread storage to learn whether a late write actually committed.
      request.then(function(value){done(false,value);},function(error){done(true,error);});
    });
  }
  async function nativeRead() {
    var response;
    try { response = await nativeRequest('getStorage', {key:LIBRARY_KEY}); }
    catch (error) { if (error && error.code === 'SDK_PENDING') throw error; throw failure('READ_ONLY', '围巾记录无法读取，请重试'); }
    if (!response || !Object.prototype.hasOwnProperty.call(response, 'data') ||
        (response.data !== null && typeof response.data !== 'string'))
      throw failure('READ_ONLY', '围巾记录无法读取，请重试');
    if (response.data === '') {
      // An empty string is ambiguous: confirm the key is absent before initializing a new library.
      // If it exists, keep protecting the unreadable archive instead of replacing its contents.
      if (typeof nativeSDK.getStorageInfo !== 'function')
        throw failure('READ_ONLY', '围巾记录库无法读取，请重试');
      var info;
      try { info = await nativeRequest('getStorageInfo'); }
      catch (error) {
        if (error && error.code === 'SDK_PENDING') throw error;
        throw failure('READ_ONLY', '围巾记录库无法读取，请重试');
      }
      if (!info || !Array.isArray(info.keys) ||
          info.keys.some(function(key) { return typeof key !== 'string'; }) ||
          info.keys.indexOf(LIBRARY_KEY) >= 0)
        throw failure('READ_ONLY', '围巾记录库无法读取，请重试');
      return {raw:null, library:null};
    }
    return {raw:response.data, library:response.data === null ? null : parseLibrary(response.data)};
  }
  async function nativeWrite(library) {
    var raw = JSON.stringify(library);
    try { await nativeRequest('setStorage', {key:LIBRARY_KEY, data:raw}); }
    catch (error) { if (error && error.code === 'SDK_PENDING') throw error; throw failure('STORAGE_WRITE', '围巾未保存，请重试'); }
  }
  function queueNative(operation) {
    var next = nativeQueue.then(operation);
    nativeQueue = next.catch(function(){});
    return next;
  }
  function browserMigration() {
    // A fresh WebView can have no browser storage at all. Only accessible data is migrated;
    // an accessible but corrupt archive must never be mistaken for an empty library.
    var raw;
    try {
      if (!root.localStorage || typeof root.localStorage.getItem !== 'function') return emptyLibrary();
      raw = root.localStorage.getItem(LIBRARY_KEY);
    } catch (unavailable) { return emptyLibrary(); }
    if (raw !== null) return parseLibrary(raw);
    var source;
    try { source = legacySource(); }
    catch (error) { throw failure('READ_ONLY', '旧围巾记录无法读取，请重试'); }
    if (!source) return emptyLibrary();
    try { return legacyLibrary(source); }
    catch (error) { throw failure('READ_ONLY', '旧围巾记录无法读取，请重试'); }
  }
  function initialize() {
    if (initializationPromise) return initializationPromise;
    var attempt = selectBackend().then(function() {
      if (backend !== 'native') return loadLibrary();
      return queueNative(async function() {
        try {
          var stored = await nativeRead();
          if (stored.library) { nativeCache = copy(stored.library); nativeError = null; return loadLibrary(); }
          if (nativeCache) throw failure('READ_ONLY', '围巾记录无法读取，请重试');
          var library = browserMigration();
          // Recheck before committing a migration: another container may already have created its library.
          var latest = await nativeRead();
          if (latest.library) { nativeCache = copy(latest.library); nativeError = null; return loadLibrary(); }
          await nativeWrite(library);
          nativeCache = copy(library); nativeError = null;
          return loadLibrary();
        } catch (error) { nativeError = error; throw error; }
      });
    });
    initializationPromise = attempt.then(function(result) {
      initializationPromise = null; return result;
    }, function(error) {
      initializationPromise = null; throw error;
    });
    return initializationPromise;
  }
  function mutateNative(change) {
    return queueNative(async function() {
      try {
        var state = await nativeRead();
        // Once native storage is selected, a disappeared or unreadable archive cannot trigger browser fallback.
        if (!state.library) throw failure('READ_ONLY', '围巾记录无法读取，请重试');
        nativeCache = copy(state.library);
        var library = state.library, changed = change(library);
        if (changed) {
          if (library.revision >= Number.MAX_SAFE_INTEGER)
            throw failure('READ_ONLY', '围巾记录版本无法继续保存，请重试');
          library.revision++;
          var latest = await nativeRead();
          if (latest.raw !== state.raw) {
            nativeCache = latest.library ? copy(latest.library) : nativeCache;
            throw failure('CONFLICT', '围巾记录已在别处修改，请重新加载');
          }
          // The public SDK has no compare-and-swap or native lock. This check detects observed changes,
          // but cannot provide atomic writes between independent WebViews.
          await nativeWrite(library);
        }
        nativeCache = copy(library); nativeError = null;
        return loadLibrary();
      } catch (error) {
        if (error.code === 'READ_ONLY' || error.code === 'STORAGE_WRITE' || error.code === 'SDK_PENDING') nativeError = error;
        throw error;
      }
    });
  }
  function openLockDatabase() {
    if (lockDatabasePromise) return lockDatabasePromise;
    lockDatabasePromise = new Promise(function(resolve, reject) {
      if (!root.indexedDB || typeof root.indexedDB.open !== 'function') {
        reject(failure('LOCK_UNAVAILABLE', LOCK_ERROR)); return;
      }
      var request, settled = false;
      function fail() { if (!settled) { settled = true; reject(failure('LOCK_UNAVAILABLE', LOCK_ERROR)); } }
      try { request = root.indexedDB.open(LOCK_DB, 1); } catch (error) { fail(); return; }
      request.onupgradeneeded = function() {
        try { if (!request.result.objectStoreNames.contains(LOCK_STORE)) request.result.createObjectStore(LOCK_STORE); }
        catch (error) { fail(); }
      };
      request.onerror = fail; request.onblocked = fail;
      request.onsuccess = function() {
        var database = request.result;
        if (settled) { database.close(); return; }
        if (!database.objectStoreNames.contains(LOCK_STORE)) { database.close(); fail(); return; }
        settled = true;
        database.onversionchange = function() { database.close(); lockDatabasePromise = null; };
        resolve(database);
      };
    }).catch(function(error) { lockDatabasePromise = null; throw error; });
    return lockDatabasePromise;
  }
  function withLock(operation) {
    // A readwrite IndexedDB transaction serializes every tab before its synchronous localStorage read-modify-write.
    // Keep the operation synchronous: awaiting work here would release the transaction before committing the library.
    return openLockDatabase().then(function(database) {
      return new Promise(function(resolve, reject) {
        var transaction, request, result, operationError;
        try {
          transaction = database.transaction(LOCK_STORE, 'readwrite');
          request = transaction.objectStore(LOCK_STORE).get(LIBRARY_KEY);
        } catch (error) {
          // An invalid/closed connection must not poison every subsequent save attempt.
          lockDatabasePromise = null;
          try { database.close(); } catch (ignored) {}
          reject(failure('LOCK_UNAVAILABLE', LOCK_ERROR)); return;
        }
        transaction.oncomplete = function() { resolve(result); };
        transaction.onabort = function() { reject(operationError || failure('LOCK_UNAVAILABLE', LOCK_ERROR)); };
        transaction.onerror = function() { /* onabort reports the final failure. */ };
        request.onsuccess = function() {
          try { result = operation(); }
          catch (error) { operationError = error; transaction.abort(); }
        };
        request.onerror = function() { operationError = failure('LOCK_UNAVAILABLE', LOCK_ERROR); };
      });
    });
  }
  function mutate(change) {
    if (backend === 'undecided') return initialize().then(function(){return mutate(change);});
    if (backend === 'native') return mutateNative(change);
    return withLock(function() {
      var state;
      try { state = readRaw(); }
      catch (error) { throw error.code ? error : failure('READ_ONLY', '围巾记录无法读取，请重试'); }
      var library = state.library, changed = change(library);
      if (changed || state.pending) {
        if (library.revision >= Number.MAX_SAFE_INTEGER)
          throw failure('READ_ONLY', '围巾记录版本无法继续保存，请重试');
        library.revision++;
        try { root.localStorage.setItem(LIBRARY_KEY, JSON.stringify(library)); }
        catch (error) { throw failure('STORAGE_WRITE', '围巾未保存，请检查浏览器空间后重试'); }
      }
      return present({library:library, pending:false});
    });
  }
  function find(library, id) {
    for (var i = 0; i < library.items.length; i++) {
      if (presentItem(library.items[i], i).id === id) return {item:library.items[i], index:i};
    }
    throw failure('CONFLICT', '这条围巾已被删除，请重新加载');
  }
  function requireRevision(item, index, expectedRevision) {
    if (!integer(expectedRevision) || presentItem(item,index).revision !== expectedRevision)
      throw failure('CONFLICT', '这条围巾已在别处修改，请重新加载');
  }
  var api = {
    KEY:LIBRARY_KEY,
    CAPACITY:CAPACITY,
    initialize:initialize,
    load: function () {
      var raw = root.localStorage.getItem(KEY);
      if (raw === null) raw = root.localStorage.getItem(LEGACY_KEY);
      if (raw === null) return null;
      var saved = JSON.parse(raw);
      validate(saved);
      return saved;
    },
    save: function (params, completed) {
      var saved = { version: 1, params: params, completed: completed, updatedAt: Date.now() };
      validate(saved);
      root.localStorage.setItem(KEY, JSON.stringify(saved));
    },
    newId: function() {
      if (root.crypto && typeof root.crypto.getRandomValues === 'function') {
        var bytes = new Uint8Array(16); root.crypto.getRandomValues(bytes);
        return 'scarf-' + Array.prototype.map.call(bytes,function(n){return ('0'+n.toString(16)).slice(-2);}).join('');
      }
      return 'scarf-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + '-' + Math.random().toString(36).slice(2);
    },
    loadLibrary:loadLibrary,
    ensureLibrary: function() { return mutate(function(){return false;}); },
    createScarf: function(input) {
      // Capture the submitted draft before waiting for another tab's transaction.
      var draft;
      try {
        if (!input || !validId(input.id) || input.id.indexOf('broken-slot-') === 0) throw new Error('围巾编号无法读取');
        snapshot(input.params, input.completed);
        draft = copy(input);
      } catch (error) { return Promise.reject(failure('INVALID', error.message)); }
      return mutate(function(library) {
        var existing = library.items.find(function(item){return item && item.id === draft.id;});
        if (existing) {
          if (sameValue(existing.params,draft.params) && sameValue(existing.completed,draft.completed)) return false;
          throw failure('CONFLICT', '这条围巾已保存，请返回首页重新打开');
        }
        if (library.deletedIds && library.deletedIds.indexOf(draft.id) >= 0)
          throw failure('CONFLICT', '这条围巾已被删除，请重新新建');
        if (library.items.length >= CAPACITY) throw failure('CAPACITY', '最多保存 3 条围巾，请先删除一条');
        var now = Date.now();
        library.items.push({id:draft.id,params:draft.params,completed:draft.completed,revision:0,
          createdAt:now,updatedAt:now,lastOpenedAt:now,completedAt:completionTimes(draft.completed,draft.completedAt)});
        library.lastOpenedId = draft.id;
        return true;
      });
    },
    updateScarf: function(id, expectedRevision, changes) {
      var patch;
      try {
        if (!changes || typeof changes !== 'object' || Array.isArray(changes)) throw new Error('围巾修改无法读取');
        if (changes.lastOpenedAt !== undefined && !timestamp(changes.lastOpenedAt)) throw new Error('打开时间无法读取');
        patch = copy(changes);
      } catch (error) { return Promise.reject(failure('INVALID', error.message)); }
      return mutate(function(library) {
        var target = find(library,id), item = target.item;
        var edits = Object.prototype.hasOwnProperty.call(patch,'params') || Object.prototype.hasOwnProperty.call(patch,'completed') || Object.prototype.hasOwnProperty.call(patch,'completedAt');
        if (presentItem(item,target.index).broken) throw failure('READ_ONLY','这条围巾记录无法读取，请重试');
        if (edits) {
          requireRevision(item,target.index,expectedRevision);
          if (item.revision >= Number.MAX_SAFE_INTEGER)
            throw failure('READ_ONLY', '这条围巾记录版本无法继续保存，请重试');
          var params = Object.prototype.hasOwnProperty.call(patch,'params') ? patch.params : item.params;
          var completed = Object.prototype.hasOwnProperty.call(patch,'completed') ? patch.completed : item.completed;
          try { snapshot(params,completed); } catch (error) { throw failure('INVALID',error.message); }
          item.completedAt = completionTimes(completed, Object.prototype.hasOwnProperty.call(patch,'completedAt') ? patch.completedAt : item.completedAt);
          item.params = params; item.completed = completed; item.revision++; item.updatedAt = Date.now();
        }
        if (patch.lastOpenedAt !== undefined) { item.lastOpenedAt = patch.lastOpenedAt; library.lastOpenedId = id; }
        return edits || patch.lastOpenedAt !== undefined;
      });
    },
    deleteScarf: function(id, expectedRevision) {
      return mutate(function(library) {
        var target = find(library,id);
        requireRevision(target.item,target.index,expectedRevision);
        library.items.splice(target.index,1);
        if (library.lastOpenedId === id) library.lastOpenedId = null;
        if (target.item && validId(target.item.id)) {
          if (!library.deletedIds) library.deletedIds = [];
          library.deletedIds.push(target.item.id);
        }
        return true;
      });
    }
  };
  root.SophieStorage = api;
})(this);
