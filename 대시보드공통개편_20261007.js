/* 공통 메뉴와 월간일정 UI. 데이터 저장은 기존 app.js에서 처리한다. */
(() => {
  'use strict';
  function init() {
    const byId = id => document.getElementById(id);
    const nav = byId('tabCalendar');
    const tabs = ['Request', 'Goals', 'Leave', 'Thanks', 'Menu'].map(x => byId('tab' + x)).filter(Boolean);
    const toolbar = byId('dashboardToolbar');
    const grid = byId('calendarGrid');
    const panel = byId('panelCalendar');
    if (!nav || !toolbar || !grid || !panel) return;
    let view = window.matchMedia('(max-width:600px)').matches ? 'list' : 'calendar';
    let selectedDate = '';
    let lastFocus = null;
    const list = document.createElement('div');
    list.id = 'calendarListView'; list.className = 'calendar-list';
    panel.append(list);
    const dialog = document.createElement('div');
    dialog.id = 'calendarDayDialog'; dialog.className = 'modal-overlay';
    dialog.innerHTML = '<div class="modal-content"><button type="button" class="close-btn" aria-label="닫기">×</button><h2 id="calendarDayTitle" class="day-dialog-heading"></h2><div class="day-dialog-events"></div><button type="button" class="dashboard-button primary day-dialog-add">일정 추가</button></div>';
    dialog.setAttribute('aria-labelledby', 'calendarDayTitle');
    document.body.append(dialog);
    const company = { Group: '그룹', NBT: '엔비티', BIO: '바이오' };
    function currentTab() {
      const active = tabs.find(t => t.classList.contains('active'));
      return active ? active.id.slice(3).toLowerCase() : 'calendar';
    }
    function syncNavigation() {
      const key = currentTab();
      document.body.dataset.dashboardPanel = key;
      nav.classList.toggle('active', key === 'calendar');
      [nav, ...tabs].forEach(t => {
        if (t.classList.contains('active')) t.setAttribute('aria-current', 'page');
        else t.removeAttribute('aria-current');
      });
      toolbar.hidden = !['calendar', 'request', 'thanks'].includes(key);
      ['calendarCompanyFilters', 'calendarSearch', 'calendarActions'].forEach(id => byId(id).hidden = key !== 'calendar');
      toolbar.querySelector('.month-selector').hidden = toolbar.hidden;
    }
    tabs.forEach(t => {
      // 이미 선택한 메뉴를 누를 때 다른 화면으로 이동하지 않는다.
      t.addEventListener('click', e => { if (t.classList.contains('active')) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
      new MutationObserver(syncNavigation).observe(t, { attributes: true, attributeFilter: ['class'] });
    });
    nav.addEventListener('click', () => { window.BTIScheduleUI?.showCalendar(); syncNavigation(); });
    document.querySelector('.dashboard-brand').addEventListener('click', e => { e.preventDefault(); nav.click(); });
    byId('currentMonthBtn').addEventListener('click', () => {
      const d = new Date(); window.BTIScheduleUI?.goToMonth(d.getFullYear(), d.getMonth() + 1);
    });
    ['monthTitle','leaveMonthLabel'].map(byId).filter(Boolean).forEach(monthTitle => {
      const normalizeMonth = () => {
        const match = monthTitle.textContent.trim().match(/^(\d{4})\.\s*(\d{1,2})$/);
        if (match) monthTitle.textContent = match[1] + '년 ' + Number(match[2]) + '월';
      };
      new MutationObserver(normalizeMonth).observe(monthTitle, {childList:true}); normalizeMonth();
    });
    document.querySelectorAll('.filter-btn').forEach(button => {
      const selected = () => button.setAttribute('aria-pressed', String(button.classList.contains('active')));
      new MutationObserver(selected).observe(button, {attributes:true,attributeFilter:['class']}); selected();
    });
    function defaultDate() {
      const m = window.BTIScheduleUI?.month(); const d = new Date();
      if (!m) return '';
      const day = d.getFullYear() === m.year && d.getMonth() + 1 === m.month ? d.getDate() : 1;
      return m.year + '-' + String(m.month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
    }
    byId('calendarAddBtn').addEventListener('click', () => window.BTIScheduleUI?.addEvent(defaultDate()));
    byId('calendarImportBtn').addEventListener('click', () => { byId('tabUpload').click(); byId('openSettingsBtn').click(); });
    function closeDay() { dialog.classList.remove('active'); }
    dialog.querySelector('.close-btn').addEventListener('click', closeDay);
    dialog.addEventListener('click', e => { if (e.target === dialog) closeDay(); });
    dialog.querySelector('.day-dialog-add').addEventListener('click', () => { closeDay(); window.BTIScheduleUI?.addEvent(selectedDate); });
    function dayTitle(date) {
      const d = new Date(date + 'T12:00:00');
      return d.getMonth() + 1 + '월 ' + d.getDate() + '일 (' + ['일', '월', '화', '수', '목', '금', '토'][d.getDay()] + ')';
    }
    function copyEventPresentation(source, target) {
      target.dataset.priority = source.dataset.priority || 'false';
      target.classList.toggle('event-important', source.dataset.priority === 'true');
      ['--event-bg', '--event-ink'].forEach(property => target.style.setProperty(property, source.style.getPropertyValue(property)));
    }
    function showDay(day) {
      selectedDate = day.dataset.date;
      byId('calendarDayTitle').textContent = dayTitle(selectedDate);
      const target = dialog.querySelector('.day-dialog-events'); target.replaceChildren();
      const events = [...day.querySelectorAll('.event')];
      if (!events.length) { const empty = document.createElement('p'); empty.className = 'dashboard-empty'; empty.textContent = '등록된 일정이 없습니다.'; target.append(empty); }
      events.forEach(source => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'day-dialog-event';
        copyEventPresentation(source, b);
        const meta = document.createElement('small'); meta.textContent = (company[source.dataset.company] || source.dataset.company || '') + (source.querySelector('.e-time') ? '  ' + source.querySelector('.e-time').textContent : '');
        const title = document.createElement('span'); title.textContent = source.querySelector('.e-title')?.textContent || source.textContent;
        b.append(meta, title); b.addEventListener('click', () => { closeDay(); source.click(); }); target.append(b);
      });
      dialog.classList.add('active');
    }
    function styleEvent(event) {
      if (event.dataset.visualReady) return;
      const title = event.querySelector('.e-title');
      if (!title) return;
      const time = event.querySelector('.e-time');
      const hasCompany = !!event.querySelector('.e-badge');
      const meta = document.createElement('span'); meta.className = 'event-meta';
      if (time) meta.append(time);
      if (hasCompany) {
        const label = document.createElement('span'); label.className = 'event-company';
        label.textContent = company[event.dataset.company] || event.dataset.company;
        meta.append(label);
      }
      event.replaceChildren(...(meta.childNodes.length ? [meta, title] : [title]));
      event.classList.add('event-modern'); event.dataset.visualReady = 'true';
    }
    function refresh() {
      const trailing = (7 - grid.children.length % 7) % 7;
      if (grid.children.length && trailing) {
        for (let i = 0; i < trailing; i++) {
          const cell = document.createElement('div'); cell.className = 'cal-day empty visual-tail'; cell.setAttribute('aria-hidden', 'true'); grid.append(cell);
        }
      }
      grid.dataset.weekRows = String(Math.ceil(grid.children.length / 7));
      const days = [...grid.querySelectorAll('.cal-day:not(.empty)')];
      days.forEach(day => {
        if (!day.dataset.date) return;
        const span = day.querySelector('.date-num');
        if (span && span.tagName !== 'BUTTON') {
          const button = document.createElement('button'); button.type = 'button'; button.className = span.className; button.textContent = span.textContent; button.setAttribute('aria-label', dayTitle(day.dataset.date) + ' 일정 보기');
          button.addEventListener('click', e => { e.stopPropagation(); showDay(day); }); span.replaceWith(button);
        }
        const events = [...day.querySelectorAll('.event')];
        events.forEach(event => {
          styleEvent(event);
          event.hidden = false; event.tabIndex = 0; event.setAttribute('role', 'button'); event.setAttribute('aria-label', event.title);
          if (!event.dataset.keyboardBound) { event.dataset.keyboardBound = 'true'; event.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); event.click(); } }); }
        });
        day.querySelector('.day-more')?.remove();
        day.setAttribute('role', 'group'); day.setAttribute('aria-label', dayTitle(day.dataset.date) + ' 일정');
      });
      renderList(days); setView(view); syncNavigation();
      requestAnimationFrame(updateScrollState);
    }
    function updateScrollState() {
      grid.querySelectorAll('.cal-day:not(.empty)').forEach(day => {
        const scrollable = day.clientHeight > 0 && day.scrollHeight > day.clientHeight + 2;
        day.dataset.scrollable = String(scrollable); day.tabIndex = scrollable ? 0 : -1;
      });
    }
    new ResizeObserver(updateScrollState).observe(grid);
    function renderList(days) {
      list.replaceChildren();
      const table = document.createElement('table'); table.innerHTML = '<thead><tr><th scope="col">일자</th><th scope="col">회사</th><th scope="col">시간</th><th scope="col">일정</th></tr></thead><tbody></tbody>';
      const tbody = table.querySelector('tbody');
      days.forEach(day => {
        // 생일은 달력의 날짜 행 라벨로만 표시되므로 목록 보기에도 같은 날짜의 첫 행으로 추가한다.
        [...day.querySelectorAll('.birthday-label')].forEach(label => {
          const tr = document.createElement('tr'); tr.className = 'list-birthday-row';
          const date = document.createElement('td'); date.textContent = dayTitle(day.dataset.date); if (day.querySelector('.date-num.sun,.date-num.sat')) date.className = 'red-date';
          const comp = document.createElement('td'); comp.textContent = '생일';
          const time = document.createElement('td');
          const content = document.createElement('td'); const span = document.createElement('span'); span.className = 'list-birthday'; span.textContent = label.textContent.trim(); content.append(span);
          tr.append(date, comp, time, content); tbody.append(tr);
        });
        [...day.querySelectorAll('.event')].forEach(source => {
          const tr = document.createElement('tr');
          tr.dataset.priority = source.dataset.priority || 'false';
          const date = document.createElement('td'); date.textContent = dayTitle(day.dataset.date); if (day.querySelector('.date-num.sun,.date-num.sat')) date.className = 'red-date';
          const comp = document.createElement('td'); comp.textContent = company[source.dataset.company] || source.dataset.company;
          const time = document.createElement('td'); time.textContent = source.querySelector('.e-time')?.textContent || '';
          const content = document.createElement('td'); const b = document.createElement('button'); b.type = 'button'; b.className = 'list-event'; b.textContent = source.querySelector('.e-title')?.textContent || source.textContent; b.addEventListener('click', () => source.click()); content.append(b);
          copyEventPresentation(source, b);
          tr.append(date, comp, time, content); tbody.append(tr);
        });
      });
      if (!tbody.children.length) { const empty = document.createElement('p'); empty.className = 'dashboard-empty'; empty.textContent = '표시할 일정이 없습니다.'; list.append(empty); }
      else list.append(table);
    }
    function setView(next) {
      view = next; grid.hidden = view !== 'calendar'; panel.querySelector('.calendar-header').hidden = view !== 'calendar'; list.hidden = view !== 'list';
      [['calendarViewBtn','calendar'],['calendarListBtn','list']].forEach(([id,v]) => { const b=byId(id); b.classList.toggle('selected', v===view); b.setAttribute('aria-pressed', String(v===view)); });
    }
    byId('calendarViewBtn').addEventListener('click', () => setView('calendar'));
    byId('calendarListBtn').addEventListener('click', () => setView('list'));
    new MutationObserver(records => {
      const onlyTail = records.every(record => [...record.addedNodes, ...record.removedNodes].every(node => node.classList?.contains('visual-tail')));
      if (!onlyTail) refresh();
    }).observe(grid, { childList: true });
    // 닫힌 입력창은 키보드와 스크린리더에서 제외한다.
    document.querySelectorAll('.modal-overlay').forEach(modal => {
      modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true');
      const title = modal.querySelector('h2,h3');
      if (title && !modal.hasAttribute('aria-labelledby')) { if (!title.id) title.id=modal.id+'Title'; modal.setAttribute('aria-labelledby', title.id); }
      let active = false;
      const observer = () => {
        const open = modal.classList.contains('active'); modal.setAttribute('aria-hidden', String(!open));
        if (open && !active) {
          // 입력창을 연속해서 열 때 닫힌 창의 버튼으로 포커스가 돌아가지 않도록 한다.
          if (!document.activeElement.closest('.modal-overlay:not(.active)')) lastFocus=document.activeElement;
          requestAnimationFrame(() => {
          if (!modal.classList.contains('active')) return;
          const fields=[...modal.querySelectorAll('input:not([type="hidden"]),select,textarea,button')].filter(x=>x.getClientRects().length && !x.disabled);
          const field=fields.find(x=>x.matches('input,select,textarea')) || fields[0]; if (field) field.focus();
        }); }
        if (!open && active && !document.querySelector('.modal-overlay.active')) lastFocus?.focus();
        active=open;
      };
      new MutationObserver(observer).observe(modal,{attributes:true,attributeFilter:['class']}); observer();
    });
    document.addEventListener('keydown', e => {
      const modal=[...document.querySelectorAll('.modal-overlay.active')].at(-1); if (!modal) return;
      if (e.key === 'Escape') { const close=modal.querySelector('.close-btn,[id^="close"]'); if (close) close.click(); else modal.classList.remove('active'); }
      if (e.key === 'Tab') {
        const targets=[...modal.querySelectorAll('button,input,select,textarea,a[href],[tabindex="0"]')].filter(x=>x.getClientRects().length && !x.disabled);
        if (!targets.length) return; const first=targets[0], last=targets.at(-1);
        if (e.shiftKey && document.activeElement===first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement===last) { e.preventDefault(); first.focus(); }
      }
    });
    window.BTICommonUI={ refresh, setView };
    refresh();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
