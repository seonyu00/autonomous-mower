package com.autonomousmower.vision;

import com.autonomousmower.auth.entity.Admin;
import com.autonomousmower.auth.repository.AdminRepository;
import com.autonomousmower.workzone.dto.GeoJsonGeometryDto;
import com.autonomousmower.workzone.dto.WorkZonePayload;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import static org.assertj.core.api.Assertions.*;

/** 격리 DB에서 실제 인증 HTTP와 웹 표시를 확인하는 재사용 가능한 시험 데이터. */
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT, properties={
    "app.mqtt.enabled=false", "app.security.jwt.secret=vision-web-test-signing-key-only-2026"})
@EnabledIfEnvironmentVariable(named="VISION_WEB_DB_URL",matches="jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/vision_web_test")
class VisionWebIntegrationTest {
    @DynamicPropertySource static void database(DynamicPropertyRegistry p) {
        p.add("spring.datasource.url",()->System.getenv("VISION_WEB_DB_URL"));
        p.add("spring.datasource.username",()->"postgres");
        p.add("spring.datasource.password",()->"vision-web-test");
        p.add("app.snapshot.storage-path",()->System.getProperty("java.io.tmpdir")+"/mower-vision-web-snapshots");
    }
    @Autowired JdbcTemplate jdbc;
    @Autowired VisionMapService vision;
    @Autowired AdminRepository admins;
    @Autowired PasswordEncoder passwords;
    @Autowired TestRestTemplate http;
    @Autowired ObjectMapper json;
    @LocalServerPort int port;

    static WorkZonePayload area(double x0,double x1,double y0,double y1) {
        return new WorkZonePayload("Polygon",4326,new GeoJsonGeometryDto("Polygon",List.of(List.of(
            List.of(x0,y0),List.of(x1,y0),List.of(x1,y1),List.of(x0,y1),List.of(x0,y0)))));
    }
    @Test void authenticatedApiReturnsStoredObservationsForBrowser() throws Exception {
        http.getRestTemplate().setRequestFactory(new org.springframework.http.client.JdkClientHttpRequestFactory());
        // 이름과 접속 주소로 제한한 격리 시험 DB의 이전 시험 자료만 정리한다.
        jdbc.update("DELETE FROM vision_observation WHERE robot_id='MOWER-01'");
        jdbc.update("DELETE FROM work_zone WHERE robot_id='MOWER-01'");
        jdbc.update("DELETE FROM admin_account WHERE admin_id IN ('vision-web-fixture','vision-reader-fixture')");
        jdbc.update("INSERT INTO work_zone(robot_id,zone_polygon,version,created_at,updated_at) VALUES('MOWER-01',ST_GeomFromText('POLYGON((127.454 36.6255,127.455 36.6255,127.455 36.6265,127.454 36.6265,127.454 36.6255))',4326),1,now(),now())");
        admins.saveAndFlush(new Admin("vision-web-fixture",passwords.encode("Vision-Test-Only-2026!"),"admin",LocalDateTime.now()));
        Instant now=Instant.now();
        vision.record("MOWER-01",new VisionMapService.Input("hazard",1,now.minusSeconds(330),VisionMapService.State.DANGEROUS,"test-fixture",area(127.4542,127.4546,36.6258,36.6262)));
        vision.record("MOWER-01",new VisionMapService.Input("newer",1,now.minusSeconds(3),VisionMapService.State.MOW_NOW,"test-fixture",area(127.4544,127.4548,36.6258,36.6262)));
        var login=http.postForEntity("/api/auth/login",Map.of("adminId","vision-web-fixture","password","Vision-Test-Only-2026!"),String.class);
        assertThat(login.getStatusCode()).isEqualTo(HttpStatus.OK);
        var headers=new HttpHeaders();headers.setBearerAuth(json.readTree(login.getBody()).path("data").path("accessToken").asText());
        var response=http.exchange("/api/robots/MOWER-01/vision-map?version=1",HttpMethod.GET,new HttpEntity<>(headers),String.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        var result=json.readTree(response.getBody()).path("data");
        assertThat(result.path("regions").size()).isEqualTo(2);
        assertThat(result.path("dangerHistory").size()).isEqualTo(1);
        assertThat(result.path("regions").get(0).path("geometry").path("type").asText()).isIn("Polygon","MultiPolygon");
        assertThat(http.getForEntity("/api/robots/MOWER-01/vision-map?version=1",String.class).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        var observation=Map.of("observationId","candidate", "observedAt",now.minusSeconds(1).toString(),
            "objectType","BUSH_CANDIDATE","area",area(127.4541,127.4542,36.6256,36.6257));
        var batch=Map.of("version",1,"sessionId","web-http-test","observations",List.of(observation));
        String ingest="/api/robots/MOWER-01/vision-map/observations";
        assertThat(http.postForEntity(ingest,batch,String.class).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        for(int attempt=0;attempt<2;attempt++) {
            assertThat(http.exchange(ingest,HttpMethod.POST,new HttpEntity<>(batch,headers),String.class).getStatusCode()).isEqualTo(HttpStatus.OK);
        }
        assertThat(jdbc.queryForObject("SELECT count(*) FROM vision_observation WHERE observation_id='web-http-test:candidate'",Integer.class)).isEqualTo(1);
        var after=http.exchange("/api/robots/MOWER-01/vision-map?version=1",HttpMethod.GET,new HttpEntity<>(headers),String.class);
        assertThat(after.getBody()).contains("dual_gps_vision:bush_candidate", "UNKNOWN");
        var wrong=Map.of("version",2,"sessionId","wrong-version","observations",List.of(observation));
        assertThat(http.exchange(ingest,HttpMethod.POST,new HttpEntity<>(wrong,headers),String.class).getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        var invalid=Map.of("version",1,"sessionId","bad-frame","observations",List.of(Map.of(
            "observationId","bad","observedAt",now.toString(),"objectType","BUSH_CANDIDATE")));
        assertThat(http.exchange(ingest,HttpMethod.POST,new HttpEntity<>(invalid,headers),String.class).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        var missingVersion=Map.of("sessionId","missing-version","observations",List.of(observation));
        assertThat(http.exchange(ingest,HttpMethod.POST,new HttpEntity<>(missingVersion,headers),String.class).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        admins.saveAndFlush(new Admin("vision-reader-fixture",passwords.encode("Vision-Reader-Test-2026!"),"read-only",LocalDateTime.now()));
        var readerLogin=http.postForEntity("/api/auth/login",Map.of("adminId","vision-reader-fixture","password","Vision-Reader-Test-2026!"),String.class);
        var readerHeaders=new HttpHeaders();readerHeaders.setBearerAuth(json.readTree(readerLogin.getBody()).path("data").path("accessToken").asText());
        assertThat(http.exchange(ingest,HttpMethod.POST,new HttpEntity<>(batch,readerHeaders),String.class).getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        var rollback=Map.of("version",1,"sessionId","atomic-frame","observations",List.of(observation,
            Map.of("observationId","outside","observedAt",now.toString(),"objectType","BUSH_CANDIDATE","area",area(128,129,38,39))));
        assertThat(http.exchange(ingest,HttpMethod.POST,new HttpEntity<>(rollback,headers),String.class).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM vision_observation WHERE observation_id LIKE 'atomic-frame:%'",Integer.class)).isZero();
        String ready=System.getenv("VISION_WEB_READY_FILE");
        if(ready!=null && !ready.isBlank()) {
            Path marker=Path.of(ready); Files.writeString(marker,Integer.toString(port));
            long end=System.nanoTime()+java.time.Duration.ofMinutes(5).toNanos();
            while(Files.exists(marker) && System.nanoTime()<end) Thread.sleep(500);
        }
    }
}
