document.addEventListener('DOMContentLoaded', async () => {
    const calendarGrid = document.getElementById('calendarGrid');
    const upcomingList = document.getElementById('upcomingList');
    const searchInput = document.getElementById('searchInput');
    const filterBtns = document.querySelectorAll('.filter-btn');
    
    // Modal elements
    const eventModal = document.getElementById('eventModal');
    const closeModal = document.getElementById('closeModal');
    const modalCompany = document.getElementById('modalCompany');
    const modalTitle = document.getElementById('modalTitle');
    const modalDate = document.getElementById('modalDate');

    let allEvents = window.fallbackEvents || [];
    let currentFilter = 'all';
    let currentSearch = '';

    // Dynamic Calendar State
    let today = new Date();
    // Default to April 2026 since the provided Excel data is for April 2026.
    // If the user wants this to be strictly 'today', we can use today.getFullYear() and today.getMonth().
    // The instructions say "처음화면은 그달 조회화면으로 뜨게 수정" (show the current month of the real world).
    let currentYear = today.getFullYear();
    let currentMonth = today.getMonth();

    try {
        const response = await fetch('schedules.json?t=' + new Date().getTime());
        if (response.ok) {
            allEvents = await response.json();
            allEvents.sort((a, b) => a.date.localeCompare(b.date));
        } else {
            console.warn('Server fetch did not return OK. Using static data.js fallback.');
        }
    } catch (e) {
        console.warn('Running locally via file:// without server. Using fully loaded static data.js fallback.');
    }

    function renderCalendar() {
        calendarGrid.innerHTML = '';
        
        const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
        const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();

        document.getElementById('monthTitle').textContent = `${currentYear}. ${String(currentMonth + 1).padStart(2, '0')}`;

        // Empty slots for days before 1st
        for (let i = 0; i < firstDayIndex; i++) {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'cal-day empty';
            calendarGrid.appendChild(emptyDiv);
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const dayDiv = document.createElement('div');
            dayDiv.className = 'cal-day';
            
            const dateSpan = document.createElement('span');
            dateSpan.className = 'date-num';
            if ((firstDayIndex + day - 1) % 7 === 0) {
                dateSpan.classList.add('sun');
            }
            dateSpan.textContent = day;
            dayDiv.appendChild(dateSpan);

            const dayString = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            
            // Render events for this day
            const dayEvents = allEvents.filter(e => e.date === dayString);
            
            dayEvents.forEach(evt => {
                // Apply filters
                if (currentFilter !== 'all' && evt.company !== currentFilter) return;
                if (currentSearch && !evt.title.toLowerCase().includes(currentSearch)) return;

                const eventDiv = document.createElement('div');
                eventDiv.className = `event ${evt.company}`;
                eventDiv.textContent = `[${evt.company}] ${evt.title}`;
                eventDiv.title = `[${evt.company}] ${evt.title}`;
                
                // Click handler for modal
                eventDiv.addEventListener('click', () => {
                    modalCompany.className = `company-badge ${evt.company}`;
                    modalCompany.textContent = evt.company;
                    modalTitle.textContent = evt.title;
                    modalDate.textContent = evt.date;
                    eventModal.classList.add('active');
                });
                
                dayDiv.appendChild(eventDiv);
            });

            calendarGrid.appendChild(dayDiv);
        }
    }

    function renderUpcoming() {
        upcomingList.innerHTML = '';
        // Only show up to 10 events from a specific date logic or random top ones
        // For prototype, we show first 7 events that match filters
        const filtered = allEvents.filter(evt => {
            if (currentFilter !== 'all' && evt.company !== currentFilter) return false;
            if (currentSearch && !evt.title.toLowerCase().includes(currentSearch)) return false;
            return true;
        }).slice(0, 7);

        if (filtered.length === 0) {
            upcomingList.innerHTML = '<li style="color:#9ca3af;font-size:13px;">예정된 일정이 없습니다.</li>';
            return;
        }

        filtered.forEach(evt => {
            const li = document.createElement('li');
            li.className = `upcoming-item ${evt.company}`;
            li.innerHTML = `
                <span class="upcoming-date">${evt.date} &middot; ${evt.company}</span>
                <span class="upcoming-title">${evt.title}</span>
            `;
            upcomingList.appendChild(li);
        });
    }

    function update() {
        renderCalendar();
        renderUpcoming();
    }

    // Event Listeners
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
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

    closeModal.addEventListener('click', () => {
        eventModal.classList.remove('active');
    });

    eventModal.addEventListener('click', (e) => {
        if (e.target === eventModal) {
            eventModal.classList.remove('active');
        }
    });

    document.getElementById('prevMonth').addEventListener('click', () => {
        currentMonth--;
        if (currentMonth < 0) {
            currentMonth = 11;
            currentYear--;
        }
        update();
    });

    document.getElementById('nextMonth').addEventListener('click', () => {
        currentMonth++;
        if (currentMonth > 11) {
            currentMonth = 0;
            currentYear++;
        }
        update();
    });

    // Initial render
    update();

    // File Upload / Drop Logic
    const uploadZone = document.getElementById('uploadZone');
    const fileInput = document.getElementById('fileInput');

    uploadZone.addEventListener('click', () => fileInput.click());

    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('dragover');
    });

    uploadZone.addEventListener('dragleave', () => {
        uploadZone.classList.remove('dragover');
    });

    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('dragover');
        if (e.dataTransfer.files.length) {
            handleFile(e.dataTransfer.files[0]);
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            handleFile(e.target.files[0]);
        }
    });

    function handleFile(file) {
        if (!file.name.endsWith('.pdf') && !file.name.endsWith('.xls') && !file.name.endsWith('.xlsx')) {
            alert('지원하지 않는 파일 형식입니다. (PDF 또는 엑셀 등록 가능)');
            return;
        }

        const formData = new FormData();
        formData.append('file', file);

        fetch('/upload', {
            method: 'POST',
            body: formData
        })
        .then(res => res.json())
        .then(data => {
            if (data.status === 'success') {
                alert(data.message);
                // Reload schedules from server completely
                fetch('schedules.json?t=' + new Date().getTime())
                .then(r => r.json())
                .then(events => {
                    allEvents = events;
                    allEvents.sort((a, b) => a.date.localeCompare(b.date));
                    update();
                });
            } else {
                alert('업로드 오류: ' + data.message);
            }
        })
        .catch(err => {
            console.error(err);
            alert('서버와 통신하는 중 문제가 발생했습니다. 파이썬 서버가 켜져 있는지 확인해주세요!');
        });
    }
});
