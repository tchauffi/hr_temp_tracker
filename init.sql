-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Raw readings table
CREATE TABLE IF NOT EXISTS readings (
    time        TIMESTAMPTZ      NOT NULL,
    temperature DOUBLE PRECISION NOT NULL,
    humidity    DOUBLE PRECISION NOT NULL
);

-- Convert to a hypertable (partitioned by time)
SELECT create_hypertable('readings', 'time', if_not_exists => TRUE);

-- Speed up latest-reading queries
CREATE INDEX IF NOT EXISTS readings_time_desc ON readings (time DESC);
