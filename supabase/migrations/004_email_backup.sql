alter table public.company_settings add column if not exists backup_email text;
alter table public.company_settings add column if not exists backup_email_enabled boolean not null default false;
alter table public.company_settings add column if not exists backup_email_frequency text not null default 'weekly';
alter table public.company_settings add column if not exists last_backup_email_at timestamptz;
