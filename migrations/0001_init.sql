CREATE TABLE routes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  origin_name TEXT NOT NULL,
  destination_name TEXT NOT NULL,
  total_m REAL NOT NULL,
  points TEXT NOT NULL,
  cum_m TEXT NOT NULL,
  progress_m REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'finished', 'cancelled')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT
);
CREATE UNIQUE INDEX one_active_route ON routes(status) WHERE status = 'active';

CREATE TABLE moves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  route_id INTEGER NOT NULL REFERENCES routes(id),
  move_date TEXT NOT NULL,
  km REAL NOT NULL,
  from_m REAL NOT NULL,
  to_m REAL NOT NULL,
  place_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(route_id, move_date)
);

CREATE TABLE logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  route_id INTEGER NOT NULL REFERENCES routes(id),
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  kcal REAL NOT NULL,
  km REAL NOT NULL,
  capped INTEGER NOT NULL DEFAULT 0,
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  applied_move_id INTEGER REFERENCES moves(id)
);
CREATE INDEX logs_route ON logs(route_id, applied_move_id);
CREATE INDEX logs_user ON logs(user_id);
