package com.opesware.maintain.documents.infrastructure;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "opes.storage.type", havingValue = "local", matchIfMissing = true)
public class LocalFileStore implements FileStore {
    private final Path root;

    public LocalFileStore(@Value("${opes.storage.root}") String root) {
        this.root = Path.of(root).toAbsolutePath().normalize();
    }

    private Path resolve(String key) {
        Path p = root.resolve(key).normalize();
        if (!p.startsWith(root)) throw new IllegalArgumentException("Invalid storage key");
        return p;
    }

    @Override
    public void put(String key, byte[] data, String contentType) throws IOException {
        Path p = resolve(key);
        Files.createDirectories(p.getParent());
        Files.write(p, data);
    }

    @Override
    public byte[] get(String key) throws IOException {
        return Files.readAllBytes(resolve(key));
    }

    @Override
    public String kind() {
        return "local";
    }
}
