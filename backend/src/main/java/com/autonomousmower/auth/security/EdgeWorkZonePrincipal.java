package com.autonomousmower.auth.security;

import java.util.UUID;

public record EdgeWorkZonePrincipal(UUID tokenId, String robotId, boolean missionUpload) { }
