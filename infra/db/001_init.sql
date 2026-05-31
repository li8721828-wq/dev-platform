create table if not exists projects (
  id text primary key,
  name text not null,
  description text not null default '',
  status text not null default 'created',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists workflow_runs (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  current_stage text not null,
  status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists requirement_analyses (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  workflow_id text references workflow_runs(id) on delete set null,
  requirement_text text not null,
  questions jsonb not null,
  reflection jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_projects_updated_at on projects(updated_at desc);
create index if not exists idx_workflow_runs_project on workflow_runs(project_id);
create index if not exists idx_requirement_analyses_project on requirement_analyses(project_id);
