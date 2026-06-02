/**
 * 월간일정표 자동 import - Google Apps Script
 *
 * 흐름:
 *   Drive 폴더 (Group/NBT/BIO) 신규 XLS 감지
 *   → Drive 공유 링크 생성
 *   → Google Sheet 'schedules' 탭에 기록
 *   → 대시보드 접속 시 서버가 폴링하여 자동 반영 (추가만)
 *
 * 설정:
 * 1. https://script.google.com 에서 새 프로젝트 생성
 * 2. 이 코드 붙여넣기
 * 3. 트리거: scanScheduleFolders → 시간 기반 → 10분 간격
 */

var PARENT_FOLDER_ID = "1RDMeEGEq88IIUC4TdLSWHZJKDa9WtdYC";
var SHEET_ID = "1_KLMONstfHH0izaneMF_Y25U_MLbXrLPRVZY7GJN3VM";
var TAB_NAME = "schedules";
var COMPANIES = ["Group", "NBT", "BIO"];

function scanScheduleFolders() {
  // 1) Sheet 탭 확보 (없으면 자동 생성)
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(TAB_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(TAB_NAME);
    sheet.appendRow(["company", "drive_url", "filename", "timestamp", "processed"]);
    Logger.log("'schedules' 탭 생성");
  }

  // 2) 부모 폴더 → 회사별 하위 폴더 확보 (없으면 생성)
  var parent = DriveApp.getFolderById(PARENT_FOLDER_ID);
  var subFolders = {};
  COMPANIES.forEach(function(name) {
    var iter = parent.getFoldersByName(name);
    if (iter.hasNext()) {
      subFolders[name] = iter.next();
    } else {
      subFolders[name] = parent.createFolder(name);
      Logger.log("하위 폴더 생성: " + name);
    }
  });

  // 3) Sheet에 이미 기록된 파일명 수집 (중복 방지)
  var data = sheet.getDataRange().getValues();
  var existing = {};
  for (var r = 1; r < data.length; r++) {
    var key = data[r][0] + "::" + data[r][2];  // company::filename
    existing[key] = true;
  }

  // 4) 각 회사 폴더 스캔
  var newCount = 0;
  COMPANIES.forEach(function(company) {
    var folder = subFolders[company];
    var files = folder.getFiles();
    while (files.hasNext()) {
      var file = files.next();
      var fname = file.getName();
      var lower = fname.toLowerCase();
      if (!lower.endsWith(".xls") && !lower.endsWith(".xlsx")) continue;

      var key = company + "::" + fname;
      if (existing[key]) continue;

      // 공유 링크 생성
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      var url = "https://drive.google.com/uc?export=download&id=" + file.getId();

      var now = Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM-dd HH:mm:ss");
      sheet.appendRow([company, url, fname, now, ""]);
      Logger.log("기록: [" + company + "] " + fname);
      newCount++;
    }
  });

  Logger.log("스캔 완료 — 신규 " + newCount + "건");
}

// 수동 테스트용
function testScanSchedules() { scanScheduleFolders(); }
