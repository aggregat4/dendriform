#!/bin/sh
find src -type f -print0 | xargs -0 wc -l | sort -n
