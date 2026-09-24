package com.autonomousmower.workzone.service;

import com.autonomousmower.common.exception.BusinessException;
import com.autonomousmower.common.exception.ErrorCode;
import java.io.IOException;
import java.nio.file.Path;
import java.util.concurrent.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class CppProcessRunner {
    private final String executable;
    private final long timeoutMs;
    private final int maxOutputBytes;
    private final Semaphore slot = new Semaphore(1);

    public CppProcessRunner(@Value("${app.cpp.executable:}") String executable,
                            @Value("${app.cpp.timeout-ms:5000}") long timeoutMs,
                            @Value("${app.cpp.max-output-bytes:2097152}") int maxOutputBytes) {
        this.executable = executable;
        this.timeoutMs = Math.max(1, Math.min(timeoutMs, 30000));
        this.maxOutputBytes = Math.max(1, Math.min(maxOutputBytes, 2097152));
    }

    public byte[] run(byte[] input) {
        if (!slot.tryAcquire()) throw new BusinessException(ErrorCode.CPP_BUSY);
        Process process = null;
        ExecutorService io = Executors.newVirtualThreadPerTaskExecutor();
        try {
            process = startProcess();
            Process child = process;
            long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(timeoutMs);
            Future<?> writer = io.submit(() -> {
                try (var stdin = child.getOutputStream()) { stdin.write(input); }
                return null;
            });
            Future<byte[]> reader = io.submit(() -> {
                try (var stdout = child.getInputStream()) {
                    byte[] output = stdout.readNBytes(maxOutputBytes + 1);
                    if (output.length > maxOutputBytes) {
                        child.destroyForcibly();
                        throw new BusinessException(ErrorCode.CPP_OUTPUT_INVALID);
                    }
                    return output;
                }
            });
            writer.get(remaining(deadline), TimeUnit.NANOSECONDS);
            byte[] output = reader.get(remaining(deadline), TimeUnit.NANOSECONDS);
            if (!child.waitFor(remaining(deadline), TimeUnit.NANOSECONDS)) throw new TimeoutException();
            if (child.exitValue() != 0) throw new BusinessException(ErrorCode.CPP_FAILED);
            return output;
        } catch (TimeoutException exception) {
            throw new BusinessException(ErrorCode.CPP_TIMEOUT);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new BusinessException(ErrorCode.CPP_FAILED);
        } catch (ExecutionException exception) {
            if (exception.getCause() instanceof BusinessException business) throw business;
            throw new BusinessException(ErrorCode.CPP_FAILED);
        } catch (IOException exception) {
            throw new BusinessException(ErrorCode.CPP_FAILED);
        } finally {
            if (process != null) {
                process.descendants().forEach(ProcessHandle::destroyForcibly);
                process.destroyForcibly();
            }
            io.shutdownNow();
            slot.release();
        }
    }

    Process startProcess() throws IOException {
        // 서버 관리자가 설정한 절대 경로만 직접 실행한다. 셸과 요청값은 명령에 사용하지 않는다.
        if (executable.isBlank() || !Path.of(executable).isAbsolute()) {
            throw new BusinessException(ErrorCode.CPP_UNAVAILABLE);
        }
        return new ProcessBuilder(executable).redirectError(ProcessBuilder.Redirect.DISCARD).start();
    }

    private long remaining(long deadline) throws TimeoutException {
        long remaining = deadline - System.nanoTime();
        if (remaining <= 0) throw new TimeoutException();
        return remaining;
    }
}
