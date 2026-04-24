-- ============================================================
-- BTI Schedule 마이그레이션 SQL
-- 대상 스키마: app_bti_schedule_prd
-- ============================================================

SET search_path TO app_bti_schedule_prd;

-- 1. 테이블 생성
CREATE TABLE IF NOT EXISTS schedules (
    id         TEXT PRIMARY KEY,
    company    TEXT NOT NULL,
    date       TEXT NOT NULL,
    title      TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS leave_plans (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date          TEXT NOT NULL,
    team          TEXT,
    rank          TEXT,
    employee_name TEXT,
    leave_type    TEXT,
    note          TEXT,
    created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS request_schedules (
    id         TEXT PRIMARY KEY,
    date       TEXT NOT NULL,
    title      TEXT NOT NULL,
    category   TEXT,
    note       TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS menu_weeks (
    week_key    TEXT PRIMARY KEY,
    file_name   TEXT,
    storage_path TEXT,
    uploaded_at TIMESTAMPTZ DEFAULT now()
);

-- 2. schedules 데이터 삽입
INSERT INTO schedules (id, company, date, title) VALUES ('NBT-1-2', 'NBT', '2026-04-01', '10:00 영업회의(이천)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('Group-1775616288112-zsem', 'Group', '2026-04-01', '0800 월례조회') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('Group-1775616179827-qsx9', 'Group', '2026-04-01', '(조회사 : 강승현 원장)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('Group-1-3-pdf', 'Group', '2026-04-01', '1030 전략품목발표회(판교)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('NBT-1-1', 'NBT', '2026-04-01', '08:30 월례조회(이천)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('Group-1-2-pdf', 'Group', '2026-04-01', '0850 영업회의(판교)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('BIO-3-0-pdf', 'BIO', '2026-04-03', '0900 S&OP회의(화상)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('NBT-6-1', 'NBT', '2026-04-06', '08:30 국내 영업회의') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('BIO-8-0-pdf', 'BIO', '2026-04-08', '0830 임원회의(판교)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('Group-9-0-pdf', 'Group', '2026-04-09', '0900 확대경영회의(판교)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('BIO-10-0-pdf', 'BIO', '2026-04-10', '0900 S&OP회의(화상)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('Group-direct-1775455986899', 'Group', '2026-04-10', '13:30 건기식 관리부문 월간미팅') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('NBT-10-1', 'NBT', '2026-04-10', '08:00 확대경영회의(GB2 6층)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('Group-1775616288112-99jv', 'Group', '2026-04-13', '0900 코스맥스파마 확대회의(판교)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('Group-1775616288112-o3lm', 'Group', '2026-04-13', '0900 코스맥스/비티아이 경영위원회(판교)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('BIO-13-0-pdf', 'BIO', '2026-04-13', '1000 자동화회의(제천)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('Group-1775616288112-6o9l', 'Group', '2026-04-14', '0900 신제품전략회의(판교)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('Group-14-1-pdf', 'Group', '2026-04-14', '1500 코스맥스펫 확대회의(판교)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('NBT-15-1', 'NBT', '2026-04-15', '14:00 생산협의회(이천)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('Group-16-1-pdf', 'Group', '2026-04-16', '1500 레시피회의(판교)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('BIO-16-0-pdf', 'BIO', '2026-04-16', '0900 부서회의(전략마케팅)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('BIO-17-1-pdf', 'BIO', '2026-04-17', '0900 건기식 통합회의(판교)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('BIO-17-0-pdf', 'BIO', '2026-04-17', '0900 S&OP회의(화상)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('Group-1775616288112-gp6e', 'Group', '2026-04-17', '0900 건기식 통합회의(판교)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('NBT-20-1', 'NBT', '2026-04-20', '08:30 국내 영업회의') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('Group-1775616288112-pfw0', 'Group', '2026-04-20', '0900 화장품 관계사 경영회의(판교)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('BIO-20-0-pdf', 'BIO', '2026-04-20', '0900 영업팀장회의(국내)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('BIO-21-0-pdf', 'BIO', '2026-04-21', '0900 건기식 관계사경영회의(판교)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('Group-1775616288112-ilvv', 'Group', '2026-04-21', '0900 건기식 관계사 경영회의(판교)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('Group-22-3-pdf', 'Group', '2026-04-22', '1000 믹스앤매치 확대회의(판교)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('BIO-22-0-pdf', 'BIO', '2026-04-22', '0830 임원회의(판교)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('Group-1775616288112-yz1s', 'Group', '2026-04-22', '0930 제안심사위원회(화성)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('Group-1775616288112-nj9z', 'Group', '2026-04-22', '0900 코스맥스네오 확대회의(판교)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('Group-1775616288112-7vvt', 'Group', '2026-04-22', '0830 생산협의회(화성)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('Group-22-4-pdf', 'Group', '2026-04-22', '1030 코스맥스 글로벌 생산기술교류회(화성)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('NBT-23-2', 'NBT', '2026-04-23', '14:00 임원회의(GB2 6층)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('NBT-23-1', 'NBT', '2026-04-23', '13:00 제안심사(GB2 6층)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('BIO-23-0-pdf', 'BIO', '2026-04-23', '0900 신제품개발회의(판교)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('Group-23-0-pdf', 'Group', '2026-04-23', '0900 임원회의(판교)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('Group-1775616288112-4joz', 'Group', '2026-04-24', '0800 코스맥스USA 확대경영회의(판교)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('BIO-24-0-pdf', 'BIO', '2026-04-24', '0900 S&OP회의(화상)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('BIO-24-1-pdf', 'BIO', '2026-04-24', '0900 연구회의(판교)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('NBT-27-1', 'NBT', '2026-04-27', '08:30 국내 신제품 설명회(GB2 6층)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('Group-direct-1775514202071', 'Group', '2026-04-27', '08:30 건기식 관리부문 월간미팅') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('BIO-27-0-pdf', 'BIO', '2026-04-27', '1330 생산업무회의(제천)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('BIO-27-1-pdf', 'BIO', '2026-04-27', '1430 손익점검회의(화상)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('Group-direct-1775605891556', 'Group', '2026-04-28', '10:30 건기식 원료통합 정기미팅') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('Group-direct-1775600442484', 'Group', '2026-04-28', '15:00 건기식 관리부문 단합행사') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('BIO-29-1-pdf', 'BIO', '2026-04-29', '1000 원료최적화회의(판교)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('NBT-29-1', 'NBT', '2026-04-29', '14:00 생산협의회(이천)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('BIO-29-0-pdf', 'BIO', '2026-04-29', '0900 트랜드 전략회의(판교)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('BIO-2026-05-04-h1ye4z', 'BIO', '2026-05-04', '제천공장 대체휴무') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('NBT-2026-05-06-18x1qug', 'NBT', '2026-05-06', '08:00 영업회의(GB2 6층)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('BIO-2026-05-06-1glzrah', 'BIO', '2026-05-06', '0900 영업회의(판교)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('BIO-2026-05-07-j3l3lc', 'BIO', '2026-05-07', '0900 S&OP회의(화상)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('BIO-2026-05-07-136zc1l', 'BIO', '2026-05-07', '0830 임원회의(판교)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('Group-2026-05-07-1jtlycd', 'Group', '2026-05-07', '0800 월례조회') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('Group-2026-05-07-1qn90so', 'Group', '2026-05-07', '1030 전략품목발표회(판교)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('Group-2026-05-07-ayacb1', 'Group', '2026-05-07', '0850 영업회의(판교)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('Group-direct-1775514128215', 'Group', '2026-05-08', '08:00 건기식 임원회의') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('Group-direct-1776152586813', 'Group', '2026-05-11', '0830 건기식관리부문 월간미팅') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('NBT-2026-05-11-1tkwbjp', 'NBT', '2026-05-11', '08:30 국내 영업회의') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('Group-2026-05-12-rov1sm', 'Group', '2026-05-12', '0900 확대경영회의(판교)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('BIO-2026-05-12-111zvf4', 'BIO', '2026-05-12', '1000 자동화회의(제천)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('NBT-2026-05-13-1fbmhgn', 'NBT', '2026-05-13', '14:00 생산협의회(이천)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('Group-2026-05-14-1u245eh', 'Group', '2026-05-14', '0900 코스맥스/비티아이 경영위원회(판교)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('BIO-2026-05-14-9rrjmt', 'BIO', '2026-05-14', '0900 부서회의(전략마케팅)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('Group-2026-05-15-1jdukpr', 'Group', '2026-05-15', '1030 바이오 확대회의(판교)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('Group-2026-05-15-6cse4c', 'Group', '2026-05-15', '1100 레시피회의(판교)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('Group-2026-05-15-anhdoh', 'Group', '2026-05-15', '1500 코스맥스펫 확대회의(판교)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('Group-2026-05-15-d95zbf', 'Group', '2026-05-15', '1600 코스맥스파마 확대회의(판교)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('BIO-2026-05-15-j3l3lc', 'BIO', '2026-05-15', '0900 S&OP회의(화상)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('BIO-2026-05-15-1jdukpr', 'BIO', '2026-05-15', '1030 바이오 확대회의(판교)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('NBT-2026-05-15-cg3sut', 'NBT', '2026-05-15', '08:00 확대경영회의(GB2 6층)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('Group-2026-05-15-10l99y3', 'Group', '2026-05-15', '0800 NBT 확대회의(판교)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('Group-2026-05-18-582x8g', 'Group', '2026-05-18', '0900 신제품전략회의(판교)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('BIO-2026-05-18-1cr7cnj', 'BIO', '2026-05-18', '0900 영업팀장회의(국내)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('Group-2026-05-19-1kqk7q', 'Group', '2026-05-19', '1100 코스맥스 그룹이사회(판교)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('NBT-2026-05-19-1tkwbjp', 'NBT', '2026-05-19', '08:30 국내 영업회의') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('Group-2026-05-19-1e4rzl0', 'Group', '2026-05-19', '1130 비티아이 그룹이사회(판교)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('Group-2026-05-19-csp2zb', 'Group', '2026-05-19', '0900 임원회의(판교)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('Group-2026-05-20-1udhd2b', 'Group', '2026-05-20', '0930 제안심사위원회(화성)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('Group-2026-05-20-ruro7t', 'Group', '2026-05-20', '1030 코스맥스 글로벌 생산기술교류회(화성)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('Group-2026-05-20-ua2jdr', 'Group', '2026-05-20', '0800 코스맥스USA 확대경영회의(판교)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('BIO-2026-05-20-136zc1l', 'BIO', '2026-05-20', '0830 임원회의(판교)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('Group-2026-05-20-1ve9820', 'Group', '2026-05-20', '0830 생산협의회(화성)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('NBT-2026-05-21-1fgosra', 'NBT', '2026-05-21', '08:00 임원회의(GB2 6층)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('NBT-2026-05-21-14t23dq', 'NBT', '2026-05-21', '09:30 제안심사(GB2 6층)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('BIO-2026-05-22-j3l3lc', 'BIO', '2026-05-22', '0900 S&OP회의(화상)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('BIO-2026-05-22-1mz3g7z', 'BIO', '2026-05-22', '0900 연구회의(판교)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('BIO-2026-05-26-170nwm7', 'BIO', '2026-05-26', '1330 생산업무회의(제천)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('NBT-2026-05-26-2zf1mj', 'NBT', '2026-05-26', '08:30 국내 신제품 설명회(GB2 6층)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('BIO-2026-05-26-9zlguk', 'BIO', '2026-05-26', '1430 손익점검회의(화상)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('Group-2026-05-27-1xel0el', 'Group', '2026-05-27', '1000 믹스앤매치 확대회의(판교)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('NBT-2026-05-27-1fbmhgn', 'NBT', '2026-05-27', '14:00 생산협의회(이천)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('Group-2026-05-27-16k87dt', 'Group', '2026-05-27', '0900 코스맥스네오 확대회의(판교)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('BIO-2026-05-27-13evs08', 'BIO', '2026-05-27', '1000 원료최적화회의(판교)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('BIO-2026-05-27-cy703w', 'BIO', '2026-05-27', '0900 트랜드 전략회의(판교)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('Group-2026-05-28-qeba3', 'Group', '2026-05-28', '1330 중국·동남아 법인 확대경영회의(판교)') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('Group-direct-1776152631093', 'Group', '2026-05-29', '0830 건기식관리부문 월간미팅') ON CONFLICT (id) DO NOTHING;
INSERT INTO schedules (id, company, date, title) VALUES ('BIO-2026-05-29-j3l3lc', 'BIO', '2026-05-29', '0900 S&OP회의(화상)') ON CONFLICT (id) DO NOTHING;

-- 3. leave_plans 데이터 삽입
INSERT INTO leave_plans (id, date, team, rank, employee_name, leave_type, note) VALUES ('51d3ad0e-f049-4bd4-81c1-53f0a820147b', '2026-04-22', '사업관리팀', '대리', '김보현', '연차', '') ON CONFLICT (id) DO NOTHING;
INSERT INTO leave_plans (id, date, team, rank, employee_name, leave_type, note) VALUES ('25f87898-388a-496a-b166-dbc43eeb0d7c', '2026-04-23', '사업관리팀', '대리', '김보현', '연차', '') ON CONFLICT (id) DO NOTHING;
INSERT INTO leave_plans (id, date, team, rank, employee_name, leave_type, note) VALUES ('86a0e58c-2d64-4715-a580-85d557a6dcdf', '2026-04-24', '사업관리팀', '대리', '김보현', '연차', '') ON CONFLICT (id) DO NOTHING;
INSERT INTO leave_plans (id, date, team, rank, employee_name, leave_type, note) VALUES ('ac376368-2ef7-4f6a-91d0-7748474f60b8', '2026-04-30', '사업관리팀', '대리', '김홍순', '연차', '') ON CONFLICT (id) DO NOTHING;
INSERT INTO leave_plans (id, date, team, rank, employee_name, leave_type, note) VALUES ('f0688a38-99b1-445b-aff6-39ea31752284', '2026-04-24', '사업관리팀', '대리', '김홍순', '반차(오후)', '') ON CONFLICT (id) DO NOTHING;
INSERT INTO leave_plans (id, date, team, rank, employee_name, leave_type, note) VALUES ('824019dc-2f14-4c16-b88f-acc562a68fb0', '2026-04-29', '관리부문', '임원', '이진우', '반차(오후)', '') ON CONFLICT (id) DO NOTHING;
INSERT INTO leave_plans (id, date, team, rank, employee_name, leave_type, note) VALUES ('b0a8b2b0-8005-47ef-b597-0bd805cc6c59', '2026-05-04', '경영관리팀', '부장', '이종현', '연차', '') ON CONFLICT (id) DO NOTHING;
INSERT INTO leave_plans (id, date, team, rank, employee_name, leave_type, note) VALUES ('9ab99a36-7b5d-4d6d-81ba-187cdf656a81', '2026-04-29', '경영관리팀', '과장', '최건', '연차', '') ON CONFLICT (id) DO NOTHING;
INSERT INTO leave_plans (id, date, team, rank, employee_name, leave_type, note) VALUES ('3693b888-605f-4d37-8eb9-03cccea14eea', '2026-05-04', '사업관리팀', '대리', '김홍순', '연차', '') ON CONFLICT (id) DO NOTHING;

-- 4. request_schedules 데이터 삽입
INSERT INTO request_schedules (id, date, title, category, note) VALUES ('3b11a93a-5af6-4e84-982d-9db07f07b66e', '2026-04-09', '경영실적(예상) 엑셀자료회신', '정기요청자료', '') ON CONFLICT (id) DO NOTHING;
INSERT INTO request_schedules (id, date, title, category, note) VALUES ('20a0cbdd-7fc8-4f1d-9a9d-19523324a00f', '2026-04-09', '관계사경영회의 경영실적회신', '관계사경영회의관련', '') ON CONFLICT (id) DO NOTHING;
INSERT INTO request_schedules (id, date, title, category, note) VALUES ('7abd9ba1-64a2-4d8e-b083-fe14b2104308', '2026-04-09', '공통전략지표 4월 업데이트', '정기요청자료', '') ON CONFLICT (id) DO NOTHING;
INSERT INTO request_schedules (id, date, title, category, note) VALUES ('6d8eea51-33e9-4564-b483-128b6f391ae0', '2026-04-10', '확대회의자료회신(펫/파마)', '통합회의및확대회의관련', '') ON CONFLICT (id) DO NOTHING;
INSERT INTO request_schedules (id, date, title, category, note) VALUES ('5b87b45d-eddd-4b2a-abea-27e73f275f91', '2026-04-13', '관계사경영회의 발표자료회신', '관계사경영회의관련', '') ON CONFLICT (id) DO NOTHING;
INSERT INTO request_schedules (id, date, title, category, note) VALUES ('c59fcb22-1737-4e1d-b4d3-b3bee189d92d', '2026-04-13', '운전자본(채권/재고/재무제표) 자료회신', '정기요청자료', '') ON CONFLICT (id) DO NOTHING;
INSERT INTO request_schedules (id, date, title, category, note) VALUES ('3dad9817-3be4-4837-9d81-88b6258334ad', '2026-04-14', '15:00 펫 확대회의', '통합회의및확대회의관련', '') ON CONFLICT (id) DO NOTHING;
INSERT INTO request_schedules (id, date, title, category, note) VALUES ('c79d4e9c-1ccd-452e-8644-f8dfed43bad0', '2026-04-14', '16:00 파마 확대회의', '통합회의및확대회의관련', '') ON CONFLICT (id) DO NOTHING;
INSERT INTO request_schedules (id, date, title, category, note) VALUES ('f8d8951a-5dd2-4bb1-a338-02aa5536ad8a', '2026-04-17', '09:00 건기식 통합회의', '통합회의및확대회의관련', '') ON CONFLICT (id) DO NOTHING;
INSERT INTO request_schedules (id, date, title, category, note) VALUES ('92601109-edf2-458e-a87c-2c76c64edeff', '2026-04-20', '09:00 화장품관계사경영회의', '관계사경영회의관련', '') ON CONFLICT (id) DO NOTHING;
INSERT INTO request_schedules (id, date, title, category, note) VALUES ('ffaa5658-2137-45bc-9d1c-7d52eb58f332', '2026-04-21', '09:00 건기식관계사경영회의', '관계사경영회의관련', '') ON CONFLICT (id) DO NOTHING;
INSERT INTO request_schedules (id, date, title, category, note) VALUES ('8ce3dff4-6ab7-48f2-aa4b-965b5fb09ec7', '2026-04-24', '가마감예상실적(매출) 자료회신', '정기요청자료', '') ON CONFLICT (id) DO NOTHING;

-- 완료

-- ── 요청자료 PDF 이미지 ──
CREATE TABLE IF NOT EXISTS request_months (
    month_key    TEXT PRIMARY KEY,
    file_name    TEXT,
    storage_path TEXT,
    uploaded_at  TIMESTAMPTZ DEFAULT now(),
    image_data   BYTEA
);

-- ── 파일 관리 (폴더별 원본 파일 보관) ──
CREATE TABLE IF NOT EXISTS schedule_files (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    folder       TEXT NOT NULL CHECK (folder IN ('Group','NBT','BIO','menu')),
    filename     TEXT NOT NULL,
    content_type TEXT,
    file_data    BYTEA NOT NULL,
    file_size    INTEGER,
    uploaded_at  TIMESTAMPTZ DEFAULT now()
);