#!/bin/bash

# Secret scanner script using detect-secrets
# Run this to scan all files for potential secrets

set -e

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔍 Scanning repository for secrets using detect-secrets...${NC}"

# Create results directory
mkdir -p scan-results
report_file="scan-results/secret-scan-$(date +%Y%m%d-%H%M%S).json"

# Run detect-secrets scan with exclusions for docs and test files
python3 -m detect_secrets scan \
  --exclude-files '\.md$|\.txt$|\.log$|detect-secrets/|scripts/scan-secrets\.sh$|\.example$|\.template$|\.sample$' \
  --exclude-lines 'password.*=.*(example|sample|test|fake|placeholder)' \
  > "$report_file"

# Parse results
secrets_count=$(cat "$report_file" | python3 -c "
import json, sys
data = json.load(sys.stdin)
count = sum(len(files) for files in data.get('results', {}).values())
print(count)
")

echo -e "\n${BLUE}📊 Scan Summary${NC}"
echo "Report saved to: $report_file"
echo "Secrets found: $secrets_count"

if [ "$secrets_count" -gt 0 ]; then
    echo -e "\n${RED}🚨 $secrets_count potential secret(s) detected!${NC}"
    echo -e "${YELLOW}Recommendations:${NC}"
    echo "1. Review the report file: $report_file"
    echo "2. Use 'python3 -m detect_secrets audit $report_file' to review findings"
    echo "3. Remove real secrets and replace with environment variables"
    echo "4. Add false positives to allowlist with '# pragma: allowlist secret'"
    echo "5. Use secret management tools (Azure Key Vault, etc.)"
    echo -e "${NC}"
    
    # Show summary of findings
    echo -e "\n${YELLOW}Files with potential secrets:${NC}"
    cat "$report_file" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for filename, secrets in data.get('results', {}).items():
    print(f'  {filename}: {len(secrets)} potential secret(s)')
"
    exit 1
else
    echo -e "${GREEN}✅ No secrets detected in repository!${NC}"
    exit 0
fi