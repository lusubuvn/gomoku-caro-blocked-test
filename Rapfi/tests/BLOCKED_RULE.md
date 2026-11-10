# Caro blocked-two-ends mode (experimental)

The experimental mode keeps Rapfi's existing Freestyle search and evaluation pipeline,
but overrides each directional line classification using the actual board endpoints.
This avoids the 9-cell Freestyle pattern window hiding the far endpoint of a five or a
six-stone overline.

Enable before starting/rebuilding a position:

```text
YXCAROBLOCKED 1
START 15
```

Disable it:

```text
YXCAROBLOCKED 0
START 15
```

The protocol command prints `OK`. Existing Freestyle remains the default. The UI setting
sends this command automatically when the Caro mode is selected.

Current agreed semantics:

- Exactly five stones wins if at least one endpoint is open.
- Exactly five stones does not win if both endpoints are blocked by opponent stones,
  WALL cells, or the board edge.
- Six or more consecutive stones wins, including when both ends are blocked.

After building `pbrain-rapfi`, run the black-box regression suite:

```sh
python3 tests/test_blocked_rule_protocol.py ./build-caro-fast/pbrain-rapfi
```

The current tests inspect the engine's Pattern4 output for opponent blockers, WALLs,
board edges, and six-in-a-row. Search-strength and full WASM/UI build validation are
still required before calling the feature complete.

## APK reference

The supplied APK's ARM64 native library exposes separate blocked-rule line-ranking,
five-checking, and defence-generation entry points. Their separation informed this
implementation's dedicated recursive line-pattern table plus board-aware endpoint
check. No APK binary or proprietary implementation code is copied into this project.
