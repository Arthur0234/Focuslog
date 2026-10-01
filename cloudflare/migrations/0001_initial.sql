CREATE TABLE devices (
  device_id TEXT PRIMARY KEY,
  push_to_start_token TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE activities (
  notion_page_id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('starting', 'active', 'ending', 'ended', 'failed')),
  activity_push_token TEXT,
  notion_edited_at TEXT,
  started_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (device_id) REFERENCES devices(device_id)
);

CREATE TABLE processed_events (
  event_id TEXT PRIMARY KEY,
  notion_page_id TEXT,
  received_at INTEGER NOT NULL
);

CREATE INDEX idx_activities_device_id ON activities(device_id);
