alter table strategy_companies
  add column if not exists deal_after_demo_date timestamptz;
