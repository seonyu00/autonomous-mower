export const VIDEO_TIMEOUT_MS = 10_000;

// fetch가 취소를 무시하거나 응답 본문이 멈춰도 호출자는 유한 시간 안에 반환한다.
export async function videoOperation<T>(operation: (signal: AbortSignal) => Promise<T>, parent?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort(parent?.reason);
  if (parent?.aborted) cancel();
  else parent?.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(() => controller.abort(new Error('영상 연결 요청 시간이 초과되었습니다.')), VIDEO_TIMEOUT_MS);
  let onAbort!: () => void;
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(controller.signal.reason);
    if (controller.signal.aborted) onAbort();
    else controller.signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    return await Promise.race([aborted, Promise.resolve().then(() => {
      controller.signal.throwIfAborted();
      return operation(controller.signal);
    })]);
  } finally {
    clearTimeout(timeout);
    controller.signal.removeEventListener('abort', onAbort);
    parent?.removeEventListener('abort', cancel);
  }
}
