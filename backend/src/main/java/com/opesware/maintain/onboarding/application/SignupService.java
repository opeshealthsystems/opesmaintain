package com.opesware.maintain.onboarding.application;

import com.opesware.maintain.identity.infrastructure.AppUserRepository;
import com.opesware.maintain.onboarding.domain.SignupRequest;
import com.opesware.maintain.onboarding.infrastructure.SignupRequestRepository;
import com.opesware.maintain.platform.application.ApiException;
import com.opesware.maintain.platform.security.PasswordHasher;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Self-service company sign-up in two steps: {@link #start} validates the form and e-mails a 6-digit
 * code; {@link #verify} checks the code and provisions the workspace. Codes are stored hashed, expire
 * after 30 minutes and allow 5 attempts.
 */
@Service
public class SignupService {
    private static final Logger log = LoggerFactory.getLogger(SignupService.class);
    static final Duration CODE_TTL = Duration.ofMinutes(30);
    static final int MAX_ATTEMPTS = 5;
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Pattern EMAIL = Pattern.compile("^[^@\\s]{1,64}@[^@\\s]+\\.[A-Za-z]{2,}$");
    private static final Set<String> INDUSTRIES = Set.of(
            "HEALTHCARE", "PHARMA", "MANUFACTURING", "FOOD_BEVERAGE", "ENERGY", "OIL_GAS", "MINING", "TRANSPORT",
            "FACILITIES", "HOSPITALITY", "EDUCATION", "TELECOM", "PUBLIC_SECTOR", "MAINTENANCE_CONTRACTOR", "OTHER");

    private final SignupRequestRepository requests;
    private final AppUserRepository users;
    private final TenantProvisioningService provisioning;
    private final ObjectProvider<JavaMailSender> mail;
    private final String from;
    private final boolean production;

    public SignupService(SignupRequestRepository requests, AppUserRepository users, TenantProvisioningService provisioning,
                         ObjectProvider<JavaMailSender> mail,
                         @Value("${opes.mail.from:no-reply@opes-maintain.local}") String from,
                         @Value("${opes.production:false}") boolean production) {
        this.requests = requests;
        this.users = users;
        this.provisioning = provisioning;
        this.mail = mail;
        this.from = from;
        this.production = production;
    }

    /** Result of {@link #start}: the raw code is returned only outside production (tests, local dev). */
    public record Started(String email, Instant expiresAt, String devCode) {}

    @Transactional
    public Started start(Map<String, String> body) {
        String email = norm(body.get("email")).toLowerCase(Locale.ROOT);
        String fullName = norm(body.get("fullName"));
        String company = norm(body.get("companyName"));
        String country = norm(body.get("country")).toUpperCase(Locale.ROOT);
        String phone = norm(body.get("phone"));
        String industry = norm(body.get("industry")).toUpperCase(Locale.ROOT);
        String plan = norm(body.get("plan")).toUpperCase(Locale.ROOT);
        String language = norm(body.get("language")).toUpperCase(Locale.ROOT);
        String password = body.get("password");

        if (!EMAIL.matcher(email).matches() || email.length() > 200) throw ApiException.invalid("Enter a valid work e-mail address");
        if (fullName.length() < 2 || fullName.length() > 120) throw ApiException.invalid("Enter your full name");
        if (company.length() < 2 || company.length() > 160) throw ApiException.invalid("Enter your company name");
        if (!country.matches("[A-Z]{2}")) throw ApiException.invalid("Choose your country");
        if (phone.length() > 40) throw ApiException.invalid("Phone number is too long");
        if (!industry.isEmpty() && !INDUSTRIES.contains(industry)) throw ApiException.invalid("Choose your industry");
        if (password == null || password.length() < 10 || password.length() > 200
                || !password.matches(".*\\d.*") || !password.matches(".*[A-Za-z].*")) {
            throw ApiException.invalid("Password must be at least 10 characters with letters and digits");
        }
        if (users.findFirstByEmailIgnoreCase(email).isPresent()) {
            throw ApiException.conflict("EMAIL_IN_USE", "An account already exists for this e-mail. Sign in or reset your password.");
        }

        Instant now = Instant.now();
        String code = String.format("%06d", RANDOM.nextInt(1_000_000));
        SignupRequest r = new SignupRequest();
        r.id = UUID.randomUUID();
        r.email = email;
        r.fullName = fullName;
        r.companyName = company;
        r.country = country;
        r.phone = phone.isEmpty() ? null : phone;
        r.industry = industry.isEmpty() ? null : industry;
        r.planInterest = Plans.known(plan) ? plan : Plans.TRIAL.code();
        r.language = "FR".equals(language) ? "FR" : "EN";
        r.passwordHash = PasswordHasher.hash(password);
        r.codeHash = hash(r.id, code);
        r.expiresAt = now.plus(CODE_TTL);
        r.createdAt = now;
        requests.save(r);
        sendCode(r, code);
        return new Started(email, r.expiresAt, production ? null : code);
    }

    /** Issues a fresh code for the latest pending sign-up of this e-mail (silently does nothing otherwise). */
    @Transactional
    public Started resend(String rawEmail) {
        String email = norm(rawEmail).toLowerCase(Locale.ROOT);
        Instant now = Instant.now();
        SignupRequest r = requests.findFirstByEmailOrderByCreatedAtDesc(email).filter(x -> x.completedAt == null).orElse(null);
        if (r == null) return new Started(email, null, null);
        String code = String.format("%06d", RANDOM.nextInt(1_000_000));
        r.codeHash = hash(r.id, code);
        r.attempts = 0;
        r.expiresAt = now.plus(CODE_TTL);
        requests.save(r);
        sendCode(r, code);
        return new Started(email, r.expiresAt, production ? null : code);
    }

    /** Verifies the code and creates the workspace. Returns the new admin's e-mail so the client can sign in. */
    @Transactional(noRollbackFor = ApiException.class)
    public TenantProvisioningService.Provisioned verify(String rawEmail, String rawCode) {
        String email = norm(rawEmail).toLowerCase(Locale.ROOT);
        String code = norm(rawCode);
        Instant now = Instant.now();
        ApiException invalid = new ApiException(400, "SIGNUP_CODE_INVALID", "The code is not valid. Check the e-mail we sent you or request a new code.");
        SignupRequest r = requests.findFirstByEmailOrderByCreatedAtDesc(email).orElseThrow(() -> invalid);
        if (!r.pending(now)) {
            throw new ApiException(400, "SIGNUP_CODE_EXPIRED", "This code has expired or was already used. Request a new code.");
        }
        if (r.attempts >= MAX_ATTEMPTS) {
            throw new ApiException(429, "SIGNUP_TOO_MANY_ATTEMPTS", "Too many wrong codes. Request a new code.");
        }
        if (!code.matches("\\d{6}") || !MessageDigest.isEqual(hash(r.id, code).getBytes(StandardCharsets.UTF_8), r.codeHash.getBytes(StandardCharsets.UTF_8))) {
            r.attempts++;
            requests.save(r);
            throw invalid;
        }
        if (users.findFirstByEmailIgnoreCase(email).isPresent()) {
            throw ApiException.conflict("EMAIL_IN_USE", "An account already exists for this e-mail. Sign in or reset your password.");
        }
        TenantProvisioningService.Provisioned p = provisioning.provision(r);
        r.completedAt = now;
        r.tenantId = p.tenantId();
        requests.save(r);
        log.info("Self-service workspace created for {} (tenant {})", r.companyName, p.tenantId());
        return p;
    }

    private void sendCode(SignupRequest r, String code) {
        JavaMailSender sender = mail.getIfAvailable();
        boolean fr = "FR".equals(r.language);
        if (sender != null) {
            try {
                SimpleMailMessage m = new SimpleMailMessage();
                m.setFrom(from);
                m.setTo(r.email);
                m.setSubject(fr ? "[OPES Maintain] Votre code de vérification : " + code : "[OPES Maintain] Your verification code: " + code);
                m.setText(fr
                        ? "Bonjour " + r.fullName + ",\n\nVotre code pour créer l'espace OPES Maintain de " + r.companyName + " est :\n\n    " + code
                          + "\n\nIl est valable 30 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.\n\nL'équipe OPES Maintain"
                        : "Hello " + r.fullName + ",\n\nYour code to create the OPES Maintain workspace for " + r.companyName + " is:\n\n    " + code
                          + "\n\nIt is valid for 30 minutes. If you did not request this, ignore this e-mail.\n\nThe OPES Maintain team");
                sender.send(m);
                return;
            } catch (RuntimeException ex) {
                log.warn("Sign-up code e-mail could not be sent to {}: {}", r.email, ex.getMessage());
                throw new ApiException(503, "EMAIL_UNAVAILABLE", "We could not send the verification e-mail. Try again in a few minutes.");
            }
        }
        if (production) {
            log.error("Sign-up attempted but e-mail is not configured (set SPRING_MAIL_HOST)");
            throw new ApiException(503, "EMAIL_UNAVAILABLE", "Sign-up is temporarily unavailable. Please contact us.");
        }
        log.info("E-mail is not configured; development sign-up code for {}: {}", r.email, code);
    }

    private static String norm(String s) {
        return s == null ? "" : s.trim();
    }

    static String hash(UUID id, String code) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest((id + ":" + code).getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
