# VLC Drive range cache

This document describes the persistent sparse cache and its segmented response
stitching behavior.

Drive videos are streamed through the native `DriveStream` proxy because VLC
cannot attach the Google Drive authorization header itself. The proxy keeps a
small persistent sparse cache in the app cache directory. It caches requested
byte windows, not complete videos.

## Cache behavior

- A cache entry is indexed by the Drive file ID and its range start. A request
  that seeks inside an existing window can reuse the cached suffix, so an
  exact range-start match is not required. For example, `video-a | 5,300,000`
  and `video-b | 5,300,000` are different entries.
- Each window stores at most 2 MB.
- The cache limit is calculated from available disk space, with a 2% target,
  a 16 MB minimum, a 256 MB maximum, and a 100 MB free-space reserve.
- Startup ranges below 8 MB are protected because VLC commonly probes there
  for MP4 metadata. Later playback and seek ranges are evicted first.
- If a cache file is missing, corrupt, storage is full, or memory is limited,
  the proxy falls back to streaming directly from Drive.

## Example with three videos

Assume a 16 MB cache limit and 2 MB per cached window.

Video A requests:

```text
bytes=0-
bytes=1,500,000-
bytes=5,300,000-
bytes=20,000,000-
```

The first three windows are protected startup ranges. The 20 MB window is
evictable.

Video B requests `0`, `4,000,000`, and `14,000,000`. The first two are
protected; the 14 MB window is evictable.

When Video C adds more ranges and the cache is full, the proxy evicts the
oldest evictable windows first (`A | 20,000,000`, then `B | 14,000,000`).
Protected startup windows are evicted only if the cache contains no other
entry that can be removed.

When Video A is replayed and VLC requests `bytes=0-`, the proxy sends the
cached startup window immediately and continues the same HTTP response from
Drive. VLC therefore avoids downloading that metadata again while seeking and
normal playback remain supported.

## Segmented cache and Drive response

The 2 MB value is a cache-window limit, not a streaming chunk size. During
continuous playback, the proxy does not reconnect to Drive after every 2 MB.
It keeps the upstream response open and streams the remainder normally.

For an unbounded request such as `bytes=1000000-`, the proxy first serves the
matching cached suffix, then any directly adjacent cached windows. If it finds
an uncached gap, it requests only that gap from Drive up to the next cached
window. It then switches back to the cached window and repeats until VLC closes
the response or the file ends.

Example:

```text
cached: 0-1,999,999
cached: 2,000,000-3,999,999
gap:    4,000,000-5,999,999
cached: 6,000,000-7,999,999
```

The single HTTP response is delivered as:

```text
disk cache -> disk cache -> Drive gap -> disk cache
```

Cached bytes are still read from disk and sent to VLC, but they are not
downloaded from Drive again. The first 2 MB of a newly fetched gap is saved as
another persistent window for later playback.

### When stitching appears in the logs

Stitching happens while one VLC HTTP request is being served. If VLC requests a
position that is already cached, the proxy emits `cache-resume` and then reads
each immediately adjacent cached window, emitting `cache-stitch` for each one.
Disk reads are much faster than playback, so a long sequence of stitch logs can
appear within a few milliseconds at the start of a request. This does not mean
the whole video was read from disk; it only describes the contiguous cached
prefix of that response.

If the proxy reaches a missing range, it switches to Drive. A range downloaded
by that request is stored only after its bytes have been received. It cannot be
stitched retroactively into the response that created it. A later VLC request
can use that newly stored range and will then show the corresponding
`cache-resume` or `cache-stitch` event.

The `intervals=[...]` value on `cache-store` is the cache state on disk after
that write. It is not a record of which source served every byte in the current
response. A response may therefore contain Drive bytes even though its final
interval list includes those bytes.

## Disk limit and eviction

The cache limit is based on available storage:

- target: 2% of usable free space
- minimum: 16 MB
- maximum: 256 MB
- 100 MB free-space reserve

Windows whose start is below 8 MB are protected because VLC commonly probes
that area for MP4 metadata. Later seek and playback windows are evicted first.
Protected startup windows are removed only if no other cache entry can be
evicted while respecting the limit.

If Drive reports a different total size for the same file, old windows for that
file are invalidated so VLC is not given ranges from an obsolete version.

## Failure and fallback

Caching is an optimization. Playback falls back to Drive when a cache file is
missing or corrupt, storage or memory is unavailable, a continuation fails, or
VLC closes the connection early (`Broken pipe`). The proxy never requires the
cache to be present for streaming to work.

## Cache logs

Use:

```powershell
adb logcat -v time -s DriveStream:D ReactNativeJS:I
```

- `cache-resume`: cache serving starts at `from`; `source=request-start` means
  the requested range began in cache, while `afterDriveBytes` means it resumed
  after a Drive gap.
- `cache-stitch`: the response continues into another cached window; `from` and
  `to` show that window's byte range.
- `cache-gap-drive-stream`: Drive is supplying the indicated missing range.
- `cache-store`: a Drive window was saved or rejected; it reports the byte
  range, `result=success` or `result=failed`, and `intervals=[start-end,...]`
  for all windows currently persisted for that file.
- `drive-end`: Drive finished or the client interrupted the stream without a
  cache resume; `storedBytes` is the total saved from that stream.

Each Drive stream stores successive windows of up to 2 MB, plus a final smaller
window when the stream ends. For a cache hit followed by a gap and another
cached window, expect `cache-resume`, `cache-stitch`, `cache-gap-drive-stream`,
one or more `cache-store` entries, then `cache-resume` and any further
`cache-stitch` entries. If the Drive stream reaches the end without returning to
cache, it ends with `drive-end`.

