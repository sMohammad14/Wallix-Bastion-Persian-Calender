const urlGroup = document.getElementById('urlGroup');
const hostInput = document.getElementById('hostUrl');
const toggleBtn = document.getElementById('toggle');
const profileSection = document.getElementById('profileSection');

let profiles = [];

function isValidURL(str) {
  if (!str) return false;
  try {
    const u = new URL(str);
    return u.hostname.includes('.');
  } catch (_) {
    return false;
  }
}

function updateProfileRowState(index) {
  const row = document.getElementById(`profile${index+1}`);
  if (!row) return;
  const check = row.querySelector('.profile-check');
  const nameInput = row.querySelector('.profile-name');
  const calIcon = row.querySelector('.profile-cal-icon');
  const enabled = check.checked;
  nameInput.disabled = !enabled;
  calIcon.style.display = enabled ? '' : 'none';
  if (!enabled) {
    nameInput.value = '';
    row.querySelector('.profile-date-display').textContent = '';
    profiles[index].name = '';
    profiles[index].gregorian = '';
    profiles[index].persian = '';
  }
}

function updateUI(host, enabled) {
  const valid = isValidURL(host);
  const active = valid && (enabled === true);

  let allCheckedValid = true;
  const checkedProfiles = profiles.filter(p => p.enabled);
  if (checkedProfiles.length > 0) {
    for (const p of checkedProfiles) {
      if (!p.name.trim() || !p.gregorian) {
        allCheckedValid = false;
        break;
      }
    }
  }

  if (active) {
    urlGroup.style.display = 'none';
    profileSection.style.display = 'none';
    toggleBtn.textContent = 'خاموش (Reload Page)';
    toggleBtn.classList.add('secondary');
    toggleBtn.disabled = false;
  } else {
    urlGroup.style.display = 'block';
    profileSection.style.display = 'block';
    toggleBtn.textContent = 'روشن (Reload Page)';
    toggleBtn.classList.add('secondary');
    toggleBtn.disabled = !(valid && allCheckedValid);
    if (!toggleBtn.disabled) {
      toggleBtn.classList.remove('secondary');
    }
  }
}

function saveProfiles() {
  const data = profiles.map(p => ({
    name: p.name,
    gregorian: p.gregorian,
    persian: p.persian,
    enabled: p.enabled
  }));
  chrome.storage.local.set({ profiles: data });
}

function loadProfiles(callback) {
  chrome.storage.local.get('profiles', ({ profiles: stored }) => {
    if (stored && Array.isArray(stored)) {
      profiles = stored.map(p => ({
        name: p.name || '',
        gregorian: p.gregorian || '',
        persian: p.persian || '',
        enabled: p.enabled || false
      }));
      while (profiles.length < 3) {
        profiles.push({ name: `پروفایل ${profiles.length+1}`, gregorian: '', persian: '', enabled: false });
      }
    } else {
      profiles = [
        { name: 'پروفایل ۱', gregorian: '', persian: '', enabled: false },
        { name: 'پروفایل ۲', gregorian: '', persian: '', enabled: false },
        { name: 'پروفایل ۳', gregorian: '', persian: '', enabled: false }
      ];
    }
    for (let i = 0; i < 3; i++) {
      const row = document.getElementById(`profile${i+1}`);
      if (!row) continue;
      const check = row.querySelector('.profile-check');
      const nameInput = row.querySelector('.profile-name');
      const dateDisplay = row.querySelector('.profile-date-display');
      check.checked = profiles[i].enabled;
      nameInput.value = profiles[i].name;
      dateDisplay.textContent = profiles[i].persian || '';
      updateProfileRowState(i);
    }
    if (callback) callback();
  });
}

function updateProfileFromDOM(index) {
  const row = document.getElementById(`profile${index+1}`);
  if (!row) return;
  const check = row.querySelector('.profile-check');
  profiles[index].enabled = check.checked;
  if (!profiles[index].enabled) {
    profiles[index].name = '';
    profiles[index].gregorian = '';
    profiles[index].persian = '';
    row.querySelector('.profile-name').value = '';
    row.querySelector('.profile-date-display').textContent = '';
  } else {
    profiles[index].name = row.querySelector('.profile-name').value.trim();
  }
  updateProfileRowState(index);
  saveProfiles();
  refreshUIAfterProfileChange();
}

function refreshUIAfterProfileChange() {
  const host = hostInput.value.trim();
  chrome.storage.local.get('enabled', ({ enabled }) => {
    updateUI(host, enabled === true);
  });
}

function bindProfileEvents() {
  for (let i = 0; i < 3; i++) {
    const row = document.getElementById(`profile${i+1}`);
    if (!row) continue;
    const check = row.querySelector('.profile-check');
    const nameInput = row.querySelector('.profile-name');
    const calIcon = row.querySelector('.profile-cal-icon');

    check.addEventListener('change', () => {
      updateProfileFromDOM(i);
    });
    nameInput.addEventListener('input', () => {
      if (!profiles[i].enabled) return;
      profiles[i].name = nameInput.value.trim();
      saveProfiles();
      refreshUIAfterProfileChange();
    });
    calIcon.addEventListener('click', () => {
      if (!profiles[i].enabled) return;
      buildPopupPicker(i, row);
    });
  }
}

function buildPopupPicker(profileIndex, row) {
  const existing = document.querySelector('.popup-picker-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'popup-picker-overlay';
  overlay.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.4); z-index:9999; display:flex; align-items:center; justify-content:center;';
  
  const pickerContainer = document.createElement('div');
  pickerContainer.innerHTML = `
    <style>
      .popup-picker {
        background: #fff; border: 1px solid #ddd; padding: 12px; direction: rtl;
        font: 14px 'B Yekan', Tahoma, sans-serif; box-shadow: 0 4px 15px rgba(0,0,0,0.1);
        border-radius: 12px; min-width: 300px; user-select: none; border-top: 4px solid #EC6707;
      }
      .popup-picker table { width: 100%; border-collapse: collapse; text-align: center; }
      .popup-picker th { background: #f9f9f9; padding: 4px; font-size: 12px; color: #555; }
      .popup-picker td { cursor: pointer; padding: 6px; border: 1px solid #eee; font-size: 14px; }
      .popup-picker td:hover { background: #ffe6d5; }
      .popup-picker td.sel { background: #EC6707; color: #fff; border-radius: 4px; }
      .popup-picker td.emp { cursor: default; background: transparent; }
      .popup-month-year { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
      .popup-month-year select { padding: 4px 6px; border: 1px solid #ddd; border-radius: 6px; font: 13px 'B Yekan', Tahoma, sans-serif; }
      .popup-month-year button { background: none; border: none; font-size: 16px; color: #EC6707; cursor: pointer; }
      .popup-time-control { display: flex; align-items: center; justify-content: center; margin-top: 10px; direction: ltr; }
      .popup-time-control select { padding: 4px 6px; border: 1px solid #ddd; border-radius: 6px; font: 13px 'B Yekan', Tahoma, sans-serif; margin: 0 8px; }
      .popup-time-label { font: 13px 'B Yekan', Tahoma, sans-serif; margin-right: 4px; }
      .popup-picker-btns { margin-top: 12px; text-align: center; }
      .popup-picker-btns button { margin: 0 4px; padding: 8px 16px; border: none; border-radius: 6px; cursor: pointer; font: 14px 'B Yekan', Tahoma, sans-serif; }
      .popup-picker-btns button.ok { background: #EC6707; color: #fff; }
      .popup-picker-btns button.cancel { background: #e0e0e0; }
    </style>
    <div class="popup-picker" id="popup-calendar">
      <div class="popup-month-year">
        <button id="popup-prev">▶</button>
        <div>
          <select id="popup-month-sel"></select>
          <select id="popup-year-sel"></select>
        </div>
        <button id="popup-next">◀</button>
      </div>
      <table>
        <thead><tr><th>ش</th><th>ی</th><th>د</th><th>س</th><th>چ</th><th>پ</th><th>ج</th></tr></thead>
        <tbody id="popup-body"></tbody>
      </table>
      <div class="popup-time-control">
        ساعت
        <select id="popup-hour"></select>
        :
        <select id="popup-minute"></select>
        <span class="popup-time-label">دقیقه</span>
      </div>
      <div class="popup-picker-btns">
        <button class="cancel" id="popup-cancel">انصراف</button>
        <button class="ok" id="popup-ok">تأیید</button>
      </div>
    </div>`;
  overlay.appendChild(pickerContainer);
  document.body.appendChild(overlay);

  const BASE_J = { y: 1405, m: 1, d: 1, H: 20, M: 0, S: 0 };
  const BASE_G = new Date(2026, 2, 21, 20, 0, 0);

  const isLeap = y => [1,5,9,13,17,22,26,30].includes((y - 475) % 33);
  const monthLen = (y, m) => m <= 6 ? 31 : m <= 11 ? 30 : (isLeap(y) ? 30 : 29);
  const yearLen = y => isLeap(y) ? 366 : 365;
  const dayOfYear = (y, m, d) => {
    let n = 0;
    for (let i = 1; i < m; i++) n += monthLen(y, i);
    return n + d;
  };
  const daysBetween = (y1, m1, d1, y2, m2, d2) => {
    if (y1 === y2) return dayOfYear(y2, m2, d2) - dayOfYear(y1, m1, d1);
    if (y1 < y2) {
      let days = yearLen(y1) - dayOfYear(y1, m1, d1) + 1;
      for (let y = y1 + 1; y < y2; y++) days += yearLen(y);
      return days + dayOfYear(y2, m2, d2) - 1;
    }
    return -daysBetween(y2, m2, d2, y1, m1, d1);
  };
  const addDays = (y, m, d, days) => {
    let doy = dayOfYear(y, m, d) + days;
    while (doy > yearLen(y)) { doy -= yearLen(y); y++; }
    while (doy < 1) { y--; doy += yearLen(y); }
    let mo = 1;
    while (doy > monthLen(y, mo)) { doy -= monthLen(y, mo); mo++; }
    return { y, m: mo, d: doy };
  };
  const toGregorian = (jy, jm, jd, h, mi, s) => {
    const days = daysBetween(BASE_J.y, BASE_J.m, BASE_J.d, jy, jm, jd);
    const date = new Date(BASE_G.getTime() + days * 86400000);
    date.setHours(h, mi, s, 0);
    return date;
  };
  const toJalali = date => {
    const baseDay = new Date(BASE_G.getFullYear(), BASE_G.getMonth(), BASE_G.getDate());
    const targetDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const offset = Math.round((targetDay - baseDay) / 86400000);
    const j = addDays(BASE_J.y, BASE_J.m, BASE_J.d, offset);
    return {
      y: j.y, m: j.m, d: j.d,
      H: date.getHours(), M: date.getMinutes(), S: date.getSeconds(),
      wd: date.getDay()
    };
  };
  const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
  const toPersian = n => String(n).replace(/\d/g, d => persianDigits[d]);
  const monthNames = ['','فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
  const dayNames = ['یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنج‌شنبه','جمعه','شنبه'];
  const fmtJalali = (j, time = true) => {
    let s = `${dayNames[j.wd]} ${toPersian(j.d)} ${monthNames[j.m]} ${toPersian(j.y)}`;
    if (time) {
      const hh = toPersian(String(j.H).padStart(2, '0'));
      const mm = toPersian(String(j.M).padStart(2, '0'));
      s += ` ساعت ${hh}:${mm}`;
    }
    return s;
  };
  const fmtGreg = d =>
    `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;

  let sY, sM, sD, sH, sMin;
  if (profiles[profileIndex].gregorian) {
    const d = new Date(profiles[profileIndex].gregorian.replace(' ', 'T'));
    const j = toJalali(d);
    sY = j.y; sM = j.m; sD = j.d; sH = j.H; sMin = j.M;
  } else {
    const now = new Date();
    const j = toJalali(now);
    sY = j.y; sM = j.m; sD = j.d; sH = j.H; sMin = j.M;
  }

  const monthSel = document.getElementById('popup-month-sel');
  const yearSel = document.getElementById('popup-year-sel');
  const hourSel = document.getElementById('popup-hour');
  const minSel = document.getElementById('popup-minute');

  monthSel.innerHTML = '';
  for (let i = 1; i <= 12; i++) {
    monthSel.appendChild(Object.assign(document.createElement('option'), { value: i, text: monthNames[i] }));
  }
  yearSel.innerHTML = '';
  for (let y = 1400; y <= 1450; y++) {
    yearSel.appendChild(Object.assign(document.createElement('option'), { value: y, text: toPersian(y) }));
  }
  hourSel.innerHTML = '';
  for (let h = 0; h <= 23; h++) {
    hourSel.appendChild(Object.assign(document.createElement('option'), { value: h, text: toPersian(String(h).padStart(2,'0')) }));
  }
  minSel.innerHTML = '';
  for (let m = 0; m <= 59; m++) {
    minSel.appendChild(Object.assign(document.createElement('option'), { value: m, text: toPersian(String(m).padStart(2,'0')) }));
  }

  function setSelects(y, m, H, M) {
    monthSel.value = m;
    yearSel.value = y;
    hourSel.value = H;
    minSel.value = M;
  }

  const tbody = document.getElementById('popup-body');
  const cal = document.getElementById('popup-calendar');

  function render(y, m) {
    const first = toGregorian(y, m, 1, 0, 0, 0);
    let startIdx = (first.getDay() + 1) % 7;
    const len = monthLen(y, m);
    tbody.innerHTML = '';
    let row = document.createElement('tr'), cnt = 0;
    for (let i = 0; i < startIdx; i++) {
      row.appendChild(Object.assign(document.createElement('td'), { className: 'emp' }));
      cnt++;
    }
    for (let d = 1; d <= len; d++) {
      if (cnt % 7 === 0 && cnt !== 0) { tbody.appendChild(row); row = document.createElement('tr'); }
      const td = document.createElement('td');
      td.textContent = toPersian(d);
      if (d === sD && y === sY && m === sM) td.classList.add('sel');
      td.addEventListener('click', () => {
        sD = d;
        cal.querySelectorAll('td').forEach(t => t.classList.remove('sel'));
        td.classList.add('sel');
      });
      row.appendChild(td);
      cnt++;
    }
    if (row.children.length) tbody.appendChild(row);
    setSelects(y, m, sH, sMin);
  }

  setSelects(sY, sM, sH, sMin);
  render(sY, sM);

  monthSel.addEventListener('change', () => { sM = parseInt(monthSel.value); render(sY, sM); });
  yearSel.addEventListener('change', () => { sY = parseInt(yearSel.value); render(sY, sM); });
  hourSel.addEventListener('change', () => { sH = parseInt(hourSel.value); });
  minSel.addEventListener('change', () => { sMin = parseInt(minSel.value); });

  document.getElementById('popup-prev').addEventListener('click', () => {
    if (sM === 1) { sY--; sM = 12; } else sM--;
    render(sY, sM);
  });
  document.getElementById('popup-next').addEventListener('click', () => {
    if (sM === 12) { sY++; sM = 1; } else sM++;
    render(sY, sM);
  });

  document.getElementById('popup-cancel').addEventListener('click', () => overlay.remove());
  document.getElementById('popup-ok').addEventListener('click', () => {
    const gregDate = toGregorian(sY, sM, sD, sH, sMin, 0);
    const gregStr = fmtGreg(gregDate);
    const persianStr = fmtJalali(toJalali(gregDate));
    profiles[profileIndex].gregorian = gregStr;
    profiles[profileIndex].persian = persianStr;
    const dateDisplay = row.querySelector('.profile-date-display');
    dateDisplay.textContent = persianStr;
    saveProfiles();
    refreshUIAfterProfileChange();
    overlay.remove();
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

loadProfiles(() => {
  bindProfileEvents();
  chrome.storage.local.get(['host', 'enabled'], ({ host, enabled }) => {
    hostInput.value = host || '';
    updateUI(host || '', enabled === true);
  });
});

hostInput.addEventListener('input', () => {
  const val = hostInput.value.trim();
  chrome.storage.local.get('enabled', ({ enabled }) => {
    updateUI(val, enabled === true);
  });
});

toggleBtn.addEventListener('click', () => {
  chrome.storage.local.get('enabled', ({ enabled }) => {
    const currentlyEnabled = enabled === true;
    if (!currentlyEnabled) {
      const newHost = hostInput.value.trim();
      if (!isValidURL(newHost)) return;
      const checked = profiles.filter(p => p.enabled);
      for (const p of checked) {
        if (!p.name.trim() || !p.gregorian) return;
      }
      chrome.storage.local.set({ host: newHost, enabled: true }, () => {
        updateUI(newHost, true);
        chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
          if (tabs[0]) chrome.tabs.reload(tabs[0].id);
        });
      });
    } else {
      profiles.forEach((p, i) => {
        p.enabled = false;
        p.name = '';
        p.gregorian = '';
        p.persian = '';
      });
      saveProfiles();
      for (let i = 0; i < 3; i++) {
        const row = document.getElementById(`profile${i+1}`);
        if (row) {
          row.querySelector('.profile-check').checked = false;
          row.querySelector('.profile-name').value = '';
          row.querySelector('.profile-date-display').textContent = '';
          updateProfileRowState(i);
        }
      }
      chrome.storage.local.set({ host: '', enabled: false }, () => {
        hostInput.value = '';
        updateUI('', false);
        chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
          if (tabs[0]) chrome.tabs.reload(tabs[0].id);
        });
      });
    }
  });
});
