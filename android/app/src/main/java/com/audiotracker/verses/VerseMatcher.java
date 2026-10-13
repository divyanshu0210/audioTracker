package com.audiotracker.verses;

import android.content.Context;
import android.util.Base64;
import android.util.Log;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** Native owner of the packed verse index. Matching rules mirror matcher.js. */
public final class VerseMatcher {
    private static final String TAG = "VerseMatcher";
    private static final int RERANK_DEPTH = 12;
    private static final Object LOCK = new Object();
    private static volatile Data data;
    private static volatile boolean loading;

    private VerseMatcher() {}

    public static void preload(Context context) {
        synchronized (LOCK) {
            if (data != null || loading) return;
            loading = true;
        }
        new Thread(() -> {
            long started = System.currentTimeMillis();
            try {
                Data loaded = read(context);
                synchronized (LOCK) { data = loaded; loading = false; }
                Log.i(TAG, "preload:ready docs=" + loaded.docs.length
                        + " elapsedMs=" + (System.currentTimeMillis() - started));
            } catch (Throwable t) {
                synchronized (LOCK) { loading = false; }
                Log.e(TAG, "preload:failed", t);
            }
        }, "verse-index-preload").start();
    }

    public static boolean isReady() { return data != null; }

    public static WritableArray songNames() {
        WritableArray out = Arguments.createArray();
        Data d = data;
        if (d == null) return out;
        for (Doc doc : d.docs) {
            if (!"song".equals(doc.kind)) continue;
            WritableMap item = Arguments.createMap();
            item.putString("id", doc.id);
            item.putString("title", doc.ref);
            out.pushMap(item);
        }
        return out;
    }

    /** Synchronous after preload: only small query work runs on the JS caller. */
    public static WritableArray match(int[] query, int floor, double minSolidRatio,
                                      double missPenalty) {
        Data d = data;
        WritableArray out = Arguments.createArray();
        if (d == null || query == null || query.length == 0) return out;

        int[] counts = new int[d.docs.length];
        int[] touched = new int[d.docs.length];
        int touchedCount = 0;
        Range[] ranges = new Range[query.length];
        for (int q = 0; q < query.length; q++) {
            int slot = find(d.hashes, query[q]);
            if (slot < 0) {
                ranges[q] = find(d.common, query[q]) < 0 ? Range.MISS : Range.NEUTRAL;
                continue;
            }
            int from = d.starts[slot], to = d.starts[slot + 1];
            ranges[q] = new Range(from, to);
            for (int p = from; p < to; p++) {
                int ordinal = d.postings[p];
                if (counts[ordinal] == 0) touched[touchedCount++] = ordinal;
                counts[ordinal]++;
            }
        }
        if (touchedCount == 0) return out;

        Integer[] shortlist = new Integer[Math.min(RERANK_DEPTH, touchedCount)];
        Integer[] all = new Integer[touchedCount];
        for (int i = 0; i < touchedCount; i++) all[i] = touched[i];
        Arrays.sort(all, (a, b) -> Integer.compare(counts[b], counts[a]));
        System.arraycopy(all, 0, shortlist, 0, shortlist.length);
        Set<Integer> wanted = new HashSet<>(Arrays.asList(shortlist));
        Run[] runs = new Run[d.docs.length];
        for (int ordinal : shortlist) runs[ordinal] = new Run();

        for (int q = 0; q < query.length; q++) {
            Range range = ranges[q];
            if (range == Range.NEUTRAL) {
                for (int ordinal : shortlist) step(runs[ordinal], q, "neutral", missPenalty);
                continue;
            }
            Set<Integer> hit = new HashSet<>();
            if (range != null && range != Range.MISS) {
                for (int p = range.from; p < range.to; p++) {
                    int ordinal = d.postings[p];
                    if (wanted.contains(ordinal)) hit.add(ordinal);
                }
            }
            for (int ordinal : shortlist)
                step(runs[ordinal], q, hit.contains(ordinal) ? "solid" : "miss", missPenalty);
        }

        List<Result> results = new ArrayList<>();
        for (int ordinal : shortlist) {
            Run run = runs[ordinal];
            int positions = run.best > 0 ? run.end - run.bestStart + 1 : 0;
            int runChars = positions > 0 ? positions + d.gramSize - 1 : 0;
            double coverage = d.docs[ordinal].len > 0
                    ? Math.min(1.0, (double) runChars / d.docs[ordinal].len) : 0;
            double solid = positions > 0 ? (double) run.bestSolid / positions : 0;
            if (runChars >= floor && solid >= minSolidRatio) {
                results.add(new Result(ordinal, counts[ordinal], runChars,
                        coverage, runChars * (0.5 + 0.5 * coverage), solid, run.end));
            }
        }
        results.sort((a, b) -> Double.compare(b.score, a.score));
        for (Result r : results) {
            Doc doc = d.docs[r.ordinal];
            WritableMap m = Arguments.createMap();
            m.putString("id", doc.id); m.putString("ref", doc.ref);
            m.putString("kind", doc.kind); m.putString("book", doc.book);
            m.putInt("len", doc.len); m.putInt("ordinal", r.ordinal);
            m.putInt("hits", r.hits); m.putInt("runChars", r.runChars);
            m.putDouble("coverage", r.coverage); m.putDouble("score", r.score);
            m.putDouble("solidRatio", r.solidRatio); m.putInt("endsAt", r.endsAt);
            out.pushMap(m);
        }
        return out;
    }

    private static void step(Run r, int q, String kind, double missPenalty) {
        if (r.score <= 0) {
            if (!"solid".equals(kind)) return;
            r.score = 1; r.solid = 1; r.start = q;
        } else if ("solid".equals(kind)) { r.score++; r.solid++;
        } else if ("miss".equals(kind)) {
            r.score -= missPenalty;
            if (r.score <= 0) { r.score = 0; r.solid = 0; r.start = -1; return; }
        }
        if (r.score > r.best) { r.best = r.score; r.bestSolid = r.solid;
            r.bestStart = r.start; r.end = q; }
    }

    private static int find(int[] values, int value) {
        int lo = 0, hi = values.length - 1;
        while (lo <= hi) { int mid = (lo + hi) >>> 1;
            if (values[mid] == value) return mid;
            if (values[mid] < value) lo = mid + 1; else hi = mid - 1; }
        return -1;
    }

    private static Data read(Context context) throws Exception {
        InputStream in = context.getAssets().open("verse_index.json");
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        byte[] buffer = new byte[65536]; int n;
        while ((n = in.read(buffer)) != -1) bytes.write(buffer, 0, n);
        in.close();
        JSONObject root = new JSONObject(bytes.toString("UTF-8"));
        JSONArray jsonDocs = root.getJSONArray("docs");
        Doc[] docs = new Doc[jsonDocs.length()];
        for (int i = 0; i < docs.length; i++) {
            JSONObject j = jsonDocs.getJSONObject(i);
            docs[i] = new Doc(j.optString("id"), j.optString("ref"),
                    j.optString("kind"), j.optString("book"), j.optInt("len"));
        }
        return new Data(docs, ints(root.getString("devanagariCommon")),
                ints(root.getString("devanagariHashes")), ints(root.getString("devanagariStarts")),
                ints(root.getString("devanagariPostings")), root.optInt("gramSize", 5));
    }

    private static int[] ints(String encoded) {
        byte[] raw = Base64.decode(encoded, Base64.DEFAULT);
        IntBufferView view = new IntBufferView(raw);
        return view.values;
    }

    private static final class IntBufferView {
        final int[] values;
        IntBufferView(byte[] raw) {
            ByteBuffer b = ByteBuffer.wrap(raw).order(ByteOrder.LITTLE_ENDIAN);
            values = new int[raw.length / 4]; b.asIntBuffer().get(values);
        }
    }
    private static final class Data { final Doc[] docs; final int[] common, hashes, starts, postings; final int gramSize;
        Data(Doc[] d, int[] c, int[] h, int[] s, int[] p, int g) { docs=d; common=c; hashes=h; starts=s; postings=p; gramSize=g; } }
    private static final class Doc { final String id, ref, kind, book; final int len;
        Doc(String i,String r,String k,String b,int l){id=i;ref=r;kind=k;book=b;len=l;} }
    private static final class Range { static final Range MISS=new Range(-1,-1), NEUTRAL=new Range(-2,-2); final int from,to; Range(int f,int t){from=f;to=t;} }
    private static final class Run { double score,best; int solid,bestSolid,start=-1,bestStart=-1,end=-1; }
    private static final class Result { final int ordinal,hits,runChars,endsAt; final double coverage,score,solidRatio;
        Result(int o,int h,int rc,double c,double s,double sr,int e){ordinal=o;hits=h;runChars=rc;coverage=c;score=s;solidRatio=sr;endsAt=e;} }
}
