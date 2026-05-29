package com.autonomousmower.auth.repository;

import com.autonomousmower.auth.entity.Admin;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AdminRepository extends JpaRepository<Admin, String> {
}
