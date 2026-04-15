document.addEventListener('DOMContentLoaded', async () => {
    const calendarGrid = document.getElementById('calendarGrid');
    const upcomingList = document.getElementById('upcomingList');
    const searchInput = document.getElementById('searchInput');
    const filterBtns = document.querySelectorAll('.filter-btn');

    // Event Detail Modal
    const eventModal = document.getElementById('eventModal');
    const closeModal = document.getElementById('closeModal');
    const modalCompany = document.getElementById('modalCompany');
    const modalTitle = document.getElementById('modalTitle');
    const modalDate = document.getElementById('modalDate');

    // Review Modal
    const reviewModal = document.getElementById('reviewModal');
    const closeReviewModal = document.getElementById('closeReviewModal');
    const reviewTableBody = document.getElementById('reviewTableBody');
    const confirmReviewBtn = document.getElementById('confirmReviewBtn');

    // Settings Modal
    const settingsModal = document.getElementById('settingsModal');
    const openSettingsBtn = document.getElementById('openSettingsBtn');
    const closeSettingsModal = document.getElementById('closeSettingsModal');

    let pendingUploadEvents = [];
    let currentFilter = 'all';
    let currentSearch = '';

    // ========== SUPABASE CONFIG ==========
    const SUPABASE_URL = 'https://heguvoklrdzcjbifzqsc.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhlZ3V2b2tscmR6Y2piaWZ6cXNjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzMzA1NjAsImV4cCI6MjA5MDkwNjU2MH0.nlaMAjSqlz7ZcP-4hrO6kWKSv6AQ3YyT8rIu95ggFVs';

    // Safely detect Supabase client (UMD export varies by version)
    let sb = null;
    try {
        const _sb = window.supabase;
        if (_sb && typeof _sb.createClient === 'function') {
            sb = _sb.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        } else if (_sb && _sb.supabase && typeof _sb.supabase.createClient === 'function') {
            sb = _sb.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        }
    } catch (initErr) {
        console.warn('Supabase 클라이언트 초기화 실패:', initErr);
    }

    // ── 이벤트 배경색 저장소 (Supabase 로드 전 초기화) ──
    let eventColorMap = {};
    try { eventColorMap = JSON.parse(localStorage.getItem('eventCustomColors')) || {}; } catch { eventColorMap = {}; }

    // ========== DATA LAYER (Supabase + fallback) ==========
    let allEvents = [];
    if (sb) {
        try {
            const { data, error } = await sb
                .from('schedules')
                .select('id, company, date, title')
                .order('date', { ascending: true });
            if (error) throw error;
            const raw = data || [];
            // _COLOR 레코드는 색상 맵으로 분리, 일반 일정만 allEvents에
            raw.forEach(r => {
                if (r.company === '_COLOR') {
                    try { eventColorMap[r.date] = JSON.parse(r.title); } catch(_) {}
                }
            });
            allEvents = raw.filter(r => r.company !== '_COLOR');
            console.log(`✅ Supabase에서 ${allEvents.length}건 로드 완료 (색상 ${Object.keys(eventColorMap).length}건)`);
        } catch (e) {
            console.warn('Supabase 쿼리 실패, data.js 폴백 사용:', e.message);
            allEvents = window.fallbackEvents || [];
        }
    } else {
        console.warn('Supabase 미연결 → data.js 폴백 사용');
        allEvents = window.fallbackEvents || [];
    }
    allEvents.sort((a, b) => a.date.localeCompare(b.date));

    // ── 기존 중복 일정 1회 정리 (company,date,정규화 title 기준) ──
    try {
        const normT = t => (t || '').replace(/\s+/g, ' ').trim().toLowerCase();
        const groups = new Map();
        allEvents.filter(e => e.company !== '_COLOR').forEach(e => {
            const k = `${e.company}||${e.date}||${normT(e.title)}`;
            if (!groups.has(k)) groups.set(k, []);
            groups.get(k).push(e);
        });
        const dupIds = [];
        groups.forEach(arr => { if (arr.length > 1) arr.slice(1).forEach(x => dupIds.push(x.id)); });
        if (dupIds.length > 0) {
            console.log(`🧹 중복 일정 ${dupIds.length}건 정리 중...`);
            if (sb) {
                const { error } = await sb.from('schedules').delete().in('id', dupIds);
                if (error) console.warn('중복 삭제 실패:', error.message);
            }
            const rm = new Set(dupIds);
            allEvents = allEvents.filter(e => !rm.has(e.id));
            console.log(`✅ 중복 ${dupIds.length}건 제거 완료`);
        }
    } catch (e) {
        console.warn('중복 정리 중 오류:', e.message);
    }

    // ========== CALENDAR STATE ==========
    let today = new Date();
    let currentYear = today.getFullYear();
    let currentMonth = today.getMonth();

    // ========== HOLIDAYS ==========
    const holidays = {
        "01-01": "신정",
        "03-01": "삼일절",
        "05-05": "어린이날",
        "06-06": "현충일",
        "08-15": "광복절",
        "10-03": "개천절",
        "10-09": "한글날",
        "12-25": "성탄절",
        // 2026 Lunar & Election
        "2026-02-16": "설연휴",
        "2026-02-17": "설날",
        "2026-02-18": "설연휴",
        "2026-05-24": "부처님오신날",
        "2026-06-03": "지방선거",
        "2026-09-24": "추석연휴",
        "2026-09-25": "추석",
        "2026-09-26": "추석연휴",
        // 2026 대체공휴일
        "2026-03-02": "대체공휴일",   // 삼일절(일) → 월
        "2026-05-25": "대체공휴일",   // 부처님오신날(일) → 월
        "2026-08-17": "대체공휴일",   // 광복절(토) → 월
        "2026-09-28": "대체공휴일",   // 추석연휴(토) → 월
        "2026-10-05": "대체공휴일",   // 개천절(토) → 월
        "05-01": "근로자의 날"
    };

    function getHolidayName(y, m, d) {
        const mm = String(m).padStart(2, '0');
        const dd = String(d).padStart(2, '0');
        return holidays[`${y}-${mm}-${dd}`] || holidays[`${mm}-${dd}`] || null;
    }

    // ========== RENDER ==========
    function renderCalendar() {
        calendarGrid.innerHTML = '';
        const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
        const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();

        document.getElementById('monthTitle').textContent = `${currentYear}. ${String(currentMonth + 1).padStart(2, '0')}`;

        for (let i = 0; i < firstDayIndex; i++) {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'cal-day empty';
            calendarGrid.appendChild(emptyDiv);
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const dayDiv = document.createElement('div');
            dayDiv.className = 'cal-day';

            const isSunday   = (firstDayIndex + day - 1) % 7 === 0;
            const isSaturday = (firstDayIndex + day - 1) % 7 === 6;
            const holidayName = getHolidayName(currentYear, currentMonth + 1, day);
            const isToday = currentYear === today.getFullYear() &&
                            currentMonth === today.getMonth() &&
                            day === today.getDate();

            if (holidayName) dayDiv.classList.add('holiday-day');
            if (isSaturday) dayDiv.classList.add('saturday-day');
            if (isToday)    dayDiv.classList.add('today-day');

            // 날짜 헤더 행
            const dateRow = document.createElement('div');
            dateRow.className = 'cal-date-row';

            const dateSpan = document.createElement('span');
            dateSpan.className = 'date-num';
            if (isSunday || holidayName) dateSpan.classList.add('sun');
            if (isSaturday) dateSpan.classList.add('sat');
            if (isToday)    dateSpan.classList.add('today-num');
            dateSpan.textContent = day;
            dateRow.appendChild(dateSpan);

            if (holidayName) {
                const hl = document.createElement('span');
                hl.className = 'holiday-label';
                hl.textContent = holidayName;
                dateRow.appendChild(hl);
            }

            dayDiv.appendChild(dateRow);

            const dayString = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

            // 시간 추출 함수 (HH:MM 형식 → 분 단위 숫자, 없으면 9999로 후순위)
            const getTimeVal = title => {
                const m = title.match(/^(\d{2}):?(\d{2})/);
                return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : 9999;
            };

            const COMPANY_PRIORITY = { Group: 0, NBT: 1, BIO: 2 };

            // 전체보기 시 동일 시간·동일 회의명 중복 제거 (Group 우선)
            function deduplicateByTitle(events) {
                if (currentFilter !== 'all') return events;
                const map = new Map();
                events.forEach(evt => {
                    const key = evt.title.replace(/\s+/g, '').toLowerCase();
                    const prev = map.get(key);
                    if (!prev || (COMPANY_PRIORITY[evt.company] ?? 9) < (COMPANY_PRIORITY[prev.company] ?? 9)) {
                        map.set(key, evt);
                    }
                });
                return [...map.values()].sort((a, b) => getTimeVal(a.title) - getTimeVal(b.title));
            }

            const dayEvents = deduplicateByTitle(
                allEvents
                    .filter(e => e.date === dayString)
                    .sort((a, b) => getTimeVal(a.title) - getTimeVal(b.title))
            );

            dayEvents.forEach(evt => {
                if (currentFilter !== 'all' && evt.company !== currentFilter) return;
                if (currentSearch && !evt.title.toLowerCase().includes(currentSearch)) return;

                const eventDiv = document.createElement('div');
                eventDiv.className = `event ${evt.company}`;
                // 커스텀 색상 적용
                const customColor = eventColorMap[evt.id];
                if (customColor) {
                    eventDiv.style.background = customColor.bg;
                    eventDiv.style.color = customColor.text;
                }

                let timeStr = "";
                let contentStr = evt.title;
                const timeMatch = evt.title.match(/^(\d{2}):?(\d{2})\s*(.*)$/);
                if (timeMatch) {
                    timeStr = `${timeMatch[1]}:${timeMatch[2]}`;
                    contentStr = timeMatch[3];
                }

                const showComp = currentFilter === 'all';
                const compInitial = evt.company === 'Group' ? 'G' : evt.company === 'NBT' ? 'N' : 'B';
                const compBadge = showComp ? `<span class="e-badge e-badge-${evt.company}">${compInitial}</span>` : '';

                // 항상 한 줄: 배지 + 시간(있으면) + 제목
                if (timeStr) {
                    eventDiv.innerHTML = `${compBadge}<span class="e-time">${timeStr}</span><span class="e-title">${contentStr}</span>`;
                } else {
                    eventDiv.innerHTML = `${compBadge}<span class="e-title">${contentStr}</span>`;
                }
                eventDiv.title = `[${evt.company}] ${timeStr ? timeStr + ' ' : ''}${contentStr}`;

                eventDiv.addEventListener('click', () => openEventModal(evt));

                dayDiv.appendChild(eventDiv);
            });

            calendarGrid.appendChild(dayDiv);
        }
    }

    // ========== 셀 드래그 스크롤 ==========
    (function initCellDragScroll() {
        const grid = document.getElementById('calendarGrid');
        let activeCell = null;
        let startY = 0, baseScrollTop = 0;
        let didDrag = false;

        // 마우스 누름 → 드래그 준비
        grid.addEventListener('mousedown', e => {
            const cell = e.target.closest('.cal-day:not(.empty)');
            if (!cell) return;
            activeCell    = cell;
            startY        = e.clientY;
            baseScrollTop = cell.scrollTop;
            didDrag       = false;
            document.body.style.userSelect = 'none';
        });

        // 마우스 이동 → 스크롤 적용
        window.addEventListener('mousemove', e => {
            if (!activeCell) return;
            const dy = e.clientY - startY;
            if (Math.abs(dy) > 4) {
                didDrag = true;
                activeCell.classList.add('is-dragging');
                activeCell.scrollTop = baseScrollTop - dy;
            }
        });

        // 마우스 뗌 → 드래그 종료
        window.addEventListener('mouseup', () => {
            if (!activeCell) return;
            activeCell.classList.remove('is-dragging');
            activeCell = null;
            document.body.style.userSelect = '';
            // 다음 틱까지 didDrag 유지 → 클릭 차단 후 리셋
            setTimeout(() => { didDrag = false; }, 0);
        });

        // 드래그 직후 클릭 이벤트 차단 (캡처 페이즈)
        grid.addEventListener('click', e => {
            if (didDrag) {
                e.stopPropagation();
                e.preventDefault();
            }
        }, true);
    })();

    function renderUpcoming() {
        upcomingList.innerHTML = '';

        // Compute current week range (Mon ~ Sun based on today)
        const now = new Date();
        const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon...
        const diffToMon = (dayOfWeek === 0) ? -6 : 1 - dayOfWeek;
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() + diffToMon);
        weekStart.setHours(0, 0, 0, 0);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999);

        const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        const wsStr = fmt(weekStart);
        const weStr = fmt(weekEnd);

        // Update sidebar label to show week range
        const h3 = upcomingList.closest('.upcoming-events').querySelector('h3');
        if (h3) {
            h3.textContent = `이번 주 주요 일정`;
            h3.title = `${wsStr} ~ ${weStr}`;
        }

        const filtered = allEvents.filter(evt => {
            if (evt.date < wsStr || evt.date > weStr) return false;
            if (currentFilter !== 'all' && evt.company !== currentFilter) return false;
            if (currentSearch && !evt.title.toLowerCase().includes(currentSearch)) return false;
            return true;
        });

        if (filtered.length === 0) {
            upcomingList.innerHTML = `<li style="color:#9ca3af;font-size:13px;">이번 주(${wsStr.slice(5)} ~ ${weStr.slice(5)}) 일정이 없습니다.</li>`;
            return;
        }

        filtered.forEach(evt => {
            const li = document.createElement('li');
            li.className = `upcoming-item ${evt.company}`;
            const showComp = currentFilter === 'all' ? ` &middot; ${evt.company}` : '';
            // Format date as M/D (요일)
            const d = new Date(evt.date);
            const dayNames = ['일','월','화','수','목','금','토'];
            const dateLabel = `${d.getMonth()+1}/${d.getDate()}(${dayNames[d.getDay()]})`;
            li.innerHTML = `
                <span class="upcoming-date">${dateLabel}${showComp}</span>
                <span class="upcoming-title">${evt.title}</span>
            `;
            upcomingList.appendChild(li);
        });
    }

    function update() {
        renderCalendar();
        renderUpcoming();
        if (panelLeave && panelLeave.style.display === 'flex') renderLeaveCalendar();
        if (panelRequest && panelRequest.style.display === 'flex') renderRequestCalendar();
    }

    // ========== EVENT LISTENERS ==========
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // 식단표/연차/요청자료 보는 중이면 캘린더로 자동 전환
            if (panelMenuView.style.display === 'flex' ||
                panelLeave.style.display === 'flex' ||
                panelRequest.style.display === 'flex') {
                switchToCalendar();
            }
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.company;
            update();
        });
    });

    searchInput.addEventListener('input', (e) => {
        currentSearch = e.target.value.toLowerCase();
        update();
    });

    // ========== MAIN TABS (Calendar / Menu / Leave / Request) ==========
    const tabMenu    = document.getElementById('tabMenu');
    const tabLeave   = document.getElementById('tabLeave');
    const tabRequest = document.getElementById('tabRequest');
    const panelCalendar = document.getElementById('panelCalendar');
    const panelMenuView = document.getElementById('panelMenuView');
    const panelLeave    = document.getElementById('panelLeave');
    const panelRequest  = document.getElementById('panelRequest');

    function switchToCalendar() {
        tabMenu.classList.remove('active');
        tabLeave.classList.remove('active');
        tabRequest.classList.remove('active');
        panelCalendar.style.display = '';
        panelMenuView.style.display = 'none';
        panelLeave.style.display = 'none';
        panelRequest.style.display = 'none';
    }

    function switchToMenu() {
        tabMenu.classList.add('active');
        tabLeave.classList.remove('active');
        tabRequest.classList.remove('active');
        panelMenuView.style.display = 'flex';
        panelMenuView.style.flexDirection = 'column';
        panelCalendar.style.display = 'none';
        panelLeave.style.display = 'none';
        panelRequest.style.display = 'none';
        renderMenuWeek();
    }

    function switchToLeave() {
        tabLeave.classList.add('active');
        tabMenu.classList.remove('active');
        tabRequest.classList.remove('active');
        panelLeave.style.display = 'flex';
        panelLeave.style.flexDirection = 'column';
        panelCalendar.style.display = 'none';
        panelMenuView.style.display = 'none';
        panelRequest.style.display = 'none';
        renderLeaveCalendar();
    }

    function switchToRequest() {
        tabRequest.classList.add('active');
        tabMenu.classList.remove('active');
        tabLeave.classList.remove('active');
        panelRequest.style.display = 'flex';
        panelRequest.style.flexDirection = 'column';
        panelCalendar.style.display = 'none';
        panelMenuView.style.display = 'none';
        panelLeave.style.display = 'none';
        renderRequestCalendar();
    }

    tabMenu.addEventListener('click', () => {
        if (panelMenuView.style.display === 'flex') switchToCalendar();
        else switchToMenu();
    });

    tabLeave.addEventListener('click', () => {
        if (panelLeave.style.display === 'flex') switchToCalendar();
        else switchToLeave();
    });

    tabRequest.addEventListener('click', () => {
        if (panelRequest.style.display === 'flex') switchToCalendar();
        else switchToRequest();
    });

    // ========== MENU WEEK NAVIGATION & PDF UPLOAD ==========
    const HARDCODED_WEEKS = {
        '2026-04-06': 'menuContentTable',   // 둘째주
        '2026-04-13': 'menuContentTable2'    // 셋째주
    };

    // Supabase에서 menu_weeks 로드 (fallback: localStorage)
    let menuStore = {};

    async function loadMenuStore() {
        if (sb) {
            try {
                const { data, error } = await sb.from('menu_weeks').select('*');
                if (error) throw error;
                menuStore = {};
                (data || []).forEach(row => {
                    const key = typeof row.week_key === 'string'
                        ? row.week_key.slice(0, 10)
                        : row.week_key;
                    const { data: urlData } = sb.storage
                        .from('menu-images')
                        .getPublicUrl(row.storage_path);
                    menuStore[key] = {
                        imageUrl: urlData.publicUrl,
                        fileName: row.file_name,
                        uploadedAt: row.uploaded_at,
                        storagePath: row.storage_path
                    };
                });
                console.log(`✅ menu_weeks ${Object.keys(menuStore).length}건 로드`);
            } catch(e) {
                console.warn('menu_weeks 로드 실패, localStorage 폴백:', e.message);
                try {
                    const saved = localStorage.getItem('menuWeekStore');
                    if (saved) menuStore = JSON.parse(saved);
                } catch(_) {}
            }
        } else {
            try {
                const saved = localStorage.getItem('menuWeekStore');
                if (saved) menuStore = JSON.parse(saved);
            } catch(_) {}
        }
    }

    await loadMenuStore();

    // 현재 표시 중인 주 (오늘 날짜 기준 → 해당 주 월요일 자동 계산)
    function getTodayMonday() {
        const today = new Date();
        today.setHours(0,0,0,0);
        const day = today.getDay(); // 0=Sun
        const diff = day === 0 ? 6 : day - 1; // 월요일까지 거리
        today.setDate(today.getDate() - diff);
        return today;
    }
    let currentMenuMonday = getTodayMonday();

    function menuWeekKey(d) {
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }

    function getMenuWeekInfo(monday) {
        const year = monday.getFullYear();
        const month = monday.getMonth() + 1;
        const firstDayOfMonth = new Date(year, monday.getMonth(), 1).getDay(); // 0=Sun
        const weekNum = Math.ceil((monday.getDate() + firstDayOfMonth) / 7);
        const names = ['첫째', '둘째', '셋째', '넷째', '다섯째'];
        const friday = new Date(monday.getTime() + 4 * 86400000);
        const fmt = d => `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
        return {
            title: `${year}년 ${month}월 ${names[Math.min(weekNum-1, 4)]} 주`,
            range: `${fmt(monday)} ~ ${fmt(friday)}`
        };
    }

    function renderMenuWeek() {
        const key = menuWeekKey(currentMenuMonday);
        const info = getMenuWeekInfo(currentMenuMonday);

        document.getElementById('menuWeekLabel').textContent = '창조경제혁신센터 주간 메뉴';
        document.getElementById('menuWeekSub').textContent = `${info.title} (${info.range}) · (주)멜리에프에스`;

        const imageEl  = document.getElementById('menuContentImage');
        const emptyEl  = document.getElementById('menuContentEmpty');
        const noticeEl = document.getElementById('menuNotice');

        // 모든 하드코딩 테이블 숨기기
        Object.values(HARDCODED_WEEKS).forEach(id => {
            document.getElementById(id).style.display = 'none';
        });
        imageEl.style.display = 'none';
        emptyEl.style.display = 'none';

        if (menuStore[key]) {
            // 업로드된 이미지 표시 (Supabase Storage URL 또는 dataUrl 폴백)
            document.getElementById('menuUploadedImg').src = menuStore[key].imageUrl || menuStore[key].dataUrl || '';
            imageEl.style.display = 'block';
            noticeEl.style.display = '';
        } else if (HARDCODED_WEEKS[key]) {
            // 하드코딩 테이블 표시
            document.getElementById(HARDCODED_WEEKS[key]).style.display = '';
            noticeEl.style.display = '';
        } else {
            // 빈 상태
            emptyEl.style.display = 'flex';
            noticeEl.style.display = 'none';
        }
    }

    // 이전/다음 주 이동
    document.getElementById('prevWeekBtn').addEventListener('click', () => {
        currentMenuMonday = new Date(currentMenuMonday.getTime() - 7 * 86400000);
        renderMenuWeek();
    });
    document.getElementById('nextWeekBtn').addEventListener('click', () => {
        currentMenuMonday = new Date(currentMenuMonday.getTime() + 7 * 86400000);
        renderMenuWeek();
    });

    // PDF 업로드 처리
    const menuPdfInput = document.getElementById('menuPdfInput');
    const triggerMenuUpload = () => menuPdfInput.click();

    document.getElementById('menuUploadBtn').addEventListener('click', triggerMenuUpload);
    document.getElementById('menuEmptyUploadBtn').addEventListener('click', triggerMenuUpload);

    menuPdfInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        menuPdfInput.value = '';

        const btn = document.getElementById('menuUploadBtn');
        const origLabel = btn.textContent;
        btn.textContent = '⏳ 처리 중...';
        btn.disabled = true;

        try {
            // PDF → Canvas 렌더링
            const ab = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
            const page = await pdf.getPage(1);
            const vp = page.getViewport({ scale: 2.0 });
            const canvas = document.createElement('canvas');
            canvas.width = vp.width;
            canvas.height = vp.height;
            await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;

            const key = menuWeekKey(currentMenuMonday);
            const storagePath = `${key}.jpg`;

            if (sb) {
                // Supabase Storage에 업로드
                const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.92));
                const { error: upErr } = await sb.storage
                    .from('menu-images')
                    .upload(storagePath, blob, { upsert: true, contentType: 'image/jpeg' });
                if (upErr) throw upErr;

                // 공개 URL 취득
                const { data: urlData } = sb.storage.from('menu-images').getPublicUrl(storagePath);

                // menu_weeks 테이블 upsert
                const { error: dbErr } = await sb.from('menu_weeks').upsert({
                    week_key: key,
                    file_name: file.name,
                    storage_path: storagePath,
                    uploaded_at: new Date().toISOString()
                });
                if (dbErr) throw dbErr;

                menuStore[key] = {
                    imageUrl: urlData.publicUrl,
                    fileName: file.name,
                    uploadedAt: new Date().toISOString(),
                    storagePath
                };
            } else {
                // Supabase 미연결 → localStorage 폴백
                const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
                menuStore[key] = { imageUrl: dataUrl, fileName: file.name, uploadedAt: new Date().toISOString() };
                try { localStorage.setItem('menuWeekStore', JSON.stringify(menuStore)); } catch(_) {}
            }

            renderMenuWeek();
        } catch(err) {
            alert('PDF 처리 중 오류가 발생했습니다: ' + err.message);
        } finally {
            btn.textContent = origLabel;
            btn.disabled = false;
        }
    });

    // 업로드 메뉴 삭제
    document.getElementById('menuDeleteBtn').addEventListener('click', async () => {
        const key = menuWeekKey(currentMenuMonday);
        if (!menuStore[key]) return;
        if (!confirm('이 주의 업로드된 메뉴를 삭제할까요?')) return;

        const storagePath = menuStore[key].storagePath || `${key}.jpg`;

        if (sb) {
            try {
                await sb.storage.from('menu-images').remove([storagePath]);
                await sb.from('menu_weeks').delete().eq('week_key', key);
            } catch(e) {
                console.warn('삭제 오류:', e.message);
            }
        } else {
            try { localStorage.setItem('menuWeekStore', JSON.stringify(menuStore)); } catch(_) {}
        }

        delete menuStore[key];
        renderMenuWeek();
    });

    // 초기 렌더링
    renderMenuWeek();

    // ========== DETAIL / EDIT / DELETE MODAL ==========
    let currentEventId = null; // tracks the event being viewed/edited

    // ── 이벤트 배경색 저장 (Supabase schedules 테이블, company='_COLOR') ──
    async function saveEventColor(eventId, colorInfo) {
        // localStorage 동기 저장 (즉시 반영)
        try { localStorage.setItem('eventCustomColors', JSON.stringify(eventColorMap)); } catch(_) {}
        // Supabase 비동기 저장 (다른 사용자와 공유)
        if (!sb || !eventId) return;
        try {
            await sb.from('schedules').upsert({
                id:      `_COLOR-${eventId}`,
                company: '_COLOR',
                date:    eventId,          // event_id를 date 필드에 보관
                title:   JSON.stringify(colorInfo)
            }, { onConflict: 'id' });
        } catch(e) { console.warn('색상 저장 실패:', e.message); }
    }

    async function deleteEventColor(eventId) {
        try { localStorage.setItem('eventCustomColors', JSON.stringify(eventColorMap)); } catch(_) {}
        if (!sb || !eventId) return;
        try {
            await sb.from('schedules').delete().eq('id', `_COLOR-${eventId}`);
        } catch(e) { console.warn('색상 삭제 실패:', e.message); }
    }

    // 배경 밝기에 따라 텍스트색 자동 결정 (WCAG 대비)
    function contrastColor(hex) {
        const r = parseInt(hex.slice(1,3),16);
        const g = parseInt(hex.slice(3,5),16);
        const b = parseInt(hex.slice(5,7),16);
        const lum = 0.299*r + 0.587*g + 0.114*b;
        return lum > 145 ? '#1e293b' : '#ffffff';
    }

    function applyEventColorToDiv(div, colorInfo) {
        if (!colorInfo) { div.style.background = ''; div.style.color = ''; return; }
        div.style.background = colorInfo.bg;
        div.style.color = colorInfo.text;
    }

    function updateColorPreview(bg, titleText) {
        const preview = document.getElementById('eventColorPreview');
        const text = contrastColor(bg);
        preview.style.background = bg;
        preview.style.color = text;
        preview.textContent = titleText || '미리보기';
    }

    function syncColorPickerUI(colorInfo, defaultBg) {
        const picker = document.getElementById('eventColorPicker');
        const presets = document.querySelectorAll('.preset-swatch');
        const activeBg = colorInfo ? colorInfo.bg : defaultBg;
        picker.value = activeBg;
        presets.forEach(s => {
            s.classList.toggle('selected', s.dataset.color === activeBg);
        });
    }

    // 기본 배경색 (회사별)
    const DEFAULT_EVENT_BG = { Group: '#eff8ff', NBT: '#f0fdf4', BIO: '#fff7ed' };

    function openEventModal(evt) {
        currentEventId = evt.id;
        modalCompany.className = `company-badge ${evt.company}`;
        modalCompany.textContent = evt.company;
        document.getElementById('modalTitle').textContent = evt.title;
        document.getElementById('modalDate').textContent = evt.date;
        document.getElementById('modalViewMode').style.display = '';
        document.getElementById('modalEditMode').style.display = 'none';

        // 색상 UI 초기화
        const colorInfo = eventColorMap[evt.id];
        const defaultBg = DEFAULT_EVENT_BG[evt.company] || '#f1f5f9';
        syncColorPickerUI(colorInfo, defaultBg);
        updateColorPreview(colorInfo ? colorInfo.bg : defaultBg, evt.title);

        eventModal.classList.add('active');
    }

    function closeEventModal() {
        eventModal.classList.remove('active');
        currentEventId = null;
    }

    closeModal.addEventListener('click', closeEventModal);
    eventModal.addEventListener('click', (e) => { if (e.target === eventModal) closeEventModal(); });

    // ── 색상 피커 이벤트 ──
    function applyColorSelection(bg) {
        if (!currentEventId) return;
        const text = contrastColor(bg);
        const colorInfo = { bg, text };
        eventColorMap[currentEventId] = colorInfo;
        saveEventColor(currentEventId, colorInfo); // Supabase + localStorage
        syncColorPickerUI(colorInfo, bg);
        const evt = allEvents.find(e => e.id === currentEventId);
        updateColorPreview(bg, evt ? evt.title : '미리보기');
        renderCalendar(); // 캘린더 즉시 반영
    }

    document.getElementById('eventColorPicker').addEventListener('input', e => {
        applyColorSelection(e.target.value);
    });

    document.getElementById('eventColorPresets').addEventListener('click', e => {
        const swatch = e.target.closest('.preset-swatch');
        if (!swatch) return;
        applyColorSelection(swatch.dataset.color);
    });

    document.getElementById('eventColorResetBtn').addEventListener('click', () => {
        if (!currentEventId) return;
        delete eventColorMap[currentEventId];
        deleteEventColor(currentEventId); // Supabase + localStorage
        const evt = allEvents.find(e => e.id === currentEventId);
        const defaultBg = evt ? (DEFAULT_EVENT_BG[evt.company] || '#f1f5f9') : '#f1f5f9';
        syncColorPickerUI(null, defaultBg);
        updateColorPreview(defaultBg, evt ? evt.title : '미리보기');
        renderCalendar();
    });

    // Edit button → switch to edit mode
    document.getElementById('editEventBtn').addEventListener('click', () => {
        const evt = allEvents.find(e => e.id === currentEventId);
        if (!evt) return;
        document.getElementById('editCompanyInput').value = evt.company;
        document.getElementById('editDateInput').value = evt.date;
        document.getElementById('editTitleInput').value = evt.title;
        document.getElementById('modalViewMode').style.display = 'none';
        document.getElementById('modalEditMode').style.display = '';
    });

    // Cancel edit
    document.getElementById('cancelEditBtn').addEventListener('click', () => {
        document.getElementById('modalViewMode').style.display = '';
        document.getElementById('modalEditMode').style.display = 'none';
    });

    // Save edit
    document.getElementById('saveEditBtn').addEventListener('click', async () => {
        const company = document.getElementById('editCompanyInput').value;
        const date = document.getElementById('editDateInput').value;
        const title = document.getElementById('editTitleInput').value.trim();
        if (!date || !title) { alert('날짜와 일정 내용을 입력해주세요.'); return; }

        const idx = allEvents.findIndex(e => e.id === currentEventId);
        if (idx === -1) return;

        const updated = { ...allEvents[idx], company, date, title };

        try {
            if (sb) {
                const { error } = await sb.from('schedules').upsert(updated, { onConflict: 'id' });
                if (error) throw error;
            }
            allEvents[idx] = updated;
            allEvents.sort((a, b) => a.date.localeCompare(b.date));
            closeEventModal();
            update();
        } catch (err) {
            alert('저장 오류: ' + err.message);
        }
    });

    // Delete button
    document.getElementById('deleteEventBtn').addEventListener('click', async () => {
        if (!confirm('이 일정을 삭제하시겠습니까?')) return;
        try {
            if (sb) {
                const { error } = await sb.from('schedules').delete().eq('id', currentEventId);
                if (error) throw error;
            }
            allEvents = allEvents.filter(e => e.id !== currentEventId);
            closeEventModal();
            update();
        } catch (err) {
            alert('삭제 오류: ' + err.message);
        }
    });

    // ========== SETTINGS TABS ==========
    const tabUpload = document.getElementById('tabUpload');
    const tabDirect = document.getElementById('tabDirect');
    const panelUpload = document.getElementById('panelUpload');
    const panelDirect = document.getElementById('panelDirect');

    tabUpload.addEventListener('click', () => {
        tabUpload.classList.add('active'); tabDirect.classList.remove('active');
        panelUpload.style.display = ''; panelDirect.style.display = 'none';
    });
    tabDirect.addEventListener('click', () => {
        tabDirect.classList.add('active'); tabUpload.classList.remove('active');
        panelDirect.style.display = ''; panelUpload.style.display = 'none';
        // Default date to today
        const today = new Date();
        const dd = document.getElementById('directDate');
        if (!dd.value) dd.value = today.toISOString().slice(0,10);
    });

    // Direct save
    document.getElementById('directSaveBtn').addEventListener('click', async () => {
        const company = document.getElementById('directCompany').value;
        const date = document.getElementById('directDate').value;
        const title = document.getElementById('directTitle').value.trim();
        if (!date || !title) { alert('날짜와 일정 내용을 모두 입력해주세요.'); return; }

        const newEvt = {
            id: `${company}-direct-${Date.now()}`,
            company, date, title
        };
        try {
            if (sb) {
                const { error } = await sb.from('schedules').upsert(newEvt, { onConflict: 'id' });
                if (error) throw error;
            }
            allEvents.push(newEvt);
            allEvents.sort((a, b) => a.date.localeCompare(b.date));
            document.getElementById('directTitle').value = '';
            settingsModal.classList.remove('active');
            update();
            alert(`✅ [${company}] ${date} 일정이 추가되었습니다.`);
        } catch (err) {
            alert('저장 오류: ' + err.message);
        }
    });

    // Review modal
    closeReviewModal.addEventListener('click', () => { reviewModal.classList.remove('active'); pendingUploadEvents = []; });
    reviewModal.addEventListener('click', (e) => { if (e.target === reviewModal) { reviewModal.classList.remove('active'); pendingUploadEvents = []; } });

    // Settings modal close only (open은 upload 섹션에서 초기화와 함께 처리)
    closeSettingsModal.addEventListener('click', () => settingsModal.classList.remove('active'));
    settingsModal.addEventListener('click', (e) => { if (e.target === settingsModal) settingsModal.classList.remove('active'); });

    // Confirm review → save to Supabase
    confirmReviewBtn.addEventListener('click', async () => {
        const rows = reviewTableBody.querySelectorAll('tr');
        const isRequest = (uploadDestination === 'Request');

        if (isRequest) {
            // ── 요청자료 일정 저장 ──
            const finalItems = [];
            rows.forEach(row => {
                const dateInput = row.querySelector('.edit-date');
                const titleInput = row.querySelector('.edit-title');
                const catSelect  = row.querySelector('.edit-category');
                if (dateInput && titleInput && catSelect) {
                    finalItems.push({
                        id: crypto.randomUUID ? crypto.randomUUID() : `req-${Date.now()}-${Math.random().toString(36).substr(2,4)}`,
                        date: dateInput.value,
                        category: catSelect.value,
                        title: titleInput.value,
                        note: ''
                    });
                }
            });
            if (finalItems.length === 0) { alert('반영할 일정이 없습니다.'); return; }

            confirmReviewBtn.textContent = '저장 중...'; confirmReviewBtn.disabled = true;
            try {
                if (sb) {
                    const { error } = await sb.from('request_schedules').insert(finalItems);
                    if (error) throw error;
                }
                finalItems.forEach(item => allRequests.push(item));
                reviewModal.classList.remove('active');
                if (panelRequest && panelRequest.style.display === 'flex') renderRequestCalendar();
                alert(`✅ ${finalItems.length}건의 요청자료 일정이 저장되었습니다.`);
            } catch (err) {
                console.error(err); alert('저장 오류: ' + err.message);
            } finally {
                confirmReviewBtn.textContent = '최종 캘린더 반영하기'; confirmReviewBtn.disabled = false;
            }
        } else {
            // ── 회사 일정 저장 (Group / NBT / BIO) — 결정적 ID로 병합 ──
            // djb2 해시: 동일 (company, date, title)은 동일 ID 생성 → 재업로드 시 중복 방지
            const hashStr = (s) => {
                let h = 5381;
                for (let i = 0; i < s.length; i++) h = ((h << 5) + h) + s.charCodeAt(i);
                return (h >>> 0).toString(36);
            };
            const normalizeTitle = t => (t || '').replace(/\s+/g, ' ').trim();

            const finalEvents = [];
            const seenIds = new Set();
            rows.forEach(row => {
                const dateInput = row.querySelector('.edit-date');
                const titleInput = row.querySelector('.edit-title');
                const compInput  = row.querySelector('.edit-company');
                if (!dateInput || !titleInput) return;
                const company = compInput ? compInput.value : (uploadDestination || 'Group');
                const date    = dateInput.value;
                const title   = normalizeTitle(titleInput.value);
                if (!title) return;
                const id = `${company}-${date}-${hashStr(title)}`;
                if (seenIds.has(id)) return; // 리뷰 테이블 내 중복도 제거
                seenIds.add(id);
                finalEvents.push({ id, company, date, title });
            });
            if (finalEvents.length === 0) { alert('반영할 일정이 없습니다.'); return; }

            confirmReviewBtn.textContent = '저장 중...'; confirmReviewBtn.disabled = true;
            try {
                if (sb) {
                    const { error } = await sb.from('schedules').upsert(finalEvents, { onConflict: 'id' });
                    if (error) throw error;
                }
                // 로컬 상태 병합: 동일 ID는 교체, 신규는 추가
                const byId = new Map(allEvents.map(e => [e.id, e]));
                let addedCount = 0, updatedCount = 0;
                finalEvents.forEach(ne => {
                    if (byId.has(ne.id)) updatedCount++;
                    else addedCount++;
                    byId.set(ne.id, ne);
                });
                allEvents = [...byId.values()].sort((a, b) => a.date.localeCompare(b.date));

                reviewModal.classList.remove('active');
                update();
                alert(`✅ 신규 ${addedCount}건 / 기존 ${updatedCount}건 병합 완료 (총 ${finalEvents.length}건 반영)`);
            } catch (err) {
                console.error(err); alert('Supabase 저장 오류: ' + err.message);
            } finally {
                confirmReviewBtn.textContent = '최종 캘린더 반영하기'; confirmReviewBtn.disabled = false;
            }
        }
    });

    // Month navigation
    document.getElementById('prevMonth').addEventListener('click', () => {
        currentMonth--;
        if (currentMonth < 0) { currentMonth = 11; currentYear--; }
        // 연차 패널이 열려 있으면 leaveYear/leaveMonth도 함께 이동
        if (panelLeave && panelLeave.style.display === 'flex') {
            leaveMonth = currentMonth; leaveYear = currentYear;
        }
        update();
    });
    document.getElementById('nextMonth').addEventListener('click', () => {
        currentMonth++;
        if (currentMonth > 11) { currentMonth = 0; currentYear++; }
        if (panelLeave && panelLeave.style.display === 'flex') {
            leaveMonth = currentMonth; leaveYear = currentYear;
        }
        update();
    });

    // ========== INITIAL RENDER ==========
    update();

    // ========== FILE UPLOAD (Browser-only, no server!) ==========
    let uploadDestination = null; // 'Group' | 'NBT' | 'BIO' | 'Request'

    const uploadZone = document.getElementById('uploadZone');
    const fileInput  = document.getElementById('fileInput');
    const uploadFileSection = document.getElementById('uploadFileSection');

    // 대상 선택 버튼
    document.querySelectorAll('.upload-dest-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.upload-dest-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            uploadDestination = btn.dataset.dest;
            uploadFileSection.style.display = '';
            const dest = uploadDestination;
            const label = dest === 'Group' ? '그룹 일정 (Group)' :
                          dest === 'NBT'   ? '엔비티 일정 (NBT)' :
                          dest === 'BIO'   ? '바이오 일정 (BIO)' : '요청자료 일정';
            document.getElementById('uploadZoneText').innerHTML =
                `<b style="color:#2563eb;">[${label}]</b> 대상으로 업로드<br/><span>PDF 또는 엑셀 파일을 드래그하거나 클릭하세요</span>`;
        });
    });

    // 설정 모달 열릴 때마다 선택 초기화
    document.getElementById('openSettingsBtn').addEventListener('click', () => {
        uploadDestination = null;
        document.querySelectorAll('.upload-dest-btn').forEach(b => b.classList.remove('selected'));
        uploadFileSection.style.display = 'none';
        settingsModal.classList.add('active');
    });

    uploadZone.addEventListener('click', () => fileInput.click());
    uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('dragover'); });
    uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('dragover');
        if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) handleFile(e.target.files[0]);
        fileInput.value = '';
    });

    function handleFile(file) {
        if (!uploadDestination) {
            alert('먼저 업로드 대상을 선택해주세요.');
            return;
        }
        const name = file.name.toLowerCase();
        if (!name.endsWith('.pdf') && !name.endsWith('.xls') && !name.endsWith('.xlsx')) {
            alert('지원하지 않는 파일 형식입니다. (PDF 또는 엑셀 등록 가능)');
            return;
        }
        settingsModal.classList.remove('active');
        if (name.endsWith('.xls') || name.endsWith('.xlsx')) {
            parseExcelFile(file, uploadDestination);
        } else {
            parsePdfFile(file, uploadDestination);
        }
    }

    // ========== EXCEL PARSING (SheetJS, client-side) ==========
    // 두 가지 레이아웃 지원:
    //  A) Group/BIO: 숫자 날짜(1~31) + 같은 열 아래 이벤트(시간 내장)
    //  B) NBT: Date 객체 날짜 + 인접 열(col+1) 이벤트 + 같은 열 time 객체
    function parseExcelFile(file, company) {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                const newEvents = [];

                // 헬퍼: 셀에서 날짜(YYYY-MM-DD) 추출
                function extractDate(v) {
                    if (v instanceof Date) {
                        const y = v.getFullYear();
                        if (y < 1970) return null; // 시간 전용 셀
                        return `${y}-${String(v.getMonth()+1).padStart(2,'0')}-${String(v.getDate()).padStart(2,'0')}`;
                    }
                    if (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 31) {
                        return `${currentYear}-${String(currentMonth+1).padStart(2,'0')}-${String(v).padStart(2,'0')}`;
                    }
                    if (typeof v === 'string') {
                        const s = v.trim();
                        let m;
                        if (m = s.match(/^(\d{1,2})\s*일?$/)) {
                            const d = parseInt(m[1]);
                            if (d >= 1 && d <= 31) return `${currentYear}-${String(currentMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
                        }
                        if (m = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/)) {
                            return `${m[1]}-${String(parseInt(m[2])).padStart(2,'0')}-${String(parseInt(m[3])).padStart(2,'0')}`;
                        }
                    }
                    return null;
                }

                // 헬퍼: 셀에서 시간(HH:MM) 추출
                function extractTime(v) {
                    if (v instanceof Date && v.getFullYear() < 1970) {
                        return `${String(v.getHours()).padStart(2,'0')}:${String(v.getMinutes()).padStart(2,'0')}`;
                    }
                    if (typeof v === 'string') {
                        const m = v.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
                        if (m) return `${m[1].padStart(2,'0')}:${m[2]}`;
                    }
                    return null;
                }

                workbook.SheetNames.forEach(sheetName => {
                    const sheet = workbook.Sheets[sheetName];
                    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
                    if (!rows.length) return;

                    // 1단계: 모든 날짜 셀 위치 수집
                    const dateCells = [];
                    for (let r = 0; r < rows.length; r++) {
                        const row = rows[r] || [];
                        for (let c = 0; c < row.length; c++) {
                            const ds = extractDate(row[c]);
                            if (ds) dateCells.push({ row: r, col: c, dateStr: ds });
                        }
                    }

                    // 2단계: 각 날짜 셀에 대해 이벤트 영역 스캔
                    dateCells.forEach(dc => {
                        // 같은 열/인접 열에 있는 다음 날짜 행을 찾아 스캔 종료점 결정
                        let maxRow = Math.min(dc.row + 10, rows.length);
                        dateCells.forEach(other => {
                            if (other === dc) return;
                            if (Math.abs(other.col - dc.col) <= 1 && other.row > dc.row && other.row < maxRow) {
                                maxRow = other.row;
                            }
                        });

                        // 인접 열(col+1)에 다른 날짜가 있으면 수평 헤더 레이아웃(Group)
                        // → col+1 스캔 시 다음 날짜의 이벤트가 현재 날짜로 중복 수집되는 것을 방지
                        const hasAdjDate = dateCells.some(o =>
                            o !== dc && o.col === dc.col + 1 && Math.abs(o.row - dc.row) <= 1
                        );
                        const scanCols = hasAdjDate ? [dc.col] : [dc.col, dc.col + 1];

                        // 스캔: 행(dc.row+1 ~ maxRow-1) × 선택 열
                        let pendingTime = null;
                        for (let r = dc.row + 1; r < maxRow; r++) {
                            const row = rows[r] || [];
                            for (const c of scanCols) {
                                const v = row[c];
                                if (v == null || v === '') continue;

                                // 시간 셀?
                                const t = extractTime(v);
                                if (t) { pendingTime = t; continue; }

                                // 텍스트 이벤트?
                                const txt = String(v).trim();
                                if (!txt) continue;
                                if (/^[\d.]+$/.test(txt)) continue;
                                if (/^(일|월|화|수|목|금|토|SUN|MON|TUE|WED|THU|FRI|SAT)$/i.test(txt)) continue;
                                // 일정이 아닌 행정/참고 항목 제외
                                if (/생산일수|상여지급|급여지급|근무일수|휴무일수|공휴일수/.test(txt)) continue;

                                const title = pendingTime ? `${pendingTime} ${txt}` : txt;
                                pendingTime = null;
                                newEvents.push({
                                    company: company,
                                    date: dc.dateStr,
                                    title: title
                                });
                            }
                        }
                    });
                });

                if (newEvents.length === 0) {
                    alert('엑셀에서 일정을 추출하지 못했습니다. 표 구조를 확인해주세요.');
                    return;
                }
                showReviewModal(newEvents, company);
            } catch(err) {
                console.error(err);
                alert('엑셀 파일 읽기 오류: ' + err.message);
            }
        };
        reader.readAsArrayBuffer(file);
    }

    // ========== PDF PARSING (PDF.js, client-side) ==========
    async function parsePdfFile(file, company) {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            const newEvents = [];

            for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                const page = await pdf.getPage(pageNum);
                const textContent = await page.getTextContent();

                // Group text items by approximate Y position (rows)
                const items = textContent.items;
                const rowMap = {};
                items.forEach(item => {
                    const y = Math.round(item.transform[5]);
                    if (!rowMap[y]) rowMap[y] = [];
                    rowMap[y].push({ text: item.str, x: item.transform[4] });
                });

                // Sort rows top to bottom (descending Y in PDF coords)
                const sortedYs = Object.keys(rowMap).map(Number).sort((a, b) => b - a);

                let currentDate = null;
                sortedYs.forEach(y => {
                    const rowTexts = rowMap[y].sort((a, b) => a.x - b.x).map(i => i.text.trim()).filter(t => t.length > 0);
                    const fullRow = rowTexts.join(' ');

                    const ym = `${currentYear}-${String(currentMonth+1).padStart(2,'0')}`;
                    // Check if line starts with a day number (1-31)
                    const dayMatch = fullRow.match(/^(\d{1,2})\b/);
                    if (dayMatch) {
                        const d = parseInt(dayMatch[1]);
                        if (d >= 1 && d <= 31) {
                            currentDate = d;
                            // Rest might be event text
                            const rest = fullRow.replace(/^\d{1,2}\s*/, '').trim();
                            if (rest.length > 2 && !rest.match(/^(일|월|화|수|목|금|토)$/)) {
                                newEvents.push({
                                    id: `${company}-${d}-0-pdf`,
                                    company: company,
                                    date: `${ym}-${String(d).padStart(2,'0')}`,
                                    title: rest,
                                    category: '정기요청자료'
                                });
                            }
                        }
                    } else if (currentDate && fullRow.length > 2 && !fullRow.match(/^(일|월|화|수|목|금|토|SUN|MON|TUE|WED|THU|FRI|SAT)$/i)) {
                        // Continuation event under a date
                        newEvents.push({
                            id: `${company}-${currentDate}-${newEvents.length}-pdf`,
                            company: company,
                            date: `${ym}-${String(currentDate).padStart(2,'0')}`,
                            title: fullRow,
                            category: '정기요청자료'
                        });
                    }
                });
            }

            if (newEvents.length === 0) {
                alert('PDF에서 일정을 추출하지 못했습니다. PDF 표 구조가 복잡할 수 있습니다.');
                return;
            }
            showReviewModal(newEvents, company);
        } catch (err) {
            console.error(err);
            alert('PDF 파일 읽기 오류: ' + err.message);
        }
    }

    // ========== REVIEW MODAL ==========
    const REQUEST_CATEGORIES = ['통합회의및확대회의관련', '관계사경영회의관련', '정기요청자료'];

    function showReviewModal(events, dest) {
        // 파싱 단계 중복 제거: (date, 정규화 title) 기준
        const _seen = new Set();
        const _norm = t => (t || '').replace(/\s+/g, ' ').trim().toLowerCase();
        events = (events || []).filter(e => {
            const t = _norm(e.title);
            if (!t) return false;
            const k = `${e.date}||${t}`;
            if (_seen.has(k)) return false;
            _seen.add(k);
            return true;
        });

        pendingUploadEvents = events;
        reviewTableBody.innerHTML = '';

        const isRequest = dest === 'Request';
        // 카테고리 컬럼 표시/숨김
        document.getElementById('reviewColCat').style.display   = isRequest ? '' : 'none';
        document.getElementById('reviewColTitle').style.width   = isRequest ? '44%' : '56%';

        events.forEach((evt) => {
            const tr = document.createElement('tr');

            // 날짜
            const tdDate = document.createElement('td');
            const inputDate = document.createElement('input');
            inputDate.type = 'text'; inputDate.value = evt.date; inputDate.className = 'edit-date';
            tdDate.appendChild(inputDate);

            // 카테고리 (Request 전용)
            if (isRequest) {
                const tdCat = document.createElement('td');
                const selCat = document.createElement('select');
                selCat.className = 'edit-category';
                selCat.style.cssText = 'width:100%;padding:4px 6px;border:1px solid #e2e8f0;border-radius:6px;font-size:11.5px;';
                REQUEST_CATEGORIES.forEach(cat => {
                    const opt = document.createElement('option');
                    opt.value = cat; opt.textContent = cat;
                    if (evt.category === cat) opt.selected = true;
                    selCat.appendChild(opt);
                });
                tdCat.appendChild(selCat);
                tr.appendChild(tdDate);
                tr.appendChild(tdCat);
            } else {
                tr.appendChild(tdDate);
            }

            // 제목
            const tdTitle = document.createElement('td');
            const inputTitle = document.createElement('input');
            inputTitle.type = 'text'; inputTitle.value = evt.title; inputTitle.className = 'edit-title';
            // 숨은 필드: company (schedules용)
            const hiddenComp = document.createElement('input');
            hiddenComp.type = 'hidden'; hiddenComp.value = evt.company || dest; hiddenComp.className = 'edit-company';
            tdTitle.appendChild(inputTitle);
            tdTitle.appendChild(hiddenComp);
            tr.appendChild(tdTitle);

            // 삭제
            const tdDel = document.createElement('td');
            const btnDel = document.createElement('button');
            btnDel.innerHTML = '&times;'; btnDel.className = 'del-row-btn';
            btnDel.onclick = () => tr.remove();
            tdDel.style.textAlign = 'center';
            tdDel.appendChild(btnDel);
            tr.appendChild(tdDel);

            reviewTableBody.appendChild(tr);
        });

        const destLabel = dest === 'Group' ? '그룹' : dest === 'NBT' ? '엔비티' : dest === 'BIO' ? '바이오' : '요청자료';
        document.getElementById('reviewTitle').textContent = `추출된 일정 검토 [${destLabel}] — ${events.length}건`;
        reviewModal.classList.add('active');
    }

    // ========== 연차계획 관리 ==========
    /*
     * Supabase 테이블 생성 SQL (최초 1회 실행 필요):
     * CREATE TABLE public.leave_plans (
     *   id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
     *   date date NOT NULL,
     *   team text NOT NULL,
     *   rank text NOT NULL,
     *   employee_name text NOT NULL,
     *   leave_type text NOT NULL DEFAULT '연차',
     *   note text,
     *   created_at timestamptz DEFAULT now()
     * );
     * ALTER TABLE public.leave_plans ENABLE ROW LEVEL SECURITY;
     * CREATE POLICY "leave_all" ON public.leave_plans FOR ALL USING (true) WITH CHECK (true);
     */

    const RANK_ORDER = { 임원:1, 부장:2, 과장:3, 대리:4, 사원:5 };
    const LEAVE_TYPE_CLASS = {
        '연차':       'ltype-연차',
        '반차(오전)': 'ltype-반차오전',
        '반차(오후)': 'ltype-반차오후',
        '반반차(오전)':'ltype-반반차오전',
        '반반차(오후)':'ltype-반반차오후',
        '하기휴가':   'ltype-하기휴가',
        '교육':       'ltype-교육',
        '특별휴가':   'ltype-특별휴가',
        '병가':       'ltype-병가'
    };

    let allLeaves = [];
    let leaveModalDate = '';
    // 연차 패널 전용 월/연도 (공통 currentYear/currentMonth와 독립)
    let leaveYear  = new Date().getFullYear();
    let leaveMonth = new Date().getMonth();

    async function loadLeaves() {
        if (!sb) { allLeaves = []; return; }
        try {
            const { data, error } = await sb.from('leave_plans').select('*').order('date');
            if (error) throw error;
            allLeaves = data || [];
            console.log(`✅ leave_plans ${allLeaves.length}건 로드`);
        } catch(e) {
            console.warn('leave_plans 로드 실패:', e.message);
            allLeaves = [];
            // 연차 패널에 오류 안내 표시
            const grid = document.getElementById('leaveGrid');
            if (grid) grid.innerHTML =
                '<div style="grid-column:1/-1;text-align:center;padding:40px;color:#f43f5e;font-weight:600;">Supabase leave_plans 테이블 연결 오류<br><span style="font-size:12px;color:#94a3b8;">' + e.message + '</span></div>';
        }
    }

    await loadLeaves();
    // null/불완전 항목 방어 정리
    allLeaves = allLeaves.filter(l => l && l.date && l.employee_name);

    // ---- 연차 패널 월 이동 버튼 ----
    // 연차 패널 월 이동 공통 함수
    function moveLeaveMonth(year, month) {
        leaveYear = year; leaveMonth = month;
        currentYear = year; currentMonth = month;
        document.getElementById('monthTitle').textContent =
            `${year}. ${String(month + 1).padStart(2, '0')}`;
        // picker 값도 동기화
        const picker = document.getElementById('leaveMonthPicker');
        if (picker) picker.value = `${year}-${String(month + 1).padStart(2, '0')}`;
        renderLeaveCalendar();
    }

    document.getElementById('leavePrevMonth').addEventListener('click', () => {
        let m = leaveMonth - 1, y = leaveYear;
        if (m < 0) { m = 11; y--; }
        moveLeaveMonth(y, m);
    });
    document.getElementById('leaveNextMonth').addEventListener('click', () => {
        let m = leaveMonth + 1, y = leaveYear;
        if (m > 11) { m = 0; y++; }
        moveLeaveMonth(y, m);
    });

    // 월 라벨 클릭 → input[type=month] picker
    document.getElementById('leaveMonthPicker').addEventListener('change', (e) => {
        const [y, m] = e.target.value.split('-').map(Number);
        if (y && m) moveLeaveMonth(y, m - 1);
    });

    // ---- 연차 캘린더 렌더링 ----
    function renderLeaveCalendar() {
        const leaveGrid = document.getElementById('leaveGrid');
        if (!leaveGrid) return;
        leaveGrid.innerHTML = '';

        const daysInMonth = new Date(leaveYear, leaveMonth + 1, 0).getDate();
        const firstDayIndex = new Date(leaveYear, leaveMonth, 1).getDay();

        // 연차 패널 자체 월 라벨 갱신
        const leaveLabel = document.getElementById('leaveMonthLabel');
        if (leaveLabel) leaveLabel.textContent = `${leaveYear}. ${String(leaveMonth + 1).padStart(2, '0')}`;
        const picker = document.getElementById('leaveMonthPicker');
        if (picker) picker.value = `${leaveYear}-${String(leaveMonth + 1).padStart(2, '0')}`;

        for (let i = 0; i < firstDayIndex; i++) {
            const d = document.createElement('div');
            d.className = 'cal-day empty';
            leaveGrid.appendChild(d);
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${leaveYear}-${String(leaveMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
            const dayDiv = document.createElement('div');
            dayDiv.className = 'cal-day leave-cal-day';

            const isSunday  = (firstDayIndex + day - 1) % 7 === 0;
            const isSaturday = (firstDayIndex + day - 1) % 7 === 6;
            const holidayName = getHolidayName(leaveYear, leaveMonth + 1, day);

            if (isSaturday) dayDiv.classList.add('saturday-day');
            if (isSunday || holidayName) dayDiv.classList.add('holiday-day');

            const dateSpan = document.createElement('span');
            dateSpan.className = 'date-num';
            if (isSunday || holidayName) dateSpan.classList.add('sun');
            if (isSaturday) dateSpan.classList.add('sat');
            dateSpan.textContent = day;
            if (holidayName) {
                const hl = document.createElement('span');
                hl.textContent = holidayName;
                hl.style.cssText = 'font-size:10px;margin-left:4px;font-weight:600;opacity:0.85;';
                dateSpan.appendChild(hl);
            }
            dayDiv.appendChild(dateSpan);

            // 해당 날짜 연차: 팀→직급→이름 정렬
            const dayLeaves = allLeaves
                .filter(l => (l.date || '').slice(0, 10) === dateStr)
                .sort((a, b) => {
                    const tc = a.team.localeCompare(b.team, 'ko');
                    if (tc !== 0) return tc;
                    const rd = (RANK_ORDER[a.rank] || 9) - (RANK_ORDER[b.rank] || 9);
                    if (rd !== 0) return rd;
                    return a.employee_name.localeCompare(b.employee_name, 'ko');
                });

            dayLeaves.forEach(leave => {
                const chip = document.createElement('div');
                chip.className = `leave-chip ${LEAVE_TYPE_CLASS[leave.leave_type] || 'ltype-연차'}`;
                chip.innerHTML = `<span class="lc-name">${leave.employee_name}</span><span class="lc-type">${leave.leave_type}</span>`;
                chip.title = `[${leave.team}] ${leave.rank} ${leave.employee_name} · ${leave.leave_type}${leave.note ? ' / ' + leave.note : ''}`;
                chip.addEventListener('click', e => { e.stopPropagation(); openLeaveModal(dateStr); });
                dayDiv.appendChild(chip);
            });

            dayDiv.addEventListener('click', () => openLeaveModal(dateStr));
            leaveGrid.appendChild(dayDiv);
        }
    }

    // ---- 연차 모달 열기/닫기 ----
    function openLeaveModal(dateStr) {
        leaveModalDate = dateStr;
        setLeaveModalDateLabel(dateStr);
        const singleDateInput = document.getElementById('leaveSingleDate');
        if (singleDateInput) singleDateInput.value = dateStr;
        renderLeaveModalEntries(dateStr);
        document.getElementById('leaveModal').classList.add('active');
    }

    function setLeaveModalDateLabel(dateStr) {
        leaveModalDate = dateStr;
        const d = new Date(dateStr + 'T00:00:00');
        const days = ['일','월','화','수','목','금','토'];
        document.getElementById('leaveModalDateLabel').textContent =
            `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
    }

    document.getElementById('closeLeaveModal').addEventListener('click', () => {
        document.getElementById('leaveModal').classList.remove('active');
    });
    document.getElementById('leaveModal').addEventListener('click', e => {
        if (e.target === document.getElementById('leaveModal'))
            document.getElementById('leaveModal').classList.remove('active');
    });

    // HTML 특수문자 이스케이프 (innerHTML 삽입용)
    function escHtml(s) {
        return String(s || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    // ---- 모달 내 기존 항목 렌더링 ----
    function renderLeaveModalEntries(dateStr) {
        const container = document.getElementById('leaveModalEntries');
        const entries = allLeaves
            .filter(l => l && (l.date || '').slice(0, 10) === dateStr)  // null 항목 방어
            .sort((a, b) => {
                const tc = (a.team || '').localeCompare(b.team || '', 'ko');
                if (tc !== 0) return tc;
                const rd = (RANK_ORDER[a.rank] || 9) - (RANK_ORDER[b.rank] || 9);
                if (rd !== 0) return rd;
                return (a.employee_name || '').localeCompare(b.employee_name || '', 'ko');
            });

        if (entries.length === 0) {
            container.innerHTML = '<p style="font-size:13px;color:#94a3b8;text-align:center;padding:8px 0 4px;">등록된 연차가 없습니다</p>';
            return;
        }

        container.innerHTML = '';
        entries.forEach(leave => {
            const wrap = document.createElement('div');
            wrap.style.cssText = 'margin-bottom:6px;';
            wrap.dataset.id = leave.id;

            // ── 표시 행 ──
            const row = document.createElement('div');
            row.className = 'leave-entry-row';
            const tc = LEAVE_TYPE_CLASS[leave.leave_type] || 'ltype-연차';

            const info = document.createElement('div');
            info.className = 'leave-entry-info';
            info.innerHTML =
                `<span class="leave-entry-date-badge">${leave.date ? leave.date.slice(5).replace('-','/') : ''}</span>` +
                `<span class="leave-entry-badge ${tc}">${escHtml(leave.leave_type)}</span>` +
                `<span class="leave-entry-team">${escHtml(leave.team)}</span>` +
                `<span class="leave-entry-rank">${escHtml(leave.rank)}</span>` +
                `<span class="leave-entry-name">${escHtml(leave.employee_name)}</span>` +
                (leave.note ? `<span class="leave-entry-note">· ${escHtml(leave.note)}</span>` : '');

            // 수정 버튼
            const editBtn = document.createElement('button');
            editBtn.className = 'leave-entry-edit';
            editBtn.innerHTML = '✏️ 수정';
            editBtn.title = '이 항목 수정';

            // 삭제 버튼
            const delBtn = document.createElement('button');
            delBtn.className = 'leave-entry-del';
            delBtn.innerHTML = '🗑️ 삭제';
            delBtn.title = '이 항목 삭제';
            delBtn.addEventListener('click', async () => {
                if (!confirm(`[${leave.team}] ${leave.rank} ${leave.employee_name} (${leave.leave_type}) 을 삭제할까요?`)) return;
                delBtn.disabled = true; delBtn.textContent = '삭제 중...';
                await deleteLeave(leave.id, dateStr, wrap);
            });

            const btnGroup = document.createElement('div');
            btnGroup.style.cssText = 'display:flex;gap:5px;flex-shrink:0;';
            btnGroup.appendChild(editBtn);
            btnGroup.appendChild(delBtn);

            row.appendChild(info);
            row.appendChild(btnGroup);

            // ── 인라인 수정 폼 (기본 숨김) ──
            const editForm = document.createElement('div');
            editForm.className = 'leave-edit-form';
            editForm.style.display = 'none';

            const RANKS = ['임원','부장','과장','대리','사원'];
            const TYPES = ['연차','반차(오전)','반차(오후)','반반차(오전)','반반차(오후)','하기휴가','교육','특별휴가','병가'];

            editForm.innerHTML = `
<div class="leave-edit-grid">
  <div>
    <label class="leave-form-label">날짜</label>
    <input type="date" class="form-input ef-date" value="${leave.date ? leave.date.slice(0,10) : ''}">
  </div>
  <div>
    <label class="leave-form-label">팀</label>
    <input type="text" class="form-input ef-team" value="${escHtml(leave.team)}">
  </div>
  <div>
    <label class="leave-form-label">직급</label>
    <select class="form-input ef-rank">${RANKS.map(r=>`<option${r===leave.rank?' selected':''}>${escHtml(r)}</option>`).join('')}</select>
  </div>
  <div>
    <label class="leave-form-label">이름</label>
    <input type="text" class="form-input ef-name" value="${escHtml(leave.employee_name)}">
  </div>
  <div>
    <label class="leave-form-label">구분</label>
    <select class="form-input ef-type">${TYPES.map(t=>`<option${t===leave.leave_type?' selected':''}>${escHtml(t)}</option>`).join('')}</select>
  </div>
  <div>
    <label class="leave-form-label">비고</label>
    <input type="text" class="form-input ef-note" value="${escHtml(leave.note)}">
  </div>
</div>
<div style="margin-top:8px;display:flex;gap:6px;justify-content:flex-end;align-items:center;flex-wrap:wrap;">
  <label style="font-size:11.5px;color:#64748b;display:flex;align-items:center;gap:4px;cursor:pointer;">
    <input type="checkbox" class="ef-period-toggle"> 기간 수정
  </label>
  <div class="ef-period-section" style="display:none;gap:6px;align-items:center;">
    <input type="date" class="form-input ef-period-start" style="width:130px;">
    <span style="font-size:12px;color:#94a3b8;">~</span>
    <input type="date" class="form-input ef-period-end" style="width:130px;">
    <span class="ef-period-preview" style="font-size:11px;color:#64748b;"></span>
  </div>
  <button class="ef-cancel-btn">취소</button>
  <button class="ef-save-btn">저장</button>
</div>`;

            // 기간 수정 토글
            const periodToggle = editForm.querySelector('.ef-period-toggle');
            const periodSection = editForm.querySelector('.ef-period-section');
            const dateInput = editForm.querySelector('.ef-date');
            periodToggle.addEventListener('change', () => {
                const on = periodToggle.checked;
                periodSection.style.display = on ? 'flex' : 'none';
                dateInput.closest('div').style.display = on ? 'none' : '';
                if (on) {
                    editForm.querySelector('.ef-period-start').value = dateInput.value || leave.date.slice(0,10);
                    editForm.querySelector('.ef-period-end').value   = dateInput.value || leave.date.slice(0,10);
                }
            });
            const updateEfPreview = () => {
                const s = editForm.querySelector('.ef-period-start').value;
                const e = editForm.querySelector('.ef-period-end').value;
                const days = getDateRange(s, e);
                editForm.querySelector('.ef-period-preview').textContent =
                    days.length ? `평일 ${days.length}일` : '⚠️ 날짜 오류';
            };
            editForm.querySelector('.ef-period-start').addEventListener('change', updateEfPreview);
            editForm.querySelector('.ef-period-end').addEventListener('change', updateEfPreview);

            // 취소
            editForm.querySelector('.ef-cancel-btn').addEventListener('click', () => {
                editForm.style.display = 'none';
                row.style.display = '';
            });

            // 저장
            editForm.querySelector('.ef-save-btn').addEventListener('click', async () => {
                const saveBtn = editForm.querySelector('.ef-save-btn');
                const team2  = editForm.querySelector('.ef-team').value.trim();
                const rank2  = editForm.querySelector('.ef-rank').value;
                const name2  = editForm.querySelector('.ef-name').value.trim();
                const type2  = editForm.querySelector('.ef-type').value;
                const note2  = editForm.querySelector('.ef-note').value.trim();
                if (!team2 || !name2) { alert('팀과 이름은 필수입니다.'); return; }

                const isPeriod = periodToggle.checked;
                saveBtn.textContent = '저장 중...'; saveBtn.disabled = true;

                try {
                    if (isPeriod) {
                        // 기간 수정: 기존 항목 삭제 후 새 기간으로 일괄 upsert
                        const ps = editForm.querySelector('.ef-period-start').value;
                        const pe = editForm.querySelector('.ef-period-end').value;
                        const newDates = getDateRange(ps, pe);
                        if (!newDates.length) { alert('유효한 기간이 없습니다.'); return; }
                        if (!confirm(`기존 항목을 삭제하고 ${ps}~${pe} 평일 ${newDates.length}일로 재등록하시겠습니까?`)) return;

                        // 기존 항목 삭제
                        if (sb) {
                            const { error } = await sb.from('leave_plans').delete().eq('id', leave.id);
                            if (error) throw error;
                        }
                        allLeaves = allLeaves.filter(l => l.id !== leave.id);

                        // 새 기간 insert — UUID 클라이언트 생성
                        const payloads = newDates.map(date => ({
                            id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                            date, team: team2, rank: rank2, employee_name: name2,
                            leave_type: type2, note: note2 || null
                        }));
                        if (sb) {
                            const { error } = await sb.from('leave_plans').insert(payloads);
                            if (error) throw error;
                        }
                        payloads.forEach(p => allLeaves.push(p));
                        allLeaves.sort((a, b) => a.date.localeCompare(b.date));
                    } else {
                        // 단일 날짜 수정
                        const newDate = editForm.querySelector('.ef-date').value;
                        if (!newDate) { alert('날짜를 선택해주세요.'); return; }
                        const updated = { date: newDate, team: team2, rank: rank2,
                            employee_name: name2, leave_type: type2, note: note2 || null };

                        if (sb) {
                            // 기존 UUID id 유지한 채로 update
                            const { error } = await sb.from('leave_plans')
                                .update(updated).eq('id', leave.id);
                            if (error) throw error;
                        }
                        // 로컬 상태 갱신
                        const merged = { ...leave, ...updated };
                        allLeaves = allLeaves.map(l => l.id === leave.id ? merged : l)
                            .sort((a, b) => a.date.localeCompare(b.date));
                    }

                    renderLeaveCalendar();
                    renderLeaveModalEntries(leaveModalDate);
                } catch(err) {
                    console.error(err); alert('수정 오류: ' + err.message);
                    saveBtn.textContent = '저장'; saveBtn.disabled = false;
                }
            });

            // 수정 버튼 클릭 → 폼 토글
            editBtn.addEventListener('click', () => {
                const isOpen = editForm.style.display !== 'none';
                editForm.style.display = isOpen ? 'none' : '';
                row.style.display = isOpen ? '' : 'none';
            });

            wrap.appendChild(row);
            wrap.appendChild(editForm);
            container.appendChild(wrap);
        });
    }

    // ---- 연차 삭제 ----
    async function deleteLeave(id, dateStr, rowEl) {
        if (!id) { console.error('삭제 오류: id 없음'); return; }
        if (sb) {
            const { error } = await sb.from('leave_plans').delete().eq('id', id);
            if (error) {
                console.error('연차 삭제 오류:', error);
                alert('삭제 오류: ' + error.message);
                if (rowEl) { // 실패 시 버튼 원복
                    const btn = rowEl.querySelector('.leave-entry-del');
                    if (btn) { btn.disabled = false; btn.innerHTML = '🗑️ 삭제'; }
                }
                return;
            }
        }
        // 로컬 데이터 및 UI 갱신
        allLeaves = allLeaves.filter(l => l.id !== id);
        if (rowEl) rowEl.remove(); // 행 즉시 제거 (깜빡임 없이)
        // 빈 상태 처리
        const container = document.getElementById('leaveModalEntries');
        if (container && !container.querySelector('.leave-entry-row')) {
            container.innerHTML = '<p style="font-size:13px;color:#94a3b8;text-align:center;padding:8px 0 4px;">등록된 연차가 없습니다</p>';
        }
        renderLeaveCalendar();
    }

    // ---- 연차 추가 (공통 실행 함수) ----
    // djb2 해시 (leave 결정적 ID용)
    function leaveHashStr(s) {
        let h = 5381;
        for (let i = 0; i < s.length; i++) h = ((h << 5) + h) + s.charCodeAt(i);
        return (h >>> 0).toString(36);
    }

    async function submitLeaveAdd() {
        const team  = document.getElementById('leaveTeamInput').value.trim();
        const rank  = document.getElementById('leaveRankInput').value;
        const name  = document.getElementById('leaveNameInput').value.trim();
        const type  = document.getElementById('leaveTypeInput').value;
        const note  = document.getElementById('leaveNoteInput').value.trim();
        const isPeriod = document.getElementById('leavePeriodToggle').checked;

        if (!team) { alert('팀을 입력해주세요.'); document.getElementById('leaveTeamInput').focus(); return; }
        if (!name) { alert('이름을 입력해주세요.'); document.getElementById('leaveNameInput').focus(); return; }

        // 기간 모드
        if (isPeriod) {
            const s = document.getElementById('leaveStartDate').value;
            const e = document.getElementById('leaveEndDate').value;
            if (!s || !e) { alert('시작일과 종료일을 모두 입력해주세요.'); return; }
            const dates = getDateRange(s, e);
            if (dates.length === 0) { alert('유효한 기간이 없습니다. (주말만 선택되었거나 종료일이 시작일보다 빠릅니다.)'); return; }
            if (!confirm(`${s} ~ ${e} 기간 중 평일 ${dates.length}일 모두 등록하시겠습니까?`)) return;

            const btn = document.getElementById('leaveAddBtn');
            btn.textContent = '저장 중...'; btn.disabled = true;
            try {
                // 날짜별로 UUID 생성 → DB uuid 컬럼 호환, 로컬 상태도 즉시 반영
                const payloads = dates.map(date => ({
                    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                    date, team, rank, employee_name: name, leave_type: type, note: note || null
                }));
                if (sb) {
                    const { error } = await sb.from('leave_plans').insert(payloads);
                    if (error) throw error;
                }
                payloads.forEach(p => allLeaves.push(p));
                allLeaves.sort((a, b) => a.date.localeCompare(b.date));

                renderLeaveCalendar();
                // 단일 날짜 필드를 시작일로 업데이트하고 모달 라벨도 변경
                const targetDate = s;
                setLeaveModalDateLabel(targetDate);
                const singleDateInput = document.getElementById('leaveSingleDate');
                if (singleDateInput) singleDateInput.value = targetDate;
                renderLeaveModalEntries(targetDate);

                // 폼 초기화 (기간 필드는 유지)
                document.getElementById('leaveTeamInput').value = '';
                document.getElementById('leaveNameInput').value = '';
                document.getElementById('leaveNoteInput').value = '';
                document.getElementById('leavePeriodToggle').checked = false;
                document.getElementById('leavePeriodSection').style.display = 'none';
                document.getElementById('leaveSingleDateRow').style.display = '';
                alert(`✅ ${dates.length}일 등록 완료 (${s} ~ ${e})\n이제 날짜를 선택해 개별 항목을 추가할 수 있습니다.`);
            } catch(err) {
                console.error(err); alert('저장 오류: ' + err.message);
            } finally {
                btn.textContent = '➕ 추가'; btn.disabled = false;
            }
            return;
        }

        // 단일 날짜 모드 — leaveSingleDate 필드 우선 사용
        const singleDateVal = (document.getElementById('leaveSingleDate') || {}).value || leaveModalDate;
        if (!singleDateVal) { alert('입력 날짜를 선택해주세요.'); return; }
        // crypto.randomUUID()로 클라이언트에서 UUID 생성 → DB uuid 컬럼과 호환
        const newId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const payload = {
            id: newId,
            date: singleDateVal,
            team, rank,
            employee_name: name,
            leave_type: type,
            note: note || null
        };

        const btn = document.getElementById('leaveAddBtn');
        btn.textContent = '저장 중...';
        btn.disabled = true;

        try {
            if (sb) {
                const { error } = await sb.from('leave_plans').insert(payload);
                if (error) throw error;
            }
            // DB 반환값에 의존하지 않고 로컬 payload를 직접 사용
            allLeaves.push(payload);
            allLeaves.sort((a, b) => a.date.localeCompare(b.date));

            // 입력 초기화 후 팀 입력란으로 포커스 복귀
            document.getElementById('leaveTeamInput').value = '';
            document.getElementById('leaveNameInput').value = '';
            document.getElementById('leaveNoteInput').value = '';
            document.getElementById('leaveTeamInput').focus();

            // 라벨·엔트리를 현재 선택된 날짜 기준으로 갱신
            setLeaveModalDateLabel(singleDateVal);
            renderLeaveModalEntries(singleDateVal);
            renderLeaveCalendar();
        } catch(err) {
            console.error('연차 저장 오류:', err);
            alert('저장 오류: ' + (err.message || '알 수 없는 오류가 발생했습니다.'));
        } finally {
            btn.textContent = '➕ 추가';
            btn.disabled = false;
        }
    }

    document.getElementById('leaveAddBtn').addEventListener('click', submitLeaveAdd);

    // ── 기간 입력 토글 ──
    const leavePeriodToggle  = document.getElementById('leavePeriodToggle');
    const leavePeriodSection = document.getElementById('leavePeriodSection');
    const leaveStartDate     = document.getElementById('leaveStartDate');
    const leaveEndDate       = document.getElementById('leaveEndDate');
    const leavePeriodPreview = document.getElementById('leavePeriodPreview');

    leavePeriodToggle.addEventListener('change', () => {
        const on = leavePeriodToggle.checked;
        leavePeriodSection.style.display = on ? '' : 'none';
        const singleRow = document.getElementById('leaveSingleDateRow');
        if (singleRow) singleRow.style.display = on ? 'none' : '';
        if (on) {
            const curDate = (document.getElementById('leaveSingleDate') || {}).value || leaveModalDate;
            if (curDate) {
                leaveStartDate.value = curDate;
                leaveEndDate.value   = curDate;
            }
            updatePeriodPreview();
        }
    });

    function updatePeriodPreview() {
        const s = leaveStartDate.value, e = leaveEndDate.value;
        if (!s || !e) { leavePeriodPreview.textContent = ''; return; }
        const days = getDateRange(s, e);
        leavePeriodPreview.textContent =
            days.length > 0
            ? `📅 ${s} ~ ${e} (주말 제외 ${days.length}일 등록 예정)`
            : '⚠️ 종료일이 시작일보다 빠릅니다.';
    }

    leaveStartDate.addEventListener('change', updatePeriodPreview);
    leaveEndDate.addEventListener('change', updatePeriodPreview);

    // 단일 날짜 변경 시 모달 라벨·엔트리 즉시 갱신
    const leaveSingleDateInput = document.getElementById('leaveSingleDate');
    if (leaveSingleDateInput) {
        leaveSingleDateInput.addEventListener('change', () => {
            const v = leaveSingleDateInput.value;
            if (v) { setLeaveModalDateLabel(v); renderLeaveModalEntries(v); }
        });
    }

    // 시작~종료일 사이 평일 날짜 배열 반환
    function getDateRange(startStr, endStr) {
        const result = [];
        const cur = new Date(startStr + 'T00:00:00');
        const end = new Date(endStr   + 'T00:00:00');
        if (cur > end) return result;
        while (cur <= end) {
            const dow = cur.getDay();
            if (dow !== 0 && dow !== 6) { // 주말 제외
                result.push(cur.toISOString().slice(0, 10));
            }
            cur.setDate(cur.getDate() + 1);
        }
        return result;
    }

    // Enter 키로 추가 지원 (이름·비고 입력란)
    ['leaveNameInput', 'leaveNoteInput'].forEach(id => {
        document.getElementById(id).addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); submitLeaveAdd(); }
        });
    });

    // ========== 요청자료일정 관리 ==========
    const REQUEST_CAT_CLASS = {
        '통합회의및확대회의관련': 'rcat-meeting',
        '관계사경영회의관련':     'rcat-related',
        '정기요청자료':           'rcat-regular'
    };

    let allRequests = [];
    let requestModalDate = '';

    // request_schedules 로드
    async function loadRequests() {
        if (!sb) { allRequests = []; return; }
        try {
            const { data, error } = await sb.from('request_schedules').select('*').order('date');
            if (error) throw error;
            allRequests = data || [];
            console.log(`✅ request_schedules ${allRequests.length}건 로드`);
        } catch(e) {
            console.warn('request_schedules 로드 실패:', e.message);
            allRequests = [];
        }
    }
    await loadRequests();

    // request_months (PDF 이미지) 로드
    let requestImageStore = {}; // { 'YYYY-MM': { imageUrl, storagePath, fileName } }
    async function loadRequestImageStore() {
        if (!sb) return;
        try {
            const { data, error } = await sb.from('request_months').select('*');
            if (error) throw error;
            requestImageStore = {};
            (data || []).forEach(row => {
                const key = typeof row.month_key === 'string' ? row.month_key.slice(0, 7) : '';
                if (!key) return;
                const { data: urlData } = sb.storage.from('request-images').getPublicUrl(row.storage_path);
                requestImageStore[key] = {
                    imageUrl: urlData.publicUrl,
                    storagePath: row.storage_path,
                    fileName: row.file_name
                };
            });
        } catch(e) {
            console.warn('request_months 로드 실패:', e.message);
        }
    }
    await loadRequestImageStore();

    // ---- 요청자료 캘린더 렌더링 ----
    function renderRequestCalendar() {
        const requestGrid = document.getElementById('requestGrid');
        if (!requestGrid) return;
        requestGrid.innerHTML = '';

        const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
        const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();
        document.getElementById('monthTitle').textContent =
            `${currentYear}. ${String(currentMonth + 1).padStart(2, '0')}`;

        // 월 레이블
        const monthKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;

        // PDF 이미지 업로드 토글 버튼 상태
        const toggleBtn = document.getElementById('requestViewToggleBtn');
        if (toggleBtn) {
            if (requestImageStore[monthKey]) {
                toggleBtn.style.display = '';
            } else {
                toggleBtn.style.display = 'none';
                document.getElementById('requestImageView').style.display = 'none';
                document.getElementById('requestCalendarWrap').style.display = '';
                toggleBtn.textContent = '🖼️ PDF 보기';
            }
        }

        for (let i = 0; i < firstDayIndex; i++) {
            const d = document.createElement('div');
            d.className = 'cal-day empty';
            requestGrid.appendChild(d);
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayDiv = document.createElement('div');
            dayDiv.className = 'cal-day leave-cal-day';

            const isSunday   = (firstDayIndex + day - 1) % 7 === 0;
            const isSaturday = (firstDayIndex + day - 1) % 7 === 6;
            const holidayName = getHolidayName(currentYear, currentMonth + 1, day);

            if (isSaturday) dayDiv.classList.add('saturday-day');
            if (isSunday || holidayName) dayDiv.classList.add('holiday-day');

            const dateSpan = document.createElement('span');
            dateSpan.className = 'date-num';
            if (isSunday || holidayName) dateSpan.classList.add('sun');
            if (isSaturday) dateSpan.classList.add('sat');
            dateSpan.textContent = day;
            if (holidayName) {
                const hl = document.createElement('span');
                hl.textContent = holidayName;
                hl.style.cssText = 'font-size:10px;margin-left:4px;font-weight:600;opacity:0.85;';
                dateSpan.appendChild(hl);
            }
            dayDiv.appendChild(dateSpan);

            const dayRequests = allRequests
                .filter(r => (r.date || '').slice(0, 10) === dateStr)
                .sort((a, b) => {
                    // 카테고리 순서: 통합>관계사>정기
                    const catOrder = { '통합회의및확대회의관련': 1, '관계사경영회의관련': 2, '정기요청자료': 3 };
                    const cd = (catOrder[a.category] || 9) - (catOrder[b.category] || 9);
                    if (cd !== 0) return cd;
                    return a.title.localeCompare(b.title, 'ko');
                });

            dayRequests.forEach(req => {
                const chip = document.createElement('div');
                chip.className = `request-chip ${REQUEST_CAT_CLASS[req.category] || 'rcat-regular'}`;
                chip.textContent = req.title;
                chip.title = `[${req.category}] ${req.title}${req.note ? ' / ' + req.note : ''}`;
                chip.addEventListener('click', e => { e.stopPropagation(); openRequestModal(dateStr); });
                dayDiv.appendChild(chip);
            });

            dayDiv.addEventListener('click', () => openRequestModal(dateStr));
            requestGrid.appendChild(dayDiv);
        }
    }

    // ---- 요청자료 모달 열기/닫기 ----
    function openRequestModal(dateStr) {
        requestModalDate = dateStr;
        const d = new Date(dateStr + 'T00:00:00');
        const days = ['일','월','화','수','목','금','토'];
        document.getElementById('requestModalDateLabel').textContent =
            `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
        renderRequestModalEntries(dateStr);
        document.getElementById('requestModal').classList.add('active');
    }

    document.getElementById('closeRequestModal').addEventListener('click', () => {
        document.getElementById('requestModal').classList.remove('active');
    });
    document.getElementById('requestModal').addEventListener('click', e => {
        if (e.target === document.getElementById('requestModal'))
            document.getElementById('requestModal').classList.remove('active');
    });

    // ---- 모달 내 기존 항목 렌더링 ----
    function renderRequestModalEntries(dateStr) {
        const container = document.getElementById('requestModalEntries');
        const entries = allRequests
            .filter(r => (r.date || '').slice(0, 10) === dateStr)
            .sort((a, b) => {
                const catOrder = { '통합회의및확대회의관련': 1, '관계사경영회의관련': 2, '정기요청자료': 3 };
                return (catOrder[a.category] || 9) - (catOrder[b.category] || 9);
            });

        if (entries.length === 0) {
            container.innerHTML = '<p style="font-size:13px;color:#94a3b8;text-align:center;padding:8px 0 4px;">등록된 요청자료 일정이 없습니다</p>';
            return;
        }

        container.innerHTML = '';
        entries.forEach(req => {
            const row = document.createElement('div');
            row.className = 'leave-entry-row';
            row.dataset.id = req.id;
            const catCls = REQUEST_CAT_CLASS[req.category] || 'rcat-regular';

            const info = document.createElement('div');
            info.className = 'leave-entry-info';
            info.innerHTML =
                `<span class="leave-entry-badge ${catCls}" style="font-size:10px;">${req.category}</span>` +
                `<span class="leave-entry-name" style="font-weight:700;">${req.title}</span>` +
                (req.note ? `<span class="leave-entry-note">· ${req.note}</span>` : '');

            const delBtn = document.createElement('button');
            delBtn.className = 'leave-entry-del';
            delBtn.innerHTML = '🗑️ 삭제';
            delBtn.title = '이 항목 삭제';
            delBtn.addEventListener('click', async () => {
                if (!confirm(`[${req.category}] ${req.title} 을 삭제할까요?`)) return;
                delBtn.disabled = true;
                delBtn.textContent = '삭제 중...';
                await deleteRequest(req.id, dateStr, row);
            });

            row.appendChild(info);
            row.appendChild(delBtn);
            container.appendChild(row);
        });
    }

    // ---- 요청자료 삭제 ----
    async function deleteRequest(id, dateStr, rowEl) {
        if (!id) return;
        if (sb) {
            const { error } = await sb.from('request_schedules').delete().eq('id', id);
            if (error) {
                alert('삭제 오류: ' + error.message);
                if (rowEl) {
                    const btn = rowEl.querySelector('.leave-entry-del');
                    if (btn) { btn.disabled = false; btn.innerHTML = '🗑️ 삭제'; }
                }
                return;
            }
        }
        allRequests = allRequests.filter(r => r.id !== id);
        if (rowEl) rowEl.remove();
        const container = document.getElementById('requestModalEntries');
        if (container && !container.querySelector('.leave-entry-row')) {
            container.innerHTML = '<p style="font-size:13px;color:#94a3b8;text-align:center;padding:8px 0 4px;">등록된 요청자료 일정이 없습니다</p>';
        }
        renderRequestCalendar();
    }

    // ---- 요청자료 추가 ----
    async function submitRequestAdd() {
        const category = document.getElementById('requestCategoryInput').value;
        const title    = document.getElementById('requestTitleInput').value.trim();
        const note     = document.getElementById('requestNoteInput').value.trim();

        if (!title) { alert('내용을 입력해주세요.'); document.getElementById('requestTitleInput').focus(); return; }
        if (!requestModalDate) { alert('캘린더에서 날짜를 클릭해 선택해주세요.'); return; }

        const payload = { date: requestModalDate, title, category, note: note || null };

        const btn = document.getElementById('requestAddBtn');
        btn.textContent = '저장 중...';
        btn.disabled = true;

        try {
            if (sb) {
                const { data, error } = await sb
                    .from('request_schedules')
                    .insert(payload)
                    .select('*')
                    .single();
                if (error) throw error;
                allRequests.push(data);
            } else {
                allRequests.push({ ...payload, id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(), created_at: new Date().toISOString() });
            }
            document.getElementById('requestTitleInput').value = '';
            document.getElementById('requestNoteInput').value = '';
            document.getElementById('requestTitleInput').focus();
            renderRequestModalEntries(requestModalDate);
            renderRequestCalendar();
        } catch(err) {
            console.error('요청자료 저장 오류:', err);
            alert('저장 오류: ' + (err.message || '알 수 없는 오류가 발생했습니다.'));
        } finally {
            btn.textContent = '➕ 추가';
            btn.disabled = false;
        }
    }

    document.getElementById('requestAddBtn').addEventListener('click', submitRequestAdd);
    document.getElementById('requestTitleInput').addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); submitRequestAdd(); }
    });
    document.getElementById('requestNoteInput').addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); submitRequestAdd(); }
    });

    // ---- 요청자료 PDF 업로드 ----
    const requestPdfInput = document.getElementById('requestPdfInput');
    document.getElementById('requestUploadBtn').addEventListener('click', () => requestPdfInput.click());

    requestPdfInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        requestPdfInput.value = '';

        const btn = document.getElementById('requestUploadBtn');
        const origLabel = btn.textContent;
        btn.textContent = '⏳ 처리 중...';
        btn.disabled = true;

        try {
            const ab = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
            const page = await pdf.getPage(1);
            const vp = page.getViewport({ scale: 2.0 });
            const canvas = document.createElement('canvas');
            canvas.width = vp.width;
            canvas.height = vp.height;
            await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;

            const monthKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
            const storagePath = `${monthKey}.jpg`;

            if (sb) {
                const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.92));
                const { error: upErr } = await sb.storage
                    .from('request-images')
                    .upload(storagePath, blob, { upsert: true, contentType: 'image/jpeg' });
                if (upErr) throw upErr;

                const { data: urlData } = sb.storage.from('request-images').getPublicUrl(storagePath);

                const { error: dbErr } = await sb.from('request_months').upsert({
                    month_key: monthKey + '-01',
                    file_name: file.name,
                    storage_path: storagePath,
                    uploaded_at: new Date().toISOString()
                });
                if (dbErr) throw dbErr;

                requestImageStore[monthKey] = {
                    imageUrl: urlData.publicUrl,
                    storagePath,
                    fileName: file.name
                };
            } else {
                const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
                requestImageStore[monthKey] = { imageUrl: dataUrl, storagePath, fileName: file.name };
            }

            // PDF 이미지 표시 및 토글
            document.getElementById('requestUploadedImg').src = requestImageStore[monthKey].imageUrl;
            document.getElementById('requestImageView').style.display = 'block';
            document.getElementById('requestCalendarWrap').style.display = 'none';
            const toggleBtn = document.getElementById('requestViewToggleBtn');
            toggleBtn.style.display = '';
            toggleBtn.textContent = '📅 캘린더 보기';
            renderRequestCalendar();
        } catch(err) {
            alert('PDF 처리 중 오류가 발생했습니다: ' + err.message);
        } finally {
            btn.textContent = origLabel;
            btn.disabled = false;
        }
    });

    // PDF/캘린더 토글
    document.getElementById('requestViewToggleBtn').addEventListener('click', () => {
        const imageView = document.getElementById('requestImageView');
        const calWrap   = document.getElementById('requestCalendarWrap');
        const toggleBtn = document.getElementById('requestViewToggleBtn');
        if (imageView.style.display === 'none') {
            imageView.style.display = 'block';
            calWrap.style.display = 'none';
            toggleBtn.textContent = '📅 캘린더 보기';
        } else {
            imageView.style.display = 'none';
            calWrap.style.display = '';
            toggleBtn.textContent = '🖼️ PDF 보기';
        }
    });

    // PDF 인쇄
    document.getElementById('requestPrintBtn').addEventListener('click', () => {
        const months = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
        const monthEl = document.getElementById('requestPrintMonth');
        if (monthEl) monthEl.textContent = `${currentYear}년 ${months[currentMonth]}`;
        window.print();
    });

    // PDF 이미지 삭제
    document.getElementById('requestDeleteImgBtn').addEventListener('click', async () => {
        const monthKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
        if (!requestImageStore[monthKey]) return;
        if (!confirm('이 달의 업로드된 PDF 이미지를 삭제할까요?')) return;
        const storagePath = requestImageStore[monthKey].storagePath;
        if (sb) {
            try {
                await sb.storage.from('request-images').remove([storagePath]);
                await sb.from('request_months').delete().eq('storage_path', storagePath);
            } catch(e) { console.warn('삭제 오류:', e.message); }
        }
        delete requestImageStore[monthKey];
        document.getElementById('requestImageView').style.display = 'none';
        document.getElementById('requestCalendarWrap').style.display = '';
        document.getElementById('requestViewToggleBtn').style.display = 'none';
        renderRequestCalendar();
    });
});
