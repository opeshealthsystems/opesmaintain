package com.opesware.maintain.documents.infrastructure;

import java.io.IOException;

/** Evidence storage port. Keys are opaque, tenant-prefixed and never derived from user input. */
public interface FileStore {
    void put(String key, byte[] data, String contentType) throws IOException;

    byte[] get(String key) throws IOException;

    String kind();
}
