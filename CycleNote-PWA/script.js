/**
 * CycleNote - Application Logic Ver.2.0
 * Pure vanilla JavaScript with no dependencies.
 * Implements Departure → Return / Cancel state machine.
 */

// ==================== STATE MANAGEMENT ====================
let appRecords = [];
let currentDetailRecordId = null;
let elapsedTimer = null;
let historyFilter = 'cycling'; // 'cycling' | 'maintenance'

// Preset destinations (shared by radio buttons and picker)
const PRESET_DESTINATIONS = [
  '権現ダム',
  '向島公園',
  '大蔵海岸',
  '明石海峡大橋',
  '舞子公園'
];

// LocalStorage keys
const KEY_RECORDS     = 'cyclenote_records';
const KEY_BACKUP      = 'cyclenote_records_backup';
const KEY_BACKUP_TIME = 'cyclenote_backup_time';
const KEY_CURRENT     = 'cyclenote_currentRide'; // { departureTime: ISO string }
const KEY_THEME       = 'cyclenote_theme';

// DOM Elements
const elements = {
  // Navigation & Views
  navHome: document.getElementById('nav-home'),
  navHistory: document.getElementById('nav-history'),
  viewHome: document.getElementById('view-home'),
  viewHistory: document.getElementById('view-history'),
  appMain: document.querySelector('.app-main'),

  // Theme
  themeToggle: document.getElementById('theme-toggle-btn'),

  // Cycling state sections
  cyclingIdleSection:   document.getElementById('cycling-idle-section'),
  cyclingRidingSection: document.getElementById('cycling-riding-section'),
  btnDeparture:         document.getElementById('btn-departure'),
  btnReturn:            document.getElementById('btn-return'),
  btnCancelRide:        document.getElementById('btn-cancel-ride'),
  rideDepartureDisplay: document.getElementById('ride-departure-display'),
  rideElapsedDisplay:   document.getElementById('ride-elapsed-display'),

  // Modals & Overlays
  modalCycling:   document.getElementById('modal-cycling'),
  modalMaint:     document.getElementById('modal-maintenance'),
  modalMaintOther: document.getElementById('modal-maint-other'),
  modalDetail:    document.getElementById('modal-detail'),

  // Forms
  formCycling: document.getElementById('form-cycling'),
  formMaint:   document.getElementById('form-maintenance'),

  // Form Inputs: Cycling
  cyclingId:    document.getElementById('cycling-id'),
  cyclingDate:  document.getElementById('cycling-date'),
  cyclingDest:  document.getElementById('cycling-dest'),
  cyclingDist:  document.getElementById('cycling-dist'),
  cyclingTotalH: document.getElementById('cycling-total-h'),
  cyclingTotalM: document.getElementById('cycling-total-m'),
  cyclingRideH: document.getElementById('cycling-ride-h'),
  cyclingRideM: document.getElementById('cycling-ride-m'),
  cyclingMemo:  document.getElementById('cycling-memo'),

  // Form Inputs: Maintenance
  maintId:   document.getElementById('maint-id'),
  maintDate: document.getElementById('maint-date'),
  maintTask: document.getElementById('maint-task'),
  maintMemo: document.getElementById('maint-memo'),

  // Other Maintenance selection elements
  maintCustomTask:      document.getElementById('maint-custom-task-input'),
  btnCustomMaintSubmit: document.getElementById('btn-custom-maint-submit'),

  // Destination picker elements
  modalDestPicker:   document.getElementById('modal-dest-picker'),
  btnDestPicker:     document.getElementById('btn-dest-picker'),
  btnPickerCancel:   document.getElementById('btn-picker-cancel'),
  btnPickerCancel2:  document.getElementById('btn-picker-cancel2'),
  btnPickerConfirm:  document.getElementById('btn-picker-confirm'),
  pickerDrum:        document.getElementById('picker-drum'),

  // History List Container
  historyList:    document.getElementById('history-list'),
  historyCounter: document.getElementById('history-counter'),
  historyTabs:    document.querySelectorAll('.history-tab'),
  btnExportData:  document.getElementById('btn-export-data'),
  btnImportData:  document.getElementById('btn-import-data'),
  importFileInput: document.getElementById('import-file-input'),

  // Detail Modal Elements
  detailTitle:     document.getElementById('detail-title'),
  detailContent:   document.getElementById('detail-content'),
  btnDetailDelete: document.getElementById('btn-detail-delete'),
  btnDetailEdit:   document.getElementById('btn-detail-edit')
};

// ==================== APP INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  loadRecords();
  updateRideUI();       // Restore ride state on launch
  registerEventListeners();
  registerServiceWorker();
});

// ==================== THEME MANAGEMENT ====================
function initTheme() {
  const savedTheme = localStorage.getItem(KEY_THEME);
  const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = savedTheme || (systemPrefersDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem(KEY_THEME, newTheme);
}

// ==================== STORAGE OPERATIONS ====================
function loadRecords() {
  let raw = localStorage.getItem(KEY_RECORDS);
  if (!raw) {
    raw = localStorage.getItem(KEY_BACKUP);
    if (raw) {
      localStorage.setItem(KEY_RECORDS, raw);
    }
  }
  if (raw) {
    try {
      appRecords = JSON.parse(raw);
      sortRecords();
    } catch (e) {
      console.error('Error parsing records:', e);
      appRecords = [];
    }
  } else {
    appRecords = [];
  }
}

function saveRecords() {
  sortRecords();
  const data = JSON.stringify(appRecords);
  localStorage.setItem(KEY_RECORDS, data);
  localStorage.setItem(KEY_BACKUP, data);
  localStorage.setItem(KEY_BACKUP_TIME, new Date().toISOString());
  renderHistory();
}

function sortRecords() {
  appRecords.sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return b.id.localeCompare(a.id);
  });
}

// ==================== RIDE STATE MACHINE ====================

/**
 * Returns the current ride object from localStorage, or null if no ride in progress.
 */
function getCurrentRide() {
  const raw = localStorage.getItem(KEY_CURRENT);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

/**
 * Called when user taps 出発 (Departure).
 * Records the current timestamp and switches UI to "riding" state.
 */
function handleDeparture() {
  const rideData = { departureTime: new Date().toISOString() };
  localStorage.setItem(KEY_CURRENT, JSON.stringify(rideData));
  updateRideUI();
}

/**
 * Called when user taps キャンセル (Cancel).
 * Discards the stored departure time and returns to idle state.
 */
function handleCancelRide() {
  localStorage.removeItem(KEY_CURRENT);
  clearInterval(elapsedTimer);
  elapsedTimer = null;
  updateRideUI();
}

/**
 * Called when user taps 帰宅 (Return home).
 * Computes elapsed time and pre-fills the cycling form.
 */
function handleReturn() {
  const ride = getCurrentRide();
  if (!ride) return;

  const departure = new Date(ride.departureTime);
  const arrival   = new Date();
  const elapsedMs = arrival - departure;

  const totalMinutes = Math.round(elapsedMs / 60000);
  const totalH = Math.floor(totalMinutes / 60);
  const totalM = totalMinutes % 60;

  // Clear the in-progress ride
  localStorage.removeItem(KEY_CURRENT);
  clearInterval(elapsedTimer);
  elapsedTimer = null;

  // Open cycling form pre-filled with auto-calculated time
  openCyclingFormWithTime(totalH, totalM, departure);
  updateRideUI();
}

/**
 * Updates the home screen cycling section visibility based on current ride state.
 */
function updateRideUI() {
  const ride = getCurrentRide();

  if (ride) {
    // ---- RIDING STATE ----
    elements.cyclingIdleSection.style.display   = 'none';
    elements.cyclingRidingSection.style.display = 'block';

    // Show departure time in local HH:MM format
    const departure = new Date(ride.departureTime);
    elements.rideDepartureDisplay.textContent = formatTimeHHMM(departure);

    // Start / restart elapsed timer
    clearInterval(elapsedTimer);
    updateElapsedDisplay(departure);
    elapsedTimer = setInterval(() => updateElapsedDisplay(departure), 10000);
  } else {
    // ---- IDLE STATE ----
    elements.cyclingIdleSection.style.display   = 'block';
    elements.cyclingRidingSection.style.display = 'none';

    clearInterval(elapsedTimer);
    elapsedTimer = null;
  }
}

function updateElapsedDisplay(departure) {
  const now     = new Date();
  const diffMs  = now - departure;
  const diffMin = Math.floor(diffMs / 60000);
  const h       = Math.floor(diffMin / 60);
  const m       = diffMin % 60;
  if (h === 0) {
    elements.rideElapsedDisplay.textContent = `経過 ${m}分`;
  } else {
    elements.rideElapsedDisplay.textContent = `経過 ${h}時間${m}分`;
  }
}

// Format a Date object to "HH:MM" in local time
function formatTimeHHMM(date) {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

// ==================== VIEW ROUTING ====================
function switchView(viewId, filter) {
  if (filter) {
    historyFilter = filter;
    updateHistoryTabs();
  }
  if (viewId === 'home') {
    elements.navHome.classList.add('active');
    elements.navHistory.classList.remove('active');
    elements.viewHome.classList.add('active');
    elements.viewHistory.classList.remove('active');
  } else if (viewId === 'history') {
    elements.navHome.classList.remove('active');
    elements.navHistory.classList.add('active');
    elements.viewHome.classList.remove('active');
    elements.viewHistory.classList.add('active');
    renderHistory();
  }
  elements.appMain.scrollTop = 0;
}

function updateHistoryTabs() {
  elements.historyTabs.forEach(tab => {
    const isActive = tab.dataset.filter === historyFilter;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
}

function setHistoryFilter(filter) {
  historyFilter = filter;
  updateHistoryTabs();
  renderHistory();
}

// ==================== MODAL HELPERS ====================
function openModal(modal) {
  if (!modal) return;
  modal.classList.add('active');
}

function closeModal(modal) {
  if (!modal) return;
  modal.classList.remove('active');
}

function getTodayDateString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function closeAllModals() {
  closeModal(elements.modalCycling);
  closeModal(elements.modalMaint);
  closeModal(elements.modalMaintOther);
  closeModal(elements.modalDetail);
  closeModal(elements.modalDestPicker);
}

// ==================== EVENT LISTENERS ====================
function registerEventListeners() {
  // Navigation
  elements.navHome.addEventListener('click', () => switchView('home'));
  elements.navHistory.addEventListener('click', () => switchView('history'));

  // History sub-tabs
  elements.historyTabs.forEach(tab => {
    tab.addEventListener('click', () => setHistoryFilter(tab.dataset.filter));
  });

  // Data backup export / import
  elements.btnExportData.addEventListener('click', exportRecordsToFile);
  elements.btnImportData.addEventListener('click', () => elements.importFileInput.click());
  elements.importFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) importRecordsFromFile(file);
    e.target.value = '';
  });

  // Theme
  elements.themeToggle.addEventListener('click', toggleTheme);

  // Close modals by data-close-target
  document.querySelectorAll('[data-close-target]').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetModal = document.getElementById(btn.getAttribute('data-close-target'));
      closeModal(targetModal);
    });
  });

  // Close modals by clicking backdrop
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal(overlay);
    });
  });

  // --- Cycling ride state buttons ---
  elements.btnDeparture.addEventListener('click', handleDeparture);
  elements.btnReturn.addEventListener('click', handleReturn);
  elements.btnCancelRide.addEventListener('click', handleCancelRide);

  // --- Destination radio buttons ↔ text input sync ---
  document.querySelectorAll('input[name="cycling-dest-radio"]').forEach(radio => {
    radio.addEventListener('change', () => {
      if (radio.checked) {
        elements.cyclingDest.value = radio.value;
      }
    });
  });

  // When user types in the text field, clear any radio selection
  elements.cyclingDest.addEventListener('input', () => {
    const val = elements.cyclingDest.value.trim();
    const matchingRadio = document.querySelector(`input[name="cycling-dest-radio"][value="${val}"]`);
    document.querySelectorAll('input[name="cycling-dest-radio"]').forEach(r => r.checked = false);
    if (matchingRadio) matchingRadio.checked = true;
  });

  // Round distance to 1 decimal on blur (e.g. 25.56 → 25.6)
  elements.cyclingDist.addEventListener('blur', () => {
    const val = elements.cyclingDist.value;
    if (val !== '') {
      const rounded = roundToOneDecimal(val);
      if (rounded !== null) elements.cyclingDist.value = formatDistanceDisplay(rounded);
    }
  });

  // --- Drum-roll picker (no_picker variant: elements may be absent) ---
  if (elements.btnDestPicker) {
    elements.btnDestPicker.addEventListener('click', openDestPicker);
  }
  if (elements.btnPickerCancel) {
    elements.btnPickerCancel.addEventListener('click', () => closeModal(elements.modalDestPicker));
  }
  if (elements.btnPickerCancel2) {
    elements.btnPickerCancel2.addEventListener('click', () => closeModal(elements.modalDestPicker));
  }
  if (elements.btnPickerConfirm) {
    elements.btnPickerConfirm.addEventListener('click', confirmDestPicker);
  }

  // --- Maintenance Quick Action Buttons ---
  document.querySelectorAll('.maint-btn:not(.spec-other)').forEach(btn => {
    btn.addEventListener('click', () => openMaintForm(btn.getAttribute('data-task')));
  });

  document.getElementById('btn-maint-other').addEventListener('click', () => {
    openModal(elements.modalMaintOther);
  });

  // Accordion behavior
  document.querySelectorAll('.accordion-header').forEach(header => {
    header.addEventListener('click', () => {
      const group    = header.parentElement;
      const isActive = group.classList.contains('active');
      document.querySelectorAll('.accordion-group').forEach(g => g.classList.remove('active'));
      if (!isActive) group.classList.add('active');
    });
  });

  // Maintenance item selection
  document.querySelectorAll('.select-maint-item-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      closeModal(elements.modalMaintOther);
      openMaintForm(btn.getAttribute('data-task'));
    });
  });

  // Custom maintenance task
  elements.btnCustomMaintSubmit.addEventListener('click', () => {
    const customTask = elements.maintCustomTask.value.trim();
    if (customTask) {
      closeModal(elements.modalMaintOther);
      openMaintForm(customTask);
      elements.maintCustomTask.value = '';
    }
  });

  // Form submits
  elements.formCycling.addEventListener('submit', (e) => { e.preventDefault(); saveCyclingRecord(); });
  elements.formMaint.addEventListener('submit',   (e) => { e.preventDefault(); saveMaintRecord(); });

  // Detail actions
  elements.btnDetailDelete.addEventListener('click', () => deleteRecord(currentDetailRecordId));
  elements.btnDetailEdit.addEventListener('click',   () => editRecord(currentDetailRecordId));
}

// ==================== FORM MANAGEMENT: CYCLING ====================

/**
 * Open cycling form after 帰宅 — pre-fills total duration from auto-calculation.
 * @param {number} totalH  - Calculated hours
 * @param {number} totalM  - Calculated minutes
 * @param {Date}   departure - Departure Date object (used for date field)
 */
// ==================== DESTINATION PICKER (DRUM-ROLL) ====================
function openDestPicker() {
  // Populate drum if empty
  const drum = elements.pickerDrum;
  drum.innerHTML = '';
  PRESET_DESTINATIONS.forEach(dest => {
    const item = document.createElement('div');
    item.className = 'picker-item';
    item.textContent = dest;
    item.dataset.value = dest;
    drum.appendChild(item);
  });

  // Determine initial scroll position based on current text input
  const currentVal = elements.cyclingDest.value.trim();
  let initIdx = PRESET_DESTINATIONS.indexOf(currentVal);
  if (initIdx < 0) initIdx = 0;

  openModal(elements.modalDestPicker);

  // Scroll to initial item after modal transition
  requestAnimationFrame(() => {
    setTimeout(() => {
      scrollPickerTo(initIdx, false);
      updatePickerHighlight();
    }, 50);
  });

  // Update highlight on scroll
  drum.addEventListener('scroll', onPickerScroll, { passive: true });
}

function scrollPickerTo(index, smooth = true) {
  const ITEM_H = 44;
  elements.pickerDrum.scrollTo({
    top: index * ITEM_H,
    behavior: smooth ? 'smooth' : 'instant'
  });
}

function getPickerSelectedIndex() {
  const ITEM_H = 44;
  return Math.round(elements.pickerDrum.scrollTop / ITEM_H);
}

function onPickerScroll() {
  updatePickerHighlight();
}

function updatePickerHighlight() {
  const idx = getPickerSelectedIndex();
  elements.pickerDrum.querySelectorAll('.picker-item').forEach((item, i) => {
    item.classList.toggle('picker-item-selected', i === idx);
  });
}

function confirmDestPicker() {
  const idx   = getPickerSelectedIndex();
  const items = elements.pickerDrum.querySelectorAll('.picker-item');
  if (items[idx]) {
    const selected = items[idx].dataset.value;
    elements.cyclingDest.value = selected;
    // Sync radio button
    document.querySelectorAll('input[name="cycling-dest-radio"]').forEach(r => {
      r.checked = (r.value === selected);
    });
  }
  // Remove scroll listener
  elements.pickerDrum.removeEventListener('scroll', onPickerScroll);
  closeModal(elements.modalDestPicker);
}

// ==================== FORM MANAGEMENT: CYCLING ====================
function openCyclingFormWithTime(totalH, totalM, departure) {
  // Determine the date from departure (ride might have started yesterday)
  const rideDate = `${departure.getFullYear()}-${String(departure.getMonth()+1).padStart(2,'0')}-${String(departure.getDate()).padStart(2,'0')}`;

  elements.cyclingId.value    = '';
  elements.cyclingDate.value  = rideDate;
  elements.cyclingDest.value  = '';
  elements.cyclingDist.value  = '';
  elements.cyclingTotalH.value = totalH > 0 ? totalH : '0';
  elements.cyclingTotalM.value = totalM > 0 ? totalM : '0';
  elements.cyclingRideH.value  = '';
  elements.cyclingRideM.value  = '';
  elements.cyclingMemo.value   = '';

  // Clear all radio selections (destination not yet chosen)
  document.querySelectorAll('input[name="cycling-dest-radio"]').forEach(r => r.checked = false);

  openModal(elements.modalCycling);
}

/**
 * Open cycling form for edit (existing record) or blank new entry.
 */
function openCyclingForm(destination = '', record = null) {
  if (record) {
    elements.cyclingId.value   = record.id;
    elements.cyclingDate.value = record.date;
    elements.cyclingDest.value = record.destination;
    elements.cyclingDist.value = record.distance !== null ? formatDistanceDisplay(record.distance) : '';

    const totalParts = record.durationTotal ? record.durationTotal.split(':') : ['', ''];
    elements.cyclingTotalH.value = totalParts[0] || '';
    elements.cyclingTotalM.value = totalParts[1] || '';

    const rideParts = record.durationRide ? record.durationRide.split(':') : ['', ''];
    elements.cyclingRideH.value = rideParts[0] || '';
    elements.cyclingRideM.value = rideParts[1] || '';

    elements.cyclingMemo.value = record.memo || '';
    // Sync radio
    syncDestRadio(record.destination);
  } else {
    elements.cyclingId.value    = '';
    elements.cyclingDate.value  = getTodayDateString();
    elements.cyclingDest.value  = destination;
    elements.cyclingDist.value  = '';
    elements.cyclingTotalH.value = '';
    elements.cyclingTotalM.value = '';
    elements.cyclingRideH.value  = '';
    elements.cyclingRideM.value  = '';
    elements.cyclingMemo.value   = '';
    syncDestRadio(destination);
  }

  openModal(elements.modalCycling);
}

/** Round a numeric value to one decimal place (四捨五入). Returns null if invalid. */
function roundToOneDecimal(value) {
  const num = parseFloat(value);
  if (isNaN(num) || num < 0) return null;
  return Math.round(num * 10) / 10;
}

function formatDistanceDisplay(distance) {
  if (distance === null || distance === undefined) return '';
  return distance.toFixed(1);
}

// ==================== DATA BACKUP (EXPORT / IMPORT) ====================
function buildBackupPayload() {
  return {
    app: 'CycleNote',
    version: 1,
    exportedAt: new Date().toISOString(),
    records: appRecords
  };
}

function exportRecordsToFile() {
  const payload = buildBackupPayload();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cyclenote_backup_${getTodayDateString()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function importRecordsFromFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      let incoming = [];
      if (Array.isArray(parsed)) {
        incoming = parsed;
      } else if (parsed && Array.isArray(parsed.records)) {
        incoming = parsed.records;
      } else {
        alert('バックアップファイルの形式が正しくありません。');
        return;
      }

      const valid = incoming.filter(r => r && r.id && r.type && r.date);
      if (valid.length === 0) {
        alert('インポートできる記録が見つかりませんでした。');
        return;
      }

      const existingIds = new Set(appRecords.map(r => r.id));
      const newRecords = valid.filter(r => !existingIds.has(r.id));
      const merge = confirm(
        `${valid.length}件の記録が見つかりました。\n` +
        `新規 ${newRecords.length}件を追加します（既存IDは上書きしません）。\n\n` +
        `続行しますか？`
      );
      if (!merge) return;

      appRecords = appRecords.concat(newRecords);
      saveRecords();
      alert(`${newRecords.length}件の記録をインポートしました。`);
    } catch (e) {
      console.error('Import failed:', e);
      alert('ファイルの読み込みに失敗しました。');
    }
  };
  reader.readAsText(file);
}

/** Sync radio buttons to match the given destination string */
function syncDestRadio(dest) {
  document.querySelectorAll('input[name="cycling-dest-radio"]').forEach(r => {
    r.checked = (r.value === dest);
  });
}

function saveCyclingRecord() {
  const id          = elements.cyclingId.value || 'ride_' + Date.now();
  const date        = elements.cyclingDate.value;
  const destination = elements.cyclingDest.value.trim();
  const distanceVal = elements.cyclingDist.value;
  let distance = null;
  if (distanceVal !== '') {
    distance = roundToOneDecimal(distanceVal);
    if (distance === null) {
      alert('距離には0以上の数値を入力してください。');
      return;
    }
    elements.cyclingDist.value = formatDistanceDisplay(distance);
  }

  const totalH = elements.cyclingTotalH.value;
  const totalM = elements.cyclingTotalM.value;
  let durationTotal = '';
  if (totalH !== '' || totalM !== '') {
    const h = String(parseInt(totalH, 10) || 0).padStart(2, '0');
    const m = String(parseInt(totalM, 10) || 0).padStart(2, '0');
    durationTotal = `${h}:${m}`;
  }

  const rideH = elements.cyclingRideH.value;
  const rideM = elements.cyclingRideM.value;
  let durationRide = '';
  if (rideH !== '' || rideM !== '') {
    const h = String(parseInt(rideH, 10) || 0).padStart(2, '0');
    const m = String(parseInt(rideM, 10) || 0).padStart(2, '0');
    durationRide = `${h}:${m}`;
  }

  const memo = elements.cyclingMemo.value.trim();

  const recordObj = { id, type: 'cycling', date, destination, distance, durationTotal, durationRide, memo };

  const existingIdx = appRecords.findIndex(r => r.id === id);
  if (existingIdx !== -1) {
    appRecords[existingIdx] = recordObj;
  } else {
    appRecords.push(recordObj);
  }

  saveRecords();
  closeModal(elements.modalCycling);
  switchView('history', 'cycling');
}

// ==================== FORM MANAGEMENT: MAINTENANCE ====================
function openMaintForm(taskName = '', record = null) {
  if (record) {
    elements.maintId.value   = record.id;
    elements.maintDate.value = record.date;
    elements.maintTask.value = record.taskName;
    elements.maintMemo.value = record.memo || '';
  } else {
    elements.maintId.value   = '';
    elements.maintDate.value = getTodayDateString();
    elements.maintTask.value = taskName;
    elements.maintMemo.value = '';
  }
  openModal(elements.modalMaint);
}

function saveMaintRecord() {
  const id       = elements.maintId.value || 'maint_' + Date.now();
  const date     = elements.maintDate.value;
  const taskName = elements.maintTask.value.trim();
  const memo     = elements.maintMemo.value.trim();

  const recordObj = { id, type: 'maintenance', date, taskName, memo };

  const existingIdx = appRecords.findIndex(r => r.id === id);
  if (existingIdx !== -1) {
    appRecords[existingIdx] = recordObj;
  } else {
    appRecords.push(recordObj);
  }

  saveRecords();
  closeModal(elements.modalMaint);
  switchView('history', 'maintenance');
}

// ==================== HISTORY RENDER LOGIC ====================
function renderHistory() {
  const container = elements.historyList;
  container.innerHTML = '';

  const filtered = appRecords.filter(r => r.type === historyFilter);
  elements.historyCounter.textContent = `${filtered.length}件`;

  if (filtered.length === 0) {
    const icon = historyFilter === 'cycling' ? '🚴' : '🔧';
    const msg = historyFilter === 'cycling'
      ? 'サイクリング記録がまだありません。<br>ホームから出発・帰宅を記録しましょう！'
      : 'メンテナンス記録がまだありません。<br>ホームから作業を記録しましょう！';
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">${icon}</div>
        <p>${msg}</p>
      </div>
    `;
    return;
  }

  const grouped = {};
  filtered.forEach(record => {
    if (!grouped[record.date]) grouped[record.date] = [];
    grouped[record.date].push(record);
  });

  Object.keys(grouped).forEach(dateStr => {
    const dateGroupDiv = document.createElement('div');
    dateGroupDiv.className = 'history-date-group';

    const titleEl = document.createElement('div');
    titleEl.className = 'history-date-title';
    titleEl.textContent = formatDateHeader(dateStr);
    dateGroupDiv.appendChild(titleEl);

    grouped[dateStr].forEach(record => {
      dateGroupDiv.appendChild(createHistoryCard(record));
    });

    container.appendChild(dateGroupDiv);
  });
}

function createHistoryCard(record) {
  const card = document.createElement('div');
  card.className = 'history-card';
  card.addEventListener('click', () => openDetailModal(record.id));

  const isCycling = record.type === 'cycling';
  const iconContainer = document.createElement('div');
  iconContainer.className = `card-icon-container ${isCycling ? 'card-icon-cycling' : 'card-icon-maint'}`;

  const bikeIconSvg   = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="5" cy="17" r="4" />
    <circle cx="19" cy="17" r="4" />
    <polygon points="5,17 10.5,17 9,9.5" />
    <polygon points="9,9.5 16,9.5 10.5,17" />
    <line x1="9" y1="9.5" x2="8.7" y2="8.0" />
    <line x1="7.5" y1="8.0" x2="9.5" y2="8.0" stroke-width="2.2" />
    <line x1="16" y1="9.5" x2="19" y2="17" />
    <path d="M 16 9.5 L 16.5 8.0 L 18.0 8.0 M 18.0 8.0 Q 19.0 8.0 19.0 9.0 Q 19.0 10.0 17.5 10.0" />
  </svg>`;
  const wrenchIconSvg = `<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.3C.5 6.7.9 9.8 2.9 11.8c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.6z"/></svg>`;

  iconContainer.innerHTML = isCycling ? bikeIconSvg : wrenchIconSvg;

  const cardDetails = document.createElement('div');
  cardDetails.className = 'card-details';

  const titleRow = document.createElement('div');
  titleRow.className = 'card-title-row';
  const title = document.createElement('div');
  title.className = 'card-title';
  title.textContent = isCycling ? record.destination : record.taskName;
  titleRow.appendChild(title);
  cardDetails.appendChild(titleRow);

  const meta = document.createElement('div');
  meta.className = 'card-meta';
  if (isCycling) {
    if (record.distance !== null) {
      const distSpan = document.createElement('span');
      distSpan.innerHTML = `<strong>${formatDistanceDisplay(record.distance)}</strong> km`;
      meta.appendChild(distSpan);
    }
    const timeVal = record.durationRide || record.durationTotal;
    if (timeVal) {
      const timeSpan = document.createElement('span');
      timeSpan.textContent = formatDurationDisplay(timeVal);
      meta.appendChild(timeSpan);
    }
  } else {
    const taskTag = document.createElement('span');
    taskTag.textContent = 'メンテナンス';
    meta.appendChild(taskTag);
  }
  cardDetails.appendChild(meta);

  if (record.memo) {
    const snippet = document.createElement('div');
    snippet.className = 'card-memo-preview';
    snippet.textContent = record.memo;
    cardDetails.appendChild(snippet);
  }

  card.appendChild(iconContainer);
  card.appendChild(cardDetails);
  return card;
}

function formatDateHeader(dateStr) {
  try {
    const parts   = dateStr.split('-');
    const year    = parseInt(parts[0], 10);
    const month   = parseInt(parts[1], 10);
    const day     = parseInt(parts[2], 10);
    const d       = new Date(year, month - 1, day);
    const weekday = ['日','月','火','水','木','金','土'][d.getDay()];
    return `${year}年${month}月${day}日 (${weekday})`;
  } catch { return dateStr; }
}

function formatDurationDisplay(durationStr) {
  if (!durationStr) return '';
  const parts = durationStr.split(':');
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  if (h === 0) return `${m}分`;
  return `${h}時間${m}分`;
}

// ==================== DETAIL VIEW & DELETE/EDIT ACTIONS ====================
function openDetailModal(id) {
  const record = appRecords.find(r => r.id === id);
  if (!record) return;

  currentDetailRecordId = id;
  const isCycling = record.type === 'cycling';

  elements.detailTitle.textContent = isCycling ? 'サイクリング詳細' : 'メンテナンス詳細';

  let html = `
    <div class="detail-item">
      <div class="detail-label">日付</div>
      <div class="detail-value">${formatDateHeader(record.date)}</div>
    </div>
    <div class="detail-item">
      <div class="detail-label">${isCycling ? '行き先' : '作業内容'}</div>
      <div class="detail-value-highlight">${isCycling ? record.destination : record.taskName}</div>
    </div>
  `;

  if (isCycling) {
    if (record.distance !== null) {
      html += `
        <div class="detail-item">
          <div class="detail-label">走行距離</div>
          <div class="detail-value"><strong>${formatDistanceDisplay(record.distance)}</strong> km</div>
        </div>
      `;
    }
    if (record.durationTotal) {
      html += `
        <div class="detail-item">
          <div class="detail-label">全体時間</div>
          <div class="detail-value">${formatDurationDisplay(record.durationTotal)}</div>
        </div>
      `;
    }
    if (record.durationRide) {
      html += `
        <div class="detail-item">
          <div class="detail-label">走行時間</div>
          <div class="detail-value">${formatDurationDisplay(record.durationRide)}</div>
        </div>
      `;
    }
  }

  html += `
    <div class="detail-item">
      <div class="detail-label">メモ</div>
      <div class="detail-memo ${!record.memo ? 'color-text-muted' : ''}">${record.memo ? escapeHTML(record.memo) : '（メモなし）'}</div>
    </div>
  `;

  elements.detailContent.innerHTML = html;
  openModal(elements.modalDetail);
}

function deleteRecord(id) {
  if (confirm('この記録を削除してもよろしいですか？')) {
    appRecords = appRecords.filter(r => r.id !== id);
    saveRecords();
    closeModal(elements.modalDetail);
    renderHistory();
  }
}

function editRecord(id) {
  const record = appRecords.find(r => r.id === id);
  if (!record) return;
  closeModal(elements.modalDetail);
  if (record.type === 'cycling') {
    openCyclingForm('', record);
  } else {
    openMaintForm('', record);
  }
}

function escapeHTML(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ==================== SERVICE WORKER REGISTRATION ====================
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js')
        .then(reg => console.log('CycleNote PWA SW registered:', reg.scope))
        .catch(err => console.error('SW registration failed:', err));
    });
  }
}
