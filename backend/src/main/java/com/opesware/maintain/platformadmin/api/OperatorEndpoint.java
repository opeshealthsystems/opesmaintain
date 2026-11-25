package com.opesware.maintain.platformadmin.api;

import com.opesware.maintain.platformadmin.application.OperatorProvisioning;
import java.util.Map;
import org.springframework.boot.actuate.endpoint.annotation.Endpoint;
import org.springframework.boot.actuate.endpoint.annotation.WriteOperation;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/** Server-side command to add OPES operators (management port only; same switch as the sign-up review endpoint). */
@Component
@Endpoint(id = "operators")
@ConditionalOnProperty(name = "opes.signup.review-endpoint", havingValue = "true")
public class OperatorEndpoint {
    private final OperatorProvisioning provisioning;

    public OperatorEndpoint(OperatorProvisioning provisioning) {
        this.provisioning = provisioning;
    }

    @WriteOperation
    public Map<String, Object> add(String email, String fullName) {
        return provisioning.addOperator(email, fullName);
    }
}
