package com.opesware.maintain.documents.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.TreeMap;
import org.junit.jupiter.api.Test;

/** Verifies the S3 signer against AWS's published Signature V4 example (GET Object, docs "Example: GET Object"). */
class S3SignatureTest {
    @Test
    void matchesAwsPublishedSignatureV4Vector() {
        TreeMap<String, String> h = new TreeMap<>();
        h.put("host", "examplebucket.s3.amazonaws.com");
        h.put("range", "bytes=0-9");
        h.put("x-amz-content-sha256", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
        h.put("x-amz-date", "20130524T000000Z");
        String auth = S3FileStore.authorization("GET", "/test.txt", "", h, "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
                "20130524T000000Z", "us-east-1", "AKIAIOSFODNN7EXAMPLE", "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY");
        assertThat(auth).isEqualTo("AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, "
                + "SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, "
                + "Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41");
    }
}
