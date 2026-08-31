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

// Session 으로 소유자 주소를 못 얻을 때 사용할 대체 수신자
var ALERT_FALLBACK_TO = "zecks3636@gmail.com";

// ─────────────────────────────────────────────────────────────
// 실패 알림
//   위 검색어가 또 안 맞는 등으로 조용히 멈추는 상황을 알아채기 위한 장치.
//   정상 등록과 "이미 등록된 파일"(중복)은 알리지 않는다. 중복은 트리거가
//   두 번 돌았을 때 나오는 정상 동작이라 알리면 잡음이 된다.
// ─────────────────────────────────────────────────────────────

function _alertRecipient() {
  try {
    var me = Session.getActiveUser().getEmail();
    if (me) return me;
  } catch (e) {}
  return ALERT_FALLBACK_TO;
}

/** 큐 시트의 마지막 기록을 돌려준다 (알림 본문에서 마지막 성공 시점 확인용) */
function _lastSheetRecord() {
  try {
    var data = SpreadsheetApp.openById(SHEET_ID).getSheets()[0].getDataRange().getValues();
    for (var r = data.length - 1; r >= 1; r--) {
      if (data[r][1]) return data[r][2] + "  " + data[r][1];
    }
    return "(기록 없음)";
  } catch (e) {
    return "(시트 조회 실패: " + e.message + ")";
  }
}

function notifyFailure(reason, detail) {
  var now = Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM-dd HH:mm:ss");
  var lines = [
    "주간 식단표 자동 등록이 완료되지 못했습니다.",
    "",
    "실행 시각   : " + now,
    "사유        : " + reason,
    "상세        : " + (detail || "-"),
    "현재 검색어 : " + SEARCH_QUERY,
    "마지막 기록 : " + _lastSheetRecord(),
    "",
    "확인할 것",
    "  1. 식단표 메일이 실제로 도착했는지",
    "  2. 도착했다면 제목 표기가 바뀌지 않았는지",
    "     2026-08 에 '주간 메뉴표' 에서 '주간 식단표' 로 바뀌면서",
    "     한 주 누락된 사례가 있음",
    "  3. 필요하면 SEARCH_QUERY 를 고치고 testMenuToSheet 수동 실행",
    "",
    "스크립트 : https://script.google.com/home",
    "큐 시트   : https://docs.google.com/spreadsheets/d/" + SHEET_ID + "/edit"
  ];
  try {
    GmailApp.sendEmail(_alertRecipient(), "[식단표 자동화] 실패 - " + reason, lines.join("\n"));
    Logger.log("알림 메일 발송: " + reason);
  } catch (e) {
    // 알림 실패가 본체 실행을 막지는 않도록 로그만 남긴다
    Logger.log("알림 메일 발송 실패: " + e.message);
  }
}

// ─────────────────────────────────────────────────────────────
// 본체
// ─────────────────────────────────────────────────────────────

function sendMenuToSheet() {
  try {
    _sendMenuToSheetInner();
  } catch (e) {
    Logger.log("실행 오류: " + e.message);
    notifyFailure("실행 오류", e.message + (e.stack ? " / " + e.stack : ""));
  }
}

function _sendMenuToSheetInner() {
  var threads = GmailApp.search(SEARCH_QUERY, 0, 1);
  if (threads.length === 0) {
    Logger.log("최근 7일 내 식단표 메일 없음");
    notifyFailure("메일을 찾지 못함", "최근 7일 내 검색 조건에 맞는 메일이 없습니다.");
    return;
  }

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
  if (!pdf) {
    Logger.log("PDF 없음");
    notifyFailure("PDF 첨부 없음",
      "메일 제목: " + latest.getSubject() + " / 첨부 " + attachments.length + "개 중 PDF 없음");
    return;
  }
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
  // 정상 동작이므로 알림을 보내지 않는다.
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
  Logger.log("Sheet에 기록 완료");

  // 3) Gmail 라벨 부착
  var label = GmailApp.getUserLabelByName("식단표_자동업로드");
  if (!label) label = GmailApp.createLabel("식단표_자동업로드");
  threads[0].addLabel(label);
  Logger.log("완료: " + pdf.getName());
}

// 수동 테스트용
function testMenuToSheet() { sendMenuToSheet(); }

// 알림 메일이 실제로 오는지만 확인하는 용도 (본체는 건드리지 않음)
function testNotifyOnly() { notifyFailure("알림 테스트", "이 메일이 오면 알림 설정이 정상입니다."); }
