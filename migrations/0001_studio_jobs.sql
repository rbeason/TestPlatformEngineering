CREATE TABLE studio_jobs (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  prompt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'previewing', 'review', 'failed')),
  message TEXT NOT NULL DEFAULT 'Waiting for the Mac runner.',
  pr_url TEXT,
  preview_url TEXT,
  claim TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX studio_jobs_recent ON studio_jobs (created_at DESC);
CREATE UNIQUE INDEX studio_one_active ON studio_jobs ((1))
  WHERE status IN ('queued', 'running', 'previewing');
