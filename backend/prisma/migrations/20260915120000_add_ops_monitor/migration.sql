-- DAX-HULP ops inventory, probe logs and prepared alerts.

IF OBJECT_ID('dbo.ops_targets', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.ops_targets (
        target_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ops_targets PRIMARY KEY,
        target_key NVARCHAR(80) NOT NULL,
        display_name NVARCHAR(150) NOT NULL,
        product_family NVARCHAR(50) NOT NULL,
        component_kind NVARCHAR(30) NOT NULL,
        environment NVARCHAR(30) NOT NULL,
        owner_app NVARCHAR(50) NOT NULL,
        origin NVARCHAR(30) NOT NULL CONSTRAINT DF_ops_targets_origin DEFAULT ('daxhulp'),
        probe_mode NVARCHAR(30) NOT NULL,
        base_url_env_var NVARCHAR(100) NULL,
        health_path NVARCHAR(200) NOT NULL CONSTRAINT DF_ops_targets_health_path DEFAULT ('/api/dax-ops/health'),
        auth_env_var NVARCHAR(100) NULL,
        vercel_project_id NVARCHAR(80) NULL,
        region NVARCHAR(40) NULL,
        requires_vpn BIT NOT NULL CONSTRAINT DF_ops_targets_vpn DEFAULT (0),
        check_interval_sec INT NOT NULL CONSTRAINT DF_ops_targets_interval DEFAULT (60),
        timeout_ms INT NOT NULL CONSTRAINT DF_ops_targets_timeout DEFAULT (15000),
        is_active BIT NOT NULL CONSTRAINT DF_ops_targets_active DEFAULT (1),
        agent_installed BIT NOT NULL CONSTRAINT DF_ops_targets_agent DEFAULT (0),
        alert_on_offline BIT NOT NULL CONSTRAINT DF_ops_targets_alert_off DEFAULT (1),
        alert_on_degraded BIT NOT NULL CONSTRAINT DF_ops_targets_alert_deg DEFAULT (1),
        cpu_warn_percent INT NOT NULL CONSTRAINT DF_ops_targets_cpu DEFAULT (90),
        mem_warn_percent INT NOT NULL CONSTRAINT DF_ops_targets_mem DEFAULT (90),
        disk_warn_percent INT NOT NULL CONSTRAINT DF_ops_targets_disk DEFAULT (90),
        notes NVARCHAR(500) NULL,
        last_status NVARCHAR(30) NULL,
        last_checked_at DATETIME2 NULL,
        last_error NVARCHAR(500) NULL,
        last_latency_ms INT NULL,
        last_app_version NVARCHAR(50) NULL,
        last_git_sha NVARCHAR(40) NULL,
        last_node_version NVARCHAR(30) NULL,
        last_hostname NVARCHAR(120) NULL,
        last_region NVARCHAR(40) NULL,
        last_cpu_percent FLOAT NULL,
        last_mem_used_pct FLOAT NULL,
        last_disk_used_pct FLOAT NULL,
        last_payload_json NVARCHAR(MAX) NULL,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_ops_targets_created DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2 NOT NULL CONSTRAINT DF_ops_targets_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT UQ_ops_targets_key UNIQUE (target_key)
    );
END
GO

IF OBJECT_ID('dbo.ops_health_logs', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.ops_health_logs (
        log_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ops_health_logs PRIMARY KEY,
        target_id INT NOT NULL,
        checked_at DATETIME2 NOT NULL CONSTRAINT DF_ops_health_logs_checked DEFAULT (SYSUTCDATETIME()),
        status NVARCHAR(30) NOT NULL,
        latency_ms INT NULL,
        http_status INT NULL,
        error NVARCHAR(500) NULL,
        app_version NVARCHAR(50) NULL,
        git_sha NVARCHAR(40) NULL,
        node_version NVARCHAR(30) NULL,
        hostname NVARCHAR(120) NULL,
        region NVARCHAR(40) NULL,
        cpu_percent FLOAT NULL,
        mem_used_percent FLOAT NULL,
        disk_used_percent FLOAT NULL,
        db_online BIT NULL,
        db_latency_ms INT NULL,
        vercel_env NVARCHAR(30) NULL,
        source_module NVARCHAR(40) NOT NULL CONSTRAINT DF_ops_health_logs_source DEFAULT ('daxhulp-poller'),
        payload_json NVARCHAR(MAX) NULL,
        alert_triggered BIT NOT NULL CONSTRAINT DF_ops_health_logs_alert DEFAULT (0),
        CONSTRAINT FK_ops_health_logs_target FOREIGN KEY (target_id)
            REFERENCES dbo.ops_targets(target_id) ON DELETE CASCADE
    );
    CREATE INDEX IX_ops_health_logs_target_checked ON dbo.ops_health_logs (target_id, checked_at);
    CREATE INDEX IX_ops_health_logs_status_checked ON dbo.ops_health_logs (status, checked_at);
END
GO

IF OBJECT_ID('dbo.ops_alert_events', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.ops_alert_events (
        event_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ops_alert_events PRIMARY KEY,
        target_id INT NOT NULL,
        triggered_at DATETIME2 NOT NULL CONSTRAINT DF_ops_alert_events_triggered DEFAULT (SYSUTCDATETIME()),
        severity NVARCHAR(20) NOT NULL,
        kind NVARCHAR(30) NOT NULL,
        message NVARCHAR(500) NOT NULL,
        from_status NVARCHAR(30) NULL,
        to_status NVARCHAR(30) NULL,
        acknowledged_at DATETIME2 NULL,
        notification_status NVARCHAR(20) NOT NULL CONSTRAINT DF_ops_alert_events_notif DEFAULT ('pending'),
        channel NVARCHAR(30) NULL,
        notification_error NVARCHAR(300) NULL,
        CONSTRAINT FK_ops_alert_events_target FOREIGN KEY (target_id)
            REFERENCES dbo.ops_targets(target_id) ON DELETE CASCADE
    );
    CREATE INDEX IX_ops_alert_events_target ON dbo.ops_alert_events (target_id, triggered_at);
    CREATE INDEX IX_ops_alert_events_status ON dbo.ops_alert_events (notification_status);
END
GO
