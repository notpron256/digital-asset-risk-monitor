-- Amount was never a scoring input — only address drives the risk score and
-- sanctions check. Displaying/collecting it implied it mattered when it
-- didn't, so it's removed entirely rather than just hidden in the UI.
ALTER TABLE transactions DROP COLUMN IF EXISTS amount;
