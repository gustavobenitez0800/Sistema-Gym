-- Create table for Members
create table members (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  first_name text not null,
  last_name text not null,
  contact text,
  active boolean default true
);

-- Create table for Payments
create table payments (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  member_id uuid references members(id) on delete cascade not null,
  month_year text not null, -- Format: '2026-01', '2026-02'
  amount numeric not null
);

-- Enable Row Level Security (RLS)
alter table members enable row level security;
alter table payments enable row level security;

-- Create Policies to allow access only to authenticated users
create policy "Enable all for authenticated users" on members
  for all using (auth.role() = 'authenticated');

create policy "Enable all for authenticated users" on payments
  for all using (auth.role() = 'authenticated');
