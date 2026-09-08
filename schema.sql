-- Slack Database Schema - Phase 1 and Phase 2
-- Tables: trips, bookings, dependencies, disruptions
-- RLS policies: scoped to auth.uid() matching trips.owner_id

-- Enable UUID extension if needed
create extension if not exists "pgcrypto";

-- Table: trips
create table if not exists trips (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    owner_id uuid,
    created_at timestamptz default now()
);

-- Table: bookings
create table if not exists bookings (
    id uuid primary key default gen_random_uuid(),
    trip_id uuid not null references trips(id) on delete cascade,
    type text not null check (type in ('flight', 'hotel', 'transfer', 'activity')),
    title text not null,
    vendor text,
    location text,
    start_time timestamptz not null,
    end_time timestamptz not null,
    cost numeric,
    cancellation_policy text,
    metadata jsonb default '{}'::jsonb,
    created_at timestamptz default now()
);

-- Table: dependencies
create table if not exists dependencies (
    id uuid primary key default gen_random_uuid(),
    trip_id uuid not null references trips(id) on delete cascade,
    from_booking_id uuid not null references bookings(id) on delete cascade,
    to_booking_id uuid not null references bookings(id) on delete cascade,
    min_buffer_minutes integer not null default 0,
    dependency_type text check (dependency_type in ('temporal', 'location', 'prerequisite')),
    created_at timestamptz default now()
);

-- Table: disruptions (Phase 2 addition)
create table if not exists disruptions (
    id uuid primary key default gen_random_uuid(),
    trip_id uuid not null references trips(id) on delete cascade,
    booking_id uuid not null references bookings(id) on delete cascade,
    disruption_type text not null check (disruption_type in ('delay', 'cancellation', 'weather', 'other')),
    delay_minutes integer default 0,
    description text,
    triggered_at timestamptz default now(),
    resolved boolean default false,
    resolved_at timestamptz
);

-- Table: recovery_candidates (Phase 3 addition)
create table if not exists recovery_candidates (
    id uuid primary key default gen_random_uuid(),
    disruption_id uuid not null references disruptions(id) on delete cascade,
    trip_id uuid not null references trips(id) on delete cascade,
    target_booking_id uuid not null references bookings(id) on delete cascade,
    candidate_type text not null check (candidate_type in ('rebook', 'shift', 'drop')),
    title text not null,
    description text,
    human_explanation text,
    score integer not null check (score >= 0 and score <= 100),
    cost_delta numeric not null default 0,
    time_delta_minutes integer not null default 0,
    itinerary_altered_percent numeric not null default 0,
    refund_amount numeric not null default 0,
    refund_eligible boolean not null default false,
    is_recommended boolean not null default false,
    scoring_breakdown jsonb default '{}'::jsonb,
    mutation_payload jsonb not null default '{}'::jsonb,
    created_at timestamptz default now()
);

-- Table: applied_recoveries (Phase 3 addition - audit trail)
create table if not exists applied_recoveries (
    id uuid primary key default gen_random_uuid(),
    disruption_id uuid not null references disruptions(id) on delete cascade,
    candidate_id uuid not null references recovery_candidates(id) on delete cascade,
    applied_at timestamptz default now(),
    applied_by uuid,
    previous_state jsonb not null,
    new_state jsonb not null
);

-- Enable Row Level Security (RLS)
alter table trips enable row level security;
alter table bookings enable row level security;
alter table dependencies enable row level security;
alter table disruptions enable row level security;
alter table recovery_candidates enable row level security;
alter table applied_recoveries enable row level security;

-- RLS Policies for trips
create policy "Users can view own trips"
    on trips for select
    using (auth.uid() = owner_id);

create policy "Users can insert own trips"
    on trips for insert
    with check (auth.uid() = owner_id);

create policy "Users can update own trips"
    on trips for update
    using (auth.uid() = owner_id);

create policy "Users can delete own trips"
    on trips for delete
    using (auth.uid() = owner_id);

-- RLS Policies for bookings
create policy "Users can view bookings in own trips"
    on bookings for select
    using (
        exists (
            select 1 from trips
            where trips.id = bookings.trip_id
            and trips.owner_id = auth.uid()
        )
    );

create policy "Users can insert bookings in own trips"
    on bookings for insert
    with check (
        exists (
            select 1 from trips
            where trips.id = bookings.trip_id
            and trips.owner_id = auth.uid()
        )
    );

create policy "Users can update bookings in own trips"
    on bookings for update
    using (
        exists (
            select 1 from trips
            where trips.id = bookings.trip_id
            and trips.owner_id = auth.uid()
        )
    );

create policy "Users can delete bookings in own trips"
    on bookings for delete
    using (
        exists (
            select 1 from trips
            where trips.id = bookings.trip_id
            and trips.owner_id = auth.uid()
        )
    );

-- RLS Policies for dependencies
create policy "Users can view dependencies in own trips"
    on dependencies for select
    using (
        exists (
            select 1 from trips
            where trips.id = dependencies.trip_id
            and trips.owner_id = auth.uid()
        )
    );

create policy "Users can insert dependencies in own trips"
    on dependencies for insert
    with check (
        exists (
            select 1 from trips
            where trips.id = dependencies.trip_id
            and trips.owner_id = auth.uid()
        )
    );

-- RLS Policies for disruptions (Phase 2)
create policy "Users can view disruptions in own trips"
    on disruptions for select
    using (
        exists (
            select 1 from trips
            where trips.id = disruptions.trip_id
            and trips.owner_id = auth.uid()
        )
    );

create policy "Users can insert disruptions in own trips"
    on disruptions for insert
    with check (
        exists (
            select 1 from trips
            where trips.id = disruptions.trip_id
            and trips.owner_id = auth.uid()
        )
    );

create policy "Users can update disruptions in own trips"
    on disruptions for update
    using (
        exists (
            select 1 from trips
            where trips.id = disruptions.trip_id
            and trips.owner_id = auth.uid()
        )
    );

create policy "Users can delete disruptions in own trips"
    on disruptions for delete
    using (
        exists (
            select 1 from trips
            where trips.id = disruptions.trip_id
            and trips.owner_id = auth.uid()
        )
    );

-- RLS Policies for recovery_candidates (Phase 3)
create policy "Users can view recovery candidates in own trips"
    on recovery_candidates for select
    using (
        exists (
            select 1 from trips
            where trips.id = recovery_candidates.trip_id
            and trips.owner_id = auth.uid()
        )
    );

create policy "Users can insert recovery candidates in own trips"
    on recovery_candidates for insert
    with check (
        exists (
            select 1 from trips
            where trips.id = recovery_candidates.trip_id
            and trips.owner_id = auth.uid()
        )
    );

create policy "Users can delete recovery candidates in own trips"
    on recovery_candidates for delete
    using (
        exists (
            select 1 from trips
            where trips.id = recovery_candidates.trip_id
            and trips.owner_id = auth.uid()
        )
    );

-- RLS Policies for applied_recoveries (Phase 3)
create policy "Users can view applied recoveries in own trips"
    on applied_recoveries for select
    using (
        exists (
            select 1 from disruptions
            join trips on trips.id = disruptions.trip_id
            where disruptions.id = applied_recoveries.disruption_id
            and trips.owner_id = auth.uid()
        )
    );

create policy "Users can insert applied recoveries in own trips"
    on applied_recoveries for insert
    with check (
        exists (
            select 1 from disruptions
            join trips on trips.id = disruptions.trip_id
            where disruptions.id = applied_recoveries.disruption_id
            and (trips.owner_id = auth.uid() or exists (
                select 1 from trip_members
                where trip_members.trip_id = trips.id
                and trip_members.user_id = auth.uid()
                and trip_members.role in ('owner', 'editor')
            ))
        )
    );

-- Table: trip_members (Phase 5 addition)
create table if not exists trip_members (
    id uuid primary key default gen_random_uuid(),
    trip_id uuid not null references trips(id) on delete cascade,
    user_id uuid,
    email text not null,
    name text not null,
    role text not null check (role in ('owner', 'editor', 'viewer')),
    invite_token text unique,
    joined_at timestamptz default now(),
    unique (trip_id, email)
);

-- Table: activity_feed (Phase 5 addition)
create table if not exists activity_feed (
    id uuid primary key default gen_random_uuid(),
    trip_id uuid not null references trips(id) on delete cascade,
    actor_name text not null,
    actor_email text,
    action_type text not null,
    description text not null,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz default now()
);

-- Enable RLS for Phase 5 tables
alter table trip_members enable row level security;
alter table activity_feed enable row level security;

-- RLS Policies for trip_members
create policy "Members and owners can view trip members"
    on trip_members for select
    using (
        exists (
            select 1 from trips
            where trips.id = trip_members.trip_id
            and (trips.owner_id = auth.uid() or exists (
                select 1 from trip_members tm
                where tm.trip_id = trips.id
                and tm.user_id = auth.uid()
            ))
        )
    );

create policy "Owners and editors can invite or manage trip members"
    on trip_members for insert
    with check (
        exists (
            select 1 from trips
            where trips.id = trip_members.trip_id
            and (trips.owner_id = auth.uid() or exists (
                select 1 from trip_members tm
                where tm.trip_id = trips.id
                and tm.user_id = auth.uid()
                and tm.role in ('owner', 'editor')
            ))
        )
    );

create policy "Owners can delete trip members"
    on trip_members for delete
    using (
        exists (
            select 1 from trips
            where trips.id = trip_members.trip_id
            and trips.owner_id = auth.uid()
        )
    );

-- RLS Policies for activity_feed
create policy "Members and owners can view activity feed"
    on activity_feed for select
    using (
        exists (
            select 1 from trips
            where trips.id = activity_feed.trip_id
            and (trips.owner_id = auth.uid() or exists (
                select 1 from trip_members
                where trip_members.trip_id = trips.id
                and trip_members.user_id = auth.uid()
            ))
        )
    );

create policy "Owners and editors can append activity feed"
    on activity_feed for insert
    with check (
        exists (
            select 1 from trips
            where trips.id = activity_feed.trip_id
            and (trips.owner_id = auth.uid() or exists (
                select 1 from trip_members
                where trip_members.trip_id = trips.id
                and trip_members.user_id = auth.uid()
                and trip_members.role in ('owner', 'editor')
            ))
        )
    );


