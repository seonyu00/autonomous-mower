import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Fragment, useEffect, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { useAuthStore } from '../../features/auth/authStore';

export function QueryProvider({ children }: PropsWithChildren) {
  const sessionVersion = useAuthStore((state) => state.sessionVersion);
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            refetchOnWindowFocus: false,
          },
          mutations: {
            retry: false,
          },
        },
      }),
  );

  // 세션이 바뀌는 즉시 진행 중인 조회와 이전 사용자의 캐시를 제거한다.
  useEffect(() => useAuthStore.subscribe((state, previous) => {
    if (state.sessionVersion !== previous.sessionVersion) {
      queryClient.clear();
    }
  }), [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <Fragment key={sessionVersion}>{children}</Fragment>
    </QueryClientProvider>
  );
}
