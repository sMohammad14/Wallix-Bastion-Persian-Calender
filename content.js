(function () {
  'use strict';

  const LOG = '[PAM Picker]';
  const log = (...args) => console.log(LOG, ...args);
  const warn = (...args) => console.warn(LOG, ...args);

  let extensionEnabled = false;
  let mainInterval = null;
  let allowedHost = '';

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
  const fromPersian = s => s.replace(/[۰-۹]/g, d => persianDigits.indexOf(d));

  const dayNames = ['یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنج‌شنبه','جمعه','شنبه'];
  const monthNames = ['','فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];

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

  const boundInputs = new Set();

  // ========== ابزارها ==========
  let picker = null, outsideHandler = null, originalValue = '';

  function closePicker(doc) {
    if (picker) { picker.remove(); picker = null; }
    if (outsideHandler) {
      doc.removeEventListener('click', outsideHandler);
      outsideHandler = null;
    }
  }

  function applyAndUpdate(input, doc, sY, sM, sD, sH, sMin) {
    const gregDate = toGregorian(sY, sM, sD, sH, sMin, 0);
    input.value = fmtGreg(gregDate);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    updateLabel(input, doc);
  }

  function parseDate(str) {
    const match = str.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2}) (\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
    if (!match) return null;
    const [, y, m, d, h, min, s] = match;
    return new Date(parseInt(y), parseInt(m)-1, parseInt(d), parseInt(h), parseInt(min), s ? parseInt(s) : 0);
  }

  function buildPicker(input, icon, doc, win) {
    closePicker(doc);
    originalValue = input.value;

    let jNow = toJalali(new Date());
    const parsed = parseDate(input.value);
    if (parsed && !isNaN(parsed)) jNow = toJalali(parsed);

    let sY = jNow.y, sM = jNow.m, sD = jNow.d, sH = jNow.H, sMin = jNow.M;

    const box = doc.createElement('div');
    box.innerHTML = `
      <style>
        .pam-picker {
          position: absolute; z-index: 999999; background: #fff; border: 1px solid #ddd;
          padding: 12px; direction: rtl; font: 14px 'B Yekan', Tahoma, sans-serif;
          box-shadow: 0 4px 15px rgba(0,0,0,0.1); border-radius: 12px;
          min-width: 320px; user-select: none; border-top: 4px solid #EC6707;
        }
        .pam-picker table { width: 100%; border-collapse: collapse; text-align: center; }
        .pam-picker th { background: #f9f9f9; padding: 4px; font-size: 12px; color: #555; }
        .pam-picker td { cursor: pointer; padding: 6px; border: 1px solid #eee; font-size: 14px; }
        .pam-picker td:hover { background: #ffe6d5; }
        .pam-picker td.sel { background: #EC6707; color: #fff; border-radius: 4px; }
        .pam-picker td.emp { cursor: default; background: transparent; }
        .pam-month-year { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; direction: rtl; }
        .pam-month-year select { padding: 4px 6px; border: 1px solid #ddd; border-radius: 6px; font: 13px 'B Yekan', Tahoma, sans-serif; }
        .pam-month-year button { background: none; border: none; font-size: 16px; color: #EC6707; cursor: pointer; }
        .pam-time-control { display: flex; align-items: center; justify-content: center; margin-top: 10px; direction: ltr; }
        .pam-time-control select { padding: 4px 6px; border: 1px solid #ddd; border-radius: 6px; font: 13px 'B Yekan', Tahoma, sans-serif; margin: 0 8px; }
        .pam-time-label { font: 13px 'B Yekan', Tahoma, sans-serif; margin-right: 4px; }
        .pam-profile-btns { margin-top: 8px; text-align: center; direction: rtl; }
        .pam-profile-btns button {
          margin: 2px; padding: 4px 10px; background: #f0f0f0; border: 1px solid #ccc;
          border-radius: 4px; cursor: pointer; font: 12px 'B Yekan', Tahoma, sans-serif;
        }
        .pam-picker-btns { margin-top: 12px; text-align: center; }
        .pam-picker-btns button { margin: 0 4px; padding: 8px 16px; border: none; border-radius: 6px; cursor: pointer; font: 14px 'B Yekan', Tahoma, sans-serif; }
        .pam-picker-btns button.pam-ok { background: #EC6707; color: #fff; }
        .pam-picker-btns button.pam-ok:hover { background: #d45c06; }
        .pam-picker-btns button.pam-cancel { background: #e0e0e0; }
        .pam-picker-btns button.pam-cancel:hover { background: #ccc; }
      </style>
      <div class="pam-picker" id="pam-calendar">
        <div class="pam-month-year">
          <button id="pam-prev">▶</button>
          <div>
            <select id="pam-month-sel"></select>
            <select id="pam-year-sel"></select>
          </div>
          <button id="pam-next">◀</button>
        </div>
        <table>
          <thead><tr><th>ش</th><th>ی</th><th>د</th><th>س</th><th>چ</th><th>پ</th><th>ج</th></tr></thead>
          <tbody id="pam-body"></tbody>
        </table>
        <div class="pam-time-control">
          ساعت
          <select id="pam-hour"></select>
          :
          <select id="pam-minute"></select>
          <span class="pam-time-label">دقیقه</span>
        </div>
        <div class="pam-profile-btns" id="pam-profile-btns"></div>
        <div class="pam-picker-btns">
          <button class="pam-cancel" id="pam-cancel">انصراف</button>
          <button class="pam-ok" id="pam-ok">تأیید</button>
        </div>
      </div>`;
    doc.body.appendChild(box);
    picker = box;

    const cal = box.querySelector('#pam-calendar');
    const monthSel = box.querySelector('#pam-month-sel');
    const yearSel = box.querySelector('#pam-year-sel');
    const hourSel = box.querySelector('#pam-hour');
    const minSel = box.querySelector('#pam-minute');

    for (let i = 1; i <= 12; i++) monthSel.appendChild(Object.assign(doc.createElement('option'), { value: i, text: monthNames[i] }));
    for (let y = 1400; y <= 1450; y++) yearSel.appendChild(Object.assign(doc.createElement('option'), { value: y, text: toPersian(y) }));
    for (let h = 0; h <= 23; h++) hourSel.appendChild(Object.assign(doc.createElement('option'), { value: h, text: toPersian(String(h).padStart(2,'0')) }));
    for (let m = 0; m <= 59; m++) minSel.appendChild(Object.assign(doc.createElement('option'), { value: m, text: toPersian(String(m).padStart(2,'0')) }));

    function setSelects(y, m, H, M) {
      monthSel.value = m; yearSel.value = y; hourSel.value = H; minSel.value = M;
    }

    function render(y, m) {
      const first = toGregorian(y, m, 1, 0, 0, 0);
      let startIdx = (first.getDay() + 1) % 7;
      const len = monthLen(y, m);
      const tbody = cal.querySelector('#pam-body');
      tbody.innerHTML = '';
      let row = doc.createElement('tr'), cnt = 0;
      for (let i = 0; i < startIdx; i++) {
        row.appendChild(Object.assign(doc.createElement('td'), { className: 'emp' }));
        cnt++;
      }
      for (let d = 1; d <= len; d++) {
        if (cnt % 7 === 0 && cnt !== 0) { tbody.appendChild(row); row = doc.createElement('tr'); }
        const td = doc.createElement('td');
        td.textContent = toPersian(d);
        if (d === sD && y === sY && m === sM) td.classList.add('sel');
        td.onclick = () => {
          sD = d;
          cal.querySelectorAll('td').forEach(t => t.classList.remove('sel'));
          td.classList.add('sel');
          applyAndUpdate(input, doc, sY, sM, sD, sH, sMin);
        };
        row.appendChild(td);
        cnt++;
      }
      if (row.children.length) tbody.appendChild(row);
      setSelects(y, m, sH, sMin);
    }

    setSelects(sY, sM, sH, sMin);
    render(sY, sM);

    hourSel.onchange = () => { sH = parseInt(hourSel.value); applyAndUpdate(input, doc, sY, sM, sD, sH, sMin); };
    minSel.onchange = () => { sMin = parseInt(minSel.value); applyAndUpdate(input, doc, sY, sM, sD, sH, sMin); };
    monthSel.onchange = () => { sM = parseInt(monthSel.value); render(sY, sM); };
    yearSel.onchange = () => { sY = parseInt(yearSel.value); render(sY, sM); };

    box.querySelector('#pam-prev').onclick = () => {
      if (sM === 1) { sY--; sM = 12; } else sM--;
      render(sY, sM);
    };
    box.querySelector('#pam-next').onclick = () => {
      if (sM === 12) { sY++; sM = 1; } else sM++;
      render(sY, sM);
    };

    box.querySelector('#pam-cancel').onclick = () => {
      input.value = originalValue;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      updateLabel(input, doc);
      closePicker(doc);
    };
    box.querySelector('#pam-ok').onclick = () => closePicker(doc);

    // بارگذاری پروفایل‌ها و ایجاد دکمه‌ها (با تأخیر برای اطمینان)
    setTimeout(() => {
      chrome.storage.local.get('profiles', ({ profiles: storedProfiles }) => {
        if (storedProfiles && Array.isArray(storedProfiles)) {
          const enabled = storedProfiles.filter(p => p.enabled && p.name && p.gregorian);
          const container = box.querySelector('#pam-profile-btns');
          container.innerHTML = '';
          if (enabled.length > 0) {
            enabled.forEach(p => {
              const btn = doc.createElement('button');
              btn.textContent = p.name;
              btn.addEventListener('click', () => {
                input.value = p.gregorian;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                updateLabel(input, doc);
                closePicker(doc);
              });
              container.appendChild(btn);
            });
          }
        }
      });
    }, 50);

    const rect = icon.getBoundingClientRect();
    cal.style.top = (rect.bottom + win.scrollY + 5) + 'px';
    cal.style.left = (rect.left + win.scrollX) + 'px';

    outsideHandler = (e) => {
      if (!cal.contains(e.target) && e.target !== icon) closePicker(doc);
    };
    doc.addEventListener('click', outsideHandler);
  }

  function updateLabel(input, doc) {
    const span = input.parentNode.querySelector('.pam-persian-label');
    if (!span) return;
    const parsed = parseDate(input.value);
    span.textContent = (parsed && !isNaN(parsed)) ? fmtJalali(toJalali(parsed)) : '';
  }

  const tooltipMap = new WeakMap();

  function getTooltip(doc) {
    if (!tooltipMap.has(doc)) {
      const el = doc.createElement('div');
      el.className = 'pam-tooltip';
      el.style.cssText = `
        position: absolute; z-index: 9999999; background: #333; color: #fff;
        padding: 6px 10px; font-size: 12px; border-radius: 4px; pointer-events: none;
        white-space: nowrap; box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        direction: ltr; text-align: center; display: none;
        font-family: 'B Yekan', Tahoma, sans-serif;
      `;
      const arrow = doc.createElement('div');
      el.appendChild(arrow);
      doc.body.appendChild(el);
      tooltipMap.set(doc, el);
    }
    return tooltipMap.get(doc);
  }

  function showTooltip(cell, original, doc, win) {
    const tooltip = getTooltip(doc);
    while (tooltip.firstChild && tooltip.firstChild !== tooltip.lastChild) tooltip.removeChild(tooltip.firstChild);
    tooltip.insertBefore(doc.createTextNode(original), tooltip.firstChild);
    tooltip.style.display = 'block';
    const tooltipRect = tooltip.getBoundingClientRect();
    const cellRect = cell.getBoundingClientRect();
    const scrollX = win.scrollX || win.pageXOffset;
    const scrollY = win.scrollY || win.pageYOffset;
    const gap = 8;
    let top = cellRect.top + scrollY - tooltipRect.height - gap;
    let arrowDir = 'down';
    if (top < scrollY) {
      top = cellRect.bottom + scrollY + gap;
      arrowDir = 'up';
    }
    let left = cellRect.left + scrollX + (cellRect.width - tooltipRect.width) / 2;
    const maxLeft = scrollX + win.innerWidth - tooltipRect.width;
    if (left < scrollX) left = scrollX;
    else if (left > maxLeft) left = maxLeft;
    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;
    const arrow = tooltip.querySelector('div');
    if (arrowDir === 'down') {
      arrow.style.cssText = `
        position: absolute; bottom: -6px; left: 50%; transform: translateX(-50%);
        width: 0; height: 0;
        border-left: 6px solid transparent;
        border-right: 6px solid transparent;
        border-top: 6px solid #333;
      `;
    } else {
      arrow.style.cssText = `
        position: absolute; top: -6px; left: 50%; transform: translateX(-50%);
        width: 0; height: 0;
        border-left: 6px solid transparent;
        border-right: 6px solid transparent;
        border-bottom: 6px solid #333;
      `;
    }
  }

  function hideTooltip(doc) {
    const tooltip = getTooltip(doc);
    tooltip.style.display = 'none';
  }

  function attachTooltipEvents(cell, doc, win) {
    cell.addEventListener('mouseenter', () => {
      const original = cell.dataset.pamOriginal;
      if (original) showTooltip(cell, original, doc, win);
    });
    cell.addEventListener('mouseleave', () => hideTooltip(doc));
    cell.addEventListener('mousedown', () => hideTooltip(doc));
  }

  function ensureTooltipEvents(doc, win) {
    if (!extensionEnabled) return;
    const tds = doc.querySelectorAll('td[data-pam-converted]:not([data-pam-tooltip-bound])');
    for (const td of tds) {
      attachTooltipEvents(td, doc, win);
      td.dataset.pamTooltipBound = '1';
    }
  }

  function convertDateCells(doc, win) {
    if (!extensionEnabled) return;
    const tds = doc.querySelectorAll('td:not([data-pam-converted])');
    for (const td of tds) {
      const text = td.textContent.trim();
      const parsed = parseDate(text);
      if (parsed && !isNaN(parsed)) {
        td.dataset.pamOriginal = text;
        td.textContent = fmtJalali(toJalali(parsed), true);
        td.dataset.pamConverted = '1';
        td.style.fontFamily = "'B Yekan', Tahoma, sans-serif";
      }
    }
  }

  function cleanupAll() {
    document.querySelectorAll('.pam-icon').forEach(el => el.remove());
    document.querySelectorAll('.pam-persian-label').forEach(el => el.remove());
    document.querySelectorAll('[data-pam-converted]').forEach(el => {
      if (el.dataset.pamOriginal) el.textContent = el.dataset.pamOriginal;
      delete el.dataset.pamConverted;
      delete el.dataset.pamOriginal;
      delete el.dataset.pamTooltipBound;
      el.style.fontFamily = '';
    });
    document.querySelectorAll('#id_disableDateTime').forEach(input => delete input.dataset.pamBound);
    boundInputs.clear();
    if (picker) picker.remove();
    picker = null;
    if (outsideHandler) {
      document.removeEventListener('click', outsideHandler);
      outsideHandler = null;
    }
  }

  function setup(doc, win) {
    if (!extensionEnabled) return false;
    const input = doc.getElementById('id_disableDateTime');
    if (!input) return false;
    if (input.dataset.pamBound) return true;

    const icon = doc.createElement('span');
    icon.className = 'pam-icon';
    icon.innerHTML = '📅';
    icon.title = 'انتخاب تاریخ شمسی';
    icon.style.cssText = 'cursor:pointer; font-size:18px; margin-left:6px; vertical-align:middle;';
    input.parentNode.appendChild(icon);

    icon.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      buildPicker(input, icon, doc, win);
    });

    const labelSpan = doc.createElement('span');
    labelSpan.className = 'pam-persian-label';
    labelSpan.style.cssText =
      'display:block; clear:both; min-height:1.5em; margin-top:4px; font-size:13px; color:#000; text-align:left; direction:ltr; font-family:\'B Yekan\', Tahoma, sans-serif;';
    const br = input.parentNode.querySelector('br');
    if (br) br.after(labelSpan);
    else input.parentNode.appendChild(labelSpan);

    updateLabel(input, doc);
    input.addEventListener('input', () => updateLabel(input, doc));
    input.addEventListener('change', () => updateLabel(input, doc));

    input.dataset.pamBound = '1';
    boundInputs.add(input);
    convertDateCells(doc, win);
    return true;
  }

  function mainLoop() {
    if (!extensionEnabled) return;
    const iframe = document.getElementById('djangoIframe');
    if (iframe) {
      const idoc = iframe.contentDocument || iframe.contentWindow.document;
      if (idoc && idoc.readyState === 'complete') {
        if (!setup(idoc, iframe.contentWindow)) {
          convertDateCells(idoc, iframe.contentWindow);
        }
        ensureTooltipEvents(idoc, iframe.contentWindow);
      }
    } else {
      if (!setup(document, window)) {
        convertDateCells(document, window);
      }
      ensureTooltipEvents(document, window);
    }
    for (const inp of boundInputs) {
      if (inp.isConnected) updateLabel(inp, inp.ownerDocument);
      else boundInputs.delete(inp);
    }
  }

  // بررسی تطابق host
  function checkHostAndStart() {
    chrome.storage.local.get(['host', 'enabled'], ({ host, enabled }) => {
      if (!host || !enabled) {
        extensionEnabled = false;
        cleanupAll();
        if (mainInterval) { clearInterval(mainInterval); mainInterval = null; }
        return;
      }
      try {
        const currentHost = window.location.hostname;
        const allowed = new URL(host).hostname;
        if (currentHost !== allowed) {
          extensionEnabled = false;
          cleanupAll();
          if (mainInterval) { clearInterval(mainInterval); mainInterval = null; }
          return;
        }
      } catch (e) {
        extensionEnabled = false;
        return;
      }
      extensionEnabled = true;
      if (!mainInterval) {
        mainInterval = setInterval(mainLoop, 200);
      }
    });
  }

  checkHostAndStart();
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.host || changes.enabled) {
      checkHostAndStart();
    }
  });
})();
