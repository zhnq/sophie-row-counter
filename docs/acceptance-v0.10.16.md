# v0.10.16 acceptance

Date: 2026-10-22.

- Applied the approved preview: HH:mm below each completed checkbox; month/day on older rows and year for older years. Full date and time available in title/aria-label.
- Fixed 44px completion column for every row. Existing row heights and last-record footer retained.
- Uses existing v0.10.15 completedAt storage; no data migration. Missing timestamps remain blank; undo removes the corresponding row time.
- Release contains no demo script or sample data.

Validation: all 281 tests passed. Browser checks on production source covered completion, undo, reload/reopen, retained older timestamps, and missing timestamps. Screenshot: acceptance-v0.10.16/01-row-time-mobile.png (390x844). At 320x568, clientWidth and scrollWidth both equal 320, and inspected timestamps fit their rows.

ZIP and standalone HTML builds passed. ZIP has exactly 9 production files, valid CRC, and contents identical to src and build. ZIP size: 66,073 bytes.

SHA256: 817bcc85ce314d729e0653b2ccf2d0cc1b378d19424a8160988efde8eba14818

Not uploaded or published. Not tested in the Xiaohongshu iOS/Android container.
