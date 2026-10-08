/* 요청자료 및 연차 화면 개편. 기존 app.js의 입력/저장/자동 생성 동작을 사용합니다. */
(() => {
    'use strict';
    const categoryLabels = {
        rcatMeeting: '통합 및 확대회의',
        rcatRelated: '관계사 경영회의',
        rcatRegular: '정기 요청자료'
    };
    const $ = id => document.getElementById(id);
    const make = (tag, className, text) => {
        const el = document.createElement(tag);
        if (className) el.className = className;
        if (text !== undefined) el.textContent = text;
        return el;
    };
    const button = (text, action, primary) => {
        const el = make('button', 'rl-button' + (primary ? ' rl-primary' : ''), text);
        el.type = 'button'; el.addEventListener('click', action);
        return el;
    };
    const formatDate = date => date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
    function monthKey(kind) {
        const picker = kind === 'leave' ? $('leaveMonthPicker') : null;
        if (picker && /^\d{4}-\d{2}$/.test(picker.value)) return picker.value;
        const label = kind === 'leave' ? $('leaveMonthLabel') : $('monthTitle');
        const match = (label ? label.textContent : '').match(/(\d{4})\D+(\d{1,2})/);
        return match ? match[1] + '-' + match[2].padStart(2, '0') : formatDate(new Date()).slice(0, 7);
    }
    function init() {
        if (!$('panelLeave') || !$('panelRequest') || window.__requestLeaveUiReady) return;
        window.__requestLeaveUiReady = true;
        const states = {};
        ['leave', 'request'].forEach(kind => {
            const upper = kind === 'leave' ? 'Leave' : 'Request';
            const panel = $('panel' + upper);
            const grid = $(kind + 'Grid');
            const state = { kind, panel, grid, query: '', selected: '', view: window.matchMedia('(max-width:600px)').matches ? 'list' : 'calendar', records: [] };
            states[kind] = state;
            const list = make('div', 'rl-list');
            list.id = kind + 'ScheduleList'; list.hidden = true;
            panel.appendChild(list); state.list = list;
            let toolbar;
            if (kind === 'leave') {
                toolbar = panel.querySelector('.panel-title-row');
                toolbar.classList.add('rl-toolbar', 'rl-leave-toolbar');
                const title = toolbar.querySelector('.panel-title');
                if (title) title.hidden = true;
                const nav = $('leavePrevMonth').parentElement;
                nav.classList.add('rl-month-nav');
                $('leavePrevMonth').setAttribute('aria-label', '연차계획 이전 달');
                $('leaveNextMonth').setAttribute('aria-label', '연차계획 다음 달');
                $('leaveMonthPicker').setAttribute('aria-label', '연차계획 월 선택');
                nav.appendChild(button('이번 달', () => {
                    const date = new Date();
                    $('leaveMonthPicker').value = formatDate(date).slice(0, 7);
                    $('leaveMonthPicker').dispatchEvent(new Event('change', { bubbles: true }));
                }));
            } else {
                toolbar = make('div', 'rl-toolbar-extra');
                toolbar.dataset.dashboardPanel = 'request';
                toolbar.id = 'requestDashboardTools';
                const slot = $('dashboardToolbarExtra');
                (slot || panel.querySelector('.request-panel-header')).appendChild(toolbar);
                const oldHeader = panel.querySelector('.request-panel-header');
                if (slot && oldHeader) oldHeader.classList.add('rl-obsolete-header');
                else if (oldHeader && oldHeader.firstElementChild) oldHeader.firstElementChild.hidden = true;
            }
            state.toolbar = toolbar;
            const filter = make('select', 'rl-select');
            filter.id = kind + 'DashboardFilter';
            filter.setAttribute('aria-label', kind === 'leave' ? '연차계획 팀 선택' : '요청자료 구분 선택');
            if (kind === 'leave') filter.appendChild(new Option('전체 팀', ''));
            else {
                filter.appendChild(new Option('전체 구분', ''));
                filter.appendChild(new Option(categoryLabels.rcatMeeting, 'rcat-meeting'));
                filter.appendChild(new Option(categoryLabels.rcatRelated, 'rcat-related'));
                filter.appendChild(new Option(categoryLabels.rcatRegular, 'rcat-regular'));
            }
            filter.addEventListener('change', () => { state.selected = filter.value; refresh(state); });
            toolbar.appendChild(filter); state.filter = filter;
            const searchWrap = make('label', 'rl-search');
            const search = make('input');
            search.type = 'search'; search.id = kind + 'DashboardSearch';
            search.placeholder = kind === 'leave' ? '이름, 팀 검색' : '요청자료 검색';
            search.setAttribute('aria-label', search.placeholder);
            search.addEventListener('input', () => { state.query = search.value.trim().toLocaleLowerCase('ko'); refresh(state); });
            searchWrap.appendChild(search); toolbar.appendChild(searchWrap);
            const switcher = make('div', 'rl-view-switch');
            switcher.setAttribute('role', 'group'); switcher.setAttribute('aria-label', '표시 방식');
            ['calendar', 'list'].forEach(view => {
                const control = button(view === 'calendar' ? '달력' : '목록', () => {
                    state.view = view; refresh(state);
                });
                control.dataset.view = view; control.setAttribute('aria-pressed', String(view === state.view));
                switcher.appendChild(control);
            });
            toolbar.appendChild(switcher); state.switcher = switcher;
            toolbar.appendChild(button(kind === 'leave' ? '연차 입력' : '일정 추가', () => {
                const key = monthKey(kind), today = formatDate(new Date());
                const preferred = today.startsWith(key) ? today : key + '-01';
                const cell = Array.from(grid.querySelectorAll('.cal-day:not(.empty)')).find(el => el.dataset.rlDate === preferred) || grid.querySelector('.cal-day:not(.empty)');
                if (cell) { cell.click(); requestAnimationFrame(() => $(kind === 'leave' ? 'leaveTeamInput' : 'requestTitleInput').focus()); }
            }, true));
            if (kind === 'request') {
                const print = $('requestPrintBtn');
                if (print) { print.textContent = 'PDF 인쇄'; print.classList.add('rl-button'); toolbar.appendChild(print); }
            }
            const headers = panel.querySelectorAll('.calendar-header');
            headers.forEach(header => ['일', '월', '화', '수', '목', '금', '토'].forEach((name, i) => {
                if (header.children[i]) header.children[i].textContent = name;
            }));
            let scheduled = false;
            new MutationObserver(() => {
                if (!scheduled) { scheduled = true; requestAnimationFrame(() => { scheduled = false; decorate(state); }); }
            }).observe(grid, { childList: true });
            decorate(state);
        });
        const requestTab = $('tabRequest');
        const syncRequestToolbar = () => {
            const state = states.request;
            const slot = $('dashboardToolbarExtra');
            if (slot && state.toolbar.parentElement !== slot) {
                slot.appendChild(state.toolbar);
                state.panel.querySelector('.request-panel-header').classList.add('rl-obsolete-header');
            }
            state.toolbar.hidden = !requestTab.classList.contains('active');
        };
        new MutationObserver(syncRequestToolbar).observe(requestTab, { attributes: true, attributeFilter: ['class'] });
        syncRequestToolbar();
        // Print the complete selected month with the existing one-page print fitter.
        window.addEventListener('beforeprint', () => {
            Object.values(states).forEach(state => state.records.forEach(record => { record.chip.hidden = false; }));
        }, true);
        window.addEventListener('afterprint', () => Object.values(states).forEach(refresh));
        ['leaveModal', 'requestModal'].forEach(id => {
            const modal = $(id), title = modal.querySelector('.modal-header h3');
            if (title) title.textContent = id === 'leaveModal' ? '연차 입력' : '요청자료 입력';
            modal.querySelector('.modal-content').classList.add('rl-modal-content');
            const observer = new MutationObserver(() => {
                if (modal.classList.contains('active')) requestAnimationFrame(() => {
                    modal.querySelectorAll('.leave-entry-edit, .leave-entry-del, .req-save-btn, .req-cancel-btn').forEach(el => {
                        const clean = el.textContent.replace(/^[^가-힣A-Za-z0-9]+/, '');
                        if (el.textContent !== clean) el.textContent = clean;
                    });
                });
            });
            observer.observe(modal, { childList: true, subtree: true });
        });
        const requestModal = $('requestModal');
        const requestForm = $('requestCategoryInput').parentElement.parentElement;
        const dateField = make('div');
        const dateLabel = make('label', 'leave-form-label', '입력 날짜');
        const entryDate = make('input', 'form-input');
        entryDate.type = 'date'; entryDate.id = 'requestEntryDate'; dateLabel.htmlFor = entryDate.id;
        dateField.append(dateLabel, entryDate); requestForm.prepend(dateField);
        const syncRequestEntryDate = () => {
            const match = $('requestModalDateLabel').textContent.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
            if (match) entryDate.value = match[1] + '-' + match[2].padStart(2, '0') + '-' + match[3].padStart(2, '0');
            const key = monthKey('request'), last = new Date(Number(key.slice(0, 4)), Number(key.slice(5)), 0).getDate();
            entryDate.min = key + '-01'; entryDate.max = key + '-' + String(last).padStart(2, '0');
        };
        new MutationObserver(syncRequestEntryDate).observe($('requestModalDateLabel'), { childList: true });
        entryDate.addEventListener('change', () => {
            const cell = Array.from(states.request.grid.querySelectorAll('.cal-day:not(.empty)')).find(el => el.dataset.rlDate === entryDate.value);
            if (cell) cell.click(); else syncRequestEntryDate();
        });
        Array.from($('requestCategoryInput').options).forEach(option => {
            const labels = { '통합회의및확대회의관련': categoryLabels.rcatMeeting, '관계사경영회의관련': categoryLabels.rcatRelated, '정기요청자료': categoryLabels.rcatRegular };
            if (labels[option.value]) option.textContent = labels[option.value];
        });
        window.BTIRequestLeaveUI = {
            refresh: () => Object.values(states).forEach(decorate),
            setView: (kind, view) => { if (states[kind] && ['calendar', 'list'].includes(view)) { states[kind].view = view; refresh(states[kind]); } }
        };
    }
    function decorate(state) {
        const key = monthKey(state.kind);
        let day = 0;
        state.records = [];
        state.grid.querySelectorAll('.cal-day:not(.empty)').forEach(cell => {
            day += 1;
            const date = key + '-' + String(day).padStart(2, '0');
            cell.dataset.rlDate = date; cell.setAttribute('role', 'button');
            cell.tabIndex = 0; cell.setAttribute('aria-label', date + (state.kind === 'leave' ? ' 연차 입력 및 조회' : ' 요청자료 입력 및 조회'));
            if (state.kind === 'leave') {
                // 날짜는 셀에 남기고 항목만 스크롤한다. 기존 칩과 이벤트 리스너를 그대로 옮긴다.
                let chips = cell.querySelector('.leave-chips-scroll');
                if (!chips) {
                    chips = make('div', 'leave-chips-scroll');
                    cell.appendChild(chips);
                }
                Array.from(cell.children).filter(child => child.classList.contains('leave-chip')).forEach(chip => chips.appendChild(chip));
            }
            if (!cell.dataset.rlKeyboard) {
                cell.dataset.rlKeyboard = 'true';
                cell.addEventListener('keydown', event => {
                    if (event.target === cell && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); cell.click(); }
                });
            }
            cell.querySelectorAll(state.kind === 'leave' ? '.leave-chip' : '.request-chip').forEach(chip => {
                const tooltip = chip.title || chip.textContent;
                const prefix = tooltip.match(/^\[([^\]]+)\]\s*/);
                const scope = prefix ? prefix[1] : '';
                const rest = tooltip.replace(/^\[[^\]]+\]\s*/, '');
                let record = { chip, cell, date, scope, text: rest, note: '', category: '' };
                if (state.kind === 'leave') {
                    record.name = (chip.querySelector('.lc-name') || chip).textContent;
                    record.type = (chip.querySelector('.lc-type') || { textContent: '' }).textContent;
                    const split = rest.split(' / '); record.note = split.slice(1).join(' / ');
                } else {
                    record.category = ['rcat-meeting', 'rcat-related', 'rcat-regular'].find(cls => chip.classList.contains(cls)) || 'rcat-regular';
                    const split = rest.split(' / '); record.text = split[0]; record.note = split.slice(1).join(' / ');
                }
                chip.setAttribute('role', 'button'); chip.tabIndex = 0;
                chip.setAttribute('aria-label', date + ' ' + tooltip);
                if (!chip.dataset.rlKeyboard) {
                    chip.dataset.rlKeyboard = 'true';
                    chip.addEventListener('keydown', event => {
                        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); chip.click(); }
                    });
                }
                state.records.push(record);
            });
        });
        if (state.kind === 'leave') {
            const teams = new Set(Array.from(document.querySelectorAll('#leaveTeamList option')).map(el => el.value));
            state.records.forEach(record => { if (record.scope) teams.add(record.scope); });
            if (state.selected) teams.add(state.selected);
            const desired = ['', ...Array.from(teams).filter(Boolean).sort((a, b) => a.localeCompare(b, 'ko'))];
            if (Array.from(state.filter.options).map(option => option.value).join('|') !== desired.join('|')) {
                state.filter.replaceChildren(...desired.map(team => new Option(team || '전체 팀', team)));
                state.filter.value = state.selected;
            }
        }
        refresh(state);
    }
    function refresh(state) {
        const visible = state.records.filter(record => {
            const scope = state.kind === 'leave' ? record.scope : record.category;
            const match = (!state.selected || state.selected === scope) && (!state.query || (record.chip.title || record.chip.textContent).toLocaleLowerCase('ko').includes(state.query));
            record.chip.hidden = !match;
            return match;
        });
        const isList = state.view === 'list';
        state.panel.classList.toggle('rl-list-mode', isList);
        state.list.hidden = !isList;
        state.switcher.querySelectorAll('button').forEach(btn => btn.setAttribute('aria-pressed', String(btn.dataset.view === state.view)));
        state.list.replaceChildren();
        if (!isList) return;
        const loading = state.grid.querySelector(':scope > .panel-loading');
        if (loading) { state.list.appendChild(loading.cloneNode(true)); return; }
        if (!visible.length) { state.list.appendChild(make('p', 'rl-empty', '조건에 해당하는 일정이 없습니다.')); return; }
        const head = make('div', 'rl-list-head');
        ['날짜', state.kind === 'leave' ? '팀' : '구분', state.kind === 'leave' ? '이름 / 휴가 구분' : '요청자료', ''].forEach(text => head.appendChild(make('span', '', text)));
        state.list.appendChild(head);
        visible.forEach(record => {
            const row = make('button', 'rl-list-row'); row.type = 'button';
            row.title = record.chip.title;
            const date = new Date(record.date + 'T00:00:00');
            const day = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()];
            const dateLabel = make('span', 'rl-list-date', (date.getMonth() + 1) + '/' + date.getDate() + ' (' + day + ')');
            if ([0, 6].includes(date.getDay()) || record.cell.classList.contains('holiday-day')) dateLabel.classList.add('rl-holiday');
            row.appendChild(dateLabel);
            const scope = state.kind === 'leave' ? record.scope : ({ 'rcat-meeting': categoryLabels.rcatMeeting, 'rcat-related': categoryLabels.rcatRelated, 'rcat-regular': categoryLabels.rcatRegular })[record.category];
            row.appendChild(make('span', 'rl-list-scope', scope));
            const content = make('span', 'rl-list-content');
            content.appendChild(make('span', 'rl-list-main', state.kind === 'leave' ? record.name + '  ' + record.type : record.text));
            if (record.note) content.appendChild(make('span', 'rl-list-note', record.note));
            row.appendChild(content); row.appendChild(make('span', 'rl-list-arrow', '›'));
            row.addEventListener('click', () => record.chip.click());
            state.list.appendChild(row);
        });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
