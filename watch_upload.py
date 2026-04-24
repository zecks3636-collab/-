"""
watch_upload.py - schedules/ 폴더 감시 -> App Runner 자동 업로드

사용:
    python watch_upload.py

폴더 구조:
    schedules/Group/   → /api/files/Group
    schedules/NBT/     → /api/files/NBT
    schedules/BIO/     → /api/files/BIO
    schedules/menu/    → /api/files/menu

새 파일이 감지되면 자동으로 서버에 업로드합니다.
이미 업로드된 파일은 .uploaded_state.json에 기록되어 재업로드하지 않습니다.
"""

import os, json, time, uuid, pathlib, urllib.request, urllib.error, mimetypes, sys

BASE_URL  = "https://pemwciwg3z.ap-northeast-1.awsapprunner.com"
WATCH_DIR = pathlib.Path(__file__).parent / "schedules"
STATE_FILE = pathlib.Path(__file__).parent / ".uploaded_state.json"
POLL_SEC  = 5  # 폴더 확인 주기 (초)

FOLDERS = ["Group", "NBT", "BIO", "menu"]

IGNORE_EXTS = {".tmp", ".part", ".crdownload", ""}


def load_state():
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def save_state(state):
    STATE_FILE.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def upload_file(folder: str, filepath: pathlib.Path) -> dict:
    url = f"{BASE_URL}/api/files/{folder}"
    filename = filepath.name
    content_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"

    with open(filepath, "rb") as f:
        data = f.read()

    boundary = uuid.uuid4().hex
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        f"Content-Type: {content_type}\r\n\r\n"
    ).encode("utf-8") + data + f"\r\n--{boundary}--\r\n".encode()

    req = urllib.request.Request(
        url, data=body, method="POST",
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def scan_once(state: dict) -> dict:
    changed = False
    for folder in FOLDERS:
        folder_path = WATCH_DIR / folder
        if not folder_path.exists():
            continue
        for filepath in sorted(folder_path.iterdir()):
            if not filepath.is_file():
                continue
            if filepath.suffix.lower() in IGNORE_EXTS:
                continue
            key = f"{folder}/{filepath.name}"
            mtime = filepath.stat().st_mtime
            if key in state and state[key].get("mtime") == mtime:
                continue  # 이미 업로드된 파일 (수정 없음)

            print(f"[업로드] {key} ({round(filepath.stat().st_size/1024)}KB) ...", end=" ", flush=True)
            try:
                result = upload_file(folder, filepath)
                state[key] = {"id": result.get("id"), "mtime": mtime, "uploaded_at": result.get("uploaded_at")}
                print(f"완료 (id={result.get('id','?')[:8]}...)")
                changed = True
            except urllib.error.HTTPError as e:
                body = e.read().decode(errors="replace")[:200]
                print(f"실패 HTTP {e.code}: {body}")
            except Exception as e:
                print(f"실패: {e}")

    if changed:
        save_state(state)
    return state


def main():
    print("=" * 60)
    print("watch_upload.py - schedules/ 폴더 자동 업로드 감시")
    print(f"  대상 서버 : {BASE_URL}")
    print(f"  감시 폴더 : {WATCH_DIR}")
    print(f"  확인 주기 : {POLL_SEC}초")
    print(f"  상태 파일 : {STATE_FILE.name}")
    print("  중지: Ctrl+C")
    print("=" * 60)

    if not WATCH_DIR.exists():
        print(f"[오류] schedules/ 폴더가 없습니다: {WATCH_DIR}")
        sys.exit(1)

    state = load_state()
    print(f"[초기화] 이미 업로드된 파일 {len(state)}건 로드")
    print()

    try:
        while True:
            state = scan_once(state)
            time.sleep(POLL_SEC)
    except KeyboardInterrupt:
        print("\n[종료] 감시를 중단합니다.")


if __name__ == "__main__":
    main()
