/* store.js — datos guardados en el dispositivo (localStorage), siempre con try/catch.
 * Si el almacenamiento no está disponible la app sigue funcionando con los datos en memoria. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Store = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var KEY_STATE = 'zvg.v1.state';
  var KEY_MEM = 'zvg.v1.memory';
  var BACKUP_FORMAT = 'zonas-de-vida-backup';
  var MAX_POINT_PHOTO_LENGTH = 350000;
  var mem = {};          // respaldo si localStorage falla
  var storage = null;
  try { storage = typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { storage = null; }

  function setBackend(s) { storage = s; }
  function read(key) {
    try { if (storage) { var v = storage.getItem(key); if (v !== null) return JSON.parse(v); } } catch (e) { /* cae al respaldo */ }
    return Object.prototype.hasOwnProperty.call(mem, key) ? JSON.parse(mem[key]) : null;
  }
  function write(key, value) {
    var s = JSON.stringify(value);
    mem[key] = s;
    try { if (storage) { storage.setItem(key, s); return { ok: true }; } } catch (e) { return { ok: false, error: e && e.name === 'QuotaExceededError' ? 'Sin espacio para guardar.' : 'No se pudo guardar en el dispositivo.' }; }
    return { ok: false, error: 'Este navegador no permite guardar datos; se perderán al cerrar.' };
  }

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function newProject(name) {
    return { id: uid(), name: name || 'Proyecto sin nombre', created: Date.now(), points: [], climate: {}, nextPoint: 1 };
  }

  function defaultState() {
    var p = newProject('Mi primer proyecto');
    return { v: 1, projects: [p], currentId: p.id, settings: { areaUnit: 'ha' } };
  }

  function loadState() {
    var s = read(KEY_STATE);
    if (!s || !Array.isArray(s.projects) || !s.projects.length) return defaultState();
    s.projects.forEach(function (p) {
      p.points = Array.isArray(p.points) ? p.points : [];
      p.climate = p.climate || {};
      p.nextPoint = p.nextPoint || (p.points.length + 1);
    });
    if (!s.projects.some(function (p) { return p.id === s.currentId; })) s.currentId = s.projects[0].id;
    s.settings = s.settings || { areaUnit: 'ha' };
    return s;
  }
  function saveState(s) { return write(KEY_STATE, s); }
  function loadMemory() { var m = read(KEY_MEM); return Array.isArray(m) ? m : []; }
  function saveMemory(arr) { return write(KEY_MEM, arr); }

  function createBackup(state, climateMemory) {
    return JSON.stringify({
      format: BACKUP_FORMAT, version: 1, createdAt: Date.now(),
      state: state, climateMemory: climateMemory
    }, null, 2);
  }

  function validateBackup(data) {
    if (!data || data.format !== BACKUP_FORMAT || data.version !== 1) return 'El archivo no es una copia de seguridad compatible.';
    var state = data.state;
    if (!state || state.v !== 1 || !Array.isArray(state.projects) || !state.projects.length ||
        typeof state.currentId !== 'string' || !state.settings || !Array.isArray(data.climateMemory)) {
      return 'La copia está incompleta o tiene una estructura no válida.';
    }
    var ids = Object.create(null);
    for (var i = 0; i < state.projects.length; i++) {
      var p = state.projects[i];
      if (!p || typeof p.id !== 'string' || !p.id || ids[p.id] || typeof p.name !== 'string' ||
          !Array.isArray(p.points) || !p.climate || typeof p.climate !== 'object' || Array.isArray(p.climate) ||
          (p.nextPoint !== undefined && (!Number.isInteger(p.nextPoint) || p.nextPoint < 1))) return 'La copia contiene un proyecto no válido.';
      ids[p.id] = true;
      for (var j = 0; j < p.points.length; j++) {
        var pt = p.points[j];
        if (!pt || typeof pt.lat !== 'number' || !isFinite(pt.lat) || Math.abs(pt.lat) > 90 ||
            typeof pt.lon !== 'number' || !isFinite(pt.lon) || Math.abs(pt.lon) > 180) return 'La copia contiene coordenadas no válidas.';
        if (pt.alt !== null && pt.alt !== undefined && (typeof pt.alt !== 'number' || !isFinite(pt.alt))) return 'La copia contiene una altitud no válida.';
        if (pt.id !== undefined && typeof pt.id !== 'string') return 'La copia contiene un punto no válido.';
        if (pt.style !== undefined && typeof pt.style !== 'string') return 'La copia contiene un estilo de punto no válido.';
        if (pt.photo !== undefined && pt.photo !== null &&
            (typeof pt.photo !== 'string' || pt.photo.length > MAX_POINT_PHOTO_LENGTH ||
             !/^data:image\/jpeg;base64,[A-Za-z0-9+/]*={0,2}$/.test(pt.photo))) return 'La copia contiene una foto de punto no válida.';
      }
    }
    if (!ids[state.currentId]) return 'El proyecto actual de la copia no existe.';
    if (!state.settings || typeof state.settings !== 'object' || Array.isArray(state.settings) ||
        ['ha', 'm2', 'km2', 'fanegadas'].indexOf(state.settings.areaUnit) < 0) return 'La unidad de área de la copia no es válida.';
    for (var k = 0; k < data.climateMemory.length; k++) {
      var r = data.climateMemory[k];
      if (!r || typeof r.lat !== 'number' || !isFinite(r.lat) || Math.abs(r.lat) > 90 ||
          typeof r.lon !== 'number' || !isFinite(r.lon) || Math.abs(r.lon) > 180 ||
          (r.T !== undefined && r.T !== null && (typeof r.T !== 'number' || !isFinite(r.T))) ||
          (r.P !== undefined && r.P !== null && (typeof r.P !== 'number' || !isFinite(r.P))) ||
          (!((typeof r.T === 'number' && isFinite(r.T)) || (typeof r.P === 'number' && isFinite(r.P))))) return 'La copia contiene un dato climático no válido.';
    }
    return null;
  }

  function inspectBackup(text) {
    var data;
    try { data = typeof text === 'string' ? JSON.parse(text) : text; }
    catch (e) { return { ok: false, error: 'El archivo de respaldo no contiene JSON válido.' }; }
    var error = validateBackup(data);
    if (error) return { ok: false, error: error };
    return { ok: true, data: data };
  }

  function restoreBackup(text) {
    var inspected = inspectBackup(text);
    if (!inspected.ok) return inspected;
    var data = inspected.data;
    var stateText = JSON.stringify(data.state), memoryText = JSON.stringify(data.climateMemory);
    var oldState = null, oldMemory = null, haveOldState = false, haveOldMemory = false;
    try {
      if (storage) {
        oldState = storage.getItem(KEY_STATE); haveOldState = true;
        oldMemory = storage.getItem(KEY_MEM); haveOldMemory = true;
        storage.setItem(KEY_STATE, stateText);
        storage.setItem(KEY_MEM, memoryText);
      }
      mem[KEY_STATE] = stateText;
      mem[KEY_MEM] = memoryText;
      return { ok: true, state: data.state, climateMemory: data.climateMemory };
    } catch (e) {
      if (storage) {
        try {
          if (haveOldState) oldState === null ? storage.removeItem(KEY_STATE) : storage.setItem(KEY_STATE, oldState);
          if (haveOldMemory) oldMemory === null ? storage.removeItem(KEY_MEM) : storage.setItem(KEY_MEM, oldMemory);
        } catch (rollbackError) { /* Se informa del error original; la restauración anterior ya se intentó. */ }
      }
      return { ok: false, error: e && e.name === 'QuotaExceededError' ? 'No hay espacio suficiente para restaurar la copia.' : 'No se pudo guardar la copia restaurada en el dispositivo.' };
    }
  }

  return { loadState: loadState, saveState: saveState, loadMemory: loadMemory, saveMemory: saveMemory,
           newProject: newProject, uid: uid, setBackend: setBackend, defaultState: defaultState,
           createBackup: createBackup, inspectBackup: inspectBackup, restoreBackup: restoreBackup };
});
