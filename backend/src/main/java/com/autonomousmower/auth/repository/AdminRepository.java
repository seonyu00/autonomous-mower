package com.autonomousmower.auth.repository;

import com.autonomousmower.auth.entity.Admin;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface AdminRepository extends JpaRepository<Admin, String> {
    Page<Admin> findByAdminIdContainingIgnoreCase(String search, Pageable pageable);

    @Query("select count(a) from Admin a where a.enabled = true and lower(a.role) in ('admin', 'role_admin')")
    long countActiveAdmins();
}
