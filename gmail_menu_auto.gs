/**
 * Gmail 주간메뉴표 자동 업로드 - Google Apps Script
 *
 * 설정 방법:
 * 1. https://script.google.com 에서 새 프로젝트 생성
 * 2. 이 코드를 붙여넣기
 * 3. SERVER_URL, AUTH_TOKEN 값 확인
 * 4. 트리거 설정: sendMenuToServer 함수 → 시간 기반 트리거 → 매주 금요일 오후 5~6시
 */

const SERVER_URL = "https://7prxbbpwnm.ap-northeast-1.awsapprunner.com/api/menu_auto";
const AUTH_TOKEN = "bti-menu-2026";

// Gmail 검색 키워드 (제목에 "주간메뉴표" 또는 "창조" 포함)
const SEARCH_QUERY = 'subject:(주간메뉴표) has:attachment filename:pdf newer_than:7d';

function sendMenuToServer() {
  const threads = GmailApp.search(SEARCH_QUERY, 0, 1);
  if (threads.length === 0) {
    Logger.log("최근 7일 내 주간메뉴표 메일 없음");
    return;
  }

  const messages = threads[0].getMessages();
  const latest = messages[messages.length - 1];
  const attachments = latest.getAttachments();

  // PDF 첨부파일 찾기
  let pdf = null;
  for (const att of attachments) {
    if (att.getContentType() === "application/pdf" ||
        att.getName().toLowerCase().endsWith(".pdf")) {
      pdf = att;
      break;
    }
  }

  if (!pdf) {
    Logger.log("PDF 첨부파일 없음: " + latest.getSubject());
    return;
  }

  Logger.log("PDF 발견: " + pdf.getName() + " (" + pdf.getSize() + " bytes)");

  // multipart/form-data 로 서버에 전송
  const boundary = "----FormBoundary" + Utilities.getUuid();
  const pdfBlob = pdf.copyBlob();

  const payload = Utilities.newBlob(
    "--" + boundary + "\r\n" +
    'Content-Disposition: form-data; name="file"; filename="' + pdf.getName() + '"\r\n' +
    "Content-Type: application/pdf\r\n\r\n"
  ).getBytes()
  .concat(pdfBlob.getBytes())
  .concat(Utilities.newBlob("\r\n--" + boundary + "--\r\n").getBytes());

  const options = {
    method: "post",
    contentType: "multipart/form-data; boundary=" + boundary,
    headers: {
      "X-Menu-Token": AUTH_TOKEN
    },
    payload: payload,
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(SERVER_URL, options);
  Logger.log("서버 응답: " + response.getResponseCode() + " " + response.getContentText());

  // 성공 시 라벨 추가 (중복 전송 방지용)
  if (response.getResponseCode() === 200) {
    let label = GmailApp.getUserLabelByName("식단표_자동업로드");
    if (!label) label = GmailApp.createLabel("식단표_자동업로드");
    threads[0].addLabel(label);
    Logger.log("✅ 업로드 성공 — week_key: " + JSON.parse(response.getContentText()).week_key);
  }
}

// 수동 테스트용
function testMenuUpload() {
  sendMenuToServer();
}
