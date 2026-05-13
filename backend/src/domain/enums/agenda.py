from enum import Enum

class CalendarProvider(str, Enum):
    INTERNAL = "internal"
    GOOGLE = "google"

class MeetingProvider(str, Enum):
    NONE = "none"
    GOOGLE_MEET = "google_meet"
    MANUAL = "manual"

class CalendarSyncStatus(str, Enum):
    NOT_SYNCED = "not_synced"
    PENDING = "pending"
    SYNCED = "synced"
    FAILED = "failed"
    CANCELLED = "cancelled"
