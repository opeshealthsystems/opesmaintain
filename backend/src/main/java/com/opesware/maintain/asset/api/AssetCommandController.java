package com.opesware.maintain.asset.api;

import com.opesware.maintain.asset.application.AssetService;
import com.opesware.maintain.platform.application.CrudService;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
public class AssetCommandController {
    private final AssetService assets;
    private final CrudService crud;

    public AssetCommandController(AssetService assets, CrudService crud) {
        this.assets = assets;
        this.crud = crud;
    }

    @PostMapping("/assets/{id}:change-status")
    public Map<String, Object> status(@PathVariable UUID id, @RequestBody Map<String, Object> b) {
        return crud.get("assets", assets.changeStatus(id, s(b, "status"), s(b, "reason")).id);
    }

    @PostMapping("/assets/{id}:change-safety")
    public Map<String, Object> safety(@PathVariable UUID id, @RequestBody Map<String, Object> b) {
        return crud.get("assets", assets.changeSafety(id, s(b, "safetyState"), s(b, "reason")).id);
    }

    @PostMapping("/assets/{id}:transfer")
    public Map<String, Object> transfer(@PathVariable UUID id, @RequestBody Map<String, Object> b) {
        String loc = s(b, "locationId");
        return crud.get("assets", assets.transfer(id, UUID.fromString(s(b, "siteId")), loc == null ? null : UUID.fromString(loc), s(b, "reason")).id);
    }

    @PostMapping("/assets/{id}:retire")
    public Map<String, Object> retire(@PathVariable UUID id, @RequestBody Map<String, Object> b) {
        return crud.get("assets", assets.retire(id, s(b, "reason"), "true".equals(s(b, "dispose"))).id);
    }

    @PostMapping("/assets/{id}/passport-tokens")
    public Map<String, Object> issueToken(@PathVariable UUID id) {
        return crud.get("passport-tokens", assets.issueToken(id).id);
    }

    @PostMapping("/passport-tokens/{id}:revoke")
    public Map<String, Object> revokeToken(@PathVariable UUID id) {
        return crud.get("passport-tokens", assets.revokeToken(id).id);
    }

    @GetMapping("/passport/{token}")
    public Map<String, Object> passport(@PathVariable String token) {
        return crud.get("assets", assets.resolveToken(token));
    }

    @GetMapping("/public/passport/{token}")
    public Map<String, Object> publicPassport(@PathVariable String token) {
        return assets.publicScan(token);
    }

    @GetMapping("/assets/{id}/tree")
    public List<Map<String, Object>> tree(@PathVariable UUID id) {
        return assets.tree(id);
    }

    private static String s(Map<String, Object> b, String k) {
        Object v = b == null ? null : b.get(k);
        return v == null || v.toString().isBlank() ? null : v.toString();
    }
}
