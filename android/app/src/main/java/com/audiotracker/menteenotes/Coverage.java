package com.audiotracker.menteenotes;

import org.json.JSONArray;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Which stretches of a mentee's history this device has already taken the
 * notes out of: a sorted list of non-overlapping [start, end) pairs in epoch
 * seconds.
 *
 * Time rather than filenames, because the files are not stable. Compaction
 * merges six L0 files into one L1 covering the same span and deletes the
 * originals, so a name seen yesterday is gone today and a name never seen
 * before may hold nothing new. A compaction output is provably a subset, with
 * identical content, of the files it replaced — updated_at only ever moves
 * forward, so no row can enter a window that has already closed, and any row
 * still in that window has not been touched since. Recording the range rather
 * than the name is what lets those be skipped without downloading them.
 *
 * Deliberately not a high-water mark. A mentee who was offline uploads a
 * backlog three files at a time, and an upload that fails is left for the next
 * run — so Drive routinely holds a newer file while an older one is still
 * missing. A single "synced through" number would step past the gap and skip
 * the straggler for good when it landed. An interval list leaves the hole
 * uncovered, and the next pass fills it.
 */
public final class Coverage {

    private Coverage() {}

    /** One [start, end) pair. */
    public static final class Range {
        public final long start;
        public final long end;

        public Range(long start, long end) {
            this.start = start;
            this.end = end;
        }
    }

    /**
     * Merged is load-bearing: because touching intervals are collapsed, a
     * range is covered if and only if one interval contains it, so this never
     * has to reason about unions.
     */
    public static boolean isCovered(List<Range> covered, long start, long end) {
        for (Range r : covered) {
            if (r.start <= start && end <= r.end) return true;
            // Sorted by start, so once we are past it nothing later can
            // contain it.
            if (r.start > start) break;
        }
        return false;
    }

    public static List<Range> addInterval(List<Range> covered, long start, long end) {
        List<Range> out = new ArrayList<>();
        long lo = start;
        long hi = end;

        for (Range r : covered) {
            // `r.end < lo` rather than `<=`: [a,b) and [b,c) are adjacent and
            // have to merge into [a,c). Left as two entries, coverage
            // fragments and every later file spanning the seam looks
            // incomplete.
            if (r.end < lo || r.start > hi) {
                out.add(r);
                continue;
            }
            lo = Math.min(lo, r.start);
            hi = Math.max(hi, r.end);
        }

        out.add(new Range(lo, hi));
        Collections.sort(out, (a, b) -> Long.compare(a.start, b.start));
        return out;
    }

    /* ---------------------------------- */
    /* Persistence                         */
    /* ---------------------------------- */

    /** Stored as [[start,end],...], the same shape the JS reader used. */
    public static List<Range> parse(String json) {
        List<Range> out = new ArrayList<>();
        if (json == null || json.isEmpty()) return out;
        try {
            JSONArray arr = new JSONArray(json);
            for (int i = 0; i < arr.length(); i++) {
                JSONArray pair = arr.optJSONArray(i);
                if (pair == null || pair.length() < 2) continue;
                out.add(new Range(pair.getLong(0), pair.getLong(1)));
            }
        } catch (Exception e) {
            // A corrupt interval list is not worth failing over: an empty one
            // costs a re-sync, which is the same thing throwing would cost.
            return new ArrayList<>();
        }
        Collections.sort(out, (a, b) -> Long.compare(a.start, b.start));
        return out;
    }

    public static String serialize(List<Range> covered) {
        JSONArray arr = new JSONArray();
        for (Range r : covered) {
            JSONArray pair = new JSONArray();
            pair.put(r.start);
            pair.put(r.end);
            arr.put(pair);
        }
        return arr.toString();
    }

    /* ---------------------------------- */
    /* Level files                         */
    /* ---------------------------------- */

    /**
     * L&lt;level&gt;_&lt;startEpoch&gt;-&lt;endEpoch&gt;.json — the level files, which carry
     * the eight structured tables.
     *
     * Image files are img_&lt;start&gt;-&lt;end&gt;.json and are tracked by name instead:
     * that stream is never compacted, so every file in it is genuinely new and
     * there is nothing for a coverage rule to skip.
     */
    public static Range parseLevelFileName(String name) {
        if (name == null) return null;
        if (!name.startsWith("L") || !name.endsWith(".json")) return null;

        int underscore = name.indexOf('_');
        int dash = name.indexOf('-', underscore + 1);
        if (underscore < 0 || dash < 0) return null;

        try {
            // The level itself is not needed — only the span it covers.
            Integer.parseInt(name.substring(1, underscore));
            long start = Long.parseLong(name.substring(underscore + 1, dash));
            long end = Long.parseLong(
                    name.substring(dash + 1, name.length() - ".json".length()));
            if (end <= start) return null;
            return new Range(start, end);
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
