/**
 * Gmail 주간메뉴표 자동 업로드 - Google Apps Script (Drive 경유 방식)
 *
 * 설정 방법:
 * 1. https://script.google.com 에서 새 프로젝트 생성
 * 2. 이 코드를 붙여넣기
 * 3. 트리거 설정: sendMenuToServer → 시간 기반 → 매주 금요일 오후 1~2시
 */

var SERVER_URL = "https://7prxbbpwnm.ap-northeast-1.awsapprunner.com/api/menu_auto_drive";
var AUTH_TOKEN = "bti-menu-2026";
var SEARCH_QUERY = 'subject:(주간메뉴표) has:attachment filename:pdf newer_than:7d';

function sendMenuToServer() {
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

  // 1) Google Drive에 임시 저장
  var blob = pdf.copyBlob();
  blob.setName(pdf.getName());
  var file = DriveApp.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  var fileId = file.getId();
  var downloadUrl = "https://drive.google.com/uc?export=download&id=" + fileId;
  Logger.log("Drive URL: " + downloadUrl);

  // 2) 서버에 Drive URL만 전송 (작은 JSON)
  var jsonStr = JSON.stringify({
    token: AUTH_TOKEN,
    filename: pdf.getName(),
    drive_url: downloadUrl
  });
  Logger.log("JSON 크기: " + jsonStr.length + " chars");

  try {
    var response = UrlFetchApp.fetch(SERVER_URL, {
      method: "post",
      contentType: "application/json; charset=utf-8",
      payload: jsonStr,
      muteHttpExceptions: true
    });
    var code = response.getResponseCode();
    var body = response.getContentText();
    Logger.log("서버 응답: " + code + " " + body);

    if (code === 200) {
      var label = GmailApp.getUserLabelByName("식단표_자동업로드");
      if (!label) label = GmailApp.createLabel("식단표_자동업로드");
      threads[0].addLabel(label);
      Logger.log("✅ 업로드 성공");
    } else {
      Logger.log("❌ 업로드 실패: " + code);
    }
  } catch (e) {
    Logger.log("❌ fetch 예외: " + e.message);
  }

  // 3) Drive 임시 파일 삭제
  try { DriveApp.getFileById(fileId).setTrashed(true); } catch(e) {}
  Logger.log("Drive 임시파일 삭제 완료");
}

function testMenuUpload() { sendMenuToServer(); }
