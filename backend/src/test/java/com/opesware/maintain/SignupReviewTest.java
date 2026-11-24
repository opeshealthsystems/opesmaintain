package com.opesware.maintain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.opesware.maintain.identity.api.AuthController;
import com.opesware.maintain.identity.infrastructure.AppUserRepository;
import com.opesware.maintain.onboarding.api.InboxEndpoint;
import com.opesware.maintain.onboarding.api.PublicContactController;
import com.opesware.maintain.onboarding.api.PublicSignupController;
import com.opesware.maintain.onboarding.api.SignupReviewEndpoint;
import com.opesware.maintain.platform.application.ApiException;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

/** Sign-ups held for manual review when verification e-mails cannot be sent. */
@SpringBootTest(properties = {"opes.signup.force-review=true", "opes.signup.review-endpoint=true"})
@ActiveProfiles("test")
class SignupReviewTest {
    @Autowired PublicSignupController controller;
    @Autowired SignupReviewEndpoint review;
    @Autowired AuthController auth;
    @Autowired AppUserRepository users;
    @Autowired PublicContactController contact;
    @Autowired InboxEndpoint inbox;

    private static Map<String, String> form(String email) {
        Map<String, String> m = new HashMap<>();
        m.put("email", email);
        m.put("fullName", "Review Owner");
        m.put("companyName", "Station Total Bonaberi");
        m.put("country", "CM");
        m.put("industry", "OIL_GAS");
        m.put("password", "FuelStation2026");
        return m;
    }

    @Test
    void heldSignupIsApprovedByOperatorAndCanSignIn() {
        String email = "review-" + UUID.randomUUID() + "@example.com";
        Map<String, Object> r = controller.start(form(email));
        assertThat(r.get("review")).isEqualTo(true);
        assertThat(r).doesNotContainKey("devCode");
        assertThat(users.findFirstByEmailIgnoreCase(email)).isEmpty();
        assertThat(review.pending()).extracting(m -> m.get("email")).contains(email);

        // No code was sent, so verification is refused with a clear message.
        assertThatThrownBy(() -> controller.verify(Map.of("email", email, "code", "123456")))
                .satisfies(e -> assertThat(((ApiException) e).code()).isEqualTo("SIGNUP_IN_REVIEW"));
        assertThat(controller.resend(Map.of("email", email)).get("review")).isEqualTo(true);

        assertThat(review.decide(email, "approve").get("status")).isEqualTo("APPROVED");
        assertThat(review.pending()).extracting(m -> m.get("email")).doesNotContain(email);
        assertThat(auth.login(Map.of("email", email, "password", "FuelStation2026")).get("token")).isNotNull();
        assertThatThrownBy(() -> review.decide(email, "approve")).isInstanceOf(ApiException.class);
    }

    @Test
    void rejectedSignupCreatesNothing() {
        String email = "spam-" + UUID.randomUUID() + "@example.com";
        controller.start(form(email));
        assertThat(review.decide(email, "reject").get("status")).isEqualTo("REJECTED");
        assertThat(review.pending()).extracting(m -> m.get("email")).doesNotContain(email);
        assertThat(users.findFirstByEmailIgnoreCase(email)).isEmpty();
        assertThatThrownBy(() -> review.decide(email, "approve")).isInstanceOf(ApiException.class);
    }

    @Test
    void contactMessagesAreStoredValidatedAndReadInTheInbox() {
        String email = "lead-" + UUID.randomUUID() + "@example.com";
        Map<String, String> m = new HashMap<>(Map.of("name", "Jean Kamga", "email", email, "topic", "perpetual",
                "company", "Hôpital Laquintinie", "country", "CM", "message", "We need an on-premise license for 30 users."));
        assertThat(contact.send(m).get("ok")).isEqualTo(true);
        assertThat(inbox.messages(null)).anySatisfy(x -> {
            assertThat(x.get("email")).isEqualTo(email);
            assertThat(x.get("topic")).isEqualTo("PERPETUAL");
        });
        assertThat(inbox.markRead().get("markedRead")).isNotEqualTo(0);
        assertThat(inbox.messages(null)).noneMatch(x -> email.equals(x.get("email")));
        assertThat(inbox.messages(true)).anyMatch(x -> email.equals(x.get("email")));

        Map<String, String> bot = new HashMap<>(m);
        bot.put("email", "bot-" + UUID.randomUUID() + "@example.com");
        bot.put("website", "spam");
        contact.send(bot);
        assertThat(inbox.messages(true)).noneMatch(x -> bot.get("email").equals(x.get("email")));

        Map<String, String> bad = new HashMap<>(m);
        bad.put("message", "hi");
        assertThatThrownBy(() -> contact.send(bad)).isInstanceOf(ApiException.class);
    }
}
