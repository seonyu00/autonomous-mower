package com.autonomousmower.account.service;

import com.autonomousmower.account.dto.AccountRequests;
import com.autonomousmower.account.dto.AccountResponses;
import com.autonomousmower.account.entity.AccountAudit;
import com.autonomousmower.account.repository.AccountAuditRepository;
import com.autonomousmower.auth.entity.Admin;
import com.autonomousmower.auth.repository.AdminRepository;
import com.autonomousmower.auth.security.AccountSessionCoordinator;
import com.autonomousmower.auth.security.RoleName;
import com.autonomousmower.auth.security.SecurityUser;
import com.autonomousmower.common.exception.BusinessException;
import com.autonomousmower.common.exception.ErrorCode;
import com.autonomousmower.control.model.ControlStateStore;
import com.autonomousmower.realtime.security.AccountWebSocketSessions;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.function.Function;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Service
public class AccountService {
    private final AdminRepository admins;
    private final AccountAuditRepository audits;
    private final PasswordEncoder passwords;
    private final JdbcTemplate jdbc;
    private final TransactionTemplate transaction;
    private final AccountSessionCoordinator coordinator;
    private final ControlStateStore controls;
    private final AccountWebSocketSessions sessions;

    public AccountService(AdminRepository admins, AccountAuditRepository audits, PasswordEncoder passwords,
                          JdbcTemplate jdbc, PlatformTransactionManager transactions,
                          AccountSessionCoordinator coordinator, ControlStateStore controls, AccountWebSocketSessions sessions) {
        this.admins = admins; this.audits = audits; this.passwords = passwords; this.jdbc = jdbc;
        this.transaction = new TransactionTemplate(transactions);
        this.coordinator = coordinator; this.controls = controls; this.sessions = sessions;
    }

    public AccountResponses.Page<AccountResponses.Account> list(String search, int page, int size) {
        var result = admins.findByAdminIdContainingIgnoreCase(search, PageRequest.of(page, size, Sort.by("adminId")));
        return new AccountResponses.Page<>(result.map(AccountResponses.Account::from).getContent(), page, size,
                result.getTotalElements(), result.getTotalPages());
    }

    public AccountResponses.Account get(String id) {
        return AccountResponses.Account.from(admins.findById(id).orElseThrow(() -> new BusinessException(ErrorCode.ACCOUNT_NOT_FOUND)));
    }

    public AccountResponses.Page<AccountResponses.Audit> audit(int page, int size) {
        var result = audits.findAll(PageRequest.of(page, size, Sort.by(Sort.Order.desc("occurredAt"), Sort.Order.asc("id"))));
        return new AccountResponses.Page<>(result.map(AccountResponses.Audit::from).getContent(), page, size,
                result.getTotalElements(), result.getTotalPages());
    }

    public AccountResponses.Account create(AccountRequests.Create request, SecurityUser user) {
        validatePassword(request.temporaryPassword());
        return mutate(user, true, actor -> {
            if (admins.existsById(request.adminId())) throw new BusinessException(ErrorCode.ACCOUNT_DUPLICATE);
            LocalDateTime now = now();
            String hash = passwords.encode(request.temporaryPassword());
            Admin target = new Admin(request.adminId(), hash, request.role(), now);
            target.changePassword(hash, true, now);
            admins.saveAndFlush(target);
            audits.save(new AccountAudit(actor.getAdminId(), target.getAdminId(), "created", null, request.role(), null, true, now));
            return AccountResponses.Account.from(target);
        });
    }

    public AccountResponses.Account update(String id, AccountRequests.Update request, SecurityUser user) {
        return mutate(user, true, actor -> {
            Admin target = target(id, request.expectedVersion());
            String previousRole = RoleName.fromValue(target.getRole()).getValue();
            if (previousRole.equals(request.role()) && target.isEnabled() == request.enabled()) {
                return AccountResponses.Account.from(target);
            }
            requireNoControl(id);
            if (target.isEnabled() && previousRole.equals("admin") && (!request.enabled() || !request.role().equals("admin"))
                    && admins.countActiveAdmins() <= 1) throw new BusinessException(ErrorCode.ACCOUNT_LAST_ADMIN);
            if (id.equals(actor.getAdminId()) && (!request.enabled() || !request.role().equals("admin"))) {
                throw new BusinessException(ErrorCode.ACCOUNT_SELF_CHANGE);
            }
            boolean previousEnabled = target.isEnabled();
            target.changeAccess(request.role(), request.enabled(), now());
            admins.flush();
            audits.save(new AccountAudit(actor.getAdminId(), id, "access-changed", previousRole, request.role(),
                    previousEnabled, request.enabled(), now()));
            revokeAfterCommit(id);
            return AccountResponses.Account.from(target);
        });
    }

    public AccountResponses.Account resetPassword(String id, AccountRequests.ResetPassword request, SecurityUser user) {
        validatePassword(request.temporaryPassword());
        return mutate(user, true, actor -> {
            verifyPassword(request.currentPassword(), actor);
            Admin target = target(id, request.expectedVersion());
            requireNoControl(id);
            target.changePassword(passwords.encode(request.temporaryPassword()), true, now());
            admins.flush();
            auditPassword(actor, target, "password-reset");
            revokeAfterCommit(id);
            return AccountResponses.Account.from(target);
        });
    }

    public AccountResponses.PasswordChanged changePassword(AccountRequests.ChangePassword request, SecurityUser user) {
        validatePassword(request.newPassword());
        return mutate(user, false, actor -> {
            verifyPassword(request.currentPassword(), actor);
            requireNoControl(actor.getAdminId());
            actor.changePassword(passwords.encode(request.newPassword()), false, now());
            admins.flush();
            auditPassword(actor, actor, "password-changed");
            revokeAfterCommit(actor.getAdminId());
            return new AccountResponses.PasswordChanged(true);
        });
    }

    private <T> T mutate(SecurityUser user, boolean adminOnly, Function<Admin, T> action) {
        return coordinator.execute(() -> {
            // DB 잠금을 먼저 얻어 대기 중 변경된 관리자 상태도 새로 읽는다.
            T result = transaction.execute(status -> {
                jdbc.queryForObject("select id from account_management_guard where id = 1 for update", Integer.class);
                Admin actor = admins.findById(user.getAdminId()).orElseThrow(() -> new BusinessException(ErrorCode.INVALID_CREDENTIALS));
                if (!actor.isEnabled() || actor.getSessionVersion() != user.getSessionVersion()) {
                    throw new BusinessException(ErrorCode.INVALID_CREDENTIALS);
                }
                if (adminOnly && (actor.isMustChangePassword() || RoleName.fromValue(actor.getRole()) != RoleName.ADMIN)) {
                    throw new AccessDeniedException("계정 관리에는 관리자 권한이 필요합니다.");
                }
                return action.apply(actor);
            });
            return result;
        });
    }

    private Admin target(String id, long expectedVersion) {
        Admin target = admins.findById(id).orElseThrow(() -> new BusinessException(ErrorCode.ACCOUNT_NOT_FOUND));
        if (target.getVersion() != expectedVersion) throw new BusinessException(ErrorCode.ACCOUNT_VERSION_CONFLICT);
        return target;
    }

    private void requireNoControl(String id) {
        if (controls.hasActiveLock(id)) throw new BusinessException(ErrorCode.ACCOUNT_CONTROL_HELD);
    }

    private void verifyPassword(String password, Admin admin) {
        if (!passwords.matches(password, admin.getPasswordHash())) throw new BusinessException(ErrorCode.PASSWORD_CURRENT_INVALID);
    }

    static void validatePassword(String password) {
        if (password == null || password.isBlank() || password.codePointCount(0, password.length()) < 10
                || password.getBytes(StandardCharsets.UTF_8).length > 72) throw new BusinessException(ErrorCode.PASSWORD_POLICY);
    }

    private void auditPassword(Admin actor, Admin target, String action) {
        String role = RoleName.fromValue(target.getRole()).getValue();
        audits.save(new AccountAudit(actor.getAdminId(), target.getAdminId(), action, role, role,
                target.isEnabled(), target.isEnabled(), now()));
    }

    private void revokeAfterCommit(String id) {
        // 감사 기록과 계정 변경이 커밋된 뒤에만 연결을 종료한다.
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override public void afterCommit() { sessions.closeForAccount(id); }
        });
    }

    private static LocalDateTime now() { return LocalDateTime.now(ZoneOffset.UTC); }
}
