# BTI Schedule 감사 이벤트 2계층 계약

## 적용 기준

- SDK: `v0.1.0-alpha.1`, commit `09f0cd27eb6b04b66fb24fdf9c10f3772567bc64`
- 런타임: FastAPI `server.py`, App Runner source directory `/`, repository config
- 1계층: HTTP method 기반 canonical action + `business_action=API_REQUEST`
- 2계층: commit·파일 반출·민감 조회·승인/반려·batch terminal 경계만 추가
- 실패 정책: 전 경로 `strict=false` 기본 fail-isolated
- 상관관계: 외부 header를 버리고 요청마다 서버가 만든 별도 UUID v4
  `request_id`와 `trace_id`를 같은 요청의 두 계층에 공유
- actor: 사람 요청은 서버가 검증한 SSO 세션의 불변 UUID만 `USER`로 사용한다.
  식단·일정 동기화·배치 경로는 브라우저 쿠키와 무관하게 `SYSTEM`이며, endpoint가
  별도 machine credential을 실제 검증한 경우에만 더 구체적인 `SERVICE`가 우선한다.
  body/header가 주장하는 email·UPN은 actor의 근거로 사용하지 않는다.
- target: 아래 registry의 비식별 상수만 사용. 이름·메일·사번·제목·파일명·route 실값 금지

## 1계층 API Coverage

논리적 서버 route 67개는 `업무 API 62개 적용 + 기술/정적 surface 5개 제외`다.
업무 API만 보면 `62 = 적용 62 + 제외 0`이며, routine 조회 다섯 건은 의도적으로
1계층만 기록한다.

| method | route template | canonical action | 감사 | 제외 사유 |
| --- | --- | --- | --- | --- |
| `DELETE` | `/api/birthdays/{birthday_id}` | `DELETE` | 적용 | - |
| `DELETE` | `/api/event_colors/{event_id}` | `DELETE` | 적용 | - |
| `DELETE` | `/api/executive_tasks/{task_id}` | `DELETE` | 적용 | - |
| `DELETE` | `/api/files/{folder}/{file_id}` | `DELETE` | 적용 | - |
| `DELETE` | `/api/goal_activities/{activity_id}` | `DELETE` | 적용 | - |
| `DELETE` | `/api/goals/{goal_id}` | `DELETE` | 적용 | - |
| `DELETE` | `/api/leave_plans/{leave_id}` | `DELETE` | 적용 | - |
| `DELETE` | `/api/menu_weeks/{week_key}` | `DELETE` | 적용 | - |
| `DELETE` | `/api/praise_cards/{card_id}` | `DELETE` | 적용 | - |
| `DELETE` | `/api/praise_stickers/{sticker_id}` | `DELETE` | 적용 | - |
| `DELETE` | `/api/request_months/{month_key}` | `DELETE` | 적용 | - |
| `DELETE` | `/api/request_schedules/{item_id}` | `DELETE` | 적용 | - |
| `DELETE` | `/api/schedules` | `DELETE` | 적용 | - |
| `DELETE` | `/api/schedules/{schedule_id}` | `DELETE` | 적용 | - |
| `DELETE` | `/api/storage/menu-images/{week_key}` | `DELETE` | 적용 | - |
| `DELETE` | `/api/storage/request-images/{month_key}` | `DELETE` | 적용 | - |
| `GET` | `/api/birthdays` | `READ` | 적용 | - |
| `GET` | `/api/event_colors` | `READ` | 적용(1계층 단독) | routine 설정 조회 |
| `GET` | `/api/executive_tasks` | `READ` | 적용 | - |
| `GET` | `/api/files/{folder}` | `READ` | 적용 | - |
| `GET` | `/api/files/{folder}/{file_id}` | `READ` | 적용 | - |
| `GET` | `/api/goal_activities` | `READ` | 적용 | - |
| `GET` | `/api/goals` | `READ` | 적용 | - |
| `GET` | `/api/group_ics_events` | `READ` | 적용 | - |
| `GET` | `/api/leave_plans` | `READ` | 적용 | - |
| `GET` | `/api/menu_weeks` | `READ` | 적용(1계층 단독) | routine 메타데이터 조회 |
| `GET` | `/api/praise_cards` | `READ` | 적용 | - |
| `GET` | `/api/praise_stickers` | `READ` | 적용 | - |
| `GET` | `/api/request_months` | `READ` | 적용(1계층 단독) | routine 메타데이터 조회 |
| `GET` | `/api/request_schedules` | `READ` | 적용(1계층 단독) | routine 일정 조회 |
| `GET` | `/api/schedule_imports` | `READ` | 적용 | - |
| `GET` | `/api/schedule_imports/{import_id}` | `READ` | 적용 | - |
| `GET` | `/api/schedules` | `READ` | 적용(1계층 단독) | routine 일정 조회 |
| `GET` | `/api/storage/menu-images/{week_key}` | `READ` | 적용 | - |
| `GET` | `/api/storage/request-images/{month_key}` | `READ` | 적용 | - |
| `POST` | `/api/birthdays` | `CREATE` | 적용 | - |
| `POST` | `/api/event_colors` | `CREATE` | 적용 | - |
| `POST` | `/api/executive_tasks` | `CREATE` | 적용 | - |
| `POST` | `/api/files/{folder}` | `CREATE` | 적용 | - |
| `POST` | `/api/goal_activities` | `CREATE` | 적용 | - |
| `POST` | `/api/goals` | `CREATE` | 적용 | - |
| `POST` | `/api/leave_plans` | `CREATE` | 적용 | - |
| `POST` | `/api/menu_auto` | `CREATE` | 적용 | - |
| `POST` | `/api/menu_auto_b64` | `CREATE` | 적용 | - |
| `POST` | `/api/menu_auto_drive` | `CREATE` | 적용 | - |
| `POST` | `/api/menu_auto_poll` | `CREATE` | 적용 | - |
| `POST` | `/api/menu_weeks/upsert` | `CREATE` | 적용 | - |
| `POST` | `/api/praise_cards` | `CREATE` | 적용 | - |
| `POST` | `/api/praise_stickers` | `CREATE` | 적용 | - |
| `POST` | `/api/request_months/upsert` | `CREATE` | 적용 | - |
| `POST` | `/api/request_schedules/upsert` | `CREATE` | 적용 | - |
| `POST` | `/api/schedule_imports/poll` | `CREATE` | 적용 | - |
| `POST` | `/api/schedule_imports/submit` | `CREATE` | 적용 | - |
| `POST` | `/api/schedule_imports/{import_id}/apply` | `CREATE` | 적용 | - |
| `POST` | `/api/schedule_imports/{import_id}/reject` | `CREATE` | 적용 | - |
| `POST` | `/api/schedules/delete` | `CREATE` | 적용 | - |
| `POST` | `/api/schedules/upsert` | `CREATE` | 적용 | - |
| `POST` | `/api/storage/menu-images/{week_key}` | `CREATE` | 적용 | - |
| `POST` | `/api/storage/request-images/{month_key}` | `CREATE` | 적용 | - |
| `PUT` | `/api/executive_tasks/{task_id}` | `UPDATE` | 적용 | - |
| `PUT` | `/api/goals/{goal_id}` | `UPDATE` | 적용 | - |
| `PUT` | `/api/leave_plans/{leave_id}` | `UPDATE` | 적용 | - |
| `GET` | `/openapi.json` | - | 제외 | FastAPI 자동 명세 |
| `GET` | `/docs` | - | 제외 | FastAPI 자동 문서 |
| `GET` | `/docs/oauth2-redirect` | - | 제외 | FastAPI 자동 문서 callback |
| `GET` | `/redoc` | - | 제외 | FastAPI 자동 문서 |
| `MOUNT` | `/` | - | 제외 | 정적 UI와 자산 |

## 2계층 Action Registry

아래 57개 action은 `audit_registry.py`가 SSOT다. 자동 경계는 handler가 정상 반환한
시점이며 write route는 그 전에 DB commit이 끝난다. `401/403=DENY`, 그 밖의
`4xx/5xx=FAIL`, `2xx/3xx=SUCCESS`다. 단 `/api/menu_auto_poll`과
`/api/schedule_imports/poll`이 HTTP 200 응답 안에 전체·부분 처리 실패를 반환하는 기존
계약은 endpoint marker가 2계층만 `FAIL`로 덮어쓴다.

| action | business_action | log_type | method / route | terminal 경계 | actor | target.type / id | outcome / 정책 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `DELETE` | `BIRTHDAY_DELETE` | `DOMAIN` | `DELETE /api/birthdays/{birthday_id}` | delete commit 후 | `USER` | `birthday / selected` | status 기반 / fail-isolated |
| `DELETE` | `EVENT_COLOR_DELETE` | `DOMAIN` | `DELETE /api/event_colors/{event_id}` | delete commit 후 | `USER` | `event_color / selected` | status 기반 / fail-isolated |
| `DELETE` | `EXECUTIVE_TASK_DELETE` | `DOMAIN` | `DELETE /api/executive_tasks/{task_id}` | delete commit 후 | `USER` | `executive_task / selected` | status 기반 / fail-isolated |
| `DELETE` | `SCHEDULE_FILE_DELETE` | `DOMAIN` | `DELETE /api/files/{folder}/{file_id}` | delete commit 후 | `USER` | `schedule_file / selected` | status 기반 / fail-isolated |
| `DELETE` | `GOAL_ACTIVITY_DELETE` | `DOMAIN` | `DELETE /api/goal_activities/{activity_id}` | delete commit 후 | `USER` | `goal_activity / selected` | status 기반 / fail-isolated |
| `DELETE` | `GOAL_DELETE` | `DOMAIN` | `DELETE /api/goals/{goal_id}` | delete commit 후 | `USER` | `goal / selected` | status 기반 / fail-isolated |
| `DELETE` | `LEAVE_PLAN_DELETE` | `DOMAIN` | `DELETE /api/leave_plans/{leave_id}` | delete commit 후 | `USER` | `leave_plan / selected` | status 기반 / fail-isolated |
| `DELETE` | `MENU_WEEK_DELETE` | `DOMAIN` | `DELETE /api/menu_weeks/{week_key}` | delete commit 후 | `USER` | `menu_week / selected` | status 기반 / fail-isolated |
| `DELETE` | `PRAISE_CARD_DELETE` | `DOMAIN` | `DELETE /api/praise_cards/{card_id}` | delete commit 후 | `USER` | `praise_card / selected` | status 기반 / fail-isolated |
| `DELETE` | `PRAISE_STICKER_DELETE` | `DOMAIN` | `DELETE /api/praise_stickers/{sticker_id}` | delete commit 후 | `USER` | `praise_sticker / selected` | status 기반 / fail-isolated |
| `DELETE` | `REQUEST_MONTH_DELETE` | `DOMAIN` | `DELETE /api/request_months/{month_key}` | delete commit 후 | `USER` | `request_month / selected` | status 기반 / fail-isolated |
| `DELETE` | `REQUEST_SCHEDULE_DELETE` | `DOMAIN` | `DELETE /api/request_schedules/{item_id}` | delete commit 후 | `USER` | `request_schedule / selected` | status 기반 / fail-isolated |
| `DELETE` | `SCHEDULE_BATCH_DELETE` | `BATCH` | `DELETE /api/schedules` | batch delete commit 후 | `USER` | `schedule / batch` | status 기반 / fail-isolated |
| `DELETE` | `SCHEDULE_DELETE` | `DOMAIN` | `DELETE /api/schedules/{schedule_id}` | delete commit 후 | `USER` | `schedule / selected` | status 기반 / fail-isolated |
| `DELETE` | `MENU_IMAGE_DELETE` | `DOMAIN` | `DELETE /api/storage/menu-images/{week_key}` | image clear commit 후 | `USER` | `menu_image / selected` | status 기반 / fail-isolated |
| `DELETE` | `REQUEST_IMAGE_DELETE` | `DOMAIN` | `DELETE /api/storage/request-images/{month_key}` | image clear commit 후 | `USER` | `request_image / selected` | status 기반 / fail-isolated |
| `READ` | `BIRTHDAY_DIRECTORY_READ` | `DATA_ACCESS` | `GET /api/birthdays` | 민감 목록 응답 확정 | `USER` | `birthday / all` | status 기반 / fail-isolated |
| `READ` | `EXECUTIVE_TASKS_READ` | `DATA_ACCESS` | `GET /api/executive_tasks` | 민감 목록 응답 확정 | `USER` | `executive_task / filtered` | status 기반 / fail-isolated |
| `READ` | `SCHEDULE_FILE_LIST_READ` | `DATA_ACCESS` | `GET /api/files/{folder}` | 파일 목록 응답 확정 | `USER` | `schedule_file / folder` | status 기반 / fail-isolated |
| `EXPORT` | `SCHEDULE_FILE_DOWNLOAD` | `DATA_ACCESS` | `GET /api/files/{folder}/{file_id}` | 파일 응답 승인·생성 후 | `USER` | `schedule_file / selected` | status 기반 / fail-isolated |
| `READ` | `GOAL_ACTIVITIES_READ` | `DATA_ACCESS` | `GET /api/goal_activities` | 민감 목록 응답 확정 | `USER` | `goal_activity / filtered` | status 기반 / fail-isolated |
| `READ` | `GOALS_READ` | `DATA_ACCESS` | `GET /api/goals` | 민감 목록 응답 확정 | `USER` | `goal / all` | status 기반 / fail-isolated |
| `READ` | `GROUP_CALENDAR_SYNC_READ` | `DATA_ACCESS` | `GET /api/group_ics_events` | 외부 캘린더 조회 완료 | `USER` | `group_calendar / current` | status 기반 / fail-isolated |
| `READ` | `LEAVE_PLANS_READ` | `DATA_ACCESS` | `GET /api/leave_plans` | 민감 목록 응답 확정 | `USER` | `leave_plan / all` | status 기반 / fail-isolated |
| `READ` | `PRAISE_CARDS_READ` | `DATA_ACCESS` | `GET /api/praise_cards` | 민감 목록 응답 확정 | `USER` | `praise_card / filtered` | status 기반 / fail-isolated |
| `READ` | `PRAISE_STICKERS_READ` | `DATA_ACCESS` | `GET /api/praise_stickers` | 민감 목록 응답 확정 | `USER` | `praise_sticker / filtered` | status 기반 / fail-isolated |
| `READ` | `SCHEDULE_IMPORTS_READ` | `DATA_ACCESS` | `GET /api/schedule_imports` | import 목록 응답 확정 | `USER` | `schedule_import / filtered` | status 기반 / fail-isolated |
| `READ` | `SCHEDULE_IMPORT_DETAIL_READ` | `DATA_ACCESS` | `GET /api/schedule_imports/{import_id}` | import 상세 응답 확정 | `USER` | `schedule_import / selected` | status 기반 / fail-isolated |
| `EXPORT` | `MENU_IMAGE_DOWNLOAD` | `DATA_ACCESS` | `GET /api/storage/menu-images/{week_key}` | 이미지 응답 생성 후 | `USER` | `menu_image / selected` | status 기반 / fail-isolated |
| `EXPORT` | `REQUEST_IMAGE_DOWNLOAD` | `DATA_ACCESS` | `GET /api/storage/request-images/{month_key}` | 이미지 응답 생성 후 | `USER` | `request_image / selected` | status 기반 / fail-isolated |
| `UPDATE` | `BIRTHDAY_UPSERT` | `DOMAIN` | `POST /api/birthdays` | upsert commit 후 | `USER` | `birthday / selected` | status 기반 / fail-isolated |
| `UPDATE` | `EVENT_COLOR_UPSERT` | `DOMAIN` | `POST /api/event_colors` | upsert commit 후 | `USER` | `event_color / selected` | status 기반 / fail-isolated |
| `CREATE` | `EXECUTIVE_TASK_CREATE` | `DOMAIN` | `POST /api/executive_tasks` | insert commit 후 | `USER` | `executive_task / created` | status 기반 / fail-isolated |
| `CREATE` | `SCHEDULE_FILE_UPLOAD` | `DOMAIN` | `POST /api/files/{folder}` | 파일 insert commit 후 | `USER` | `schedule_file / uploaded` | status 기반 / fail-isolated |
| `UPDATE` | `GOAL_ACTIVITY_UPSERT` | `DOMAIN` | `POST /api/goal_activities` | upsert commit 후 | `USER` | `goal_activity / selected` | status 기반 / fail-isolated |
| `CREATE` | `GOAL_CREATE` | `DOMAIN` | `POST /api/goals` | insert commit 후 | `USER` | `goal / created` | status 기반 / fail-isolated |
| `CREATE` | `LEAVE_PLAN_BATCH_CREATE` | `BATCH` | `POST /api/leave_plans` | batch insert commit 후 | `USER` | `leave_plan / batch` | status 기반 / fail-isolated |
| `UPDATE` | `MENU_IMAGE_AUTOMATION_UPLOAD` | `BATCH` | `POST /api/menu_auto` | credential 검증·upsert commit 후 | 검증 후 `SERVICE`, 그 외 `SYSTEM` | `menu_image / weekly` | status 기반 / fail-isolated |
| `UPDATE` | `MENU_IMAGE_AUTOMATION_B64_UPLOAD` | `BATCH` | `POST /api/menu_auto_b64` | credential 검증·upsert commit 후 | 검증 후 `SERVICE`, 그 외 `SYSTEM` | `menu_image / weekly` | status 기반 / fail-isolated |
| `UPDATE` | `MENU_IMAGE_AUTOMATION_DRIVE_UPLOAD` | `BATCH` | `POST /api/menu_auto_drive` | credential 검증·upsert commit 후 | 검증 후 `SERVICE`, 그 외 `SYSTEM` | `menu_image / weekly` | status 기반 / fail-isolated |
| `EXECUTE` | `MENU_IMAGE_SYNC_RUN` | `BATCH` | `POST /api/menu_auto_poll` | polling terminal 응답 | `SYSTEM` | `menu_image_sync / current` | endpoint override 포함 / fail-isolated |
| `UPDATE` | `MENU_WEEK_BATCH_UPSERT` | `BATCH` | `POST /api/menu_weeks/upsert` | batch upsert commit 후 | `USER` | `menu_week / batch` | status 기반 / fail-isolated |
| `CREATE` | `PRAISE_CARD_CREATE` | `DOMAIN` | `POST /api/praise_cards` | insert commit 후 | `USER` | `praise_card / created` | status 기반 / fail-isolated |
| `CREATE` | `PRAISE_STICKER_CREATE` | `DOMAIN` | `POST /api/praise_stickers` | insert commit 또는 duplicate terminal | `USER` | `praise_sticker / created` | status 기반 / fail-isolated |
| `UPDATE` | `REQUEST_MONTH_BATCH_UPSERT` | `BATCH` | `POST /api/request_months/upsert` | batch upsert commit 후 | `USER` | `request_month / batch` | status 기반 / fail-isolated |
| `UPDATE` | `REQUEST_SCHEDULE_BATCH_UPSERT` | `BATCH` | `POST /api/request_schedules/upsert` | batch upsert commit 후 | `USER` | `request_schedule / batch` | status 기반 / fail-isolated |
| `EXECUTE` | `SCHEDULE_IMPORT_SYNC_RUN` | `BATCH` | `POST /api/schedule_imports/poll` | polling/내부 적용 terminal 응답 | `SYSTEM` | `schedule_import / current` | endpoint override 포함 / fail-isolated |
| `CREATE` | `SCHEDULE_IMPORT_SUBMIT` | `BATCH` | `POST /api/schedule_imports/submit` | credential 검증·preview insert commit 후 | 검증 후 `SERVICE`, 그 외 `SYSTEM` | `schedule_import / pending` | status 기반 / fail-isolated |
| `APPROVE` | `SCHEDULE_IMPORT_APPLY` | `BATCH` | `POST /api/schedule_imports/{import_id}/apply` | 변경·상태 commit 후 | `USER` | `schedule_import / selected` | status 기반 / fail-isolated |
| `APPROVE` | `SCHEDULE_IMPORT_REJECT` | `BATCH` | `POST /api/schedule_imports/{import_id}/reject` | 반려 상태 commit 후 | `USER` | `schedule_import / selected` | status 기반 / fail-isolated |
| `DELETE` | `SCHEDULE_BATCH_DELETE_ALIAS` | `BATCH` | `POST /api/schedules/delete` | batch delete commit 후 | `USER` | `schedule / batch` | status 기반 / fail-isolated |
| `UPDATE` | `SCHEDULE_BATCH_UPSERT` | `BATCH` | `POST /api/schedules/upsert` | batch upsert commit 후 | `USER` | `schedule / batch` | status 기반 / fail-isolated |
| `UPDATE` | `MENU_IMAGE_UPSERT` | `DOMAIN` | `POST /api/storage/menu-images/{week_key}` | image upsert commit 후 | `USER` | `menu_image / selected` | status 기반 / fail-isolated |
| `UPDATE` | `REQUEST_IMAGE_UPSERT` | `DOMAIN` | `POST /api/storage/request-images/{month_key}` | image upsert commit 후 | `USER` | `request_image / selected` | status 기반 / fail-isolated |
| `UPDATE` | `EXECUTIVE_TASK_UPDATE` | `DOMAIN` | `PUT /api/executive_tasks/{task_id}` | update commit 후 | `USER` | `executive_task / selected` | status 기반 / fail-isolated |
| `UPDATE` | `GOAL_UPDATE` | `DOMAIN` | `PUT /api/goals/{goal_id}` | update commit 후 | `USER` | `goal / selected` | status 기반 / fail-isolated |
| `UPDATE` | `LEAVE_PLAN_UPDATE` | `DOMAIN` | `PUT /api/leave_plans/{leave_id}` | update commit 후 | `USER` | `leave_plan / selected` | status 기반 / fail-isolated |

## 금지 데이터와 서버 전용 경계

- request/response body, header, query, cookie, token, 외부 correlation header를 보내지 않는다.
- 동적 route 값은 `:param` template으로만 기록한다.
- target은 registry의 `all`, `selected`, `batch`, `current`, `filtered` 같은 상수뿐이다.
- `audit_sdk.py`, `audit_integration.py`, `audit_registry.py`, `usage_tracker.py`,
  `docs/`, `tests/`, dependency manifest와 서버 설정 파일은 루트 정적 mount 앞에서
  404로 차단한다.
- SDK나 앱에 Firehose/S3 write 권한을 추가하지 않는다.

## 검증·배포 체크

- [x] SDK source hash와 manifest가 일치한다.
- [x] runtime route와 1계층 registry 62개가 정확히 일치한다.
- [x] 2계층 registry 57개가 canonical/UPPER_SNAKE_CASE 계약을 만족한다.
- [x] schema 음성, PII/금지 필드, actor marker, 4xx 무재시도,
      429/5xx stable event ID 재시도와 dedup을 통과한다.
- [x] 1계층 단독 요청과 같은 요청의 1·2계층 상관관계를 통과한다.
- [x] Python import/compile, 테스트, production dependency build를 통과한다.
- [x] 플래너 재실행이 `already_applied`, 변경 0건이다.
- [ ] 운영 안전 요청과 중앙 원장·후속 전달을 확인했다.

## Rollback

감사 adapter/registry/SDK와 배포 env·Secret 참조만 되돌린다. 기존 usage 또는 업무 DB를
변경하거나 발급된 token을 임의 회수하지 않고, 이미 저장된 append-only 감사 원장은
수정·삭제하지 않는다.
