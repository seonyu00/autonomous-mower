package com.autonomousmower.account.repository;

import com.autonomousmower.account.entity.AccountAudit;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AccountAuditRepository extends JpaRepository<AccountAudit, String> {}
