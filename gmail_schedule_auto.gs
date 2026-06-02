/**
 * 월간일정표 자동 import - Google Apps Script
 *
 * 흐름:
 *   1) scanGmailToDrive:
 *      Gmail 자동전달 메일(NBT/BIO 일정표) 수신
 *      → 첨부 XLS 추출 → 해당 회사 Drive 하위 폴더에 저장
 *      → 처리된 메일에 라벨 부착 (재처리 방지)
 *   2) scanScheduleFolders:
 *      Drive 폴더(Group/NBT/BIO) 스캔 → 신규 XLS → Sheet 'schedules' 탭 기록
 *      (Group은 사용자가 직접 폴더에 드롭)
 *   3) 대시보드 접속 시 서버가 Sheet 폴링 → 자동 추가 적용 (삭제 안 함)
 *
 * 설정:
 * 1. https://script.google.com 에서 새 프로젝트
 * 2. 이 코드 붙여넣기 + 권한 승인
 * 3. 트리거: runAll → 시간 기반 → 10분 간격
 */

var PARENT_FOLDER_ID = "1RDMeEGEq88IIUC4TdLSWHZJKDa9WtdYC";
var SHEET_ID = "1_KLMONstfHH0izaneMF_Y25U_MLbXrLPRVZY7GJN3VM";
var TAB_NAME = "schedules";
var COMPANIES = ["Group", "NBT", "BIO"];

// Gmail 검색: 일정표 제목 + XLS 첨부 + 자동처리 라벨 없음 + 최근 30일
var GMAIL_QUERY = 'subject:일정표 has:attachment filename:(xlsx OR xls) -label:일정표_자동처리 newer_than:30d';

// 첨부파일명/제목/발신자로 회사 식별
function detectCompany(filename, subject, sender) {
  var s = (filename + ' ' + subject + ' ' + sender).toLowerCase();
  if (s.indexOf('nbt') >= 0 || s.indexOf('엔비티') >= 0) return 'NBT';
  if (s.indexOf('bio') >= 0 || s.indexOf('바이오') >= 0) return 'BIO';
  if (s.indexOf('그룹') >= 0 || s.indexOf('group') >= 0) return 'Group';
  return null;
}

function getCompanyFolders() {
  var parent = DriveApp.getFolderById(PARENT_FOLDER_ID);
  var folders = {};
  COMPANIES.forEach(function(name) {
    var iter = parent.getFoldersByName(name);
    folders[name] = iter.hasNext() ? iter.next() : parent.createFolder(name);
  });
  return folders;
}

// ── 1단계: Gmail → Drive ──
function scanGmailToDrive() {
  var folders = getCompanyFolders();
  var label = GmailApp.getUserLabelByName("일정표_자동처리");
  if (!label) label = GmailApp.createLabel("일정표_자동처리");

  var threads = GmailApp.search(GMAIL_QUERY, 0, 30);
  var saved = 0;

  threads.forEach(function(thread) {
    var msg = thread.getMessages()[thread.getMessages().length - 1];
    var subject = msg.getSubject();
    var sender  = msg.getFrom();
    var attachments = msg.getAttachments();

    var handled = false;
    attachments.forEach(function(att) {
      var fname = att.getName();
      var lower = fname.toLowerCase();
      if (!lower.endsWith('.xls') && !lower.endsWith('.xlsx')) return;

      var company = detectCompany(fname, subject, sender);
      if (!company || company === 'Group') {
        // Group은 자동전달 대상 아님 (사용자 수동)
        Logger.log('회사 식별 실패 또는 Group: ' + fname + ' / ' + subject);
        return;
      }

      var folder = folders[company];
      // 중복 체크 (동일 파일명 이미 폴더에 있으면 스킵)
      var existing = folder.getFilesByName(fname);
      if (existing.hasNext()) {
        Logger.log('이미 존재: [' + company + '] ' + fname);
        handled = true;
        return;
      }

      folder.createFile(att.copyBlob().setName(fname));
      Logger.log('✅ 저장: [' + company + '] ' + fname);
      saved++;
      handled = true;
    });

    if (handled) thread.addLabel(label);
  });

  Logger.log('Gmail 스캔 완료 — 신규 저장 ' + saved + '건');
}

// ── 2단계: Drive → Sheet ──
function scanScheduleFolders() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(TAB_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(TAB_NAME);
    sheet.appendRow(["company", "drive_url", "filename", "timestamp", "processed"]);
  }

  var folders = getCompanyFolders();
  var data = sheet.getDataRange().getValues();
  var existing = {};
  for (var r = 1; r < data.length; r++) {
    existing[data[r][0] + "::" + data[r][2]] = true;
  }

  var newCount = 0;
  COMPANIES.forEach(function(company) {
    var folder = folders[company];
    var files = folder.getFiles();
    while (files.hasNext()) {
      var file = files.next();
      var fname = file.getName();
      var lower = fname.toLowerCase();
      if (!lower.endsWith('.xls') && !lower.endsWith('.xlsx')) continue;
      if (existing[company + "::" + fname]) continue;

      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      var url = "https://drive.google.com/uc?export=download&id=" + file.getId();
      var now = Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM-dd HH:mm:ss");
      sheet.appendRow([company, url, fname, now, ""]);
      Logger.log('Sheet 기록: [' + company + '] ' + fname);
      newCount++;
    }
  });

  Logger.log('Drive 스캔 완료 — Sheet 신규 ' + newCount + '건');
}

// ── 통합 실행 (트리거가 이걸 호출) ──
function runAll() {
  scanGmailToDrive();
  scanScheduleFolders();
}

// 수동 테스트용
function testRunAll() { runAll(); }
