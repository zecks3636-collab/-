/**
 * Gmail 주간메뉴표 자동 업로드 - Google Apps Script
 *
 * 설정 방법:
 * 1. https://script.google.com 에서 새 프로젝트 생성
 * 2. 이 코드를 붙여넣기
 * 3. SERVER_URL, AUTH_TOKEN 값 확인
 * 4. 트리거 설정: sendMenuToServer 함수 → 시간 기반 트리거 → 매주 금요일 오후 5~6시
 */

var SERVER_URL = "https://7prxbbpwnm.ap-northeast-1.awsapprunner.com/api/menu_auto_b64";
var AUTH_TOKEN = "bti-menu-2026";

// Gmail 검색 키워드 (제목에 "주간메뉴표" 포함, PDF 첨부, 최근 7일)
var SEARCH_QUERY = 'subject:(주간메뉴표) has:attachment filename:pdf newer_than:7d';

function sendMenuToServer() {
  var threads = GmailApp.search(SEARCH_QUERY, 0, 1);
  if (threads.length === 0) {
    Logger.log("최근 7일 내 주간메뉴표 메일 없음");
    return;
  }

  var messages = threads[0].getMessages();
  var latest = messages[messages.length - 1];
  var attachments = latest.getAttachments();

  // PDF 첨부파일 찾기
  var pdf = null;
  for (var i = 0; i < attachments.length; i++) {
    var att = attachments[i];
    if (att.getContentType() === "application/pdf" ||
        att.getName().toLowerCase().indexOf(".pdf") >= 0) {
      pdf = att;
      break;
    }
  }

  if (!pdf) {
    Logger.log("PDF 첨부파일 없음: " + latest.getSubject());
    return;
  }

  Logger.log("PDF 발견: " + pdf.getName() + " (" + pdf.getSize() + " bytes)");

  // PDF → Base64 인코딩 후 JSON으로 전송
  var pdfBytes = pdf.getBytes();
  var b64 = Utilities.base64Encode(pdfBytes);

  var payload = {
    "token": AUTH_TOKEN,
    "filename": pdf.getName(),
    "pdf_base64": b64
  };

  var options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch(SERVER_URL, options);
  var code = response.getResponseCode();
  var body = response.getContentText();
  Logger.log("서버 응답: " + code + " " + body);

  if (code === 200) {
    var label = GmailApp.getUserLabelByName("식단표_자동업로드");
    if (!label) label = GmailApp.createLabel("식단표_자동업로드");
    threads[0].addLabel(label);
    Logger.log("✅ 업로드 성공 — " + body);
  } else {
    Logger.log("❌ 업로드 실패 — " + code + ": " + body);
  }
}

// 수동 테스트용
function testMenuUpload() {
  sendMenuToServer();
}
