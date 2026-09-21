#!/bin/sh
set -e
npm ci
npx cap sync ios
