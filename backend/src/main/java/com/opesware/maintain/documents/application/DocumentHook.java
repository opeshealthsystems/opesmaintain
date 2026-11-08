package com.opesware.maintain.documents.application;

import com.opesware.maintain.documents.domain.Document;
import com.opesware.maintain.platform.application.ApiException;
import com.opesware.maintain.platform.application.ResourceHook;
import org.springframework.stereotype.Component;

@Component
public class DocumentHook implements ResourceHook {
    @Override
    public String path() { return "documents"; }

    @Override
    public void beforeCreate(Object e) {
        Document d = (Document) e;
        d.status = "STAGED";
        if (d.confidential == null) d.confidential = false;
    }

    @Override
    public void beforeUpdate(Object e) {
        Document d = (Document) e;
        if ("SUPERSEDED".equals(d.status)) throw ApiException.guard("RECORD_LOCKED", "Superseded documents are immutable");
    }
}
