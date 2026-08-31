-- Chat history persistence
-- Stores individual messages in a consultation session

create table if not exists public.chat_messages (
    id uuid primary key default gen_random_uuid(),
    session_id uuid not null,
    user_id uuid not null references auth.users(id) on delete cascade,
    role text not null check (role in ('user', 'assistant')),
    content text not null,
    recommendations jsonb default '[]',
    created_at timestamptz default now() not null
);

create index if not exists chat_messages_user_session_idx
    on public.chat_messages (user_id, session_id, created_at);

alter table public.chat_messages enable row level security;

create policy "Users can only read their own chat messages"
    on public.chat_messages
    for select
    using (auth.uid() = user_id);

create policy "Users can only insert their own chat messages"
    on public.chat_messages
    for insert
    with check (auth.uid() = user_id);

create policy "Users can only delete their own chat messages"
    on public.chat_messages
    for delete
    using (auth.uid() = user_id);

-- Phân quyền truy cập bảng chat_messages
grant all on public.chat_messages to postgres, service_role;
grant select, insert, update, delete on public.chat_messages to authenticated;
grant select, insert, update, delete on public.chat_messages to anon;
