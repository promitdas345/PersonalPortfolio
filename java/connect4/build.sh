#!/usr/bin/env bash
# Compiles the sources, runs the self-test, and packages out/connect4.jar.
#
#   ./build.sh              compile + self-test + jar
#   ./build.sh --run        ...then launch the game
#   ./build.sh --skip-tests compile + jar only
set -euo pipefail

cd "$(dirname "$0")"

run_after=0
skip_tests=0
for arg in "$@"; do
    case "$arg" in
        --run) run_after=1 ;;
        --skip-tests) skip_tests=1 ;;
        *) echo "unknown option: $arg" >&2; exit 2 ;;
    esac
done

rm -rf out
mkdir -p out

mapfile -t sources < <(find src -name '*.java')
echo "compiling ${#sources[@]} files"
javac -Xlint:all -Xlint:-serial -d out "${sources[@]}"

if [ "$skip_tests" -eq 0 ]; then
    echo "running self-test"
    java -cp out connect4.SelfTest
fi

echo "packaging out/connect4.jar"
jar --create --file out/connect4.jar --main-class connect4.Main -C out connect4

echo "built out/connect4.jar"
[ "$run_after" -eq 1 ] && java -jar out/connect4.jar
exit 0
