# 전체 시스템 구조

## 시스템 흐름

```text
React Dashboard
  | REST 요청 / STOMP 구독
  v
Spring Boot Backend
  | JPA                         | MQTT 명령
  v                             v
PostgreSQL/PostGIS         Mosquitto Broker
                                |
                                v
                      Jetson Edge Client
                                |
                           ROS 2 topic
                                |
                                v
                      STM32 및 실제 구동부
```

React는 운영자의 입력과 상태 화면을 담당한다. Spring Boot는 인증, 권한, 제어권, 안전 규칙을 검사하고 명령을 MQTT로 전달한다. Jetson은 MQTT 명령을 ROS 2 메시지로 변환한다.

현재 저장소에는 Jetson 이후의 STM32 통신과 실제 모터·블레이드 제어가 구현되어 있지 않다.

## 주요 폴더

| 폴더 | 역할 |
|---|---|
| `frontend/` | React 관제 화면 |
| `backend/` | Spring Boot API, 데이터 저장, 제어 안전 규칙 |
| `edge/jetson-client/` | MQTT와 ROS 2 사이의 Jetson 클라이언트 |
| `tools/edge-mock-client/` | 실제 Jetson 없이 MQTT 흐름을 시험하는 Mock |
| `docker/` | Mosquitto 등 컨테이너 설정 |
| `docs/` | 계약, 설계, 구현 상태와 학습 문서 |

## 두 가지 핵심 경로

상태 데이터는 장비에서 화면 방향으로 이동한다.

```text
Jetson -> MQTT -> Backend -> PostgreSQL
                         -> STOMP -> React
```

제어 명령은 화면에서 장비 방향으로 이동한다.

```text
React -> REST -> Backend -> MQTT -> Jetson -> ROS 2 -> STM32
```

문제가 발생하면 이 경로를 한 단계씩 확인한다. 예를 들어 화면의 배터리 값이 갱신되지 않으면 MQTT 수신, DB 저장, STOMP 발행, React store 반영 순서로 추적한다.
