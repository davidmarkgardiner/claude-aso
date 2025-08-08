# Security - Secret Detection and Prevention

This repository includes automated secret detection tools to prevent accidental exposure of sensitive information like API keys, passwords, and other credentials.

## 🔒 Pre-commit Hook

A Git pre-commit hook automatically scans files for secrets before each commit.

### What it detects:
- AWS Access Keys (`AKIA...`)
- AWS Secret Keys (40-character base64 strings)
- Azure Subscription/Client/Tenant IDs (UUID format)
- Generic API keys, secrets, passwords, tokens
- Private keys (`-----BEGIN PRIVATE KEY-----`)
- JWT tokens (`eyJ...`)
- High-entropy base64-encoded strings
- Dangerous files (`.env`, `credentials.json`, `.pem`, etc.)

### How it works:
The hook runs automatically when you try to commit:

```bash
git commit -m "your commit message"
```

If secrets are detected:
```
🚨 COMMIT BLOCKED: 2 potential secret(s) detected!

To fix this:
1. Remove or mask the secrets from your files
2. Use environment variables or secure key management instead
3. Add sensitive files to .gitignore
4. If this is a false positive, you can skip this hook with:
   git commit --no-verify
```

### Bypassing the hook (use carefully):
If you're certain the detected items are false positives:

```bash
git commit --no-verify -m "your commit message"
```

## 🔍 Repository Scanner

A comprehensive scanner tool checks all tracked files for secrets.

### Usage:

```bash
# Scan entire repository
./scripts/scan-secrets.sh
```

### Output:
- Colored terminal output showing detected issues
- Detailed report saved to `scan-results/secret-scan-YYYYMMDD-HHMMSS.txt`
- Summary of files scanned and issues found

## 🛡️ Best Practices

### ✅ Recommended Practices:
1. **Use environment variables** for secrets:
   ```bash
   export API_KEY="your-secret-key"
   ```

2. **Use Azure Key Vault** for production secrets:
   ```yaml
   apiVersion: v1
   kind: Secret
   metadata:
     name: my-secret
   spec:
     secretProviderClass: "azure-key-vault-provider"
   ```

3. **Use `.env` files locally** (but don't commit them):
   ```bash
   echo ".env" >> .gitignore
   echo ".env.local" >> .gitignore
   ```

4. **Use placeholders** in example files:
   ```yaml
   # config.yaml.example
   api_key: "your-api-key-here"
   database_url: "postgresql://user:password@host:port/database"
   ```

### ❌ Avoid These Patterns:
```bash
# Don't hardcode secrets
export API_KEY="sk-1234567890abcdef"
password = "mySecretPassword123"
connectionString = "Server=localhost;Password=secret123;"

# Don't commit sensitive files
.env
credentials.json
service-account.json
*.pem
*.key
```

## 🔧 Excluded Files

The following files are automatically excluded from secret scanning:

### File Types:
- `*.sample`
- `*.example` 
- `*.template`
- `*.md` (Markdown files)
- `*.txt`
- `*.log`

### Specific Files:
- `.gitignore`
- `LICENSE`
- `README*`
- `CHANGELOG*`

## 🚨 Common Secret Patterns Detected

### AWS Credentials:
```bash
# AWS Access Key
AKIAIOSFODNN7EXAMPLE

# AWS Secret Key (with context)
aws_secret_key = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
```

### Azure Credentials:
```bash
# Subscription ID
subscription_id = "12345678-1234-1234-1234-123456789012"

# Client Secret
client_secret = "ABC123~1234567890abcdefghijklmnopqrstuvwxyz"
```

### Generic Patterns:
```bash
# API Keys
api_key = "1234567890abcdef1234567890abcdef12345678"
apikey = "pk_live_1234567890abcdef"

# Passwords/Secrets
password = "mySecretPassword123"
secret_token = "super-secret-token-value"

# JWT Tokens
token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
```

### Dangerous Files:
- `.env` (environment files)
- `credentials.json` (service account files)
- `*.pem` (private key files)
- `id_rsa` (SSH private keys)

## 🔄 False Positives

If the scanner detects false positives:

1. **Review carefully** - ensure it's not actually a secret
2. **Refactor if needed** - use more descriptive placeholder text
3. **Skip the hook** - use `git commit --no-verify` for legitimate cases
4. **Update patterns** - modify the hook if certain patterns are consistently false

## 📊 Reporting

### Pre-commit Hook Output:
```
🔒 Running secret detection pre-commit hook...
🔍 Checking: config/database.yml
❌ Potential hardcoded credential found in config/database.yml:15
   Line: password: "secretpassword123"
🚨 COMMIT BLOCKED: 1 potential secret(s) detected!
```

### Scanner Report Structure:
```
Secret Scan Report - 2024-01-15 14:30:25
======================================

File: config/settings.py
  Line 42: Potential API Key
    Content: API_KEY = "sk-1234567890abcdef1234567890abcdef"

Scan Summary:
Files scanned: 156
Issues found: 3
Scan completed: 2024-01-15 14:30:28
```

## 🛠️ Maintenance

### Updating Detection Patterns:
Edit the hook file to add new patterns:
```bash
# .git/hooks/pre-commit
# Add new pattern in check_secrets() function
if echo "$line" | grep -qE "new-secret-pattern"; then
    echo -e "${RED}❌ New secret type found in $file:$line_num${NC}"
    ((issues_found++))
fi
```

### Hook Management:
```bash
# Disable hook temporarily
chmod -x .git/hooks/pre-commit

# Re-enable hook
chmod +x .git/hooks/pre-commit

# Check if hook is active
ls -la .git/hooks/pre-commit
```

## 📞 Support

If you encounter issues with the secret detection tools:

1. **Check the patterns** - review what's being detected
2. **Validate the file** - ensure it's not a binary file causing issues
3. **Test manually** - run the scanner script to debug
4. **Update the hook** - modify patterns as needed for your use case

## 🔐 Additional Security Measures

Consider implementing these additional security measures:

1. **git-secrets**: Install GitHub's git-secrets tool for additional protection
2. **Azure Key Vault**: Use Azure Key Vault for production secret management
3. **Workload Identity**: Use Azure Workload Identity for Kubernetes authentication
4. **Secret Scanning**: Enable GitHub secret scanning on your repositories
5. **Code Reviews**: Always review code changes that might contain sensitive information

---

**Remember**: These tools are meant to catch accidental secret exposure. Always use proper secret management practices and never rely solely on detection tools.