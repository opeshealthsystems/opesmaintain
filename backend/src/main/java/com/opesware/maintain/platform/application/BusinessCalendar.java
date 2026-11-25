package com.opesware.maintain.platform.application;

import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.EnumSet;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Business-hours SLA clock (spec §13.2). Calendar spec: {@code "MON-FRI 08:00-17:00"} (default) or
 * e.g. {@code "MON-SAT 07:30-18:00"}, evaluated in the site's IANA zone so DST is honored.
 */
public final class BusinessCalendar {
    private static final Pattern SPEC = Pattern.compile("([A-Z]{3})-([A-Z]{3})\\s+(\\d{2}:\\d{2})-(\\d{2}:\\d{2})");
    private final Set<DayOfWeek> days;
    private final LocalTime open;
    private final LocalTime close;

    private BusinessCalendar(Set<DayOfWeek> days, LocalTime open, LocalTime close) {
        this.days = days;
        this.open = open;
        this.close = close;
    }

    public static BusinessCalendar parse(String spec) {
        Matcher m = SPEC.matcher(spec == null ? "" : spec.trim().toUpperCase());
        if (!m.matches()) return new BusinessCalendar(EnumSet.range(DayOfWeek.MONDAY, DayOfWeek.FRIDAY), LocalTime.of(8, 0), LocalTime.of(17, 0));
        DayOfWeek from = day(m.group(1));
        DayOfWeek to = day(m.group(2));
        Set<DayOfWeek> d = EnumSet.noneOf(DayOfWeek.class);
        for (DayOfWeek x = from; ; x = x.plus(1)) {
            d.add(x);
            if (x == to) break;
        }
        LocalTime o = LocalTime.parse(m.group(3));
        LocalTime c = LocalTime.parse(m.group(4));
        if (!c.isAfter(o)) throw ApiException.invalid("Calendar closing time must be after opening time");
        return new BusinessCalendar(d, o, c);
    }

    private static DayOfWeek day(String s) {
        for (DayOfWeek d : DayOfWeek.values()) if (d.name().startsWith(s)) return d;
        throw ApiException.invalid("Unknown day " + s);
    }

    /** Adds working minutes to a start instant, skipping closed hours and days. */
    public Instant addWorkingMinutes(Instant start, long minutes, ZoneId zone) {
        ZonedDateTime t = start.atZone(zone);
        long remaining = minutes;
        int guard = 0;
        while (guard++ < 3700) {
            if (!days.contains(t.getDayOfWeek()) || !t.toLocalTime().isBefore(close)) {
                t = t.toLocalDate().plusDays(1).atTime(open).atZone(zone);
                continue;
            }
            if (t.toLocalTime().isBefore(open)) t = t.toLocalDate().atTime(open).atZone(zone);
            long avail = Duration.between(t, t.toLocalDate().atTime(close).atZone(zone)).toMinutes();
            if (remaining <= avail) return t.plusMinutes(remaining).toInstant();
            remaining -= avail;
            t = t.toLocalDate().plusDays(1).atTime(open).atZone(zone);
        }
        throw ApiException.invalid("Calendar has no working time");
    }
}
