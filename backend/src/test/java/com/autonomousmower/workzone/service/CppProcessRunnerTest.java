package com.autonomousmower.workzone.service;

import com.autonomousmower.common.exception.ErrorCode;
import java.io.IOException;
import java.nio.file.Path;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
import static com.autonomousmower.workzone.service.CppPreviewServiceTest.assertCode;

class CppProcessRunnerTest {
    Process child;

    CppProcessRunner runner(String mode, long timeout, int limit) {
        return new CppProcessRunner("", timeout, limit) {
            @Override Process startProcess() throws IOException {
                child = new ProcessBuilder(Path.of(System.getProperty("java.home"), "bin", "java").toString(),
                        "-cp", Path.of(java.net.URI.create(Fixture.class.getProtectionDomain().getCodeSource().getLocation().toString())).toString(),
                        Fixture.class.getName(), mode).redirectError(ProcessBuilder.Redirect.DISCARD).start();
                return child;
            }
        };
    }

    @Test void invokesProcessWithStdinAndStdout() {
        assertThat(runner("echo", 3000, 100).run("input".getBytes())).isEqualTo("input".getBytes());
    }
    @Test void handlesFailureAndMissingConfiguration() {
        assertCode(ErrorCode.CPP_FAILED, () -> runner("fail", 3000, 100).run(new byte[0]));
        assertCode(ErrorCode.CPP_UNAVAILABLE, () -> new CppProcessRunner("", 10, 10).run(new byte[0]));
        assertCode(ErrorCode.CPP_FAILED, () -> new CppProcessRunner(Path.of("missing-cpp").toAbsolutePath().toString(), 10, 10).run(new byte[0]));
    }
    @Test void timesOutEvenWhenChildDoesNotReadStdinAndKillsChild() throws Exception {
        assertCode(ErrorCode.CPP_TIMEOUT, () -> runner("sleep", 300, 100).run(new byte[1000000]));
        assertThat(child.waitFor(2, TimeUnit.SECONDS)).isTrue();
    }
    @Test void limitsOutputAndKillsChild() throws Exception {
        assertCode(ErrorCode.CPP_OUTPUT_INVALID, () -> runner("flood", 3000, 100).run(new byte[0]));
        assertThat(child.waitFor(2, TimeUnit.SECONDS)).isTrue();
    }
    @Test void rejectsConcurrentExecutionAndReleasesSlot() throws Exception {
        var started = new CountDownLatch(1);
        var runner = new CppProcessRunner("", 300, 100) {
            @Override Process startProcess() throws IOException {
                Process process = CppProcessRunnerTest.this.runner("sleep", 300, 100).startProcess();
                started.countDown();
                return process;
            }
        };
        try (var executor = Executors.newSingleThreadExecutor()) {
            var first = executor.submit(() -> assertCode(ErrorCode.CPP_TIMEOUT, () -> runner.run(new byte[0])));
            assertThat(started.await(2, TimeUnit.SECONDS)).isTrue();
            assertCode(ErrorCode.CPP_BUSY, () -> runner.run(new byte[0]));
            first.get(3, TimeUnit.SECONDS);
            assertCode(ErrorCode.CPP_TIMEOUT, () -> runner.run(new byte[0]));
        }
    }

    public static class Fixture {
        public static void main(String[] args) throws Exception {
            switch (args[0]) {
                case "sleep" -> Thread.sleep(10000);
                case "fail" -> System.exit(3);
                case "flood" -> { System.out.write(new byte[10000]); System.out.flush(); Thread.sleep(10000); }
                default -> { System.out.write(System.in.readAllBytes()); System.out.flush(); }
            }
        }
    }
}
