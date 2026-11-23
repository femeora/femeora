DO $$
DECLARE
  table_name text;
  fomeora_tables constant text[] := ARRAY[
    'bins',
    'callout_intents',
    'callout_updates',
    'callouts',
    'candles',
    'canonical_blocks',
    'chain_cursors',
    'follows',
    'indexer_health',
    'likes',
    'notifications',
    'oauth_states',
    'outbox_events',
    'pools',
    'position_bins',
    'position_events',
    'positions',
    'replies',
    'reports',
    'reposts',
    'sessions',
    'swaps',
    'tails',
    'user_stats',
    'users',
    'views_daily',
    'wallet_link_challenges',
    'wallets'
  ];
BEGIN
  FOREACH table_name IN ARRAY fomeora_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated', table_name);
  END LOOP;
END
$$;

REVOKE ALL PRIVILEGES ON SEQUENCE public.outbox_events_id_seq FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_fomeora_outbox_event() FROM PUBLIC, anon, authenticated;
