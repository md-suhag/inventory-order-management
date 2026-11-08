-- Runs once when the postgres volume is first initialised.
-- Separate database for the integration test suite (wiped on every test run).
CREATE DATABASE inventory_test OWNER inventory;
