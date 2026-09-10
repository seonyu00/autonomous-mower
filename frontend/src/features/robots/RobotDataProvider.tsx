import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { PropsWithChildren } from 'react';
import { useAuthStore } from '../auth/authStore';
import { getRobots } from './api';
import { useRobotStore } from './robotStore';

export function RobotDataProvider({ children }: PropsWithChildren) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const sessionVersion = useAuthStore((state) => state.sessionVersion);
  const setRobots = useRobotStore((state) => state.setRobots);
  const setError = useRobotStore((state) => state.setError);

  const robotsQuery = useQuery({
    queryKey: ['robots', sessionVersion],
    queryFn: getRobots,
    enabled: isAuthenticated,
  });

  useEffect(() => {
    if (!isAuthenticated || useAuthStore.getState().sessionVersion !== sessionVersion) return;
    if (robotsQuery.isError) {
      setRobots([]);
      setError('로봇 목록을 불러오지 못했습니다. 연결 상태를 확인하세요.');
    } else if (robotsQuery.data) {
      setRobots(robotsQuery.data);
      setError(null);
    }
  }, [isAuthenticated, sessionVersion, robotsQuery.data, robotsQuery.isError, setRobots, setError]);

  return children;
}
