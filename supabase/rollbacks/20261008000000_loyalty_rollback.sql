-- Rollback for 20261008000000_loyalty.sql
-- Removes the loyalty rule and the rewards not yet turned into tokens. Tokens already
-- credited as rewards stay in the wallets and in the ledger ("Loyalty reward").
alter table public.reservation_players drop column if exists loyalty_earned;
alter table public.users drop column if exists loyalty_balance;
alter table public.club_settings
  drop column if exists loyalty_enabled,
  drop column if exists loyalty_spend_tokens,
  drop column if exists loyalty_reward_tokens;
