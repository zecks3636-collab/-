/**
 * 식단화면개편_20261007.js
 * 기존 식단표의 주 이동, PDF 업로드, 이미지 표시 및 삭제 이벤트를 유지합니다.
 * 메뉴 보기는 원본 HTML 식단표에 존재하는 실제 메뉴만 일자별로 표시합니다.
 */
(function () {
  'use strict';
  function init() {
    const panel = document.getElementById('panelMenuView');
    const header = panel && panel.querySelector('.menu-panel-header');
    if (!panel || !header || panel.dataset.localMenuReady) return;
    panel.dataset.localMenuReady = 'true';
    panel.classList.add('local-menu-panel');
    const el = id => document.getElementById(id);
    const range = el('menuWeekSub');
    const originalTitle = el('menuWeekLabel');
    const previous = el('prevWeekBtn');
    const next = el('nextWeekBtn');
    const upload = el('menuUploadBtn');
    const remove = el('menuDeleteBtn');
    const input = el('menuPdfInput');
    const image = el('menuUploadedImg');
    const imageWrap = el('menuContentImage');
    const tables = Array.from(panel.querySelectorAll('.menu-table-wrapper'));
    if (![range, previous, next, upload, image, imageWrap].every(Boolean)) return;
    header.className = 'menu-panel-header local-menu-toolbar';
    const nav = document.createElement('div');
    nav.className = 'local-menu-week-nav';
    previous.setAttribute('aria-label', '이전 주');
    next.setAttribute('aria-label', '다음 주');
    previous.textContent = '‹';
    next.textContent = '›';
    range.className = 'local-menu-range';
    nav.append(previous, range, next);
    const today = document.createElement('button');
    today.className = 'local-menu-btn';
    today.textContent = '이번 주';
    nav.append(today);
    const pickerLabel = document.createElement('label');
    pickerLabel.className = 'local-menu-date-picker local-menu-btn';
    pickerLabel.textContent = '주 선택';
    const picker = document.createElement('input');
    picker.type = 'date';
    picker.setAttribute('aria-label', '날짜로 주 선택');
    pickerLabel.append(picker);
    nav.append(pickerLabel);
    const archive = document.createElement('select');
    archive.className = 'local-menu-archive';
    archive.setAttribute('aria-label', '등록된 식단 선택');
    archive.innerHTML = '<option value="">등록된 식단</option>';
    nav.append(archive);
    const actions = document.createElement('div');
    actions.className = 'local-menu-actions';
    const modes = document.createElement('div');
    modes.className = 'local-menu-modes';
    modes.setAttribute('role', 'group');
    modes.setAttribute('aria-label', '식단 표시 방식');
    const weekMode = document.createElement('button');
    weekMode.textContent = '한 주 전체';
    const dayMode = document.createElement('button');
    dayMode.textContent = '메뉴 보기';
    modes.append(weekMode, dayMode);
    const source = document.createElement('a');
    source.className = 'local-menu-btn local-menu-source';
    source.textContent = '원본 보기';
    source.target = '_blank';
    source.rel = 'noopener';
    upload.textContent = 'PDF 업로드';
    upload.classList.add('local-menu-btn', 'local-menu-upload');
    actions.append(modes, source, upload);
    if (remove) {
      remove.textContent = '식단 삭제';
      remove.classList.add('local-menu-btn', 'local-menu-remove');
      actions.append(remove);
    }
    header.replaceChildren(nav, actions);
    if (originalTitle) { originalTitle.hidden = true; header.append(originalTitle); }
    if (input) header.append(input);
    const daily = document.createElement('div');
    daily.id = 'localMenuDaily';
    daily.className = 'local-menu-daily';
    const weekdays = document.createElement('div');
    weekdays.className = 'local-menu-weekdays';
    weekdays.setAttribute('role', 'group');
    weekdays.setAttribute('aria-label', '식단 날짜 선택');
    const cards = document.createElement('div');
    cards.className = 'local-menu-meal-cards';
    daily.append(weekdays, cards);
    panel.insertBefore(daily, tables[0] || imageWrap);
    const empty = el('menuContentEmpty');
    if (empty) {
      const message = empty.querySelector('p');
      if (message) message.textContent = '등록된 식단표가 없습니다.';
      Array.from(empty.children).filter(child => child !== message && child.id !== 'menuEmptyUploadBtn').forEach(child => child.hidden = true);
      const emptyUpload = el('menuEmptyUploadBtn');
      if (emptyUpload) emptyUpload.hidden = true;
    }
    const notice = el('menuNotice');
    if (notice) notice.hidden = true;
    const known = {
      '2026-04-06': '4월 둘째주 주간메뉴표 (창조).pdf',
      '2026-04-13': '4월 셋째주 메뉴 (창조).pdf',
      '2026-04-20': '4월 넷째주 주간메뉴표 (창조).pdf',
      '2026-04-27': '4월 다섯째주 주간메뉴표 (창조).pdf',
      '2026-05-04': '5월 둘째주 주간메뉴표 (창조).pdf',
      '2026-05-11': '5월 셋째주 주간메뉴표 (창조).pdf',
      '2026-05-18': '5월 넷째주 주간메뉴표 (창조).pdf',
      '2026-05-25': '5월 마지막주 주간메뉴표 (창조).pdf'
    };
    const metadata = new Map(Object.keys(known).map(key => [key, known[key]]));
    function updateArchive() {
      const selected = archive.value;
      archive.replaceChildren(new Option('등록된 식단', ''));
      [...metadata].sort(([a], [b]) => b.localeCompare(a)).forEach(([key]) => archive.append(new Option(key.replace(/-/g, '.') + ' 주', key)));
      archive.value = selected;
    }
    updateArchive();
    function currentMonday() {
      const text = range.textContent;
      const match = text.match(/(\d{4})년.*?\((\d{2})\/(\d{2})/);
      if (!match) return null;
      return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
    }
    function mondayOf(date) {
      const result = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
      result.setDate(result.getDate() - (result.getDay() === 0 ? 6 : result.getDay() - 1));
      return result;
    }
    function dateKey(date) {
      return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
    }
    function moveTo(date) {
      const current = currentMonday();
      if (!current || !Number.isFinite(date.getTime())) return;
      const target = mondayOf(date);
      const count = Math.round((target.getTime() - current.getTime()) / 604800000);
      if (Math.abs(count) > 520) return;
      for (let index = 0; index < Math.abs(count); index++) (count < 0 ? previous : next).click();
      archive.value = '';
      selectedDay = date.getDay() > 0 && date.getDay() < 6 ? date.getDay() - 1 : 0;
      updateView();
    }
    today.addEventListener('click', () => moveTo(new Date()));
    picker.addEventListener('change', () => moveTo(new Date(picker.value + 'T12:00:00')));
    archive.addEventListener('change', () => { if (archive.value) moveTo(new Date(archive.value + 'T12:00:00')); });
    let mode = 'week';
    let selectedDay = Math.min(Math.max(new Date().getDay() - 1, 0), 4);
    let rendered = '';
    weekMode.addEventListener('click', () => {mode = 'week'; updateView();});
    dayMode.addEventListener('click', () => {mode = 'day'; updateView();});
    function renderDaily(wrapper) {
      const heads = Array.from(wrapper.querySelectorAll('.menu-th-day'));
      const signature = wrapper.id + ':' + selectedDay;
      if (signature === rendered) return;
      rendered = signature;
      weekdays.replaceChildren();
      heads.forEach((head, index) => {
        const button = document.createElement('button');
        button.className = 'local-menu-day' + (index === selectedDay ? ' active' : '');
        const dateText = head.querySelector('span') ? head.querySelector('span').textContent.trim() : '';
        const dayText = head.textContent.replace(dateText, '').replace(/\s+/g, ' ').trim();
        button.textContent = dayText + (dateText ? ' ' + dateText : '');
        button.setAttribute('aria-pressed', String(index === selectedDay));
        button.addEventListener('click', () => {selectedDay = index; rendered = ''; updateView();});
        weekdays.append(button);
      });
      const meals = new Map();
      let meal = '중식';
      wrapper.querySelectorAll('tbody tr').forEach(row => {
        const label = row.querySelector('.menu-meal-label');
        if (label) meal = label.textContent.trim();
        const category = row.querySelector('.menu-section-label');
        const cells = Array.from(row.querySelectorAll('.menu-cell')).flatMap(cell => Array.from({length:cell.colSpan || 1}, () => cell));
        const cell = cells[selectedDay];
        if (!cell) return;
        if (!meals.has(meal)) meals.set(meal, []);
        const items = Array.from(cell.querySelectorAll('.menu-item')).map(item => ({text:item.textContent.trim(), main:item.classList.contains('highlight')}));
        meals.get(meal).push({category:category ? category.textContent.trim() : '', items:items.length ? items : [{text:cell.textContent.trim(), main:false}]});
      });
      cards.replaceChildren();
      meals.forEach((groups, mealName) => {
        const card = document.createElement('section');
        card.className = 'local-menu-meal-card';
        const title = document.createElement('h3');
        title.textContent = mealName;
        card.append(title);
        const closedItems = groups.flatMap(group => group.items.map(item => item.text));
        if (closedItems.length && closedItems.every(text => /미운영|휴무/.test(text))) {
          const status = document.createElement('p');
          status.className = 'local-menu-closed';
          status.textContent = (closedItems.find(text => /공휴일|휴무/.test(text)) || closedItems[0]).replace(/\s*미운영/g, ' 미운영').trim();
          card.append(status);
          cards.append(card);
          return;
        }
        groups.forEach(group => {
          const section = document.createElement('div');
          section.className = 'local-menu-corner';
          if (group.category) {const name = document.createElement('h4'); name.textContent = group.category; section.append(name);}
          const list = document.createElement('ul');
          group.items.forEach(item => {const li = document.createElement('li'); li.textContent = item.text; if(item.main)li.className='local-menu-main-dish';list.append(li);});
          section.append(list);
          card.append(section);
        });
        cards.append(card);
      });
    }
    function updateView() {
      const activeTable = tables.find(table => table.style.display !== 'none');
      const hasImage = imageWrap.style.display !== 'none' && image.naturalWidth > 0;
      dayMode.disabled = !activeTable;
      dayMode.title = activeTable ? '날짜별 실제 메뉴 보기' : 'PDF 이미지 식단은 한 주 전체에서 확인합니다.';
      if (!activeTable) mode = 'week';
      weekMode.classList.toggle('active', mode === 'week');
      dayMode.classList.toggle('active', mode === 'day');
      weekMode.setAttribute('aria-pressed', String(mode === 'week'));
      dayMode.setAttribute('aria-pressed', String(mode === 'day'));
      panel.classList.toggle('local-menu-day-mode', mode === 'day' && !!activeTable);
      if (mode === 'day' && activeTable) renderDaily(activeTable);
      if (remove) remove.hidden = !hasImage;
      const monday = currentMonday();
      if (monday) picker.value = dateKey(monday);
      const key = monday ? dateKey(monday) : '';
      if (metadata.has(key)) archive.value = key; else archive.value = '';
      if (hasImage) {
        source.href = image.src;
        source.hidden = false;
        source.onclick = event => { event.preventDefault(); openImage(); };
      } else {
        // 과거 원본 PDF(schedules/menu)는 운영에 배포되지 않으므로 실제 이미지가 있을 때만 원본 보기를 노출한다.
        source.hidden = true;
        source.removeAttribute('href');
        source.onclick = null;
      }
      archive.title = '로컬에 보관되거나 등록된 식단표 선택';
    }
    const zoom = document.createElement('dialog');
    zoom.className = 'local-menu-image-dialog';
    zoom.setAttribute('aria-label', '주간식단 원본 확대');
    const zoomClose = document.createElement('button');
    zoomClose.className = 'local-menu-btn local-menu-zoom-close';
    zoomClose.textContent = '닫기';
    const zoomToolbar = document.createElement('div');
    zoomToolbar.className = 'local-menu-image-toolbar';
    zoomToolbar.append(zoomClose);
    const zoomScroll = document.createElement('div');
    zoomScroll.className = 'local-menu-image-scroll';
    const zoomImage = document.createElement('img');
    zoomImage.alt = '주간식단 원본';
    zoomScroll.append(zoomImage);
    zoom.append(zoomToolbar, zoomScroll);
    document.body.append(zoom);
    function openImage() {
      if (!image.naturalWidth) return;
      zoomImage.src = image.src;
      if (!zoom.open) zoom.showModal();
      zoomScroll.scrollTop = 0;
    }
    zoomClose.addEventListener('click', () => zoom.close());
    zoom.addEventListener('click', event => {if(event.target === zoom)zoom.close();});
    image.style.cursor = 'zoom-in';
    image.addEventListener('click', openImage);
    let archiveFetchVersion = 0;
    function refreshArchive() {
      const version = ++archiveFetchVersion;
      fetch('/api/menu_weeks').then(response => response.ok ? response.json() : null).then(rows => {
        if (version !== archiveFetchVersion || !Array.isArray(rows)) return;
        metadata.clear();
        Object.entries(known).forEach(([key, name]) => metadata.set(key, name));
        // 이미지 저장 경로 행(주차-UUID.jpg 등)은 제외하고 날짜 키 정식 행만 보관 목록에 반영한다.
        rows.forEach(row => { if(/^\d{4}-\d{2}-\d{2}$/.test(String(row.week_key || '')))metadata.set(row.week_key,row.file_name||''); });
        updateArchive();
        updateView();
      }).catch(() => {});
    }
    image.addEventListener('load', updateView);
    window.addEventListener('bti:menu-store-updated', refreshArchive);
    new MutationObserver(updateView).observe(range, {childList:true, characterData:true, subtree:true});
    tables.forEach(table => new MutationObserver(updateView).observe(table, {attributes:true, attributeFilter:['style']}));
    new MutationObserver(updateView).observe(imageWrap, {attributes:true, attributeFilter:['style']});
    updateView();
    refreshArchive();
  }
  if(document.readyState === 'loading')document.addEventListener('DOMContentLoaded', init);else init();
})();
