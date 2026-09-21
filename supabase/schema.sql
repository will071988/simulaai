-- MVP SimulaAí
create table concursos (
  id uuid primary key default gen_random_uuid(),
  orgao text not null,
  titulo text not null,
  banca text,
  vagas int,
  salario numeric,
  status text default 'previsto',
  edital_url text unique,
  prova_data date,
  created_at timestamptz default now()
);

create table questoes (
  id uuid primary key default gen_random_uuid(),
  enunciado text not null,
  alternativas jsonb not null,
  gabarito text not null,
  banca text, ano int, cargo text, tema text,
  fonte_url text,
  created_at timestamptz default now()
);

create table simulados (
  id uuid primary key default gen_random_uuid(),
  concurso_id uuid references concursos(id),
  titulo text not null,
  banca_alvo text, nivel text,
  premium bool default false,
  created_at timestamptz default now()
);

create table tentativas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  simulado_id uuid references simulados(id),
  nota numeric, respostas jsonb,
  created_at timestamptz default now()
);
