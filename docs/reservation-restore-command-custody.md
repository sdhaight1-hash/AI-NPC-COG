# Active finite-lot custody across v3 checkpoints

This narrows #26's reservation restore contract without changing any material production or world effect kernel.

A saved `ACTIVE` material claim is only reinstalled when the named living actor has the **same live task or an actually suspended activity** with that command ID and the exact reservation token in its saved `reservationIds`. A non-private lot must also refer to the task/activity's actual target, and an NPC-inventory lot must refer to its owner. Invalid/duplicate claim-token IDs, impossible acquisition/expiry times, overlong leases and physically overclaimed quantities are rejected without reducing real stock.

The existing `WorldRuntime.begin` and `WorldReceipts.execute` still validate available material and completed effects. Expired suspended claims are discarded and restarted from fresh legal commands. No held lot is consumed or refunded merely by restoration.

The tests cover genuine live task claims, orphaned claims, a claim made to look like it belongs to a different command, duplicate tokens, foreign resource retargeting, a nine-minute interrupted physical project, and resumed work with only one final structure and exact input debits.

**Limitations:** the current saved task records token identities rather than a cryptographic inventory-lot digest. This validates custody and exclusivity, not the full provenance of every numeric legacy inventory unit or every possible forged quantity in client-controlled save data. Longer-term dedicated item lots and hauling custody remain in #26.
