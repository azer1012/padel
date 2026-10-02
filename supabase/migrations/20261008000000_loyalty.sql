-- ============================================================================
-- Fidélité: members earn reward tokens when they pay a booking with tokens.
--
-- The club sets the rule in Réglages: "every N tokens spent earn R tokens", for
-- example 1 token spent → 0.1 token. Token balances are whole numbers (the ledger
-- stays as it is), so the fractions add up in users.loyalty_balance and each time
-- they reach a whole token, that token is credited to the wallet through the ledger.
--
--   club_settings.loyalty_*          the switch and the rule (off by default)
--   users.loyalty_balance            reward earned and not yet turned into a token.
--                                    It can go below zero: a booking refunded after
--                                    its reward became a token is owed back, and the
--                                    next rewards fill that first.
--   reservation_players.loyalty_earned  what a paid spot earned, so a refund takes
--                                    back exactly that
--
-- Additive: new columns with defaults. No existing value changes.
-- Rollback: supabase/rollbacks/20261008000000_loyalty_rollback.sql
-- ============================================================================
alter table public.club_settings
  add column if not exists loyalty_enabled boolean not null default false,
  add column if not exists loyalty_spend_tokens integer not null default 1,
  add column if not exists loyalty_reward_tokens numeric(6, 2) not null default 0.1;

do $$ begin
  alter table public.club_settings add constraint club_settings_loyalty_spend_check
    check (loyalty_spend_tokens between 1 and 1000);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.club_settings add constraint club_settings_loyalty_reward_check
    check (loyalty_reward_tokens > 0 and loyalty_reward_tokens <= 100);
exception when duplicate_object then null; end $$;

alter table public.users
  add column if not exists loyalty_balance numeric(10, 2) not null default 0;

alter table public.reservation_players
  add column if not exists loyalty_earned numeric(10, 2) not null default 0;
do $$ begin
  alter table public.reservation_players add constraint reservation_players_loyalty_earned_check
    check (loyalty_earned >= 0);
exception when duplicate_object then null; end $$;
