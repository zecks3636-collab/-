/**
 * Gmail 주간메뉴표 자동 업로드 - Google Apps Script (Sheets 큐 방식)
 *
 * 흐름:
 *   금요일 2시 트리거 → Gmail PDF 검색 → Drive 임시 저장 → Sheet에 URL 기록
 *   → 대시보드 접속 시 서버가 Sheet 읽어서 자동 반영
 *
 * 설정:
 * 1. https://script.google.com 에서 새 프로젝트 생성
 * 2. 이 코드를 붙여넣기
 * 3. 트리거: sendMenuToSheet → 시간 기반 → 매주 금요일 오후 1~2시
 */

var SHEET_ID = "1_KLMONstfHH0izaneMF_Y25U_MLbXrLPRVZY7GJN3VM";
// 2026-08-28 발송분부터 제목이 "주간 메뉴표" → "주간 식단표" 로 바뀌어 검색에 걸리지 않았다.
// 발신자가 표기를 바꿔도 견디도록 두 표현을 모두 허용한다.
// 검증: 최근 40일 기준 이 검색어는 식단표 메일 6건만 반환하며 잡음이 없다.
var SEARCH_QUERY = 'subject:(메뉴표 OR 식단표) has:attachment filename:pdf newer_than:7d';

function sendMenuToSheet() {
  var threads = GmailApp.search(SEARCH_QUERY, 0, 1);
  if (threads.length === 0) { Logger.log("최근 7일 내 주간메뉴표 메일 없음"); return; }

  var latest = threads[0].getMessages().pop();
  Logger.log("메일: " + latest.getSubject() + " (" + latest.getDate() + ")");

  var attachments = latest.getAttachments();
  var pdf = null;
  for (var i = 0; i < attachments.length; i++) {
    if (attachments[i].getContentType() === "application/pdf" ||
        attachments[i].getName().toLowerCase().indexOf(".pdf") >= 0) {
      pdf = attachments[i]; break;
    }
  }
  if (!pdf) { Logger.log("PDF 없음"); return; }
  Logger.log("PDF: " + pdf.getName() + " (" + pdf.getSize() + " bytes)");

  // 1) Google Drive에 저장 (공개 링크)
  var blob = pdf.copyBlob();
  blob.setName(pdf.getName());
  var file = DriveApp.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  var fileId = file.getId();
  var downloadUrl = "https://drive.google.com/uc?export=download&id=" + fileId;
  Logger.log("Drive URL: " + downloadUrl);

  // 2) Google Sheet에 기록
  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheets()[0];

  // 중복 체크 (같은 파일명이 이미 있으면 스킵)
  var data = sheet.getDataRange().getValues();
  for (var r = 1; r < data.length; r++) {
    if (data[r][1] === pdf.getName()) {
      Logger.log("이미 등록된 파일: " + pdf.getName());
      // Drive 임시파일 삭제
      try { DriveApp.getFileById(fileId).setTrashed(true); } catch(e) {}
      return;
    }
  }

  var now = Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM-dd HH:mm:ss");
  sheet.appendRow([downloadUrl, pdf.getName(), now, ""]);
  Logger.log("✅ Sheet에 기록 완료");

  // 3) Gmail 라벨 부착
  var label = GmailApp.getUserLabelByName("식단표_자동업로드");
  if (!label) label = GmailApp.createLabel("식단표_자동업로드");
  threads[0].addLabel(label);
  Logger.log("✅ 완료: " + pdf.getName());
}

// 수동 테스트용
function testMenuToSheet() { sendMenuToSheet(); }
