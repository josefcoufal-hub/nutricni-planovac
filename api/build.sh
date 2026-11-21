#!/usr/bin/env bash
# Sestavení bez Mavenu (jen JDK 21): ./build.sh [test]
set -euo pipefail
cd "$(dirname "$0")"
rm -rf out target && mkdir -p out target
javac --release 21 -Xlint:all,-serial -d out $(find src/main -name '*.java')
jar --create --file target/planovac-api.jar --main-class cz.planovac.api.Main -C out .
echo "OK: target/planovac-api.jar"
if [ "${1:-}" = "test" ]; then
  mkdir -p out-test
  javac --release 21 -d out-test -cp out $(find src/test -name '*.java')
  java -Dstdout.encoding=UTF-8 -Dfile.encoding=UTF-8 -cp out:out-test cz.planovac.api.TestMain
fi
