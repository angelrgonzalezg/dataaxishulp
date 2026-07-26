-- Additive: schema dialect profile for multi-island support.
-- kadaster = Statia/Saba (and current Bonaire fallback)
-- tereno   = DLV Aruba
-- bonaire  = reserved for Bonaire-specific diffs (kadaster-like until verified)

IF COL_LENGTH('dbo.system_connections', 'dialect') IS NULL
BEGIN
    ALTER TABLE dbo.system_connections
    ADD dialect nvarchar(30) NOT NULL
        CONSTRAINT DF_system_connections_dialect DEFAULT ('kadaster');
END
GO

UPDATE dbo.system_connections
SET dialect = CASE
    WHEN LOWER(system_key) LIKE 'dlv_%'
      OR LOWER(system_key) LIKE '%tereno%'
      OR LOWER(system_key) LIKE '%aruba%' THEN 'tereno'
    WHEN LOWER(system_key) LIKE '%bonaire%' THEN 'bonaire'
    ELSE 'kadaster'
END;
GO
