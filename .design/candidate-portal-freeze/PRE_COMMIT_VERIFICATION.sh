#!/bin/bash

# Pre-Commit Verification Script
# Runs all validations before committing

set -eu

ROOT_DIR="/Users/lecinolucas/Developer/Agente_Curriculo"
cd "$ROOT_DIR"

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║        PRE-COMMIT VERIFICATION CHECKLIST                      ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# 1. Git Status
echo "📋 [1/6] Git Status..."
git status --short | wc -l
echo "   ✅ Found $(git status --short | wc -l) modified files"
echo ""

# 2. Frontend Build
echo "🔨 [2/6] Frontend Build..."
npm --prefix frontend run build > /tmp/frontend-build.log 2>&1
if grep -q "✓ built in" /tmp/frontend-build.log; then
  echo "   ✅ Frontend built successfully"
else
  echo "   ❌ Frontend build failed!"
  tail -20 /tmp/frontend-build.log
  exit 1
fi
echo ""

# 3. Candidate Portal Build
echo "🔨 [3/6] Candidate Portal Build..."
npm --prefix candidate-portal run build > /tmp/portal-build.log 2>&1
if grep -q "✓ built in" /tmp/portal-build.log; then
  echo "   ✅ Candidate portal built successfully"
else
  echo "   ❌ Portal build failed!"
  tail -20 /tmp/portal-build.log
  exit 1
fi
echo ""

# 4. Frontend Tests
echo "🧪 [4/6] Frontend Tests..."
npm --prefix frontend test -- --run > /tmp/frontend-tests.log 2>&1
if grep -q "Test Files  102 passed" /tmp/frontend-tests.log; then
  echo "   ✅ Frontend tests passed (102 files, 993 tests)"
else
  echo "   ❌ Frontend tests failed!"
  tail -30 /tmp/frontend-tests.log
  exit 1
fi
echo ""

# 5. CandidatePortalRedirectPage Test
echo "🧪 [5/6] CandidatePortalRedirectPage Test..."
npm --prefix frontend test -- CandidatePortalRedirectPage --run > /tmp/redirect-test.log 2>&1
if grep -q "9 passed" /tmp/redirect-test.log; then
  echo "   ✅ Redirect tests passed (9 tests)"
else
  echo "   ❌ Redirect tests failed!"
  tail -20 /tmp/redirect-test.log
  exit 1
fi
echo ""

# 6. Backend Tests
echo "🧪 [6/6] Backend Candidaturas Tests..."
cd "$ROOT_DIR/backend"
.venv/bin/python -m pytest tests/integration/test_candidaturas_import.py -q > /tmp/backend-tests.log 2>&1
if grep -q "29 passed" /tmp/backend-tests.log; then
  echo "   ✅ Backend tests passed (29 tests)"
else
  echo "   ❌ Backend tests failed!"
  tail -20 /tmp/backend-tests.log
  exit 1
fi
echo ""

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║        ✅ ALL VERIFICATIONS PASSED                            ║"
echo "║                                                               ║"
echo "║  Status: Ready to execute commits                            ║"
echo "║  Next:   Run COMMIT_EXECUTION_GUIDE.md                       ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""
