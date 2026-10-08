/* 목표관리 및 칭찬보드 화면 개선. 기존 app.js 데이터 계약과 이벤트를 유지합니다. */
(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const later = fn => {
    let pending = false;
    return () => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => { pending = false; fn(); });
    };
  };
  let refreshGoals = () => {};
  let refreshThanks = () => {};

  function initGoals() {
    const panel = byId('panelGoals');
    if (!panel || panel.dataset.compactGoalsReady) return;
    panel.dataset.compactGoalsReady = 'true';
    const nav = panel.querySelector('.goals-nav');
    const team = byId('goalTeamFilter');
    if (!nav || !team) return;

    const toolbar = make('div', 'bti-gx-toolbar');
    const viewGroup = make('div', 'bti-gx-views');
    const year = make('span', 'bti-gx-year',
      (panel.querySelector('.goals-crumb-title')?.textContent.match(/\d{4}/) || ['2026'])[0] + '년');
    viewGroup.append(year, nav);
    const controls = make('div', 'bti-gx-filters');
    const search = make('input', 'bti-gx-search');
    search.type = 'search';
    search.placeholder = '목표명, 활동내용 검색';
    search.setAttribute('aria-label', '목표 및 수명업무 검색');
    controls.append(team, search);
    const actions = make('div', 'bti-gx-actions');
    const actionGroups = {};
    ['goalsDashboard', 'goalsActivity', 'goalsTasksPage'].forEach(page => {
      actionGroups[page] = make('div', 'bti-gx-action-group');
      actionGroups[page].dataset.goalActionPage = page;
      actions.append(actionGroups[page]);
    });
    const move = (id, parent) => { const node = byId(id); if (node) parent.append(node); };
    move('goalsGoalAdd', actionGroups.goalsDashboard);
    move('goalsQuarterSelect', actionGroups.goalsActivity);
    move('goalsActivityAdd', actionGroups.goalsActivity);
    move('goalsTaskAdd', actionGroups.goalsTasksPage);
    toolbar.append(viewGroup, controls, actions);
    panel.prepend(toolbar);

    const annualTab = nav.querySelector('[data-goal-page="goalsDashboard"]');
    const activityTab = nav.querySelector('[data-goal-page="goalsActivity"]');
    if (annualTab) annualTab.textContent = '연간 목표';
    if (activityTab) activityTab.textContent = '분기 실적';
    const tasksTab = make('button', 'goals-nav-item', '수명업무');
    tasksTab.type = 'button';
    tasksTab.dataset.goalPage = 'goalsTasksPage';
    tasksTab.id = 'goalsTasksNav';
    nav.append(tasksTab);
    nav.setAttribute('aria-label', '목표관리 보기');

    const tasksPage = make('section', 'goals-page');
    tasksPage.id = 'goalsTasksPage';
    tasksPage.setAttribute('aria-labelledby', 'goalsTasksNav');
    const tasksIntro = byId('goalsTasksSection');
    const tasksMetrics = byId('goalsTaskMetrics');
    const taskPanel = byId('goalsTaskList')?.closest('.goals-panel');
    [tasksIntro, tasksMetrics, taskPanel].filter(Boolean).forEach(node => tasksPage.append(node));
    panel.append(tasksPage);

    const emptySearch = make('div', 'bti-gx-search-empty', '검색 결과가 없습니다.');
    emptySearch.hidden = true;
    panel.append(emptySearch);

    const choose = page => {
      nav.querySelectorAll('.goals-nav-item').forEach(button => {
        const selected = button.dataset.goalPage === page;
        button.classList.toggle('active', selected);
        button.setAttribute('aria-pressed', String(selected));
      });
      panel.querySelectorAll('.goals-page').forEach(section =>
        section.classList.toggle('active-page', section.id === page));
      Object.entries(actionGroups).forEach(([key, group]) => { group.hidden = key !== page; });
      search.placeholder = page === 'goalsTasksPage' ? '업무명, 담당자 검색' : '목표명, 활동내용 검색';
      panel.dataset.goalView = page;
      filterGoals();
    };
    const enhanceTasks = () => {
      panel.querySelectorAll('.goals-task-card').forEach(card => {
        if (card.dataset.compactTaskReady) return;
        card.dataset.compactTaskReady = 'true';
        const head = card.querySelector('.goals-task-head');
        const actionsNode = card.querySelector('.goals-task-actions');
        if (head && actionsNode) head.append(actionsNode);
        const meta = card.querySelector('.goals-task-meta');
        if (meta) {
          const parts = meta.textContent.split('·').map(part => part.trim()).filter(Boolean);
          meta.replaceChildren(...parts.map(part => make('span', '', part)));
        }
        const issue = card.querySelector('.goals-task-issue');
        if (issue) issue.textContent = issue.textContent.replace(/^\s*⚠\s*/, '');
      });
      panel.querySelectorAll('.goals-td-kr').forEach(kr => {
        if (kr.closest('.bti-goals-kr-detail')) return;
        const detail = make('details', 'bti-goals-kr-detail');
        const label = make('summary', '', 'KR 및 목표 범위');
        kr.before(detail);
        detail.append(label, kr);
      });
      panel.querySelectorAll('#goalsQuarterActivityRows tr').forEach(row => {
        [6, 7].forEach(index => {
          const cell = row.children[index];
          if (!cell || cell.dataset.compactNoteReady) return;
          cell.dataset.compactNoteReady = 'true';
          const text = cell.textContent.trim();
          if (text.length <= (index === 6 ? 120 : 100)) return;
          const detail = make('details', 'bti-goals-note-detail');
          const label = make('summary', '', text.slice(0, index === 6 ? 78 : 60).replace(/\s+/g, ' ') + '…');
          const body = make('div', 'bti-goals-note-body', text);
          detail.append(label, body);
          cell.replaceChildren(detail);
        });
      });
      panel.querySelectorAll('.goals-btn-edit-goal').forEach(button => {
        if (!button.dataset.compactButtonReady) {
          button.textContent = '수정';
          button.dataset.compactButtonReady = 'true';
          button.setAttribute('aria-label', '활동목표 수정');
        }
      });
    };
    function filterGoals() {
      const query = search.value.trim().toLocaleLowerCase('ko');
      const active = panel.querySelector('.goals-page.active-page');
      let matchCount = 0;
      let candidateCount = 0;
      panel.querySelectorAll('#goalsObjectiveRows > tr, #goalsQuarterActivityRows > tr, .goals-task-card')
        .forEach(row => {
          if (row.querySelector('.goals-empty')) { row.hidden = false; return; }
          const match = !query || row.textContent.toLocaleLowerCase('ko').includes(query);
          row.hidden = !match;
          if (active?.contains(row)) { candidateCount++; if (match) matchCount++; }
        });
      emptySearch.hidden = !query || !candidateCount || matchCount > 0;
    }
    nav.querySelectorAll('.goals-nav-item').forEach(button => {
      button.type = 'button';
      button.addEventListener('click', () => choose(button.dataset.goalPage));
    });
    search.addEventListener('input', filterGoals);
    refreshGoals = () => { enhanceTasks(); filterGoals(); };
    const update = later(refreshGoals);
    ['goalsObjectiveRows', 'goalsQuarterActivityRows', 'goalsTaskList'].forEach(id => {
      const node = byId(id);
      if (node) new MutationObserver(update).observe(node, { childList: true, subtree: true });
    });
    choose(nav.querySelector('.active')?.dataset.goalPage || 'goalsDashboard');
    refreshGoals();
  }

  function initThanks() {
    const panel = byId('panelThanks');
    const grid = byId('thanksCardGrid');
    if (!panel || !grid || panel.dataset.compactThanksReady) return;
    panel.dataset.compactThanksReady = 'true';
    const header = panel.querySelector('.thanks-panel-header');
    const form = panel.querySelector('.thanks-form-card');
    const me = byId('thanksMeSelect');
    if (!header || !form || !me) return;
    const monthGroup = byId('thanksMonthTitle')?.parentElement;
    if (monthGroup) monthGroup.hidden = true;
    const meLabel = panel.querySelector('.thanks-me-label');
    if (meLabel) meLabel.textContent = '내 이름';
    me.setAttribute('aria-label', '칭찬카드를 보내는 본인 이름');
    const write = make('button', 'bti-thanks-write', '+ 칭찬 보내기');
    write.type = 'button';
    form.id ||= 'thanksComposePanel';
    form.hidden = true;
    write.setAttribute('aria-controls', form.id);
    write.setAttribute('aria-expanded', 'false');
    header.append(write);
    write.addEventListener('click', () => {
      form.hidden = !form.hidden;
      write.setAttribute('aria-expanded', String(!form.hidden));
      write.textContent = form.hidden ? '+ 칭찬 보내기' : '작성 닫기';
      if (!form.hidden) (me.value ? byId('thanksToSelect') : me)?.focus();
    });
    const formTitle = panel.querySelector('.thanks-form-header');
    if (formTitle) formTitle.textContent = '칭찬 카드 작성';
    byId('thanksToSelect')?.setAttribute('aria-label', '칭찬카드 받는 사람');
    byId('thanksTagSelect')?.setAttribute('aria-label', '칭찬카드 태그');
    byId('thanksMessageInput')?.setAttribute('aria-label', '칭찬 메시지');

    const insights = make('section', 'bti-thanks-insights bti-thanks-activity');
    insights.setAttribute('aria-labelledby', 'thanksActivityTitle');
    const chartHeader = make('div', 'bti-thanks-activity-header');
    const activityTitle = make('h3', 'bti-thanks-chart-label', '칭찬 현황');
    activityTitle.id = 'thanksActivityTitle';
    const legend = make('div', 'bti-thanks-legend');
    legend.append(make('span', 'is-sent', '보낸 칭찬'), make('span', 'is-received', '받은 칭찬'));
    chartHeader.append(activityTitle, legend);
    const groups = make('div', 'bti-thanks-team-groups');
    insights.append(chartHeader, groups);
    header.after(insights);
    const toolbar = byId('dashboardToolbar');
    if (toolbar) {
      const actions = make('div', 'bti-thanks-toolbar-actions');
      actions.id = 'thanksToolbarActions';
      actions.append(me.parentElement, write);
      toolbar.append(actions);
      header.hidden = true;
    }

    const filter = make('div', 'bti-thanks-filter');
    const tabs = make('div', 'bti-thanks-tabs');
    const viewButtons = {};
    let currentView = 'all';
    [['all', '전체'], ['received', '내가 받은'], ['sent', '내가 보낸']].forEach(([key, label]) => {
      const button = make('button', '', label);
      button.type = 'button';
      button.dataset.thanksView = key;
      button.setAttribute('aria-pressed', String(key === currentView));
      button.classList.toggle('selected', key === currentView);
      button.addEventListener('click', () => { currentView = key; refreshThanks(); });
      viewButtons[key] = button;
      tabs.append(button);
    });
    tabs.setAttribute('aria-label', '칭찬 카드 보기');
    const search = make('input', 'bti-gx-search');
    search.type = 'search';
    search.placeholder = '이름, 칭찬내용 검색';
    search.setAttribute('aria-label', '칭찬 카드 이름과 내용 검색');
    filter.append(tabs, search);
    grid.before(filter);
    const filteredEmpty = make('div', 'bti-thanks-filter-empty', '조건에 맞는 칭찬 카드가 없습니다.');
    filteredEmpty.hidden = true;
    grid.after(filteredEmpty);

    const readCards = () => Array.from(grid.querySelectorAll('.thanks-card')).map(card => {
      const to = card.querySelector('.thanks-card-to')?.textContent.replace(/^TO\.\s*/i, '').trim() || '';
      const fromNode = card.querySelector('.thanks-card-from');
      const from = fromNode?.textContent.replace(/^[—─]\s*/, '').trim() || '';
      if (fromNode && /^[—─]/.test(fromNode.textContent)) fromNode.textContent = from;
      card.querySelectorAll('.thanks-reaction').forEach(button => {
        button.type = 'button';
        button.setAttribute('aria-label', button.title || '칭찬 스티커');
        button.setAttribute('aria-pressed', String(button.classList.contains('is-mine')));
      });
      return {
        card, to, from,
        query: card.textContent.toLocaleLowerCase('ko'),
        reactions: Array.from(card.querySelectorAll('.thanks-reaction-count'))
          .reduce((sum, count) => sum + (Number(count.textContent) || 0), 0),
      };
    });
    const teamsOf = () => {
      const teams = new Map();
      Array.from(me.options).forEach(option => {
        const match = option.textContent.match(/\((.+)\s+(?:부문장|팀장|과장|대리|사원)\)$/);
        if (option.value && match) teams.set(option.value, match[1]);
      });
      return teams;
    };
    const refresh = () => {
      const cards = readCards();
      const query = search.value.trim().toLocaleLowerCase('ko');
      if (!me.value) currentView = 'all';
      Object.entries(viewButtons).forEach(([key, button]) => {
        button.disabled = key !== 'all' && !me.value;
        button.classList.toggle('selected', key === currentView);
        button.setAttribute('aria-pressed', String(key === currentView));
      });
      let visibleCount = 0;
      cards.forEach(item => {
        const viewMatch = currentView === 'all'
          || (currentView === 'received' && item.to === me.value)
          || (currentView === 'sent' && item.from === me.value);
        const visible = viewMatch && (!query || item.query.includes(query));
        item.card.hidden = !visible;
        if (visible) visibleCount++;
      });
      filteredEmpty.hidden = !cards.length || visibleCount > 0;
      const teams = teamsOf();
      const counts = new Map(['경영관리팀', '사업관리팀', '건기식관리부문'].map(team => [team, { sent: 0, received: 0 }]));
      const members = new Map(Array.from(me.options).filter(option => option.value)
        .map(option => [option.value, { sent: 0, received: 0 }]));
      cards.forEach(card => {
        [[card.from, 'sent'], [card.to, 'received']].forEach(([name, direction]) => {
          if (!name) return;
          const team = teams.get(name) || '기타';
          if (!counts.has(team)) counts.set(team, { sent: 0, received: 0 });
          counts.get(team)[direction]++;
          if (!members.has(name)) members.set(name, { sent: 0, received: 0 });
          members.get(name)[direction]++;
        });
      });
      const max = Math.max(...Array.from(counts.values()).flatMap(count => [count.sent, count.received]), 1);
      const chartSignature = JSON.stringify([Array.from(counts), Array.from(members)]);
      if (insights.dataset.signature !== chartSignature) {
        insights.dataset.signature = chartSignature;
        groups.style.setProperty('--thanks-team-count', counts.size);
        groups.replaceChildren(...Array.from(counts).map(([team, count], index) => {
          const group = make('section', 'bti-thanks-team-group');
          group.dataset.team = team;
          const title = make('h4', 'bti-thanks-team-title', team);
          title.id = 'thanksTeamTitle' + index;
          group.setAttribute('aria-labelledby', title.id);
          const bars = make('div', 'bti-thanks-chart-pair');
          bars.setAttribute('role', 'group');
          bars.setAttribute('aria-label', team + ' 합계');
          ['sent', 'received'].forEach(direction => {
            const line = make('div', 'bti-thanks-chart-line is-' + direction);
            line.setAttribute('aria-label', `${direction === 'sent' ? '보낸' : '받은'} 칭찬 ${count[direction]}건`);
            const track = make('div', 'bti-thanks-chart-track');
            track.setAttribute('aria-hidden', 'true');
            const bar = make('i');
            bar.style.width = (count[direction] / max * 100) + '%';
            track.append(bar);
            line.append(track, make('b', '', String(count[direction])));
            bars.append(line);
          });
          const table = make('table', 'bti-thanks-team-table');
          table.setAttribute('aria-label', team + ' 구성원별 칭찬');
          const tableHead = make('thead');
          const headings = make('tr');
          ['구성원', '보낸 칭찬', '받은 칭찬'].forEach((label, index) => {
            const th = make('th', index === 1 ? 'is-sent' : index === 2 ? 'is-received' : '', label);
            th.scope = 'col';
            headings.append(th);
          });
          tableHead.append(headings);
          const rows = make('tbody');
          Array.from(members).filter(([name]) => (teams.get(name) || '기타') === team).forEach(([name, totals]) => {
            const row = make('tr');
            row.dataset.person = name;
            const label = make('th', '', name);
            label.scope = 'row';
            row.append(label);
            ['sent', 'received'].forEach(direction => {
              const cell = make('td', 'is-' + direction);
              const number = make('span', '', totals[direction].toLocaleString('ko'));
              const track = make('span', 'bti-thanks-person-track');
              track.setAttribute('aria-hidden', 'true');
              const bar = make('i');
              bar.style.width = (totals[direction] / max * 100) + '%';
              track.append(bar);
              cell.append(number, track);
              row.append(cell);
            });
            rows.append(row);
          });
          table.append(tableHead, rows);
          group.append(title, bars, table);
          return group;
        }));
      }
      const emptyTitle = grid.querySelector('.thanks-empty-title');
      if (emptyTitle && emptyTitle.textContent !== '이달의 칭찬 카드가 없습니다.') emptyTitle.textContent = '이달의 칭찬 카드가 없습니다.';
      const emptySub = grid.querySelector('.thanks-empty-sub');
      if (emptySub) emptySub.hidden = true;
    };
    refreshThanks = refresh;
    panel.addEventListener('bti:praise-saved', () => {
      currentView = 'sent';
      search.value = '';
      refresh();
    });
    search.addEventListener('input', refresh);
    me.addEventListener('change', refresh);
    new MutationObserver(later(refresh)).observe(grid, { childList: true, subtree: true });
    refresh();
  }

  function boot() {
    initGoals();
    initThanks();
    window.BtiGoalsThanksUX = {
      refresh() { refreshGoals(); refreshThanks(); },
    };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
