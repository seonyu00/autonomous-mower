package com.autonomousmower.auth.repository;

import com.autonomousmower.auth.entity.EdgeWorkZoneToken;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface EdgeWorkZoneTokenRepository extends JpaRepository<EdgeWorkZoneToken, UUID> {
    Optional<EdgeWorkZoneToken> findByTokenHash(String tokenHash);
}
