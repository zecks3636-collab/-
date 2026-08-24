"""BTI Schedule 감사 route/action의 append-only 레지스트리.

1계층은 모든 명시 업무 API를 method + FastAPI route template으로 열거한다.
2계층은 변경, 파일 반출, 민감 조회, 승인/반려, 외부 동기화의 terminal
결과만 기록한다. target ID는 요청값이 아닌 통제된 비식별 상수만 사용한다.
"""


def _event(action, business_action, log_type, target_type, target_id):
    return {
        "action": action,
        "business_action": business_action,
        "log_type": log_type,
        "target_type": target_type,
        "target_id": target_id,
    }


LAYER1_COVERED_ROUTES = frozenset({
    ("DELETE", "/api/birthdays/{birthday_id}"),
    ("DELETE", "/api/event_colors/{event_id}"),
    ("DELETE", "/api/executive_tasks/{task_id}"),
    ("DELETE", "/api/files/{folder}/{file_id}"),
    ("DELETE", "/api/goal_activities/{activity_id}"),
    ("DELETE", "/api/goals/{goal_id}"),
    ("DELETE", "/api/leave_plans/{leave_id}"),
    ("DELETE", "/api/menu_weeks/{week_key}"),
    ("DELETE", "/api/praise_cards/{card_id}"),
    ("DELETE", "/api/praise_stickers/{sticker_id}"),
    ("DELETE", "/api/request_months/{month_key}"),
    ("DELETE", "/api/request_schedules/{item_id}"),
    ("DELETE", "/api/schedules"),
    ("DELETE", "/api/schedules/{schedule_id}"),
    ("DELETE", "/api/storage/menu-images/{week_key}"),
    ("DELETE", "/api/storage/request-images/{month_key}"),
    ("GET", "/api/birthdays"),
    ("GET", "/api/event_colors"),
    ("GET", "/api/executive_tasks"),
    ("GET", "/api/files/{folder}"),
    ("GET", "/api/files/{folder}/{file_id}"),
    ("GET", "/api/goal_activities"),
    ("GET", "/api/goals"),
    ("GET", "/api/group_ics_events"),
    ("GET", "/api/leave_plans"),
    ("GET", "/api/menu_weeks"),
    ("GET", "/api/praise_cards"),
    ("GET", "/api/praise_stickers"),
    ("GET", "/api/request_months"),
    ("GET", "/api/request_schedules"),
    ("GET", "/api/schedule_imports"),
    ("GET", "/api/schedule_imports/{import_id}"),
    ("GET", "/api/schedules"),
    ("GET", "/api/storage/menu-images/{week_key}"),
    ("GET", "/api/storage/request-images/{month_key}"),
    ("POST", "/api/birthdays"),
    ("POST", "/api/event_colors"),
    ("POST", "/api/executive_tasks"),
    ("POST", "/api/files/{folder}"),
    ("POST", "/api/goal_activities"),
    ("POST", "/api/goals"),
    ("POST", "/api/leave_plans"),
    ("POST", "/api/menu_auto"),
    ("POST", "/api/menu_auto_b64"),
    ("POST", "/api/menu_auto_drive"),
    ("POST", "/api/menu_auto_poll"),
    ("POST", "/api/menu_weeks/upsert"),
    ("POST", "/api/praise_cards"),
    ("POST", "/api/praise_stickers"),
    ("POST", "/api/request_months/upsert"),
    ("POST", "/api/request_schedules/upsert"),
    ("POST", "/api/schedule_imports/poll"),
    ("POST", "/api/schedule_imports/submit"),
    ("POST", "/api/schedule_imports/{import_id}/apply"),
    ("POST", "/api/schedule_imports/{import_id}/reject"),
    ("POST", "/api/schedules/delete"),
    ("POST", "/api/schedules/upsert"),
    ("POST", "/api/storage/menu-images/{week_key}"),
    ("POST", "/api/storage/request-images/{month_key}"),
    ("PUT", "/api/executive_tasks/{task_id}"),
    ("PUT", "/api/goals/{goal_id}"),
    ("PUT", "/api/leave_plans/{leave_id}"),
})


LAYER1_EXCLUDED_ROUTES = {
    ("GET", "/openapi.json"): "FastAPI 자동 명세",
    ("GET", "/docs"): "FastAPI 자동 문서",
    ("GET", "/docs/oauth2-redirect"): "FastAPI 자동 문서 callback",
    ("GET", "/redoc"): "FastAPI 자동 문서",
    ("MOUNT", "/"): "정적 UI와 자산",
}


# routine 조회 다섯 건은 1계층만 남긴다. 나머지는 아래 실제 업무 경계에서
# 정확히 한 번의 2계층 사건을 추가한다.
AUTO_LAYER2_ROUTE_ACTIONS = {
    ("DELETE", "/api/birthdays/{birthday_id}"): _event(
        "DELETE", "BIRTHDAY_DELETE", "DOMAIN", "birthday", "selected"
    ),
    ("DELETE", "/api/event_colors/{event_id}"): _event(
        "DELETE", "EVENT_COLOR_DELETE", "DOMAIN", "event_color", "selected"
    ),
    ("DELETE", "/api/executive_tasks/{task_id}"): _event(
        "DELETE", "EXECUTIVE_TASK_DELETE", "DOMAIN", "executive_task", "selected"
    ),
    ("DELETE", "/api/files/{folder}/{file_id}"): _event(
        "DELETE", "SCHEDULE_FILE_DELETE", "DOMAIN", "schedule_file", "selected"
    ),
    ("DELETE", "/api/goal_activities/{activity_id}"): _event(
        "DELETE", "GOAL_ACTIVITY_DELETE", "DOMAIN", "goal_activity", "selected"
    ),
    ("DELETE", "/api/goals/{goal_id}"): _event(
        "DELETE", "GOAL_DELETE", "DOMAIN", "goal", "selected"
    ),
    ("DELETE", "/api/leave_plans/{leave_id}"): _event(
        "DELETE", "LEAVE_PLAN_DELETE", "DOMAIN", "leave_plan", "selected"
    ),
    ("DELETE", "/api/menu_weeks/{week_key}"): _event(
        "DELETE", "MENU_WEEK_DELETE", "DOMAIN", "menu_week", "selected"
    ),
    ("DELETE", "/api/praise_cards/{card_id}"): _event(
        "DELETE", "PRAISE_CARD_DELETE", "DOMAIN", "praise_card", "selected"
    ),
    ("DELETE", "/api/praise_stickers/{sticker_id}"): _event(
        "DELETE", "PRAISE_STICKER_DELETE", "DOMAIN", "praise_sticker", "selected"
    ),
    ("DELETE", "/api/request_months/{month_key}"): _event(
        "DELETE", "REQUEST_MONTH_DELETE", "DOMAIN", "request_month", "selected"
    ),
    ("DELETE", "/api/request_schedules/{item_id}"): _event(
        "DELETE", "REQUEST_SCHEDULE_DELETE", "DOMAIN", "request_schedule", "selected"
    ),
    ("DELETE", "/api/schedules"): _event(
        "DELETE", "SCHEDULE_BATCH_DELETE", "BATCH", "schedule", "batch"
    ),
    ("DELETE", "/api/schedules/{schedule_id}"): _event(
        "DELETE", "SCHEDULE_DELETE", "DOMAIN", "schedule", "selected"
    ),
    ("DELETE", "/api/storage/menu-images/{week_key}"): _event(
        "DELETE", "MENU_IMAGE_DELETE", "DOMAIN", "menu_image", "selected"
    ),
    ("DELETE", "/api/storage/request-images/{month_key}"): _event(
        "DELETE", "REQUEST_IMAGE_DELETE", "DOMAIN", "request_image", "selected"
    ),
    ("GET", "/api/birthdays"): _event(
        "READ", "BIRTHDAY_DIRECTORY_READ", "DATA_ACCESS", "birthday", "all"
    ),
    ("GET", "/api/executive_tasks"): _event(
        "READ", "EXECUTIVE_TASKS_READ", "DATA_ACCESS", "executive_task", "filtered"
    ),
    ("GET", "/api/files/{folder}"): _event(
        "READ", "SCHEDULE_FILE_LIST_READ", "DATA_ACCESS", "schedule_file", "folder"
    ),
    ("GET", "/api/files/{folder}/{file_id}"): _event(
        "DOWNLOAD", "SCHEDULE_FILE_DOWNLOAD", "DATA_ACCESS", "schedule_file", "selected"
    ),
    ("GET", "/api/goal_activities"): _event(
        "READ", "GOAL_ACTIVITIES_READ", "DATA_ACCESS", "goal_activity", "filtered"
    ),
    ("GET", "/api/goals"): _event(
        "READ", "GOALS_READ", "DATA_ACCESS", "goal", "all"
    ),
    ("GET", "/api/group_ics_events"): _event(
        "READ", "GROUP_CALENDAR_SYNC_READ", "DATA_ACCESS", "group_calendar", "current"
    ),
    ("GET", "/api/leave_plans"): _event(
        "READ", "LEAVE_PLANS_READ", "DATA_ACCESS", "leave_plan", "all"
    ),
    ("GET", "/api/praise_cards"): _event(
        "READ", "PRAISE_CARDS_READ", "DATA_ACCESS", "praise_card", "filtered"
    ),
    ("GET", "/api/praise_stickers"): _event(
        "READ", "PRAISE_STICKERS_READ", "DATA_ACCESS", "praise_sticker", "filtered"
    ),
    ("GET", "/api/schedule_imports"): _event(
        "READ", "SCHEDULE_IMPORTS_READ", "DATA_ACCESS", "schedule_import", "filtered"
    ),
    ("GET", "/api/schedule_imports/{import_id}"): _event(
        "READ", "SCHEDULE_IMPORT_DETAIL_READ", "DATA_ACCESS", "schedule_import", "selected"
    ),
    ("GET", "/api/storage/menu-images/{week_key}"): _event(
        "DOWNLOAD", "MENU_IMAGE_DOWNLOAD", "DATA_ACCESS", "menu_image", "selected"
    ),
    ("GET", "/api/storage/request-images/{month_key}"): _event(
        "DOWNLOAD", "REQUEST_IMAGE_DOWNLOAD", "DATA_ACCESS", "request_image", "selected"
    ),
    ("POST", "/api/birthdays"): _event(
        "UPDATE", "BIRTHDAY_UPSERT", "DOMAIN", "birthday", "selected"
    ),
    ("POST", "/api/event_colors"): _event(
        "UPDATE", "EVENT_COLOR_UPSERT", "DOMAIN", "event_color", "selected"
    ),
    ("POST", "/api/executive_tasks"): _event(
        "CREATE", "EXECUTIVE_TASK_CREATE", "DOMAIN", "executive_task", "created"
    ),
    ("POST", "/api/files/{folder}"): _event(
        "CREATE", "SCHEDULE_FILE_UPLOAD", "DOMAIN", "schedule_file", "uploaded"
    ),
    ("POST", "/api/goal_activities"): _event(
        "UPDATE", "GOAL_ACTIVITY_UPSERT", "DOMAIN", "goal_activity", "selected"
    ),
    ("POST", "/api/goals"): _event(
        "CREATE", "GOAL_CREATE", "DOMAIN", "goal", "created"
    ),
    ("POST", "/api/leave_plans"): _event(
        "CREATE", "LEAVE_PLAN_BATCH_CREATE", "BATCH", "leave_plan", "batch"
    ),
    ("POST", "/api/menu_auto"): _event(
        "UPDATE", "MENU_IMAGE_AUTOMATION_UPLOAD", "BATCH", "menu_image", "weekly"
    ),
    ("POST", "/api/menu_auto_b64"): _event(
        "UPDATE", "MENU_IMAGE_AUTOMATION_B64_UPLOAD", "BATCH", "menu_image", "weekly"
    ),
    ("POST", "/api/menu_auto_drive"): _event(
        "UPDATE", "MENU_IMAGE_AUTOMATION_DRIVE_UPLOAD", "BATCH", "menu_image", "weekly"
    ),
    ("POST", "/api/menu_auto_poll"): _event(
        "EXECUTE", "MENU_IMAGE_SYNC_RUN", "BATCH", "menu_image_sync", "current"
    ),
    ("POST", "/api/menu_weeks/upsert"): _event(
        "UPDATE", "MENU_WEEK_BATCH_UPSERT", "BATCH", "menu_week", "batch"
    ),
    ("POST", "/api/praise_cards"): _event(
        "CREATE", "PRAISE_CARD_CREATE", "DOMAIN", "praise_card", "created"
    ),
    ("POST", "/api/praise_stickers"): _event(
        "CREATE", "PRAISE_STICKER_CREATE", "DOMAIN", "praise_sticker", "created"
    ),
    ("POST", "/api/request_months/upsert"): _event(
        "UPDATE", "REQUEST_MONTH_BATCH_UPSERT", "BATCH", "request_month", "batch"
    ),
    ("POST", "/api/request_schedules/upsert"): _event(
        "UPDATE", "REQUEST_SCHEDULE_BATCH_UPSERT", "BATCH", "request_schedule", "batch"
    ),
    ("POST", "/api/schedule_imports/poll"): _event(
        "EXECUTE", "SCHEDULE_IMPORT_SYNC_RUN", "BATCH", "schedule_import", "current"
    ),
    ("POST", "/api/schedule_imports/submit"): _event(
        "CREATE", "SCHEDULE_IMPORT_SUBMIT", "BATCH", "schedule_import", "pending"
    ),
    ("POST", "/api/schedule_imports/{import_id}/apply"): _event(
        "APPROVE", "SCHEDULE_IMPORT_APPLY", "BATCH", "schedule_import", "selected"
    ),
    ("POST", "/api/schedule_imports/{import_id}/reject"): _event(
        "APPROVE", "SCHEDULE_IMPORT_REJECT", "BATCH", "schedule_import", "selected"
    ),
    ("POST", "/api/schedules/delete"): _event(
        "DELETE", "SCHEDULE_BATCH_DELETE_ALIAS", "BATCH", "schedule", "batch"
    ),
    ("POST", "/api/schedules/upsert"): _event(
        "UPDATE", "SCHEDULE_BATCH_UPSERT", "BATCH", "schedule", "batch"
    ),
    ("POST", "/api/storage/menu-images/{week_key}"): _event(
        "UPDATE", "MENU_IMAGE_UPSERT", "DOMAIN", "menu_image", "selected"
    ),
    ("POST", "/api/storage/request-images/{month_key}"): _event(
        "UPDATE", "REQUEST_IMAGE_UPSERT", "DOMAIN", "request_image", "selected"
    ),
    ("PUT", "/api/executive_tasks/{task_id}"): _event(
        "UPDATE", "EXECUTIVE_TASK_UPDATE", "DOMAIN", "executive_task", "selected"
    ),
    ("PUT", "/api/goals/{goal_id}"): _event(
        "UPDATE", "GOAL_UPDATE", "DOMAIN", "goal", "selected"
    ),
    ("PUT", "/api/leave_plans/{leave_id}"): _event(
        "UPDATE", "LEAVE_PLAN_UPDATE", "DOMAIN", "leave_plan", "selected"
    ),
}


LAYER2_ROUTE_ACTIONS = dict(AUTO_LAYER2_ROUTE_ACTIONS)
