#!/bin/bash

# So we can see what we're doing
set -x

# Run bikeshed.
bikeshed --print=plain -f spec

# The out directory should contain everything needed to produce the
# HTML version of the spec.
cp index.html out
