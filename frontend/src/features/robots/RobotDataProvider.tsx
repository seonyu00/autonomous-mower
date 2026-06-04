import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { PropsWithChildren } from 'react';
import { useAuthStore } from '../auth/authStore';
import { env } from '../../shared/config/env';
import { getRobots } from './api';
import { useRobotStore } from './robotStore';

export function RobotDataProvider({ children }: PropsWithChildren) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const setRobots = useRobotStore((state) => state.setRobots);

  const robotsQuery = useQuery({
    queryKey: ['robots'],
    queryFn: getRobots,
    enabled: isAuthenticated && !env.enableMockRobots,
  });

  useEffect(() => {
    if (robotsQuery.data) {
      setRobots(robotsQuery.data);
    }
  }, [robotsQuery.data, setRobots]);

  return children;
}
