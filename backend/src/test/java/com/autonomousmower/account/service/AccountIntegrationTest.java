package com.autonomousmower.account.service;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.autonomousmower.account.dto.AccountRequests;
import com.autonomousmower.account.repository.AccountAuditRepository;
import com.autonomousmower.auth.entity.Admin;
import com.autonomousmower.auth.repository.AdminRepository;
import com.autonomousmower.auth.security.*;
import com.autonomousmower.common.exception.*;
import com.autonomousmower.control.model.ControlStateStore;
import com.autonomousmower.realtime.security.AccountWebSocketSessions;
import java.time.LocalDateTime;
import java.time.Instant;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;

// 계정 변경 테스트만을 위한 비운영 DB이며 각 테스트가 만든 계정과 감사를 정리한다.
@SpringBootTest(properties = {"app.mqtt.enabled=false", "app.security.jwt.secret=test-only-account-integration-signing-key-20261005"})
@EnabledIfEnvironmentVariable(named = "ACCOUNT_TEST_JDBC_URL", matches = "jdbc:postgresql://(localhost|127\\.0\\.0\\.1):[0-9]+/mower_account_integration")
class AccountIntegrationTest {
    @Autowired AccountService service;
    @Autowired AdminRepository admins;
    @Autowired AccountAuditRepository audits;
    @Autowired PasswordEncoder passwords;
    @Autowired JdbcTemplate jdbc;
    @Autowired PlatformTransactionManager transactions;
    @Autowired ControlStateStore controls;
    @Autowired AccountWebSocketSessions sessions;
    @Autowired JwtTokenProvider tokens;
    SecurityUser actor;
    private static final String PASSWORD = "test-password-10";

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry properties) {
        properties.add("app.snapshot.storage-path", () -> java.nio.file.Path.of(System.getProperty("java.io.tmpdir"), "mower-account-test-snapshots").toAbsolutePath().toString());
        properties.add("spring.datasource.url", () -> System.getenv("ACCOUNT_TEST_JDBC_URL"));
        properties.add("spring.datasource.username", () -> System.getenv("ACCOUNT_TEST_DB_USER"));
        properties.add("spring.datasource.password", () -> System.getenv("ACCOUNT_TEST_DB_PASSWORD"));
    }

    @BeforeEach
    void fixtures() {
        audits.deleteAllInBatch(); admins.deleteAllInBatch();
        admins.saveAndFlush(new Admin("account-admin", passwords.encode(PASSWORD), "admin", LocalDateTime.now()));
        actor = SecurityUser.from("account-admin", RoleName.ADMIN, 0, false);
    }

    @AfterEach
    void cleanup() {
        var state = controls.stateFor("account-test-simulated");
        var owner = state.snapshot().controlOwner();
        if (owner != null) state.release(owner, Instant.now());
        audits.deleteAllInBatch(); admins.deleteAllInBatch();
    }

    @Test
    void createsTemporaryAccountAndPreservesLegacyIdAndHash() {
        String oldHash = admins.findById("account-admin").orElseThrow().getPasswordHash();
        var account = service.create(new AccountRequests.Create("a".repeat(20), "operator", "1234567890"), actor);
        assertThat(account.mustChangePassword()).isTrue();
        assertThat(passwords.matches("1234567890", admins.findById(account.adminId()).orElseThrow().getPasswordHash())).isTrue();
        assertThat(admins.findById("account-admin").orElseThrow().getPasswordHash()).isEqualTo(oldHash);
        admins.saveAndFlush(new Admin("legacy-id-more-than-20-characters", oldHash, "read-only", LocalDateTime.now()));
        assertThat(service.get("legacy-id-more-than-20-characters").adminId()).hasSizeGreaterThan(20);
        assertThat(audits.count()).isEqualTo(1);
    }

    @Test
    void rejectsDuplicateAndStaleVersionWithoutChangingAccountOrAudit() {
        var account = service.create(new AccountRequests.Create("operator-test", "operator", PASSWORD), actor);
        expectCode(() -> service.create(new AccountRequests.Create("operator-test", "operator", PASSWORD), actor), ErrorCode.ACCOUNT_DUPLICATE);
        var changed = service.update(account.adminId(), new AccountRequests.Update("read-only", true, account.version()), actor);
        assertThat(changed.version()).isGreaterThan(account.version());
        expectCode(() -> service.update(account.adminId(), new AccountRequests.Update("operator", true, account.version()), actor), ErrorCode.ACCOUNT_VERSION_CONFLICT);
        assertThat(service.get(account.adminId()).role()).isEqualTo("read-only");
        assertThat(audits.count()).isEqualTo(2);
    }

    @Test
    void protectsLastAdminAndRejectsOwnDemotionEvenWithOtherAdmin() {
        long version = service.get(actor.getAdminId()).version();
        expectCode(() -> service.update(actor.getAdminId(), new AccountRequests.Update("read-only", true, version), actor), ErrorCode.ACCOUNT_LAST_ADMIN);
        expectCode(() -> service.update(actor.getAdminId(), new AccountRequests.Update("admin", false, version), actor), ErrorCode.ACCOUNT_LAST_ADMIN);
        admins.saveAndFlush(new Admin("other-admin", passwords.encode(PASSWORD), "admin", LocalDateTime.now()));
        expectCode(() -> service.update(actor.getAdminId(), new AccountRequests.Update("read-only", true, version), actor), ErrorCode.ACCOUNT_SELF_CHANGE);
        assertThat(admins.countActiveAdmins()).isEqualTo(2);
    }

    @Test
    void heldControlRejectsRolePasswordResetAndOwnPasswordChange() {
        var account = service.create(new AccountRequests.Create("operator-test", "operator", PASSWORD), actor);
        controls.stateFor("account-test-simulated").claim("operator-test", "test", "manual", Instant.now());
        expectCode(() -> service.update(account.adminId(), new AccountRequests.Update("read-only", true, account.version()), actor), ErrorCode.ACCOUNT_CONTROL_HELD);
        expectCode(() -> service.resetPassword(account.adminId(), new AccountRequests.ResetPassword(PASSWORD, PASSWORD, account.version()), actor), ErrorCode.ACCOUNT_CONTROL_HELD);
        var target = admins.findById(account.adminId()).orElseThrow();
        var user = SecurityUser.from(target.getAdminId(), RoleName.OPERATOR, target.getSessionVersion(), true);
        expectCode(() -> service.changePassword(new AccountRequests.ChangePassword(PASSWORD, "new-test-password"), user), ErrorCode.ACCOUNT_CONTROL_HELD);
    }

    @Test
    void roleDisableAndPasswordChangesInvalidatePreviousTokens() {
        var account = service.create(new AccountRequests.Create("operator-test", "operator", PASSWORD), actor);
        var user = SecurityUser.from(account.adminId(), RoleName.OPERATOR, 1, true);
        String token = tokens.createToken(user).token();
        service.changePassword(new AccountRequests.ChangePassword(PASSWORD, "new-test-password"), user);
        assertThatThrownBy(() -> tokens.parse(token)).isInstanceOf(org.springframework.security.authentication.BadCredentialsException.class);
        var current = admins.findById(account.adminId()).orElseThrow();
        user = SecurityUser.from(account.adminId(), RoleName.OPERATOR, current.getSessionVersion(), false);
        String normal = tokens.createToken(user).token();
        var reset = service.resetPassword(account.adminId(), new AccountRequests.ResetPassword("reset-test-password", PASSWORD, current.getVersion()), actor);
        assertThat(reset.mustChangePassword()).isTrue();
        assertThatThrownBy(() -> tokens.parse(normal)).isInstanceOf(org.springframework.security.authentication.BadCredentialsException.class);
        var disabled = service.update(account.adminId(), new AccountRequests.Update("operator", false, reset.version()), actor);
        assertThat(disabled.enabled()).isFalse();
        current = admins.findById(account.adminId()).orElseThrow();
        String disabledToken = tokens.createToken(SecurityUser.from(account.adminId(), RoleName.OPERATOR, current.getSessionVersion(), true)).token();
        assertThatThrownBy(() -> tokens.parse(disabledToken)).isInstanceOf(org.springframework.security.authentication.BadCredentialsException.class);
    }

    @Test
    void concurrentCrossDemotionsUsingIndependentServiceInstancesLeaveOneAdmin() throws Exception {
        admins.saveAndFlush(new Admin("other-admin", passwords.encode(PASSWORD), "admin", LocalDateTime.now()));
        var other = SecurityUser.from("other-admin", RoleName.ADMIN, 0, false);
        var first = independentService(audits, sessions);
        var second = independentService(audits, sessions);
        var start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            Future<Boolean> a = executor.submit(() -> attempt(start, () -> first.update("other-admin", new AccountRequests.Update("read-only", true, 0L), actor)));
            Future<Boolean> b = executor.submit(() -> attempt(start, () -> second.update("account-admin", new AccountRequests.Update("read-only", true, 0L), other)));
            start.countDown();
            assertThat(a.get(15, TimeUnit.SECONDS) ^ b.get(15, TimeUnit.SECONDS)).isTrue();
        }
        assertThat(admins.countActiveAdmins()).isEqualTo(1);
        assertThat(audits.count()).isEqualTo(1);
    }

    @Test
    void auditFailureRollsBackChangeAndDoesNotCloseSessions() {
        var account = service.create(new AccountRequests.Create("operator-test", "operator", PASSWORD), actor);
        var brokenAudit = mock(AccountAuditRepository.class);
        when(brokenAudit.save(any())).thenThrow(new IllegalStateException("test audit failure"));
        var sockets = mock(AccountWebSocketSessions.class);
        var broken = independentService(brokenAudit, sockets);
        assertThatThrownBy(() -> broken.update(account.adminId(), new AccountRequests.Update("read-only", true, account.version()), actor)).isInstanceOf(IllegalStateException.class);
        assertThat(service.get(account.adminId()).role()).isEqualTo("operator");
        assertThat(service.get(account.adminId()).version()).isEqualTo(account.version());
        verifyNoInteractions(sockets);
        assertThat(audits.count()).isEqualTo(1);
    }

    private AccountService independentService(AccountAuditRepository audit, AccountWebSocketSessions sockets) {
        return new AccountService(admins, audit, passwords, jdbc, transactions, new AccountSessionCoordinator(), controls, sockets);
    }

    private boolean attempt(CountDownLatch start, Runnable action) throws InterruptedException {
        start.await();
        try { action.run(); return true; }
        catch (BusinessException rejected) { assertThat(rejected.getErrorCode()).isEqualTo(ErrorCode.INVALID_CREDENTIALS); return false; }
    }

    private void expectCode(Runnable action, ErrorCode code) {
        assertThatThrownBy(action::run).isInstanceOf(BusinessException.class).extracting("errorCode").isEqualTo(code);
    }
}
